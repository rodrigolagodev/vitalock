-- ============================================================
-- NEW RPC: resolve_equipment_installation
-- ============================================================
-- Admin resolves an equipment_installation ticket atomically:
--   1. INSERT operations.equipment (serial) as status='active'
--      (installed/available — equipment has no separate 'installed' flag;
--      the row IS the installation record).
--   2. If the originating order_item has product_id: INSERT
--      stock_movements egreso_instalacion (-qty) + liberacion_reserva (+qty).
--   3. UPDATE support.tickets -> resolved.
--
-- SECURITY DEFINER (mirrors change_key_status / configure_key_order_item).
-- Idempotency: an already-resolved ticket raises P0001, so a second call can
-- never double-emit the egreso or mint a second equipment row.
--
-- Note: operations.equipment has no unit_id column, so p_unit_id (kept in
-- the signature for UI contract compatibility) is recorded in equipment.notes.

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

  -- Resolve the ticket (the idempotency guard above prevents double work).
  -- The tickets state machine (support.tickets_validate) forbids a direct
  -- open -> resolved hop, so the transition goes through in_progress.
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
