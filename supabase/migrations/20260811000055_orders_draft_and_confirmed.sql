-- ============================================================
-- Real draft state and explicit confirmed commitment for orders
-- ============================================================
-- Change: orders-draft-and-confirmed (Batch 1 — DB Foundation)
--
-- ROLLBACK INSTRUCTIONS (no down migration — Supabase CLI convention):
-- To revert this migration manually, apply the following in order:
--   1. DROP FUNCTION IF EXISTS public.confirm_order(uuid);
--   2. DROP FUNCTION IF EXISTS public.update_draft_order_with_items(uuid, jsonb, jsonb[], timestamptz);
--   3. Restore recompute_order_status: revert keys branch to guard on
--      v_current_status = 'in_preparation' and technical branch source list
--      back to ('draft', 'in_preparation') — see migration 000050.
--   4. Restore CHECK constraint with 'in_preparation':
--      ALTER TABLE public.orders DROP CONSTRAINT orders_status_check;
--      ALTER TABLE public.orders ADD CONSTRAINT orders_status_check
--        CHECK (status IN ('draft','in_preparation','in_progress',
--                          'ready_for_pickup','completed','invoiced','cancelled'));
--   5. Restore trigger from migration 000052:
--      (Re-run CREATE OR REPLACE FUNCTION public.order_items_create_tarea()
--       body from 000052, then CREATE TRIGGER if missing.)
--   6. NOTE: draft orders (and their child order_items, stock_movements,
--      and ticket nullifications) deleted in step 2 of the up migration are NOT
--      restorable. in_preparation rows that were promoted to in_progress are
--      also not individually recoverable without a data backup.
-- ============================================================

-- ============================================================
-- STEP 1: Widen CHECK to include both 'in_preparation' and 'confirmed'
-- ============================================================
-- Drop the current constraint first so we can replace it without conflict.
alter table public.orders drop constraint orders_status_check;
alter table public.orders add constraint orders_status_check
  check (status in (
    'draft',
    'in_preparation',
    'confirmed',
    'in_progress',
    'ready_for_pickup',
    'completed',
    'invoiced',
    'cancelled'
  ));

-- ============================================================
-- STEP 2: Backfill — clean up old data before narrowing the enum
-- ============================================================
-- Delete all draft orders (confirmed as test data).
-- The order_items FK to orders is ON DELETE RESTRICT, so we must
-- delete child rows first.
-- support.tickets.order_item_id → order_items is ON DELETE SET NULL (already handled).
-- stock_movements.order_id → orders is ON DELETE SET NULL.
-- stock_movements.order_item_id → order_items is nullable (no explicit cascade needed
-- for movements with no order_item linkage — those use order_id which is SET NULL).
-- Order of deletes: stock_movements → order_items → orders.

-- Remove any stock_movements referencing draft order_items (reservas created
-- by the old trigger on draft orders should not exist post-migration, but
-- delete defensively in case of legacy data).
delete from public.stock_movements
 where order_item_id in (
   select oi.id from public.order_items oi
     join public.orders o on o.id = oi.order_id
    where o.status = 'draft'
 );

-- Nullify tickets.order_item_id for items belonging to draft orders
-- (FK is ON DELETE SET NULL but we are deleting order_items below, not
-- the tickets themselves — so proactively SET NULL to avoid FK violations).
update support.tickets
   set order_item_id = null
 where order_item_id in (
   select oi.id from public.order_items oi
     join public.orders o on o.id = oi.order_id
    where o.status = 'draft'
 );

-- Nullify rfid_keys.order_item_id for items belonging to draft orders
-- (FK is ON DELETE RESTRICT — must NULL it before deleting order_items).
update public.rfid_keys
   set order_item_id = null
 where order_item_id in (
   select oi.id from public.order_items oi
     join public.orders o on o.id = oi.order_id
    where o.status = 'draft'
 );

-- Delete order_items for draft orders.
delete from public.order_items
 where order_id in (select id from public.orders where status = 'draft');

-- Delete the draft orders themselves.
-- stock_movements.order_id is ON DELETE SET NULL, so no additional cleanup needed.
delete from public.orders where status = 'draft';

-- Migrate in_preparation → in_progress (already a valid status value).
update public.orders set status = 'in_progress' where status = 'in_preparation';

-- ============================================================
-- STEP 3: Narrow CHECK — remove 'in_preparation' from the domain
-- ============================================================
-- Final domain: draft, confirmed, in_progress, ready_for_pickup,
--               completed, invoiced, cancelled
alter table public.orders drop constraint orders_status_check;
alter table public.orders add constraint orders_status_check
  check (status in (
    'draft',
    'confirmed',
    'in_progress',
    'ready_for_pickup',
    'completed',
    'invoiced',
    'cancelled'
  ));

-- ============================================================
-- STEP 4: Drop order_items_create_tarea trigger and function
-- ============================================================
-- Side effects (ticket creation, stock reservations) move to the
-- explicit confirm_order RPC. Draft inserts must be side-effect free.
drop trigger if exists order_items_create_tarea_trigger on public.order_items;
drop function if exists public.order_items_create_tarea();

-- ============================================================
-- STEP 5: Rewrite recompute_order_status
-- ============================================================
-- Keys branch: source state changes from 'in_preparation' to 'confirmed'.
--   Promote confirmed → in_progress on first item 'configured'.
--   Promote in_progress → ready_for_pickup when all non-cancelled configured.
-- Technical branch: source list is now ('confirmed', 'in_progress') — never
--   draft. When any ticket is in_progress or resolved, the order advances
--   to in_progress (if not already past that state). When all non-cancelled
--   tickets are resolved, order → completed.
create or replace function public.recompute_order_status(p_order_id uuid)
returns void
language plpgsql
as $$
declare
  v_current_status  text;
  v_order_type      text;
  v_total_key_items int;
  v_configured      int;
  v_total_tickets   int;
  v_open            int;
  v_in_progress_t   int;
  v_resolved        int;
begin
  select status, order_type
    into v_current_status, v_order_type
    from public.orders
   where id = p_order_id
   for update;

  -- Terminal states never auto-transition again.
  if v_current_status in ('completed', 'invoiced', 'cancelled') then
    return;
  end if;

  if v_order_type = 'keys' then
    -- Keys flow: only transitions from 'confirmed' or 'in_progress'.
    -- draft orders cannot auto-transition (no confirmed signal yet).
    if v_current_status not in ('confirmed', 'in_progress') then
      return;
    end if;

    select
      count(*) filter (where item_type = 'key' and status <> 'cancelled'),
      count(*) filter (where item_type = 'key' and status = 'configured')
    into v_total_key_items, v_configured
    from public.order_items
    where order_id = p_order_id;

    if v_total_key_items = 0 then
      return;  -- all key items cancelled → no transition
    end if;

    if v_configured > 0 and v_current_status = 'confirmed' then
      -- At least one key configured: advance to in_progress.
      update public.orders
         set status = 'in_progress'
       where id = p_order_id;
      -- Re-read status for the next check.
      v_current_status := 'in_progress';
    end if;

    if v_configured = v_total_key_items then
      -- All non-cancelled keys configured: ready for pickup.
      update public.orders
         set status = 'ready_for_pickup'
       where id = p_order_id;
    end if;

    return;
  end if;

  -- Technical flow: derive from generated tickets.
  -- Source states: 'confirmed' or 'in_progress'.
  if v_current_status not in ('confirmed', 'in_progress') then
    return;
  end if;

  select
    count(*) filter (where status <> 'cancelled'),
    count(*) filter (where status = 'open'),
    count(*) filter (where status = 'in_progress'),
    count(*) filter (where status = 'resolved')
  into v_total_tickets, v_open, v_in_progress_t, v_resolved
  from support.tickets
  where order_item_id in (
    select id from public.order_items where order_id = p_order_id
  );

  if v_total_tickets = 0 then
    return;  -- nothing to derive from
  end if;

  if v_resolved = v_total_tickets then
    update public.orders set status = 'completed' where id = p_order_id;
  elsif v_in_progress_t > 0 or v_resolved > 0 then
    -- Any active work: advance order to in_progress if still at confirmed.
    if v_current_status = 'confirmed' then
      update public.orders set status = 'in_progress' where id = p_order_id;
    end if;
  end if;
end;
$$;

-- ============================================================
-- STEP 6: confirm_order RPC
-- ============================================================
-- Atomically:
--   1. Locks the orders row FOR UPDATE.
--   2. Validates status = 'draft' (rejects otherwise with ORDERS_CONFIRM_NOT_DRAFT).
--   3. Validates >= 1 order_item exists (rejects with ORDERS_CONFIRM_NO_ITEMS).
--   4. Updates orders.status to 'confirmed'.
--   5. For each item (per order_type):
--      keys/equipment order_type='keys': item_type='key' with product_id not null
--        → INSERT support.tickets (key_configuration) + INSERT stock_movements (reserva)
--      technical order_type='technical': item_type IN (maintenance, installation,
--        equipment, equipment_replacement)
--        → INSERT support.tickets with appropriate category
--        → equipment/equipment_replacement with product_id not null also get reserva
--   6. Mirrors exactly the logic that was in order_items_create_tarea (migration
--      000052), including the particulares administration fallback and
--      ON CONFLICT DO NOTHING idempotency on the reserva partial unique index.
--
-- Security: SECURITY DEFINER so the RPC can write to support.tickets
-- (which lives in the support schema and requires elevated access).

create or replace function public.confirm_order(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public, support
as $$
declare
  v_order         record;
  v_item          record;
  v_admin_id      uuid;
  v_ticket_id     uuid;
  v_category      text;
  v_item_count    int;
begin
  -- 1. Lock the order row and read current state.
  select id, status, order_type, administration_id
    into v_order
    from public.orders
   where id = p_order_id
   for update;

  if not found then
    raise exception 'ORDERS_CONFIRM_NOT_FOUND: order % does not exist', p_order_id
      using errcode = 'P0001';
  end if;

  -- 2. Validate status = 'draft'.
  if v_order.status <> 'draft' then
    raise exception 'ORDERS_CONFIRM_NOT_DRAFT: order % is not in draft status (current: %)',
      p_order_id, v_order.status
      using errcode = 'P0001';
  end if;

  -- 3. Validate at least one item exists.
  select count(*) into v_item_count
    from public.order_items
   where order_id = p_order_id;

  if v_item_count = 0 then
    raise exception 'ORDERS_CONFIRM_NO_ITEMS: order % has no items', p_order_id
      using errcode = 'P0001';
  end if;

  -- 4. Transition the order to 'confirmed'.
  update public.orders
     set status = 'confirmed'
   where id = p_order_id;

  -- 5. Per-item side effects (mirrors order_items_create_tarea from 000052).
  for v_item in
    select id, item_type, product_id, building_id, quantity, description
      from public.order_items
     where order_id = p_order_id
  loop
    -- Reset ticket tracking per item.
    v_ticket_id := null;
    v_admin_id  := null;

    -- ----------------------------------------------------------------
    -- Maintenance / installation items (technical order)
    -- ----------------------------------------------------------------
    if v_item.item_type in ('maintenance', 'installation') then
      -- Try the order-level administration first.
      v_admin_id := v_order.administration_id;

      -- Particular orders: derive administration from the building.
      if v_admin_id is null and v_item.building_id is not null then
        select administration_id into v_admin_id
          from public.buildings
         where id = v_item.building_id;
      end if;

      -- Skip if still no administration or no building (same guard as trigger).
      if v_admin_id is null or v_item.building_id is null then
        continue;
      end if;

      insert into support.tickets (
        administration_id, building_id, category, description, status, notes,
        order_item_id
      ) values (
        v_admin_id,
        v_item.building_id,
        v_item.item_type,
        coalesce(nullif(trim(v_item.description), ''),
                 'Item de orden (' || v_item.item_type || ')'),
        'open',
        'Generado automáticamente desde order_item ' || v_item.id::text,
        v_item.id
      );

      continue;
    end if;

    -- ----------------------------------------------------------------
    -- equipment_replacement (technical order) — distinct category
    -- ----------------------------------------------------------------
    if v_item.item_type = 'equipment_replacement' then
      v_admin_id := v_order.administration_id;

      if v_admin_id is null and v_item.building_id is not null then
        select administration_id into v_admin_id
          from public.buildings
         where id = v_item.building_id;
      end if;

      if v_item.building_id is not null and v_admin_id is not null then
        insert into support.tickets (
          administration_id, building_id, category, description, status, notes,
          order_item_id
        ) values (
          v_admin_id,
          v_item.building_id,
          'equipment_replacement',
          coalesce(nullif(trim(v_item.description), ''), 'Cambio de equipo'),
          'open',
          'Generado automáticamente desde order_item ' || v_item.id::text,
          v_item.id
        );
      end if;

      continue;
    end if;

    -- ----------------------------------------------------------------
    -- Stock-backed lines: key / equipment
    -- Skip items with no product_id (no inventory SKU → no ticket, no
    -- reservation) — matches the original trigger behavior.
    -- ----------------------------------------------------------------
    if v_item.item_type not in ('key', 'equipment') then
      continue;  -- unknown item_type: skip silently
    end if;

    if v_item.product_id is null then
      continue;
    end if;

    v_category := case v_item.item_type
                    when 'key'       then 'key_configuration'
                    when 'equipment' then 'equipment_installation'
                  end;

    -- Resolve administration: order-level first, then building-level
    -- (particulares fallback — particular orders are NOT exempt for stock lines).
    v_admin_id := v_order.administration_id;

    if v_admin_id is null and v_item.building_id is not null then
      select administration_id into v_admin_id
        from public.buildings
       where id = v_item.building_id;
    end if;

    -- Create ticket when building and administration are both known.
    if v_item.building_id is not null and v_admin_id is not null then
      insert into support.tickets (
        administration_id, building_id, category, description, status, notes,
        order_item_id
      ) values (
        v_admin_id,
        v_item.building_id,
        v_category,
        coalesce(nullif(trim(v_item.description), ''),
                 'Item de orden (' || v_item.item_type || ')'),
        'open',
        'Generado automáticamente desde order_item ' || v_item.id::text,
        v_item.id
      )
      returning id into v_ticket_id;
    end if;

    -- Reservation movement (negative quantity).
    -- Idempotent per order_item via the partial UNIQUE index on
    -- stock_movements (order_item_id, type) WHERE type = 'reserva'.
    insert into public.stock_movements (
      product_id, type, quantity, note, order_id, order_item_id, ticket_id
    ) values (
      v_item.product_id,
      'reserva',
      -v_item.quantity,
      'Reserva de stock desde order_item ' || v_item.id::text,
      p_order_id,
      v_item.id,
      v_ticket_id
    )
    on conflict (order_item_id, type)
      where type = 'reserva' and order_item_id is not null
      do nothing;

  end loop;
end;
$$;

grant execute on function public.confirm_order(uuid) to authenticated;

-- ============================================================
-- STEP 7: update_draft_order_with_items RPC
-- ============================================================
-- Atomically updates a draft order header and performs a full item-set
-- sync (upsert by id, delete missing) in one transaction.
--
-- Arguments:
--   p_order_id            — order to update
--   p_patch               — jsonb object with optional header fields:
--                             notes, particular_id, administration_id,
--                             particular_full_name, particular_dni,
--                             particular_phone, particular_email,
--                             client_type, order_type
--   p_items               — jsonb[] where each element may include:
--                             id (existing item — UPDATE path)
--                             item_type, quantity, description,
--                             building_id, product_id, unit_price,
--                             unit_id, pickup_particular_id
--   p_expected_updated_at — optimistic concurrency guard; raises
--                           ORDERS_UPDATE_CONFLICT on mismatch
--
-- Returns: new orders.updated_at (timestamptz)
--
-- NOTE: No trigger side effects fire because order_items_create_tarea
-- was dropped in STEP 4. Item inserts into a draft order are clean.

create or replace function public.update_draft_order_with_items(
  p_order_id            uuid,
  p_patch               jsonb,
  p_items               jsonb[],
  p_expected_updated_at timestamptz
) returns timestamptz
language plpgsql
security definer
set search_path = public, support
as $$
declare
  v_order           record;
  v_new_updated_at  timestamptz;
  v_item            jsonb;
  v_item_id         uuid;
  v_item_ids_kept   uuid[] := array[]::uuid[];
begin
  -- 1. Lock the row and read current state.
  select id, status, updated_at
    into v_order
    from public.orders
   where id = p_order_id
   for update;

  if not found then
    raise exception 'ORDERS_UPDATE_NOT_FOUND: order % does not exist', p_order_id
      using errcode = 'P0001';
  end if;

  -- 2. Validate status = 'draft'.
  if v_order.status <> 'draft' then
    raise exception 'ORDERS_UPDATE_NOT_DRAFT: order % is not in draft status (current: %)',
      p_order_id, v_order.status
      using errcode = 'P0001';
  end if;

  -- 3. Optimistic concurrency guard.
  if v_order.updated_at <> p_expected_updated_at then
    raise exception 'ORDERS_UPDATE_CONFLICT: order % was modified concurrently (expected %, actual %)',
      p_order_id, p_expected_updated_at, v_order.updated_at
      using errcode = 'P0001';
  end if;

  -- 4. Update the order header with any provided patch fields.
  --    Only non-null patch keys are applied; absent keys are left unchanged.
  update public.orders
     set
       notes                = coalesce(p_patch->>'notes',                 notes),
       client_type          = coalesce(p_patch->>'client_type',           client_type),
       order_type           = coalesce(p_patch->>'order_type',            order_type),
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

  -- 5. Item sync: upsert items present in payload; delete items absent.
  if p_items is not null then
    foreach v_item in array p_items loop
      v_item_id := (v_item->>'id')::uuid;

      if v_item_id is not null then
        -- Existing item: UPDATE.
        update public.order_items
           set
             item_type           = coalesce(v_item->>'item_type',     item_type),
             quantity            = coalesce((v_item->>'quantity')::int, quantity),
             description         = coalesce(v_item->>'description',   description),
             building_id         = case
                                     when v_item ? 'building_id'
                                     then (v_item->>'building_id')::uuid
                                     else building_id
                                   end,
             product_id          = case
                                     when v_item ? 'product_id'
                                     then (v_item->>'product_id')::uuid
                                     else product_id
                                   end,
             unit_price          = case
                                     when v_item ? 'unit_price'
                                     then nullif(v_item->>'unit_price', '')::numeric(12, 2)
                                     else unit_price
                                   end,
             unit_id             = case
                                     when v_item ? 'unit_id'
                                     then (v_item->>'unit_id')::uuid
                                     else unit_id
                                   end,
             pickup_particular_id = case
                                     when v_item ? 'pickup_particular_id'
                                     then (v_item->>'pickup_particular_id')::uuid
                                     else pickup_particular_id
                                   end
         where id = v_item_id
           and order_id = p_order_id;

        v_item_ids_kept := v_item_ids_kept || v_item_id;
      else
        -- New item: INSERT.
        insert into public.order_items (
          order_id,
          item_type,
          quantity,
          description,
          building_id,
          product_id,
          unit_price,
          unit_id,
          pickup_particular_id
        )
        values (
          p_order_id,
          v_item->>'item_type',
          (v_item->>'quantity')::int,
          v_item->>'description',
          (v_item->>'building_id')::uuid,
          (v_item->>'product_id')::uuid,
          nullif(v_item->>'unit_price', '')::numeric(12, 2),
          (v_item->>'unit_id')::uuid,
          (v_item->>'pickup_particular_id')::uuid
        )
        returning id into v_item_id;

        v_item_ids_kept := v_item_ids_kept || v_item_id;
      end if;
    end loop;

    -- Delete order_items that were NOT in the payload.
    delete from public.order_items
     where order_id = p_order_id
       and id <> all(v_item_ids_kept);
  end if;

  return v_new_updated_at;
end;
$$;

grant execute on function public.update_draft_order_with_items(uuid, jsonb, jsonb[], timestamptz) to authenticated;
