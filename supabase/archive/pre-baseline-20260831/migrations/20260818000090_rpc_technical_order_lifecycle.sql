-- ============================================================
-- Migration: technical order lifecycle RPCs
-- ============================================================
-- Provides the remaining technical order operations:
--   * cancel_technical_order             — cancels order + linked tickets + releases stock.
--   * update_draft_technical_order_with_items — optimistic-concurrency draft update.
--   * mark_technical_order_invoiced      — advances completed → invoiced.
--   * recompute_technical_order_status   — trigger-driven state machine driver;
--                                          called by tickets_sync_order_status when
--                                          a linked ticket changes status.
--
-- Also wires/updates:
--   * tickets_sync_order_status — replaces the PR-1 stub with the real body that
--     calls recompute_technical_order_status.
--   * technical_orders_cancel_release_reservations — AFTER UPDATE trigger on
--     technical_orders when status → 'cancelled'; releases stock + cancels tickets.
--
-- Depends on: 20260818000089 (create_technical_order_with_items, confirm_technical_order)
-- ============================================================

-- -------------------------------------------------------
-- recompute_technical_order_status
-- -------------------------------------------------------
-- State machine driver: called by the tickets_sync trigger.
-- Reads linked support.tickets via technical_order_item_id FK.
-- Transitions:
--   confirmed → in_progress   : when any ticket moves to in_progress or resolved
--   in_progress → completed   : when all non-cancelled tickets are resolved
-- completed and invoiced are set by RPCs only.
create or replace function public.recompute_technical_order_status(
  p_order_id uuid
) returns void
language plpgsql
security definer
set search_path = public, support, extensions
as $$
declare
  v_order           record;
  v_total_tickets   int;
  v_resolved        int;
  v_in_progress     int;
  v_open            int;
begin
  -- Read current order state.
  select id, status
    into v_order
    from public.technical_orders
   where id = p_order_id;

  if not found then
    return;
  end if;

  -- Only drive state machine in the active range.
  if v_order.status not in ('confirmed', 'in_progress') then
    return;
  end if;

  -- Count tickets linked to non-cancelled items of this order.
  select
    count(*) filter (where t.status not in ('cancelled'))                           as total_tickets,
    count(*) filter (where t.status = 'resolved')                                   as resolved,
    count(*) filter (where t.status = 'in_progress')                                as in_progress,
    count(*) filter (where t.status = 'open')                                       as open
  into v_total_tickets, v_resolved, v_in_progress, v_open
  from support.tickets t
  join public.technical_order_items toi on toi.id = t.technical_order_item_id
  where toi.order_id = p_order_id
    and toi.status <> 'cancelled';

  -- No active tickets: nothing to drive (items without tickets are not counted).
  if v_total_tickets = 0 then
    return;
  end if;

  if v_resolved = v_total_tickets then
    -- All non-cancelled tickets resolved → completed.
    update public.technical_orders
       set status = 'completed'
     where id = p_order_id
       and status = 'in_progress';

  elsif v_in_progress > 0 or v_resolved > 0 then
    -- At least one ticket in flight → in_progress.
    update public.technical_orders
       set status = 'in_progress'
     where id = p_order_id
       and status = 'confirmed';
  end if;
end;
$$;

-- -------------------------------------------------------
-- Update tickets_sync_order_status — replace PR-1 stub with real body
-- -------------------------------------------------------
-- Now that recompute_technical_order_status exists, replace the placeholder
-- from migration 20260818000085 with the actual implementation.
create or replace function public.tickets_sync_order_status()
returns trigger
language plpgsql
security definer
set search_path = public, support, extensions
as $$
declare
  v_technical_order_id uuid;
begin
  -- Key orders do NOT sync from tickets. Only act when technical_order_item_id
  -- is populated. This matches design §4 intent.
  if new.technical_order_item_id is null then
    return new;
  end if;

  select order_id into v_technical_order_id
    from public.technical_order_items
   where id = new.technical_order_item_id;

  if v_technical_order_id is not null then
    perform public.recompute_technical_order_status(v_technical_order_id);
  end if;

  return new;
end;
$$;

-- Re-wire the trigger (was already created in migration 085; replace-function is enough).
-- Explicit drop+recreate to ensure the trigger is bound to the updated function body.
drop trigger if exists tickets_sync_order_status_trigger on support.tickets;
create trigger tickets_sync_order_status_trigger
after insert or update of status on support.tickets
for each row execute function public.tickets_sync_order_status();

-- -------------------------------------------------------
-- technical_orders_cancel_release_reservations — trigger function
-- -------------------------------------------------------
create or replace function public.technical_orders_cancel_release_reservations()
returns trigger
language plpgsql
security definer
set search_path = public, support, extensions
as $$
declare
  v_movement record;
begin
  -- Only fires when transitioning INTO 'cancelled'.
  if new.status <> 'cancelled' or old.status = 'cancelled' then
    return new;
  end if;

  -- Release existing reservations by inserting opposing liberacion rows.
  for v_movement in
    select id, product_id, quantity, order_item_id
      from public.stock_movements
     where order_id = new.id
       and order_kind = 'technical'
       and type = 'reserva'
  loop
    insert into public.stock_movements (
      product_id, type, quantity, note, order_id, order_item_id, order_kind
    )
    values (
      v_movement.product_id,
      'liberacion_reserva',
      -v_movement.quantity,
      'Liberacion de reserva por cancelacion de technical_order ' || new.id::text,
      new.id,
      v_movement.order_item_id,
      'technical'
    );
  end loop;

  -- Cancel all non-resolved, non-cancelled linked tickets.
  -- tickets_validate requires cancellation_reason when status='cancelled'.
  update support.tickets
     set status              = 'cancelled',
         cancellation_reason = 'Orden técnica cancelada (order_id=' || new.id::text || ')'
   where technical_order_item_id in (
     select id from public.technical_order_items where order_id = new.id
   )
     and status not in ('resolved', 'cancelled');

  -- Cancel all non-terminal technical_order_items.
  update public.technical_order_items
     set status = 'cancelled'
   where order_id = new.id
     and status not in ('completed', 'cancelled');

  return new;
end;
$$;

-- Wire trigger: fires AFTER UPDATE on technical_orders.
drop trigger if exists technical_orders_cancel_release_reservations_trigger on public.technical_orders;
create trigger technical_orders_cancel_release_reservations_trigger
after update on public.technical_orders
for each row
execute function public.technical_orders_cancel_release_reservations();

-- -------------------------------------------------------
-- cancel_technical_order
-- -------------------------------------------------------
create or replace function public.cancel_technical_order(
  p_order_id uuid
) returns void
language plpgsql
security definer
set search_path = public, support, extensions
as $$
declare
  v_order        record;
  v_all_resolved boolean;
begin
  -- Row-lock and read.
  select id, status
    into v_order
    from public.technical_orders
   where id = p_order_id
   for update;

  if not found then
    raise exception 'TECHNICAL_ORDER_NOT_FOUND: technical order % does not exist', p_order_id
      using errcode = 'P0001';
  end if;

  -- Reject if already in a terminal state.
  if v_order.status in ('completed', 'invoiced', 'cancelled') then
    raise exception 'TECHNICAL_ORDER_TERMINAL_STATE: technical order % is in terminal state (current: %)',
      p_order_id, v_order.status
      using errcode = 'P0001';
  end if;

  -- Reject if all non-cancelled tickets are resolved (order is effectively done).
  select (
    count(*) filter (where t.status not in ('cancelled', 'resolved')) = 0
    and count(*) filter (where t.status = 'resolved') > 0
  )
  into v_all_resolved
  from support.tickets t
  join public.technical_order_items toi on toi.id = t.technical_order_item_id
  where toi.order_id = p_order_id
    and t.status not in ('cancelled');

  if v_all_resolved then
    raise exception 'TECHNICAL_ORDER_ALL_RESOLVED: cannot cancel technical order % — all tickets are already resolved',
      p_order_id
      using errcode = 'P0001';
  end if;

  -- Update status → 'cancelled'.
  -- The technical_orders_cancel_release_reservations trigger fires here and handles:
  --   * stock movement liberacion rows
  --   * support.tickets status → 'cancelled' (with cancellation_reason)
  --   * technical_order_items status → 'cancelled'
  update public.technical_orders
     set status = 'cancelled'
   where id = p_order_id;
end;
$$;

-- -------------------------------------------------------
-- update_draft_technical_order_with_items
-- -------------------------------------------------------
create or replace function public.update_draft_technical_order_with_items(
  p_order_id            uuid,
  p_patch               jsonb,
  p_items               jsonb[],
  p_expected_updated_at timestamptz
) returns timestamptz
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_order          record;
  v_new_updated_at timestamptz;
  v_item           jsonb;
  v_item_id        uuid;
  v_item_ids_kept  uuid[] := array[]::uuid[];
  v_unit_price     numeric(12, 2);
begin
  -- 1. Row-lock and verify.
  select id, status, updated_at
    into v_order
    from public.technical_orders
   where id = p_order_id
   for update;

  if not found then
    raise exception 'TECHNICAL_ORDER_NOT_FOUND: technical order % does not exist', p_order_id
      using errcode = 'P0001';
  end if;

  if v_order.status <> 'draft' then
    raise exception 'TECHNICAL_ORDER_NOT_DRAFT: technical order % is not in draft status (current: %)',
      p_order_id, v_order.status
      using errcode = 'P0001';
  end if;

  if v_order.updated_at <> p_expected_updated_at then
    raise exception 'TECHNICAL_ORDER_STALE: technical order % was modified concurrently (expected %, actual %)',
      p_order_id, p_expected_updated_at, v_order.updated_at
      using errcode = 'P0001';
  end if;

  -- 2. Apply patch to header (whitelisted columns only).
  update public.technical_orders
     set
       notes                = coalesce(p_patch->>'notes',                 notes),
       client_type          = coalesce(p_patch->>'client_type',           client_type),
       administration_id    = case
                                when p_patch ? 'administration_id'
                                then (p_patch->>'administration_id')::uuid
                                else administration_id
                              end,
       particular_id        = case
                                when p_patch ? 'particular_id'
                                then (p_patch->>'particular_id')::uuid
                                else particular_id
                              end,
       particular_full_name = coalesce(p_patch->>'particular_full_name', particular_full_name),
       particular_dni       = coalesce(p_patch->>'particular_dni',       particular_dni),
       particular_phone     = coalesce(p_patch->>'particular_phone',     particular_phone),
       particular_email     = coalesce(p_patch->>'particular_email',     particular_email)
   where id = p_order_id
  returning updated_at into v_new_updated_at;

  -- 3. Item sync: upsert items present in payload; delete absent items.
  --    Technical order items are NOT exploded (quantity stays as-is).
  if p_items is not null then
    foreach v_item in array p_items loop
      v_item_id    := (v_item->>'id')::uuid;
      v_unit_price := nullif(v_item->>'unit_price', '')::numeric(12, 2);

      if v_item_id is not null then
        -- Existing item: UPDATE.
        -- Note: intended_equipment_id and intended_assignee_staff_id are mutable
        -- in draft (intent_immutable trigger only fires when parent is NOT draft).
        update public.technical_order_items
           set
             item_type                   = coalesce(v_item->>'item_type', item_type),
             quantity                    = coalesce((v_item->>'quantity')::int, quantity),
             description                 = coalesce(v_item->>'description', description),
             unit_price                  = case when v_item ? 'unit_price'
                                                then v_unit_price
                                                else unit_price end,
             product_id                  = case when v_item ? 'product_id'
                                                then (v_item->>'product_id')::uuid
                                                else product_id end,
             intended_equipment_id       = case when v_item ? 'intended_equipment_id'
                                                then (v_item->>'intended_equipment_id')::uuid
                                                else intended_equipment_id end,
             intended_assignee_staff_id  = case when v_item ? 'intended_assignee_staff_id'
                                                then (v_item->>'intended_assignee_staff_id')::uuid
                                                else intended_assignee_staff_id end
         where id = v_item_id
           and order_id = p_order_id;

        v_item_ids_kept := v_item_ids_kept || v_item_id;

      else
        -- New item: INSERT.
        insert into public.technical_order_items (
          order_id,
          item_type,
          quantity,
          description,
          unit_price,
          product_id,
          intended_equipment_id,
          intended_assignee_staff_id
        )
        values (
          p_order_id,
          v_item->>'item_type',
          coalesce((v_item->>'quantity')::int, 1),
          v_item->>'description',
          v_unit_price,
          (v_item->>'product_id')::uuid,
          (v_item->>'intended_equipment_id')::uuid,
          (v_item->>'intended_assignee_staff_id')::uuid
        )
        returning id into v_item_id;

        v_item_ids_kept := v_item_ids_kept || v_item_id;
      end if;
    end loop;

    -- Delete items not in the payload.
    delete from public.technical_order_items
     where order_id = p_order_id
       and id <> all(v_item_ids_kept);
  end if;

  return v_new_updated_at;
end;
$$;

-- -------------------------------------------------------
-- mark_technical_order_invoiced
-- -------------------------------------------------------
create or replace function public.mark_technical_order_invoiced(
  p_order_id uuid
) returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_order record;
begin
  select id, status
    into v_order
    from public.technical_orders
   where id = p_order_id
   for update;

  if not found then
    raise exception 'TECHNICAL_ORDER_NOT_FOUND: technical order % does not exist', p_order_id
      using errcode = 'P0001';
  end if;

  if v_order.status <> 'completed' then
    raise exception 'TECHNICAL_ORDER_NOT_COMPLETED: technical order % is not in completed status (current: %)',
      p_order_id, v_order.status
      using errcode = 'P0001';
  end if;

  update public.technical_orders
     set status = 'invoiced'
   where id = p_order_id;
end;
$$;

-- -------------------------------------------------------
-- Grants
-- -------------------------------------------------------
grant execute on function public.recompute_technical_order_status(uuid)                                                                         to authenticated, service_role;
grant execute on function public.tickets_sync_order_status()                                                                                    to authenticated, service_role;
grant execute on function public.technical_orders_cancel_release_reservations()                                                                 to authenticated, service_role;
grant execute on function public.cancel_technical_order(uuid)                                                                                   to authenticated, service_role;
grant execute on function public.update_draft_technical_order_with_items(uuid, jsonb, jsonb[], timestamptz)                                     to authenticated, service_role;
grant execute on function public.mark_technical_order_invoiced(uuid)                                                                            to authenticated, service_role;
