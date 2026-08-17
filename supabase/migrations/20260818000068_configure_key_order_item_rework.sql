-- ============================================================
-- Migration: rfid_key_intended_equipment junction + configure_key_order_item rewrite
-- ============================================================
-- (1) CREATE rfid_key_intended_equipment junction table.
--     Stores the intended equipment for each key at configure time.
--     The actual key_authorizations are minted later by resolve_equipment_update.
--
-- (2) REWRITE configure_key_order_item:
--     - Mint key with status='pending_creation' (was 'active')
--     - Emit key_events: creation_requested → configured
--     - Populate rfid_key_intended_equipment from p_equipment_ids
--     - Remove inline key_authorizations INSERT loop (auths minted at resolve time)
--     - Resolve key_configuration ticket (key advances to 'pending_installation')
--     - Stock movements unchanged
-- ============================================================

-- -------------------------------------------------------
-- (1) rfid_key_intended_equipment junction table
-- -------------------------------------------------------
create table public.rfid_key_intended_equipment (
  rfid_key_id  uuid not null references public.rfid_keys(id) on delete cascade,
  equipment_id uuid not null references operations.equipment(id) on delete restrict,
  created_at   timestamptz not null default now(),
  primary key (rfid_key_id, equipment_id)
);

create index rfid_key_intended_equipment_key_id_idx
  on public.rfid_key_intended_equipment (rfid_key_id);
create index rfid_key_intended_equipment_equipment_id_idx
  on public.rfid_key_intended_equipment (equipment_id);

-- -------------------------------------------------------
-- (2) Rewrite configure_key_order_item
-- -------------------------------------------------------
create or replace function public.configure_key_order_item(
  p_order_item_id  uuid,
  p_rfid_code      text,
  p_unit_id        uuid,
  p_equipment_ids  uuid[]
) returns uuid
language plpgsql
security definer
set search_path = public, support, operations, identity
as $$
declare
  v_key_id        uuid;
  v_item_status   text;
  v_existing_key  uuid;
  v_product_id    uuid;
  v_quantity      int;
  v_order_id      uuid;
  v_ticket_id     uuid;
  v_eq_id         uuid;
  v_actor         uuid;
begin
  v_actor := identity.current_staff_id();

  select status, produced_key_id, product_id, quantity, order_id
    into v_item_status, v_existing_key, v_product_id, v_quantity, v_order_id
    from public.order_items
   where id = p_order_item_id;

  if v_item_status is null then
    raise exception 'configure_key: order item % not found', p_order_item_id
      using errcode = 'P0001';
  end if;

  -- Idempotent no-op: already configured -> return the minted key.
  if v_item_status = 'configured' then
    if v_existing_key is null then
      raise exception 'configure_key: order item % is configured but has no produced key (inconsistent state)',
        p_order_item_id
        using errcode = 'P0001';
    end if;
    return v_existing_key;
  end if;

  if v_item_status <> 'pending' then
    raise exception 'configure_key: order item % is not pending (current status: %)',
      p_order_item_id, v_item_status
      using errcode = 'P0001';
  end if;

  -- Mint the RFID key as pending_creation (physical key exists but not yet programmed
  -- into any equipment; authorizations are minted at resolve_equipment_update time).
  insert into public.rfid_keys (
    rfid_code,
    unit_id,
    order_item_id,
    status
  )
  values (
    p_rfid_code,
    p_unit_id,
    p_order_item_id,
    'pending_creation'
  )
  returning id into v_key_id;

  -- Emit creation_requested event.
  insert into public.key_events (key_id, event_type, note)
    values (v_key_id, 'creation_requested', 'Llave creada para order_item ' || p_order_item_id);

  -- Link the key to the order item and mark as configured.
  update public.order_items
     set produced_key_id = v_key_id,
         status          = 'configured'
   where id = p_order_item_id;

  -- Populate intended equipment junction (replaces old inline key_authorizations loop).
  if p_equipment_ids is not null then
    foreach v_eq_id in array p_equipment_ids loop
      insert into public.rfid_key_intended_equipment (rfid_key_id, equipment_id)
        values (v_key_id, v_eq_id)
        on conflict do nothing;
    end loop;
  end if;

  -- Stock side-effects: only when the item references an inventory SKU.
  if v_product_id is not null then
    -- Locate the key_configuration ticket created for this order_item via
    -- the reserva movement.
    select m.ticket_id into v_ticket_id
      from public.stock_movements m
     where m.order_item_id = p_order_item_id
       and m.type = 'reserva'
     limit 1;

    -- Definitive egress: consumes the reservation.
    insert into public.stock_movements (
      product_id, type, quantity, note, order_id, order_item_id,
      ticket_id, created_by
    ) values (
      v_product_id, 'egreso_grabacion', -v_quantity,
      'Egreso por configuración de llave (order_item ' || p_order_item_id || ')',
      v_order_id, p_order_item_id, v_ticket_id, v_actor
    );

    -- Release the reservation.
    insert into public.stock_movements (
      product_id, type, quantity, note, order_id, order_item_id,
      ticket_id, created_by
    ) values (
      v_product_id, 'liberacion_reserva', v_quantity,
      'Liberación de reserva al configurar llave (order_item ' || p_order_item_id || ')',
      v_order_id, p_order_item_id, v_ticket_id, v_actor
    );

    -- Auto-resolve the key_configuration ticket; the key advances to pending_installation
    -- when the ticket resolves (the resolution chain no longer spawns key_installation
    -- tickets per migration 000060; instead we emit 'configured' event and advance the
    -- key status directly below).
    if v_ticket_id is not null then
      update support.tickets
         set status = 'in_progress'
       where id = v_ticket_id
         and status = 'open';

      update support.tickets
         set status               = 'resolved',
             resolved_by_staff_id = v_actor,
             resolution_notes     = 'Llave configurada (order_item ' || p_order_item_id || ')'
       where id = v_ticket_id
         and status = 'in_progress';
    end if;
  end if;

  -- Advance key to pending_installation and emit 'configured' event.
  -- This happens regardless of whether a product was involved.
  update public.rfid_keys set status = 'pending_installation' where id = v_key_id;

  insert into public.key_events (key_id, event_type, note)
    values (v_key_id, 'configured', 'Llave programada, lista para instalación en equipo');

  return v_key_id;
end;
$$;
