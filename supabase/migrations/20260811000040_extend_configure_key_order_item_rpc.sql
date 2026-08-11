-- ============================================================
-- Extend configure_key_order_item: stock side-effects + C1 fix
-- ============================================================
-- Signature preserved: (p_order_item_id, p_rfid_code, p_unit_id,
-- p_equipment_ids) -> uuid. The UI caller (useMutateOrderItem.ts) passes
-- exactly these arguments, so the contract at the PostgREST boundary is
-- unchanged.
--
-- FIXES pre-existing defect C1 (SQLSTATE 42703): the historical body
-- inserted rfid_keys.key_type, a column dropped by
-- 20260807000010_admin_units_refactor_and_fixes.sql. The new body drops
-- that reference and mints the key with status='active' (available).
--
-- ADDED (when order_items.product_id IS NOT NULL):
--   1. stock_movements egreso_grabacion (negative qty)  -> decrement total
--   2. stock_movements liberacion_reserva (positive qty)-> release reserva
--   3. resolve the key_configuration ticket (fires the resolution-chain
--      trigger, which spawns the key_installation ticket)
-- The ticket is located through the reserva movement's ticket_id (tickets
-- have no order_item_id column; the tarea trigger stamps the reserva with
-- the ticket it created).
--
-- Idempotency: an already-configured item is a no-op that returns the minted
-- key id, so re-running never duplicates movements or errors.

create or replace function public.configure_key_order_item(
  p_order_item_id  uuid,
  p_rfid_code      text,
  p_unit_id        uuid,
  p_equipment_ids  uuid[]
) returns uuid
language plpgsql
security definer
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

  -- Idempotent no-op: already configured -> return the minted key. A
  -- configured item with no minted key is an inconsistent state, not a
  -- re-run: fail loudly instead of silently returning null.
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

  -- Mint the RFID key. No key_type (column dropped in 20260807000010); the
  -- new key is minted active (available).
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
    'active'
  )
  returning id into v_key_id;

  -- Link the key to the order item and mark as configured.
  update public.order_items
     set produced_key_id = v_key_id,
         status          = 'configured'
   where id = p_order_item_id;

  -- Insert key authorizations (optional; empty array is OK).
  if p_equipment_ids is not null then
    foreach v_eq_id in array p_equipment_ids loop
      insert into operations.key_authorizations (rfid_key_id, equipment_id)
      values (v_key_id, v_eq_id);
    end loop;
  end if;

  -- Stock side-effects: only when the item references an inventory SKU.
  if v_product_id is not null then
    -- Locate the key_configuration ticket created for this order_item via
    -- the reserva movement (see 20260811000038).
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

    -- Auto-resolve the key_configuration ticket; the resolution-chain
    -- trigger spawns the key_installation ticket.
    -- NOTE: the tickets state machine (support.tickets_validate) forbids a
    -- direct open -> resolved hop, so the transition goes through
    -- in_progress. The first UPDATE is a no-op for non-open tickets.
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

  return v_key_id;
end;
$$;
