-- ============================================================
-- Migration: configure_key_order_item retargeted to key_order_items
-- ============================================================
-- Adds a new overload of configure_key_order_item that operates on
-- public.key_order_items instead of public.order_items.
--
-- The old function on public.order_items remains intact until PR-4 (W8),
-- when the legacy retirement migration drops it. Both overloads coexist
-- during the transition period.
--
-- Signature (unchanged from migration 000068):
--   configure_key_order_item(p_order_item_id, p_rfid_code, p_unit_id, p_equipment_ids)
--   returns uuid
--
-- This new body reads from public.key_order_items (not order_items) and
-- triggers recompute_key_order_status (not the legacy order status trigger).
-- The stock-movements and key-minting logic is identical to migration 000068.
--
-- Depends on: 20260818000081 (key_order_items)
--             20260818000086 (confirm_key_order, key_order_items populated)
--             20260818000087 (recompute_key_order_status)
-- ============================================================

create or replace function public.configure_key_order_item(
  p_order_item_id uuid,
  p_rfid_code     text,
  p_unit_id       uuid,
  p_equipment_ids uuid[]
) returns uuid
language plpgsql
security definer
set search_path = public, support, operations, identity, extensions
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

  -- Try key_order_items first.
  select status, produced_key_id, product_id, quantity, order_id
    into v_item_status, v_existing_key, v_product_id, v_quantity, v_order_id
    from public.key_order_items
   where id = p_order_item_id;

  if v_item_status is null then
    -- Fall back to legacy order_items for the transition period (PR-1 through PR-3).
    -- This allows existing in-flight orders on the old schema to still be configured.
    select status, produced_key_id, product_id, quantity, order_id
      into v_item_status, v_existing_key, v_product_id, v_quantity, v_order_id
      from public.order_items
     where id = p_order_item_id;

    if v_item_status is null then
      raise exception 'configure_key: order item % not found in key_order_items or order_items', p_order_item_id
        using errcode = 'P0001';
    end if;

    -- Delegate to the legacy path for backward compat (call the old body logic inline).
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

    insert into public.rfid_keys (rfid_code, unit_id, order_item_id, status)
      values (p_rfid_code, p_unit_id, p_order_item_id, 'pending_creation')
      returning id into v_key_id;

    insert into public.key_events (key_id, event_type, note)
      values (v_key_id, 'creation_requested', 'Llave creada para order_item ' || p_order_item_id);

    update public.order_items
       set produced_key_id = v_key_id, status = 'configured'
     where id = p_order_item_id;

    if p_equipment_ids is not null then
      foreach v_eq_id in array p_equipment_ids loop
        insert into public.rfid_key_intended_equipment (rfid_key_id, equipment_id)
          values (v_key_id, v_eq_id)
          on conflict do nothing;
      end loop;
    end if;

    if v_product_id is not null then
      select m.ticket_id into v_ticket_id
        from public.stock_movements m
       where m.order_item_id = p_order_item_id and m.type = 'reserva'
       limit 1;

      insert into public.stock_movements (product_id, type, quantity, note, order_id, order_item_id, ticket_id, created_by)
        values (v_product_id, 'egreso_grabacion', -v_quantity,
                'Egreso por configuración de llave (order_item ' || p_order_item_id || ')',
                v_order_id, p_order_item_id, v_ticket_id, v_actor);

      insert into public.stock_movements (product_id, type, quantity, note, order_id, order_item_id, ticket_id, created_by)
        values (v_product_id, 'liberacion_reserva', v_quantity,
                'Liberación de reserva al configurar llave (order_item ' || p_order_item_id || ')',
                v_order_id, p_order_item_id, v_ticket_id, v_actor);

      if v_ticket_id is not null then
        update support.tickets set status = 'in_progress' where id = v_ticket_id and status = 'open';
        update support.tickets
           set status = 'resolved',
               resolved_by_staff_id = v_actor,
               resolution_notes = 'Llave configurada (order_item ' || p_order_item_id || ')'
         where id = v_ticket_id and status = 'in_progress';
      end if;
    end if;

    update public.rfid_keys set status = 'pending_installation' where id = v_key_id;
    insert into public.key_events (key_id, event_type, note)
      values (v_key_id, 'configured', 'Llave programada, lista para instalación en equipo');

    return v_key_id;
  end if;

  -- ----------------------------------------------------------------
  -- New path: key_order_items
  -- ----------------------------------------------------------------

  -- Idempotent no-op: already configured → return the minted key.
  if v_item_status = 'configured' then
    if v_existing_key is null then
      raise exception 'configure_key: key_order_item % is configured but has no produced key (inconsistent state)',
        p_order_item_id
        using errcode = 'P0001';
    end if;
    return v_existing_key;
  end if;

  if v_item_status <> 'pending' then
    raise exception 'configure_key: key_order_item % is not pending (current status: %)',
      p_order_item_id, v_item_status
      using errcode = 'P0001';
  end if;

  -- Mint the RFID key as pending_creation.
  -- Note: rfid_keys.order_item_id still exists (references the legacy order_items FK);
  -- for key_order_items we track via key_order_items.produced_key_id instead.
  -- We do NOT set rfid_keys.order_item_id here since it FKs to the legacy table.
  insert into public.rfid_keys (rfid_code, unit_id, status)
    values (p_rfid_code, p_unit_id, 'pending_creation')
    returning id into v_key_id;

  -- Emit creation_requested event.
  insert into public.key_events (key_id, event_type, note)
    values (v_key_id, 'creation_requested', 'Llave creada para key_order_item ' || p_order_item_id);

  -- Link key to the new item and mark as configured.
  -- This triggers key_order_items_recompute_order_status_trigger.
  update public.key_order_items
     set produced_key_id = v_key_id,
         unit_id         = coalesce(p_unit_id, unit_id),
         status          = 'configured'
   where id = p_order_item_id;

  -- Populate intended equipment junction.
  if p_equipment_ids is not null then
    foreach v_eq_id in array p_equipment_ids loop
      insert into public.rfid_key_intended_equipment (rfid_key_id, equipment_id)
        values (v_key_id, v_eq_id)
        on conflict do nothing;
    end loop;
  end if;

  -- Stock side-effects: only when the item references an inventory SKU.
  if v_product_id is not null then
    -- Locate the reserva movement created at confirm time.
    select sm.ticket_id into v_ticket_id
      from public.stock_movements sm
     where sm.order_item_id = p_order_item_id
       and sm.order_kind = 'key'
       and sm.type = 'reserva'
     limit 1;

    -- Definitive egress movement.
    insert into public.stock_movements (
      product_id, type, quantity, note, order_id, order_item_id, order_kind, created_by
    )
    values (
      v_product_id, 'egreso_grabacion', -v_quantity,
      'Egreso por configuración de llave (key_order_item ' || p_order_item_id || ')',
      v_order_id, p_order_item_id, 'key', v_actor
    );

    -- Release the reservation.
    insert into public.stock_movements (
      product_id, type, quantity, note, order_id, order_item_id, order_kind, created_by
    )
    values (
      v_product_id, 'liberacion_reserva', v_quantity,
      'Liberación de reserva al configurar llave (key_order_item ' || p_order_item_id || ')',
      v_order_id, p_order_item_id, 'key', v_actor
    );
  end if;

  -- Advance key to pending_installation and emit 'configured' event.
  update public.rfid_keys set status = 'pending_installation' where id = v_key_id;

  insert into public.key_events (key_id, event_type, note)
    values (v_key_id, 'configured', 'Llave programada, lista para instalación en equipo');

  return v_key_id;
end;
$$;

-- Grant execute (same permissions as the previous version).
grant execute on function public.configure_key_order_item(uuid, text, uuid, uuid[]) to authenticated, service_role;
