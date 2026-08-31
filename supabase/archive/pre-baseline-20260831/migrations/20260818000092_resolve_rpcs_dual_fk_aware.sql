-- ============================================================
-- Migration: resolve_* RPCs — dual-FK awareness (PR-3 / W6)
-- ============================================================
-- Updates resolve_equipment_installation and resolve_equipment_replacement
-- to follow the technical_order_item_id path when the ticket is linked to
-- a technical order item (dual-FK schema, migration 084).
--
-- Background:
--   Before PR-3, these RPCs locate the originating order by querying:
--     stock_movements WHERE ticket_id = p_ticket_id AND type = 'reserva'
--     JOIN public.order_items ON order_items.id = stock_movements.order_item_id
--   This query fails silently for technical order reservas because:
--     - confirm_technical_order creates reservas keyed by technical_order_item_id
--       and order_kind='technical', WITHOUT ticket_id set on the movement.
--     - technical_order_items.id is NOT in public.order_items.
--   Result: product_id stays NULL; no stock movements are emitted.
--
-- Fix strategy:
--   New path (ticket has technical_order_item_id):
--     Locate reserva by sm.order_item_id = technical_order_item_id and
--     sm.order_kind = 'technical'. JOIN technical_order_items for order_id/quantity.
--     Emit egreso/liberacion with order_kind='technical'.
--
--   Legacy path (ticket has no technical_order_item_id):
--     Keep the original sm.ticket_id = p_ticket_id JOIN order_items query.
--     Carry order_kind from the found reserva row (may be NULL for pre-083 data).
--
-- resolve_ticket: no changes needed — operates only on support.tickets status.
--
-- resolve_equipment_update: the NULL guard on v_order_item_id already handles
--   new-path keys (rfid_keys.order_item_id IS NULL). No changes needed for PR-3.
--
-- Rollback: recreate the pre-PR-3 bodies from migrations 000041 and 000061.
-- ============================================================

-- ============================================================
-- resolve_equipment_installation
-- ============================================================

create or replace function public.resolve_equipment_installation(
  p_ticket_id       uuid,
  p_serial          text,
  p_unit_id         uuid,
  p_note            text default null,
  p_actor_staff_id  uuid default null
) returns uuid
language plpgsql
security definer
set search_path = public, support, operations, identity
as $$
declare
  v_ticket_category          text;
  v_ticket_status            text;
  v_building_id              uuid;
  v_description              text;
  v_technical_order_item_id  uuid;
  v_equipment_id             uuid;
  v_product_id               uuid;
  v_quantity                 int;
  v_order_id                 uuid;
  v_order_item_id            uuid;
  v_order_kind               text;
  v_actor                    uuid;
begin
  v_actor := coalesce(p_actor_staff_id, identity.current_staff_id());

  if p_serial is null or length(trim(p_serial)) = 0 then
    raise exception 'resolve_equipment_installation: serial is required'
      using errcode = 'P0001';
  end if;

  -- Lock the ticket and validate it is a pending equipment_installation.
  select category, status, building_id, description, technical_order_item_id
    into v_ticket_category, v_ticket_status, v_building_id, v_description,
         v_technical_order_item_id
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

  -- -------------------------------------------------------
  -- Stock side-effects: locate the originating order item.
  --
  -- New path (ticket linked via technical_order_item_id):
  --   The reserva was created by confirm_technical_order keyed by
  --   order_item_id = technical_order_item_id, order_kind='technical',
  --   WITHOUT ticket_id. Locate by order_item_id directly.
  --
  -- Legacy path (ticket NOT linked via technical_order_item_id):
  --   The reserva was created by the old confirm_order with ticket_id set.
  --   Locate by ticket_id JOIN order_items. Carry order_kind from the reserva.
  --
  -- No reserva (or NULL product_id) → no stock movement (both paths).
  -- -------------------------------------------------------
  if v_technical_order_item_id is not null then
    -- New schema path.
    select sm.order_item_id, sm.product_id, toi.order_id, toi.quantity,
           sm.order_kind
      into v_order_item_id, v_product_id, v_order_id, v_quantity, v_order_kind
      from public.stock_movements sm
      join public.technical_order_items toi on toi.id = sm.order_item_id
     where sm.order_item_id = v_technical_order_item_id
       and sm.type          = 'reserva'
       and sm.order_kind    = 'technical'
     limit 1;
  else
    -- Legacy path: ticket_id was stamped on the reserva at confirm_order time.
    select sm.order_item_id, sm.product_id, oi.order_id, oi.quantity,
           sm.order_kind
      into v_order_item_id, v_product_id, v_order_id, v_quantity, v_order_kind
      from public.stock_movements sm
      join public.order_items oi on oi.id = sm.order_item_id
     where sm.ticket_id = p_ticket_id
       and sm.type      = 'reserva'
     limit 1;
  end if;

  if v_product_id is not null then
    -- Definitive egress: consumes the reservation.
    insert into public.stock_movements (
      product_id, type, quantity, note, order_id, order_item_id,
      order_kind, ticket_id, created_by
    ) values (
      v_product_id, 'egreso_instalacion', -v_quantity,
      'Egreso por instalación de equipo (ticket ' || p_ticket_id || ')',
      v_order_id, v_order_item_id, v_order_kind, p_ticket_id, v_actor
    );

    -- Release the reservation.
    insert into public.stock_movements (
      product_id, type, quantity, note, order_id, order_item_id,
      order_kind, ticket_id, created_by
    ) values (
      v_product_id, 'liberacion_reserva', v_quantity,
      'Liberación de reserva al instalar equipo (ticket ' || p_ticket_id || ')',
      v_order_id, v_order_item_id, v_order_kind, p_ticket_id, v_actor
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

-- ============================================================
-- resolve_equipment_replacement
-- ============================================================

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
set search_path = public, support, operations, identity
as $$
declare
  v_ticket_category          text;
  v_ticket_status            text;
  v_technical_order_item_id  uuid;
  v_new_equipment_id         uuid;
  v_product_id               uuid;
  v_quantity                 int;
  v_order_id                 uuid;
  v_order_item_id            uuid;
  v_order_kind               text;
  v_actor                    uuid;
begin
  v_actor := coalesce(p_actor_staff_id, identity.current_staff_id());

  if p_new_serial is null or length(trim(p_new_serial)) = 0 then
    raise exception 'resolve_equipment_replacement: new serial is required'
      using errcode = 'P0001';
  end if;

  -- Lock the ticket and validate it is a pending equipment_replacement.
  select category, status, technical_order_item_id
    into v_ticket_category, v_ticket_status, v_technical_order_item_id
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
  v_new_equipment_id := operations.replace_equipment(
    p_old_equipment_id,
    trim(p_new_serial),
    p_new_model,
    coalesce(p_new_description, ''),
    null,
    'Replaced via ticket ' || p_ticket_id,
    v_actor
  );

  -- -------------------------------------------------------
  -- Stock side-effects: locate the originating order item.
  --
  -- New path (ticket linked via technical_order_item_id):
  --   Locate reserva by order_item_id = technical_order_item_id directly.
  --
  -- Legacy path (ticket NOT linked via technical_order_item_id):
  --   Locate by ticket_id JOIN order_items. Carry order_kind from the reserva.
  --
  -- No reserva (or NULL product_id) → no stock movement (both paths).
  -- -------------------------------------------------------
  if v_technical_order_item_id is not null then
    -- New schema path.
    select sm.order_item_id, sm.product_id, toi.order_id, toi.quantity,
           sm.order_kind
      into v_order_item_id, v_product_id, v_order_id, v_quantity, v_order_kind
      from public.stock_movements sm
      join public.technical_order_items toi on toi.id = sm.order_item_id
     where sm.order_item_id = v_technical_order_item_id
       and sm.type          = 'reserva'
       and sm.order_kind    = 'technical'
     limit 1;
  else
    -- Legacy path: ticket_id was stamped on the reserva at confirm_order time.
    select sm.order_item_id, sm.product_id, oi.order_id, oi.quantity,
           sm.order_kind
      into v_order_item_id, v_product_id, v_order_id, v_quantity, v_order_kind
      from public.stock_movements sm
      join public.order_items oi on oi.id = sm.order_item_id
     where sm.ticket_id = p_ticket_id
       and sm.type      = 'reserva'
     limit 1;
  end if;

  if v_product_id is not null then
    -- Definitive egress: consumes the reservation.
    insert into public.stock_movements (
      product_id, type, quantity, note, order_id, order_item_id,
      order_kind, ticket_id, created_by
    ) values (
      v_product_id, 'egreso_reemplazo', -v_quantity,
      'Egreso por reemplazo de equipo (ticket ' || p_ticket_id || ')',
      v_order_id, v_order_item_id, v_order_kind, p_ticket_id, v_actor
    );

    -- Release the reservation.
    insert into public.stock_movements (
      product_id, type, quantity, note, order_id, order_item_id,
      order_kind, ticket_id, created_by
    ) values (
      v_product_id, 'liberacion_reserva', v_quantity,
      'Liberación de reserva al reemplazar equipo (ticket ' || p_ticket_id || ')',
      v_order_id, v_order_item_id, v_order_kind, p_ticket_id, v_actor
    );
  end if;

  -- Update the ticket's linked equipment to the newly-created device.
  update support.tickets
     set equipment_id = v_new_equipment_id
   where id = p_ticket_id;

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
           'Equipo reemplazado (serial ' || trim(p_new_serial) || ')'
         )
   where id = p_ticket_id
     and status = 'in_progress';

  return v_new_equipment_id;
end;
$$;

-- ============================================================
-- Grant execute (same permissions as before)
-- ============================================================

grant execute on function public.resolve_equipment_installation(uuid, text, uuid, text, uuid)
  to authenticated;

grant execute on function public.resolve_equipment_replacement(uuid, uuid, text, text, text, text, uuid)
  to authenticated;
