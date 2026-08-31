-- ============================================================
-- Migration: atomic-stock-work-resolution
-- ============================================================
-- Rationale: equipment_installation and equipment_replacement tickets
-- leave stock reservations dangling after resolution because the generic
-- resolve_ticket path has no stock side-effects. This migration closes
-- the ledger gap by:
--   (a) Extending stock_movements.type CHECK to include egreso_reemplazo.
--   (b) Refreshing stock_movements_sign_matches_type to classify
--       egreso_reemplazo as a negative-quantity type.
--   (c) Adding public.resolve_equipment_replacement — mirrors
--       resolve_equipment_installation, delegates the swap to
--       operations.replace_equipment.
--   (d) Backfilling historical resolved equipment_installation tickets
--       that have a reserva with no matching egreso_instalacion /
--       liberacion_reserva.
--
-- Rollback pointer: see design.md §Migration / Rollout for manual steps.
-- No down migration file (pre-production convention).
-- ============================================================

-- -------------------------------------------------------
-- (a) Extend stock_movements.type CHECK to add egreso_reemplazo
-- -------------------------------------------------------

alter table public.stock_movements
  drop constraint stock_movements_type_check;

alter table public.stock_movements
  add constraint stock_movements_type_check
  check (type in (
    'compra',
    'devolucion',
    'ajuste_manual',
    'egreso_grabacion',
    'egreso_instalacion',
    'egreso_reemplazo',
    'baja_defectuoso',
    'baja_perdida',
    'reserva',
    'liberacion_reserva'
  ));

-- -------------------------------------------------------
-- (b) Refresh sign constraint — adds egreso_reemplazo to negative list
-- -------------------------------------------------------

alter table public.stock_movements
  drop constraint stock_movements_sign_matches_type;

alter table public.stock_movements
  add constraint stock_movements_sign_matches_type
  check (
    (type in ('compra', 'devolucion', 'liberacion_reserva') and quantity > 0)
    or (type in (
          'egreso_grabacion',
          'egreso_instalacion',
          'egreso_reemplazo',
          'baja_defectuoso',
          'baja_perdida',
          'reserva'
        ) and quantity < 0)
    or (type = 'ajuste_manual')
  );

-- -------------------------------------------------------
-- (c) New RPC: resolve_equipment_replacement
-- -------------------------------------------------------
-- Admin resolves an equipment_replacement ticket atomically:
--   1. Validate: ticket exists, category=equipment_replacement, not resolved.
--   2. Call operations.replace_equipment to swap the device and migrate
--      key_authorizations (uses CREATE TEMP TABLE ON COMMIT DROP — safe to
--      nest inside this outer transaction; drops at outer commit).
--   3. Locate the originating order_item through the reserva movement.
--   4. If product_id IS NOT NULL: emit egreso_reemplazo (-qty) +
--      liberacion_reserva (+qty).
--   5. Update support.tickets.equipment_id to the new equipment UUID.
--   6. Resolve the ticket via the two-step state machine
--      (open → in_progress → resolved; direct open → resolved is rejected
--      by support.tickets_validate).
--
-- SECURITY DEFINER mirrors resolve_equipment_installation.
-- Idempotency: an already-resolved ticket raises P0001, preventing
-- double-emission of stock movements.

create or replace function public.resolve_equipment_replacement(
  p_ticket_id         uuid,
  p_old_equipment_id  uuid,
  p_new_serial        text,
  p_new_model         text,
  p_new_description   text default null,
  p_note              text default null,
  p_actor_staff_id    uuid default null
) returns uuid
language plpgsql
security definer
as $$
declare
  v_ticket_category  text;
  v_ticket_status    text;
  v_new_equipment_id uuid;
  v_product_id       uuid;
  v_quantity         int;
  v_order_id         uuid;
  v_order_item_id    uuid;
  v_actor            uuid;
begin
  v_actor := coalesce(p_actor_staff_id, identity.current_staff_id());

  if p_new_serial is null or length(trim(p_new_serial)) = 0 then
    raise exception 'resolve_equipment_replacement: new serial is required'
      using errcode = 'P0001';
  end if;

  -- Lock the ticket and validate it is a pending equipment_replacement.
  select category, status
    into v_ticket_category, v_ticket_status
    from support.tickets
   where id = p_ticket_id
   for update;

  if v_ticket_category is null then
    raise exception 'resolve_equipment_replacement: ticket % not found', p_ticket_id
      using errcode = 'P0001';
  end if;

  if v_ticket_category <> 'equipment_replacement' then
    raise exception
      'resolve_equipment_replacement: ticket % is not equipment_replacement (category: %)',
      p_ticket_id, v_ticket_category
      using errcode = 'P0001';
  end if;

  if v_ticket_status = 'resolved' then
    raise exception 'resolve_equipment_replacement: ticket % is already resolved', p_ticket_id
      using errcode = 'P0001';
  end if;

  -- Swap the physical equipment + migrate key authorizations.
  -- operations.replace_equipment uses CREATE TEMP TABLE _keys_to_migrate
  -- ON COMMIT DROP; nesting inside this outer transaction is safe — the
  -- temp table drops when the outer transaction commits.
  v_new_equipment_id := operations.replace_equipment(
    p_old_equipment_id,
    trim(p_new_serial),
    p_new_model,
    coalesce(p_new_description, ''),
    null,
    'Replaced via ticket ' || p_ticket_id,
    v_actor
  );

  -- Locate the originating order_item through the reserva movement
  -- stamped with this ticket id. No reserva (or NULL product_id) means
  -- no stock movement is emitted (backward-compatible).
  select sm.order_item_id, sm.product_id, oi.order_id, oi.quantity
    into v_order_item_id, v_product_id, v_order_id, v_quantity
    from public.stock_movements sm
    join public.order_items oi on oi.id = sm.order_item_id
   where sm.ticket_id = p_ticket_id
     and sm.type = 'reserva'
   limit 1;

  if v_product_id is not null then
    -- Definitive egress: consumes the reservation.
    insert into public.stock_movements (
      product_id, type, quantity, note, order_id, order_item_id,
      ticket_id, created_by
    ) values (
      v_product_id, 'egreso_reemplazo', -v_quantity,
      'Egreso por reemplazo de equipo (ticket ' || p_ticket_id || ')',
      v_order_id, v_order_item_id, p_ticket_id, v_actor
    );

    -- Release the reservation.
    insert into public.stock_movements (
      product_id, type, quantity, note, order_id, order_item_id,
      ticket_id, created_by
    ) values (
      v_product_id, 'liberacion_reserva', v_quantity,
      'Liberación de reserva al reemplazar equipo (ticket ' || p_ticket_id || ')',
      v_order_id, v_order_item_id, p_ticket_id, v_actor
    );
  end if;

  -- Update the ticket's linked equipment to the newly-created device.
  update support.tickets
     set equipment_id = v_new_equipment_id
   where id = p_ticket_id;

  -- Resolve the ticket via the two-step state machine.
  -- Step 1: open → in_progress (no-op if already in_progress).
  update support.tickets
     set status = 'in_progress'
   where id = p_ticket_id
     and status = 'open';

  -- Step 2: in_progress → resolved.
  update support.tickets
     set status               = 'resolved',
         resolved_by_staff_id = v_actor,
         resolution_notes     = coalesce(
           nullif(trim(coalesce(p_note, '')), ''),
           'Equipo reemplazado (serial ' || trim(p_new_serial) || ')'
         )
   where id = p_ticket_id
     and status = 'in_progress';

  return v_new_equipment_id;
end;
$$;

-- -------------------------------------------------------
-- (c-fix) Patch resolve_equipment_installation to also set
--         support.tickets.equipment_id before resolving.
-- -------------------------------------------------------
-- Migration 20260811000052 added a BEFORE UPDATE trigger
-- (tickets_require_equipment_on_resolve) that rejects the
-- open → in_progress → resolved state machine unless
-- equipment_id IS NOT NULL. The original RPC (migration
-- 20260811000041) created the equipment row and returned
-- its id but never wrote it back to the ticket, leaving it
-- broken after the trigger was introduced.
-- This CREATE OR REPLACE adds the missing UPDATE statement.

create or replace function public.resolve_equipment_installation(
  p_ticket_id       uuid,
  p_serial          text,
  p_unit_id         uuid,
  p_note            text default null,
  p_actor_staff_id  uuid default null
) returns uuid
language plpgsql
security definer
as $$
declare
  v_ticket_category  text;
  v_ticket_status    text;
  v_building_id      uuid;
  v_description      text;
  v_equipment_id     uuid;
  v_product_id       uuid;
  v_quantity         int;
  v_order_id         uuid;
  v_order_item_id    uuid;
  v_actor            uuid;
begin
  v_actor := coalesce(p_actor_staff_id, identity.current_staff_id());

  if p_serial is null or length(trim(p_serial)) = 0 then
    raise exception 'resolve_equipment_installation: serial is required'
      using errcode = 'P0001';
  end if;

  -- Lock the ticket and validate it is a pending equipment_installation.
  select category, status, building_id, description
    into v_ticket_category, v_ticket_status, v_building_id, v_description
    from support.tickets
   where id = p_ticket_id
   for update;

  if v_ticket_category is null then
    raise exception 'resolve_equipment_installation: ticket % not found', p_ticket_id
      using errcode = 'P0001';
  end if;

  if v_ticket_category <> 'equipment_installation' then
    raise exception
      'resolve_equipment_installation: ticket % is not an equipment_installation (category: %)',
      p_ticket_id, v_ticket_category
      using errcode = 'P0001';
  end if;

  if v_ticket_status = 'resolved' then
    raise exception 'resolve_equipment_installation: ticket % is already resolved', p_ticket_id
      using errcode = 'P0001';
  end if;

  -- Create the physical equipment row (active = installed/available).
  insert into operations.equipment (
    serial_number,
    building_id,
    description,
    status,
    notes
  ) values (
    trim(p_serial),
    v_building_id,
    coalesce(nullif(trim(v_description), ''),
             'Equipo instalado (ticket ' || p_ticket_id || ')'),
    'active',
    'Instalado desde ticket ' || p_ticket_id
      || case when p_unit_id is not null
              then ' — unidad ' || p_unit_id::text
              else '' end
  )
  returning id into v_equipment_id;

  -- Link the new equipment to the ticket. Required before the resolved
  -- transition because tickets_require_equipment_on_resolve rejects the
  -- status update if equipment_id IS NULL for technical categories.
  update support.tickets
     set equipment_id = v_equipment_id
   where id = p_ticket_id;

  -- Stock side-effects: locate the originating order_item through the
  -- reserva movement stamped with this ticket id. No reserva (or NULL
  -- product_id) -> no stock movement (backward compatible).
  select sm.order_item_id, sm.product_id, oi.order_id, oi.quantity
    into v_order_item_id, v_product_id, v_order_id, v_quantity
    from public.stock_movements sm
    join public.order_items oi on oi.id = sm.order_item_id
   where sm.ticket_id = p_ticket_id
     and sm.type = 'reserva'
   limit 1;

  if v_product_id is not null then
    -- Definitive egress: consumes the reservation.
    insert into public.stock_movements (
      product_id, type, quantity, note, order_id, order_item_id,
      ticket_id, created_by
    ) values (
      v_product_id, 'egreso_instalacion', -v_quantity,
      'Egreso por instalación de equipo (ticket ' || p_ticket_id || ')',
      v_order_id, v_order_item_id, p_ticket_id, v_actor
    );

    -- Release the reservation.
    insert into public.stock_movements (
      product_id, type, quantity, note, order_id, order_item_id,
      ticket_id, created_by
    ) values (
      v_product_id, 'liberacion_reserva', v_quantity,
      'Liberación de reserva al instalar equipo (ticket ' || p_ticket_id || ')',
      v_order_id, v_order_item_id, p_ticket_id, v_actor
    );
  end if;

  -- Resolve the ticket via the two-step state machine.
  update support.tickets
     set status = 'in_progress'
   where id = p_ticket_id
     and status = 'open';

  update support.tickets
     set status               = 'resolved',
         resolved_by_staff_id = v_actor,
         resolution_notes     = coalesce(
           nullif(trim(coalesce(p_note, '')), ''),
           'Equipo instalado (serial ' || trim(p_serial) || ')'
         )
   where id = p_ticket_id
     and status = 'in_progress';

  return v_equipment_id;
end;
$$;

-- -------------------------------------------------------
-- (d) Backfill historical resolved equipment_installation tickets
-- -------------------------------------------------------
-- For every resolved equipment_installation ticket that has a reserva
-- movement with product_id IS NOT NULL but no matching egreso_instalacion
-- or liberacion_reserva, insert both. The idempotency guard (NOT EXISTS)
-- ensures re-running this block is safe. Note prefix '[Backfill 000061]'
-- allows targeted rollback: DELETE ... WHERE note LIKE '[Backfill 000061]%'.

do $$
declare
  r record;
begin
  for r in
    select t.id                  as ticket_id,
           t.resolved_by_staff_id,
           sm.product_id,
           sm.order_item_id,
           oi.order_id,
           oi.quantity
      from support.tickets t
      join public.stock_movements sm
        on sm.ticket_id = t.id
       and sm.type      = 'reserva'
      join public.order_items oi
        on oi.id = sm.order_item_id
     where t.status    = 'resolved'
       and t.category  = 'equipment_installation'
       and sm.product_id is not null
       and not exists (
             select 1
               from public.stock_movements m2
              where m2.ticket_id = t.id
                and m2.type in ('egreso_instalacion', 'liberacion_reserva')
           )
  loop
    insert into public.stock_movements (
      product_id, type, quantity, note, order_id, order_item_id,
      ticket_id, created_by
    ) values (
      r.product_id, 'egreso_instalacion', -r.quantity,
      '[Backfill 000061] Egreso por instalación de equipo (ticket ' || r.ticket_id || ')',
      r.order_id, r.order_item_id, r.ticket_id, r.resolved_by_staff_id
    );

    insert into public.stock_movements (
      product_id, type, quantity, note, order_id, order_item_id,
      ticket_id, created_by
    ) values (
      r.product_id, 'liberacion_reserva', r.quantity,
      '[Backfill 000061] Liberación de reserva al instalar equipo (ticket ' || r.ticket_id || ')',
      r.order_id, r.order_item_id, r.ticket_id, r.resolved_by_staff_id
    );
  end loop;
end;
$$;

-- -------------------------------------------------------
-- (e) Patch stock_movements_maintain_counters to handle egreso_reemplazo
-- -------------------------------------------------------
-- The counter trigger (migration 20260811000030) enumerates every known
-- movement type. Adding egreso_reemplazo to the type CHECK without
-- updating the trigger would cause every egreso_reemplazo insert to raise
-- 'unknown type'. This CREATE OR REPLACE adds the missing WHEN branch;
-- egreso_reemplazo is a definitive egress that decrements stock_total
-- (same semantics as egreso_instalacion).

create or replace function public.stock_movements_maintain_counters()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_total_delta     int := 0;
  v_reservado_delta int := 0;
begin
  case new.type
    when 'compra'              then v_total_delta     :=  new.quantity;
    when 'devolucion'          then v_total_delta     :=  new.quantity;
    when 'ajuste_manual'       then v_total_delta     :=  new.quantity;
    when 'egreso_grabacion'    then v_total_delta     :=  new.quantity;
    when 'egreso_instalacion'  then v_total_delta     :=  new.quantity;
    when 'egreso_reemplazo'    then v_total_delta     :=  new.quantity;   -- negative → subtract
    when 'baja_defectuoso'     then v_total_delta     :=  new.quantity;
    when 'baja_perdida'        then v_total_delta     :=  new.quantity;
    when 'reserva'             then v_reservado_delta := -new.quantity;
    when 'liberacion_reserva'  then v_reservado_delta := -new.quantity;
    else
      raise exception 'stock_movements_maintain_counters: unknown type %', new.type
        using errcode = 'P0001';
  end case;

  update public.products
     set stock_total     = stock_total     + v_total_delta,
         stock_reservado = stock_reservado + v_reservado_delta
   where id = new.product_id;

  return null;
end;
$$;

-- -------------------------------------------------------
-- Grant execute on the new RPC to authenticated role
-- -------------------------------------------------------

grant execute on function public.resolve_equipment_replacement(
  uuid, uuid, text, text, text, text, uuid
) to authenticated;
