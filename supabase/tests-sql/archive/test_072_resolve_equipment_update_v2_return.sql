-- ============================================================
-- DB smoke test: resolve_equipment_update v2 — JSONB return with skipped_key_ids
-- ============================================================
-- Prerequisite: migrations 064-072 applied.
-- ============================================================

-- ============================================================
-- Scenario 1: Skipped key is included in skipped_key_ids
-- ============================================================
-- RED guard: this test fails if the RPC still returns uuid instead of jsonb.
begin;
do $$
declare
  v_admin_id     uuid;
  v_building_id  uuid;
  v_unit_id      uuid;
  v_staff_id     uuid;
  v_equipment_id uuid;
  v_product_id   uuid;
  v_order_id     uuid;
  v_order_item_id uuid;
  v_key1         uuid;  -- pending_installation → active (normal)
  v_key2         uuid;  -- pending_disable → disabled (normal)
  v_key3         uuid;  -- stale active (should be in skipped_key_ids)
  v_task_id      uuid;
  v_result       jsonb;
  v_ticket_id_res uuid;
  v_skipped      uuid[];
begin
  insert into public.administrations (company_name) values ('Test 072-S1') returning id into v_admin_id;
  insert into public.buildings (name, address, administration_id) values ('Building 072-S1', 'Calle 1', v_admin_id) returning id into v_building_id;
  insert into public.units (number, building_id) values ('1A', v_building_id) returning id into v_unit_id;
  insert into identity.staff (full_name, role) values ('Staff 072-S1', 'admin') returning id into v_staff_id;
  insert into public.products (name, category, stock_total, stock_reservado) values ('Producto 072-S1', 'rfid_key', 10, 0) returning id into v_product_id;
  insert into operations.equipment (serial_number, building_id, description, status) values ('SN-072-S1', v_building_id, 'Equip 072-S1', 'active') returning id into v_equipment_id;

  insert into public.orders (order_number, order_type, status, administration_id, client_type)
    values ('ORD-072-S1', 'keys', 'confirmed', v_admin_id, 'administration')
    returning id into v_order_id;

  insert into public.order_items (order_id, product_id, quantity, unit_price, item_type, building_id)
    values (v_order_id, v_product_id, 1, 100.00, 'key', v_building_id)
    returning id into v_order_item_id;

  insert into public.stock_movements (product_id, type, quantity, note, order_id, order_item_id)
    values (v_product_id, 'reserva', -1, 'Reserva test 072-S1', v_order_id, v_order_item_id);

  -- Key 1: pending_installation (via configure_key_order_item)
  v_key1 := public.configure_key_order_item(v_order_item_id, 'T072-S1-KEY1', v_unit_id, array[v_equipment_id]);

  -- Key 2: pending_disable (will be disabled by resolve)
  insert into public.rfid_keys (rfid_code, unit_id, status) values ('T072-S1-KEY2', v_unit_id, 'pending_disable') returning id into v_key2;

  -- Key 3: stale — already active, but included in keys_to_activate (should be skipped)
  insert into public.rfid_keys (rfid_code, unit_id, status) values ('T072-S1-KEY3', v_unit_id, 'active') returning id into v_key3;

  select public.create_equipment_update(
    v_equipment_id, v_admin_id, v_building_id, 'Test 072-S1', 'path/test.mdb',
    array[v_key1, v_key3],  -- key3 is stale (already active)
    array[v_key2],
    v_staff_id
  ) into v_task_id;

  -- Call v2 RPC — expects jsonb back
  select public.resolve_equipment_update(v_task_id, v_staff_id) into v_result;

  assert v_result is not null, 'FAIL 072-S1: expected jsonb result, got NULL';
  assert jsonb_typeof(v_result) = 'object', 'FAIL 072-S1: expected jsonb object';

  -- ticket_id field present and valid
  v_ticket_id_res := (v_result->>'ticket_id')::uuid;
  assert v_ticket_id_res is not null, 'FAIL 072-S1: ticket_id missing from result';

  -- skipped_key_ids contains key3
  select array_agg(elem::uuid)
    into v_skipped
    from jsonb_array_elements_text(v_result->'skipped_key_ids') as elem;

  assert v_skipped is not null, 'FAIL 072-S1: skipped_key_ids is null';
  assert v_key3 = any(v_skipped), 'FAIL 072-S1: key3 not in skipped_key_ids';
  assert array_length(v_skipped, 1) = 1, 'FAIL 072-S1: expected exactly 1 skipped key, got ' || array_length(v_skipped, 1)::text;

  -- key1 was processed normally (active now)
  declare
    v_k1_status text;
  begin
    select status into v_k1_status from public.rfid_keys where id = v_key1;
    assert v_k1_status = 'active', 'FAIL 072-S1: expected key1 active, got ' || v_k1_status;
  end;

  raise notice 'PASS scenario-1: skipped key included in skipped_key_ids jsonb result';
end $$;
rollback;

-- ============================================================
-- Scenario 2: No skipped keys — skipped_key_ids is an empty array (not null)
-- ============================================================
begin;
do $$
declare
  v_admin_id     uuid;
  v_building_id  uuid;
  v_unit_id      uuid;
  v_staff_id     uuid;
  v_equipment_id uuid;
  v_product_id   uuid;
  v_order_id     uuid;
  v_order_item_id uuid;
  v_key1         uuid;
  v_task_id      uuid;
  v_result       jsonb;
  v_skipped_len  int;
begin
  insert into public.administrations (company_name) values ('Test 072-S2') returning id into v_admin_id;
  insert into public.buildings (name, address, administration_id) values ('Building 072-S2', 'Calle 2', v_admin_id) returning id into v_building_id;
  insert into public.units (number, building_id) values ('2A', v_building_id) returning id into v_unit_id;
  insert into identity.staff (full_name, role) values ('Staff 072-S2', 'admin') returning id into v_staff_id;
  insert into public.products (name, category, stock_total, stock_reservado) values ('Producto 072-S2', 'rfid_key', 10, 0) returning id into v_product_id;
  insert into operations.equipment (serial_number, building_id, description, status) values ('SN-072-S2', v_building_id, 'Equip 072-S2', 'active') returning id into v_equipment_id;

  insert into public.orders (order_number, order_type, status, administration_id, client_type)
    values ('ORD-072-S2', 'keys', 'confirmed', v_admin_id, 'administration')
    returning id into v_order_id;

  insert into public.order_items (order_id, product_id, quantity, unit_price, item_type, building_id)
    values (v_order_id, v_product_id, 1, 100.00, 'key', v_building_id)
    returning id into v_order_item_id;

  insert into public.stock_movements (product_id, type, quantity, note, order_id, order_item_id)
    values (v_product_id, 'reserva', -1, 'Reserva test 072-S2', v_order_id, v_order_item_id);

  v_key1 := public.configure_key_order_item(v_order_item_id, 'T072-S2-KEY1', v_unit_id, array[v_equipment_id]);

  select public.create_equipment_update(
    v_equipment_id, v_admin_id, v_building_id, 'Test 072-S2', 'path/test.mdb',
    array[v_key1], '{}', v_staff_id
  ) into v_task_id;

  select public.resolve_equipment_update(v_task_id, v_staff_id) into v_result;

  assert v_result is not null, 'FAIL 072-S2: expected jsonb result, got NULL';

  -- skipped_key_ids must be an empty array, not null
  assert v_result ? 'skipped_key_ids', 'FAIL 072-S2: skipped_key_ids key missing from result';
  assert jsonb_typeof(v_result->'skipped_key_ids') = 'array', 'FAIL 072-S2: skipped_key_ids not an array';

  select jsonb_array_length(v_result->'skipped_key_ids') into v_skipped_len;
  assert v_skipped_len = 0, 'FAIL 072-S2: expected 0 skipped keys, got ' || v_skipped_len::text;

  raise notice 'PASS scenario-2: no skips → skipped_key_ids is empty array (not null)';
end $$;
rollback;

-- ============================================================
-- Scenario 3: Regression — original test_070 scenarios still pass with new return type
-- ============================================================
-- Prove key1 activates, key2 disables, ticket resolves (matching test_070 scenario-1).
begin;
do $$
declare
  v_admin_id     uuid;
  v_building_id  uuid;
  v_unit_id      uuid;
  v_staff_id     uuid;
  v_equipment_id uuid;
  v_product_id   uuid;
  v_order_id     uuid;
  v_order_item_id uuid;
  v_key1         uuid;
  v_key2         uuid;
  v_task_id      uuid;
  v_result       jsonb;
  v_ticket_id    uuid;
  v_k1_status    text;
  v_k2_status    text;
  v_ticket_status text;
begin
  insert into public.administrations (company_name) values ('Test 072-S3') returning id into v_admin_id;
  insert into public.buildings (name, address, administration_id) values ('Building 072-S3', 'Calle 3', v_admin_id) returning id into v_building_id;
  insert into public.units (number, building_id) values ('3A', v_building_id) returning id into v_unit_id;
  insert into identity.staff (full_name, role) values ('Staff 072-S3', 'admin') returning id into v_staff_id;
  insert into public.products (name, category, stock_total, stock_reservado) values ('Producto 072-S3', 'rfid_key', 10, 0) returning id into v_product_id;
  insert into operations.equipment (serial_number, building_id, description, status) values ('SN-072-S3', v_building_id, 'Equip 072-S3', 'active') returning id into v_equipment_id;

  insert into public.orders (order_number, order_type, status, administration_id, client_type)
    values ('ORD-072-S3', 'keys', 'confirmed', v_admin_id, 'administration')
    returning id into v_order_id;

  insert into public.order_items (order_id, product_id, quantity, unit_price, item_type, building_id)
    values (v_order_id, v_product_id, 1, 100.00, 'key', v_building_id)
    returning id into v_order_item_id;

  insert into public.stock_movements (product_id, type, quantity, note, order_id, order_item_id)
    values (v_product_id, 'reserva', -1, 'Reserva test 072-S3', v_order_id, v_order_item_id);

  v_key1 := public.configure_key_order_item(v_order_item_id, 'T072-S3-KEY1', v_unit_id, array[v_equipment_id]);
  insert into public.rfid_keys (rfid_code, unit_id, status) values ('T072-S3-KEY2', v_unit_id, 'pending_disable') returning id into v_key2;

  select public.create_equipment_update(
    v_equipment_id, v_admin_id, v_building_id, 'Test 072-S3', 'path/test.mdb',
    array[v_key1], array[v_key2], v_staff_id
  ) into v_task_id;

  select public.resolve_equipment_update(v_task_id, v_staff_id) into v_result;

  select ticket_id into v_ticket_id from support.equipment_updates where id = v_task_id;

  select status into v_k1_status from public.rfid_keys where id = v_key1;
  assert v_k1_status = 'active', 'FAIL 072-S3: expected key1 active, got ' || v_k1_status;

  select status into v_k2_status from public.rfid_keys where id = v_key2;
  assert v_k2_status = 'disabled', 'FAIL 072-S3: expected key2 disabled, got ' || v_k2_status;

  select status into v_ticket_status from support.tickets where id = v_ticket_id;
  assert v_ticket_status = 'resolved', 'FAIL 072-S3: expected ticket resolved, got ' || v_ticket_status;

  -- skipped_key_ids must be an empty array (both keys processed normally)
  assert jsonb_array_length(v_result->'skipped_key_ids') = 0,
    'FAIL 072-S3: expected 0 skipped, got ' || jsonb_array_length(v_result->'skipped_key_ids')::text;

  raise notice 'PASS scenario-3: regression — happy path still works with v2 return type';
end $$;
rollback;
