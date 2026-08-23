-- ============================================================
-- DB smoke test: configure_key_order_item rework
-- ============================================================
-- Prerequisite: migrations 064-068 applied.
-- ============================================================

-- ============================================================
-- Scenario 1: Key minted as pending_creation; no key_authorizations; junction rows created
-- ============================================================
begin;
do $$
declare
  v_admin_id      uuid;
  v_building_id   uuid;
  v_unit_id       uuid;
  v_staff_id      uuid;
  v_product_id    uuid;
  v_order_id      uuid;
  v_order_item_id uuid;
  v_equipment_id1 uuid;
  v_equipment_id2 uuid;
  v_key_id        uuid;
  v_status        text;
  v_key_status    text;
  v_auth_count    int;
  v_junction_count int;
begin
  insert into public.administrations (company_name) values ('Test 068-S1') returning id into v_admin_id;
  insert into public.buildings (name, address, administration_id) values ('Building 068-S1', 'Calle 1', v_admin_id) returning id into v_building_id;
  insert into public.units (number, building_id) values ('1A', v_building_id) returning id into v_unit_id;
  insert into identity.staff (full_name, role) values ('Staff 068-S1', 'admin') returning id into v_staff_id;
  insert into public.products (name, category, stock_total, stock_reservado) values ('Producto 068-S1', 'rfid_key', 10, 0) returning id into v_product_id;
  insert into operations.equipment (serial_number, building_id, description, status) values ('SN-068-S1-A', v_building_id, 'Equip A', 'active') returning id into v_equipment_id1;
  insert into operations.equipment (serial_number, building_id, description, status) values ('SN-068-S1-B', v_building_id, 'Equip B', 'active') returning id into v_equipment_id2;

  insert into public.orders (order_number, order_type, status, administration_id, client_type)
    values ('ORD-068-S1', 'keys', 'confirmed', v_admin_id, 'administration')
    returning id into v_order_id;

  insert into public.order_items (order_id, product_id, quantity, unit_price, item_type, building_id)
    values (v_order_id, v_product_id, 1, 100.00, 'key', v_building_id)
    returning id into v_order_item_id;

  -- Simulate stock reservation
  insert into public.stock_movements (product_id, type, quantity, note, order_id, order_item_id)
    values (v_product_id, 'reserva', -1, 'Test reserva', v_order_id, v_order_item_id);

  -- Call configure_key_order_item with two equipment IDs
  v_key_id := public.configure_key_order_item(
    v_order_item_id,
    'T068-S1-RFID',
    v_unit_id,
    array[v_equipment_id1, v_equipment_id2]
  );

  assert v_key_id is not null, 'FAIL 068-S1: expected key_id returned';

  -- Key must be pending_installation (configure resolves key_config ticket → key advances)
  -- Actually after configure, key is pending_installation (started as pending_creation,
  -- then ticket resolution advances it)
  select status into v_key_status from public.rfid_keys where id = v_key_id;
  -- After configure_key_order_item resolves the key_configuration ticket, the key
  -- should be pending_installation
  assert v_key_status = 'pending_installation',
    'FAIL 068-S1: expected key status=pending_installation, got ' || v_key_status;

  -- No key_authorizations should exist (minted at resolve time, not configure time)
  select count(*) into v_auth_count
    from operations.key_authorizations
   where rfid_key_id = v_key_id;
  assert v_auth_count = 0,
    'FAIL 068-S1: expected 0 key_authorizations at configure time, got ' || v_auth_count::text;

  -- Junction table must have 2 rows (one per equipment_id)
  select count(*) into v_junction_count
    from public.rfid_key_intended_equipment
   where rfid_key_id = v_key_id;
  assert v_junction_count = 2,
    'FAIL 068-S1: expected 2 junction rows for equipment IDs, got ' || v_junction_count::text;

  -- order_item must be configured
  select status into v_status from public.order_items where id = v_order_item_id;
  assert v_status = 'configured',
    'FAIL 068-S1: expected order_item status=configured, got ' || v_status;

  raise notice 'PASS scenario-1: key minted as pending_creation/installation; no key_authorizations; junction rows created';
end $$;
rollback;

-- ============================================================
-- Scenario 2: Idempotency — second call returns same key_id (no-op)
-- ============================================================
begin;
do $$
declare
  v_admin_id      uuid;
  v_building_id   uuid;
  v_unit_id       uuid;
  v_product_id    uuid;
  v_order_id      uuid;
  v_order_item_id uuid;
  v_equipment_id  uuid;
  v_key_id1       uuid;
  v_key_id2       uuid;
begin
  insert into public.administrations (company_name) values ('Test 068-S2') returning id into v_admin_id;
  insert into public.buildings (name, address, administration_id) values ('Building 068-S2', 'Calle 2', v_admin_id) returning id into v_building_id;
  insert into public.units (number, building_id) values ('2A', v_building_id) returning id into v_unit_id;
  insert into public.products (name, category, stock_total, stock_reservado) values ('Producto 068-S2', 'rfid_key', 10, 0) returning id into v_product_id;
  insert into operations.equipment (serial_number, building_id, description, status) values ('SN-068-S2', v_building_id, 'Equip 068-S2', 'active') returning id into v_equipment_id;

  insert into public.orders (order_number, order_type, status, administration_id, client_type)
    values ('ORD-068-S2', 'keys', 'confirmed', v_admin_id, 'administration')
    returning id into v_order_id;

  insert into public.order_items (order_id, product_id, quantity, unit_price, item_type, building_id)
    values (v_order_id, v_product_id, 1, 100.00, 'key', v_building_id)
    returning id into v_order_item_id;

  insert into public.stock_movements (product_id, type, quantity, note, order_id, order_item_id)
    values (v_product_id, 'reserva', -1, 'Test reserva', v_order_id, v_order_item_id);

  v_key_id1 := public.configure_key_order_item(v_order_item_id, 'T068-S2-RFID', v_unit_id, array[v_equipment_id]);
  v_key_id2 := public.configure_key_order_item(v_order_item_id, 'T068-S2-RFID', v_unit_id, array[v_equipment_id]);

  assert v_key_id1 = v_key_id2, 'FAIL 068-S2: expected idempotent second call to return same key_id';
  raise notice 'PASS scenario-2: configure_key_order_item is idempotent';
end $$;
rollback;

-- ============================================================
-- Scenario 3: Stock movements emitted when product_id present
-- ============================================================
begin;
do $$
declare
  v_admin_id      uuid;
  v_building_id   uuid;
  v_unit_id       uuid;
  v_product_id    uuid;
  v_order_id      uuid;
  v_order_item_id uuid;
  v_equipment_id  uuid;
  v_key_id        uuid;
  v_egreso_count  int;
  v_liberacion_count int;
begin
  insert into public.administrations (company_name) values ('Test 068-S3') returning id into v_admin_id;
  insert into public.buildings (name, address, administration_id) values ('Building 068-S3', 'Calle 3', v_admin_id) returning id into v_building_id;
  insert into public.units (number, building_id) values ('3A', v_building_id) returning id into v_unit_id;
  insert into public.products (name, category, stock_total, stock_reservado) values ('Producto 068-S3', 'rfid_key', 10, 0) returning id into v_product_id;
  insert into operations.equipment (serial_number, building_id, description, status) values ('SN-068-S3', v_building_id, 'Equip 068-S3', 'active') returning id into v_equipment_id;

  insert into public.orders (order_number, order_type, status, administration_id, client_type)
    values ('ORD-068-S3', 'keys', 'confirmed', v_admin_id, 'administration')
    returning id into v_order_id;

  insert into public.order_items (order_id, product_id, quantity, unit_price, item_type, building_id)
    values (v_order_id, v_product_id, 1, 100.00, 'key', v_building_id)
    returning id into v_order_item_id;

  insert into public.stock_movements (product_id, type, quantity, note, order_id, order_item_id)
    values (v_product_id, 'reserva', -1, 'Test reserva', v_order_id, v_order_item_id);

  v_key_id := public.configure_key_order_item(v_order_item_id, 'T068-S3-RFID', v_unit_id, array[v_equipment_id]);

  select count(*) into v_egreso_count
    from public.stock_movements
   where order_item_id = v_order_item_id and type = 'egreso_grabacion';
  assert v_egreso_count = 1,
    'FAIL 068-S3: expected 1 egreso_grabacion movement, got ' || v_egreso_count::text;

  select count(*) into v_liberacion_count
    from public.stock_movements
   where order_item_id = v_order_item_id and type = 'liberacion_reserva';
  assert v_liberacion_count = 1,
    'FAIL 068-S3: expected 1 liberacion_reserva movement, got ' || v_liberacion_count::text;

  raise notice 'PASS scenario-3: stock movements emitted when product_id present';
end $$;
rollback;
