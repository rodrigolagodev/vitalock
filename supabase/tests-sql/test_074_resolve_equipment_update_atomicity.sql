-- ============================================================
-- DB smoke test: resolve_equipment_update atomicity / rollback
-- ============================================================
-- Prerequisite: migrations 064-073 applied.
--
-- Approach: verify PostgreSQL transaction atomicity by triggering a real
-- mid-RPC exception and asserting complete rollback.
--
-- Method chosen: pre-insert a key_authorization for key1 so that when the
-- RPC processes key1 (pending_installation → active → INSERT authorization),
-- the unique constraint `key_authorizations_key_equipment_unique` fires a
-- unique_violation mid-loop. This rolls back the entire savepoint, including
-- the status UPDATE for key1 and any state changes to key2 processed later.
--
-- Event-count checking: configure_key_order_item emits 2 key_events during
-- setup (created + key_configuration_resolved). We snapshot the count before
-- the injection attempt and assert the delta is 0 after rollback.
-- ============================================================

-- ============================================================
-- Scenario 1: unique-violation mid-loop rolls back ALL state changes
-- ============================================================
begin;
do $$
declare
  v_admin_id      uuid;
  v_building_id   uuid;
  v_unit_id       uuid;
  v_staff_id      uuid;
  v_equipment_id  uuid;
  v_product_id    uuid;
  v_order_id      uuid;
  v_order_item_id uuid;
  v_key1          uuid;  -- pending_installation (will cause unique violation on auth insert)
  v_key2          uuid;  -- pending_disable (should remain untouched after rollback)
  v_task_id       uuid;
  v_ticket_id     uuid;
  v_k1_status     text;
  v_k2_status     text;
  v_ticket_status text;
  v_events_before int;
  v_events_after  int;
  v_failed        boolean := false;
begin
  insert into public.administrations (company_name) values ('Test 074-S1') returning id into v_admin_id;
  insert into public.buildings (name, address, administration_id) values ('Building 074-S1', 'Calle 1', v_admin_id) returning id into v_building_id;
  insert into public.units (number, building_id) values ('1A', v_building_id) returning id into v_unit_id;
  insert into identity.staff (full_name, role) values ('Staff 074-S1', 'admin') returning id into v_staff_id;
  insert into public.products (name, category, stock_total, stock_reservado) values ('Produto 074-S1', 'rfid_key', 10, 0) returning id into v_product_id;
  insert into operations.equipment (serial_number, building_id, description, status) values ('SN-074-S1', v_building_id, 'Equip 074-S1', 'active') returning id into v_equipment_id;

  insert into public.orders (order_number, order_type, status, administration_id, client_type)
    values ('ORD-074-S1', 'keys', 'confirmed', v_admin_id, 'administration')
    returning id into v_order_id;

  insert into public.order_items (order_id, product_id, quantity, unit_price, item_type, building_id)
    values (v_order_id, v_product_id, 1, 100.00, 'key', v_building_id)
    returning id into v_order_item_id;

  insert into public.stock_movements (product_id, type, quantity, note, order_id, order_item_id)
    values (v_product_id, 'reserva', -1, 'Reserva test 074-S1', v_order_id, v_order_item_id);

  -- Key 1: configure to pending_installation (emits 2 key_events during setup)
  v_key1 := public.configure_key_order_item(v_order_item_id, 'T074-S1-KEY1', v_unit_id, array[v_equipment_id]);

  -- Key 2: pending_disable (processed second in the disable loop)
  insert into public.rfid_keys (rfid_code, unit_id, status) values ('T074-S1-KEY2', v_unit_id, 'pending_disable') returning id into v_key2;

  -- Create the equipment_update task
  select public.create_equipment_update(
    v_equipment_id, v_admin_id, v_building_id, 'Test 074-S1', 'path/test.mdb',
    array[v_key1], array[v_key2], v_staff_id
  ) into v_task_id;

  select ticket_id into v_ticket_id from support.equipment_updates where id = v_task_id;

  -- Failure injection: pre-insert a key_authorization for (key1, equipment).
  -- Temporarily advance key1 to active (required by the trigger), insert the
  -- conflicting auth, then revert key1 to pending_installation.
  update public.rfid_keys set status = 'active' where id = v_key1;
  insert into operations.key_authorizations (rfid_key_id, equipment_id, sync_state)
    values (v_key1, v_equipment_id, 'installed');
  update public.rfid_keys set status = 'pending_installation' where id = v_key1;

  -- Snapshot event count AFTER setup, BEFORE the injection attempt
  select count(*) into v_events_before from public.key_events where key_id in (v_key1, v_key2);

  -- Now call the RPC: it advances key1 → active, then tries INSERT key_authorization
  -- → unique_violation fires, exception propagates, savepoint rolls back.
  begin
    perform public.resolve_equipment_update(v_task_id, v_staff_id);
  exception when others then
    v_failed := true;
  end;

  assert v_failed, 'FAIL 074-S1: expected RPC to raise (unique constraint on key_authorization)';

  -- key1 must still be pending_installation (status UPDATE rolled back)
  select status into v_k1_status from public.rfid_keys where id = v_key1;
  assert v_k1_status = 'pending_installation',
    'FAIL 074-S1: key1 status changed despite rollback — expected pending_installation, got ' || coalesce(v_k1_status, 'NULL');

  -- key2 must still be pending_disable (second loop never ran)
  select status into v_k2_status from public.rfid_keys where id = v_key2;
  assert v_k2_status = 'pending_disable',
    'FAIL 074-S1: key2 status changed despite rollback — expected pending_disable, got ' || coalesce(v_k2_status, 'NULL');

  -- Ticket must still be open (resolved UPDATE rolled back)
  select status into v_ticket_status from support.tickets where id = v_ticket_id;
  assert v_ticket_status = 'open',
    'FAIL 074-S1: ticket status changed despite rollback — expected open, got ' || coalesce(v_ticket_status, 'NULL');

  -- key_events delta must be 0 (any events emitted by the RPC were rolled back)
  select count(*) into v_events_after from public.key_events where key_id in (v_key1, v_key2);
  assert v_events_after = v_events_before,
    'FAIL 074-S1: key_events delta non-zero — expected ' || v_events_before || ', got ' || v_events_after;

  raise notice 'PASS scenario-1: unique-violation mid-loop rolls back all key states, ticket, and key_events';
end $$;
rollback;

-- ============================================================
-- Scenario 2: clean resolve succeeds as baseline (atomicity complement)
-- ============================================================
begin;
do $$
declare
  v_admin_id      uuid;
  v_building_id   uuid;
  v_unit_id       uuid;
  v_staff_id      uuid;
  v_equipment_id  uuid;
  v_product_id    uuid;
  v_order_id      uuid;
  v_order_item_id uuid;
  v_key1          uuid;
  v_task_id       uuid;
  v_ticket_id     uuid;
  v_k1_status     text;
  v_ticket_status text;
  v_result        jsonb;
begin
  insert into public.administrations (company_name) values ('Test 074-S2') returning id into v_admin_id;
  insert into public.buildings (name, address, administration_id) values ('Building 074-S2', 'Calle 2', v_admin_id) returning id into v_building_id;
  insert into public.units (number, building_id) values ('2A', v_building_id) returning id into v_unit_id;
  insert into identity.staff (full_name, role) values ('Staff 074-S2', 'admin') returning id into v_staff_id;
  insert into public.products (name, category, stock_total, stock_reservado) values ('Produto 074-S2', 'rfid_key', 10, 0) returning id into v_product_id;
  insert into operations.equipment (serial_number, building_id, description, status) values ('SN-074-S2', v_building_id, 'Equip 074-S2', 'active') returning id into v_equipment_id;

  insert into public.orders (order_number, order_type, status, administration_id, client_type)
    values ('ORD-074-S2', 'keys', 'confirmed', v_admin_id, 'administration')
    returning id into v_order_id;

  insert into public.order_items (order_id, product_id, quantity, unit_price, item_type, building_id)
    values (v_order_id, v_product_id, 1, 100.00, 'key', v_building_id)
    returning id into v_order_item_id;

  insert into public.stock_movements (product_id, type, quantity, note, order_id, order_item_id)
    values (v_product_id, 'reserva', -1, 'Reserva test 074-S2', v_order_id, v_order_item_id);

  v_key1 := public.configure_key_order_item(v_order_item_id, 'T074-S2-KEY1', v_unit_id, array[v_equipment_id]);

  select public.create_equipment_update(
    v_equipment_id, v_admin_id, v_building_id, 'Test 074-S2', 'path/test.mdb',
    array[v_key1], '{}', v_staff_id
  ) into v_task_id;

  select ticket_id into v_ticket_id from support.equipment_updates where id = v_task_id;

  -- Clean call — no injection
  select public.resolve_equipment_update(v_task_id, v_staff_id) into v_result;

  select status into v_k1_status from public.rfid_keys where id = v_key1;
  assert v_k1_status = 'active',
    'FAIL 074-S2: expected key1 active, got ' || coalesce(v_k1_status, 'NULL');

  select status into v_ticket_status from support.tickets where id = v_ticket_id;
  assert v_ticket_status = 'resolved',
    'FAIL 074-S2: expected ticket resolved, got ' || coalesce(v_ticket_status, 'NULL');

  assert jsonb_array_length(v_result->'skipped_key_ids') = 0,
    'FAIL 074-S2: expected 0 skipped keys';

  raise notice 'PASS scenario-2: clean resolve succeeds as baseline (atomicity complement)';
end $$;
rollback;
