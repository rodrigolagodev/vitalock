-- ============================================================
-- Migration: key order lifecycle RPCs
-- ============================================================
-- Provides the remaining key order operations:
--   * cancel_key_order         — cancels the order, releases reservations,
--                                cancels items, nullifies minted key references.
--   * update_draft_key_order_with_items — full optimistic-concurrency draft update.
--   * mark_key_order_invoiced  — advances completed → invoiced.
--   * recompute_key_order_status — trigger-driven state machine driver;
--                                  called by key_order_items status changes.
--
-- Also wires triggers:
--   * key_order_items_recompute_order_status — AFTER UPDATE OF status on
--     key_order_items → calls recompute_key_order_status.
--   * key_orders_cancel_release_reservations — AFTER UPDATE on key_orders
--     when status transitions to 'cancelled' → releases stock reservations.
--
-- Depends on: 20260818000086 (create_key_order_with_items, confirm_key_order)
-- ============================================================

-- -------------------------------------------------------
-- recompute_key_order_status
-- -------------------------------------------------------
-- State machine driver called by triggers.
-- Transitions:
--   confirmed → in_progress     : when any non-cancelled item becomes 'configured'
--   in_progress → ready_for_pickup : when all non-cancelled items are 'configured'
--   ready_for_pickup → in_progress : when a configured item is cancelled (reverts)
-- completed and invoiced are set by RPCs only.
create or replace function public.recompute_key_order_status(
  p_order_id uuid
) returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_order       record;
  v_total       int;
  v_configured  int;
  v_pending     int;
begin
  -- Read current order state (no lock — trigger context handles concurrency).
  select id, status
    into v_order
    from public.key_orders
   where id = p_order_id;

  if not found then
    return;
  end if;

  -- Only drive state machine in the active range (confirmed, in_progress, ready_for_pickup).
  -- draft, completed, invoiced, cancelled are not driven by this function.
  if v_order.status not in ('confirmed', 'in_progress', 'ready_for_pickup') then
    return;
  end if;

  -- Count non-cancelled items.
  select
    count(*) filter (where status <> 'cancelled')                  as total,
    count(*) filter (where status = 'configured')                  as configured,
    count(*) filter (where status = 'pending')                     as pending
  into v_total, v_configured, v_pending
  from public.key_order_items
  where order_id = p_order_id;

  -- No active items → nothing to drive (should not happen post-confirm, but guard).
  if v_total = 0 then
    return;
  end if;

  if v_configured > 0 and v_pending = 0 then
    -- All non-cancelled items are configured → ready_for_pickup.
    update public.key_orders
       set status = 'ready_for_pickup'
     where id = p_order_id
       and status in ('confirmed', 'in_progress');

  elsif v_configured > 0 then
    -- At least one configured, some still pending → in_progress.
    update public.key_orders
       set status = 'in_progress'
     where id = p_order_id
       and status in ('confirmed', 'ready_for_pickup');

  else
    -- No configured items → back to confirmed (or stay confirmed).
    update public.key_orders
       set status = 'confirmed'
     where id = p_order_id
       and status in ('in_progress', 'ready_for_pickup');
  end if;
end;
$$;

-- -------------------------------------------------------
-- key_order_items_recompute_trigger function
-- -------------------------------------------------------
create or replace function public.key_order_items_recompute_order_status()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  perform public.recompute_key_order_status(new.order_id);
  return new;
end;
$$;

-- Wire trigger: fires AFTER UPDATE OF status on key_order_items.
drop trigger if exists key_order_items_recompute_order_status_trigger on public.key_order_items;
create trigger key_order_items_recompute_order_status_trigger
after update of status on public.key_order_items
for each row
execute function public.key_order_items_recompute_order_status();

-- -------------------------------------------------------
-- key_orders_release_reservations_fn — trigger function for cancellations
-- -------------------------------------------------------
create or replace function public.key_orders_cancel_release_reservations()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
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
       and order_kind = 'key'
       and type = 'reserva'
  loop
    insert into public.stock_movements (
      product_id,
      type,
      quantity,
      note,
      order_id,
      order_item_id,
      order_kind
    )
    values (
      v_movement.product_id,
      'liberacion_reserva',
      -v_movement.quantity,   -- opposing sign to the reserva
      'Liberacion de reserva por cancelacion de key_order ' || new.id::text,
      new.id,
      v_movement.order_item_id,
      'key'
    );
  end loop;

  -- Cancel all non-terminal items.
  update public.key_order_items
     set status = 'cancelled'
   where order_id = new.id
     and status not in ('cancelled');

  -- Nullify produced_key_id references for any minted but not yet fully
  -- active keys (rfid_keys with status='pending_creation' or 'pending_installation').
  -- The keys themselves are left in place for audit; only the item link is cleared.
  update public.rfid_keys
     set order_item_id = null
   where order_item_id in (
     select id from public.key_order_items where order_id = new.id
   )
     and status in ('pending_creation', 'pending_installation');

  return new;
end;
$$;

-- Wire trigger: fires AFTER UPDATE on key_orders.
drop trigger if exists key_orders_cancel_release_reservations_trigger on public.key_orders;
create trigger key_orders_cancel_release_reservations_trigger
after update on public.key_orders
for each row
execute function public.key_orders_cancel_release_reservations();

-- -------------------------------------------------------
-- cancel_key_order
-- -------------------------------------------------------
create or replace function public.cancel_key_order(
  p_order_id uuid
) returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_order record;
begin
  -- Row-lock and read.
  select id, status
    into v_order
    from public.key_orders
   where id = p_order_id
   for update;

  if not found then
    raise exception 'KEY_ORDER_NOT_FOUND: key order % does not exist', p_order_id
      using errcode = 'P0001';
  end if;

  -- Reject if already in a terminal state.
  if v_order.status in ('completed', 'invoiced', 'cancelled') then
    raise exception 'KEY_ORDER_TERMINAL_STATE: key order % is in terminal state (current: %)',
      p_order_id, v_order.status
      using errcode = 'P0001';
  end if;

  -- Update status to 'cancelled'.
  -- The key_orders_cancel_release_reservations trigger fires here and handles:
  --   * stock movement liberacion rows
  --   * key_order_items status → 'cancelled'
  --   * rfid_keys order_item_id nullification
  update public.key_orders
     set status = 'cancelled'
   where id = p_order_id;
end;
$$;

-- -------------------------------------------------------
-- update_draft_key_order_with_items
-- -------------------------------------------------------
create or replace function public.update_draft_key_order_with_items(
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
  v_qty            int;
  v_key_idx        int;
begin
  -- 1. Row-lock and verify.
  select id, status, updated_at
    into v_order
    from public.key_orders
   where id = p_order_id
   for update;

  if not found then
    raise exception 'KEY_ORDER_NOT_FOUND: key order % does not exist', p_order_id
      using errcode = 'P0001';
  end if;

  if v_order.status <> 'draft' then
    raise exception 'KEY_ORDER_NOT_DRAFT: key order % is not in draft status (current: %)',
      p_order_id, v_order.status
      using errcode = 'P0001';
  end if;

  if v_order.updated_at <> p_expected_updated_at then
    raise exception 'KEY_ORDER_STALE: key order % was modified concurrently (expected %, actual %)',
      p_order_id, p_expected_updated_at, v_order.updated_at
      using errcode = 'P0001';
  end if;

  -- 2. Apply patch to header (whitelisted columns only).
  update public.key_orders
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
  if p_items is not null then
    foreach v_item in array p_items loop
      v_item_id    := (v_item->>'id')::uuid;
      v_qty        := coalesce((v_item->>'quantity')::int, 1);
      v_unit_price := nullif(v_item->>'unit_price', '')::numeric(12, 2);

      -- Key packs (quantity > 1) are exploded into N rows.
      -- The first copy keeps the payload id when present (UPDATE path);
      -- remaining keys are INSERTed as new rows.
      if v_qty > 1 then
        if v_item_id is not null then
          -- Update the first copy.
          update public.key_order_items
             set
               quantity             = 1,
               description          = coalesce(v_item->>'description', description),
               building_id          = case when v_item ? 'building_id'
                                           then (v_item->>'building_id')::uuid
                                           else building_id end,
               product_id           = case when v_item ? 'product_id'
                                           then (v_item->>'product_id')::uuid
                                           else product_id end,
               unit_price           = case when v_item ? 'unit_price'
                                           then v_unit_price
                                           else unit_price end,
               unit_id              = case when v_item ? 'unit_id'
                                           then (v_item->>'unit_id')::uuid
                                           else unit_id end,
               pickup_particular_id = case when v_item ? 'pickup_particular_id'
                                           then (v_item->>'pickup_particular_id')::uuid
                                           else pickup_particular_id end
           where id = v_item_id
             and order_id = p_order_id;

          v_item_ids_kept := v_item_ids_kept || v_item_id;
        else
          -- New pack line, no existing id: insert first copy.
          insert into public.key_order_items (
            order_id, item_type, quantity, description, building_id,
            product_id, unit_price, unit_id, pickup_particular_id
          )
          values (
            p_order_id, 'key', 1, v_item->>'description',
            (v_item->>'building_id')::uuid,
            (v_item->>'product_id')::uuid,
            v_unit_price,
            (v_item->>'unit_id')::uuid,
            (v_item->>'pickup_particular_id')::uuid
          )
          returning id into v_item_id;

          v_item_ids_kept := v_item_ids_kept || v_item_id;
        end if;

        -- Remaining N-1 copies are always new inserts.
        for v_key_idx in 2..v_qty loop
          insert into public.key_order_items (
            order_id, item_type, quantity, description, building_id,
            product_id, unit_price, unit_id, pickup_particular_id
          )
          values (
            p_order_id, 'key', 1, v_item->>'description',
            (v_item->>'building_id')::uuid,
            (v_item->>'product_id')::uuid,
            v_unit_price,
            (v_item->>'unit_id')::uuid,
            (v_item->>'pickup_particular_id')::uuid
          )
          returning id into v_item_id;

          v_item_ids_kept := v_item_ids_kept || v_item_id;
        end loop;

      elsif v_item_id is not null then
        -- Existing single item: UPDATE.
        update public.key_order_items
           set
             quantity             = coalesce((v_item->>'quantity')::int, quantity),
             description          = coalesce(v_item->>'description',     description),
             building_id          = case when v_item ? 'building_id'
                                         then (v_item->>'building_id')::uuid
                                         else building_id end,
             product_id           = case when v_item ? 'product_id'
                                         then (v_item->>'product_id')::uuid
                                         else product_id end,
             unit_price           = case when v_item ? 'unit_price'
                                         then v_unit_price
                                         else unit_price end,
             unit_id              = case when v_item ? 'unit_id'
                                         then (v_item->>'unit_id')::uuid
                                         else unit_id end,
             pickup_particular_id = case when v_item ? 'pickup_particular_id'
                                         then (v_item->>'pickup_particular_id')::uuid
                                         else pickup_particular_id end
         where id = v_item_id
           and order_id = p_order_id;

        v_item_ids_kept := v_item_ids_kept || v_item_id;

      else
        -- New single item: INSERT.
        insert into public.key_order_items (
          order_id, item_type, quantity, description, building_id,
          product_id, unit_price, unit_id, pickup_particular_id
        )
        values (
          p_order_id, 'key', v_qty, v_item->>'description',
          (v_item->>'building_id')::uuid,
          (v_item->>'product_id')::uuid,
          v_unit_price,
          (v_item->>'unit_id')::uuid,
          (v_item->>'pickup_particular_id')::uuid
        )
        returning id into v_item_id;

        v_item_ids_kept := v_item_ids_kept || v_item_id;
      end if;
    end loop;

    -- Delete items that were NOT in the payload (only pending items — configured
    -- items cannot be deleted from a draft once configured, but that should not
    -- happen in normal flows since confirmed orders are not draft).
    delete from public.key_order_items
     where order_id = p_order_id
       and id <> all(v_item_ids_kept);
  end if;

  return v_new_updated_at;
end;
$$;

-- -------------------------------------------------------
-- mark_key_order_invoiced
-- -------------------------------------------------------
create or replace function public.mark_key_order_invoiced(
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
    from public.key_orders
   where id = p_order_id
   for update;

  if not found then
    raise exception 'KEY_ORDER_NOT_FOUND: key order % does not exist', p_order_id
      using errcode = 'P0001';
  end if;

  if v_order.status <> 'completed' then
    raise exception 'KEY_ORDER_NOT_COMPLETED: key order % is not in completed status (current: %)',
      p_order_id, v_order.status
      using errcode = 'P0001';
  end if;

  update public.key_orders
     set status = 'invoiced'
   where id = p_order_id;
end;
$$;

-- -------------------------------------------------------
-- Grants
-- -------------------------------------------------------
grant execute on function public.recompute_key_order_status(uuid)                     to authenticated, service_role;
grant execute on function public.key_order_items_recompute_order_status()              to authenticated, service_role;
grant execute on function public.key_orders_cancel_release_reservations()              to authenticated, service_role;
grant execute on function public.cancel_key_order(uuid)                               to authenticated, service_role;
grant execute on function public.update_draft_key_order_with_items(uuid, jsonb, jsonb[], timestamptz) to authenticated, service_role;
grant execute on function public.mark_key_order_invoiced(uuid)                        to authenticated, service_role;
