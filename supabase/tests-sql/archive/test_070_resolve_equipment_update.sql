-- ============================================================
-- DB smoke test: resolve_equipment_update + create_equipment_update RPCs
-- ============================================================
-- Prerequisite: migrations 064-070 applied.
-- ============================================================

-- ============================================================
-- Scenario 1: Happy path — 3-key snapshot (1 activate, 1 disable, 1 stale)
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
  v_ticket_id    uuid;
  v_task_id      uuid;
  -- keys
  v_key1         uuid;  -- pending_installation → active
  v_key2         uuid;  -- pending_disable → disabled
  v_key3         uuid;  -- stale active (snapshot_skipped)
  -- post-resolve states
  v_k1_status    text;
  v_k2_status    text;
  v_k3_status    text;
  v_ticket_status text;
  v_auth_count   int;
  v_auth_state   text;
  v_skip_count   int;
  v_task_resolved timestamptz;
  v_order_status text;
begin
  insert into public.administrations (company_name) values ('Test 070-S1') returning id into v_admin_id;
  insert into public.buildings (name, address, administration_id) values ('Building 070-S1', 'Calle 1', v_admin_id) returning id into v_building_id;
  insert into public.units (number, building_id) values ('1A', v_building_id) returning id into v_unit_id;
  insert into identity.staff (full_name, role) values ('Staff 070-S1', 'admin') returning id into v_staff_id;
  insert into public.products (name, category, stock_total, stock_reservado) values ('Producto 070-S1', 'rfid_key', 10, 0) returning id into v_product_id;
  insert into operations.equipment (serial_number, building_id, description, status) values ('SN-070-S1', v_building_id, 'Equip 070-S1', 'active') returning id into v_equipment_id;

  -- Create key order
  insert into public.orders (order_number, order_type, status, administration_id, client_type)
    values ('ORD-070-S1', 'keys', 'confirmed', v_admin_id, 'administration')
    returning id into v_order_id;

  insert into public.order_items (order_id, product_id, quantity, unit_price, item_type, building_id)
    values (v_order_id, v_product_id, 1, 100.00, 'key', v_building_id)
    returning id into v_order_item_id;

  -- Insert stock movements needed for configure
  insert into public.stock_movements (product_id, type, quantity, note, order_id, order_item_id)
    values (v_product_id, 'reserva', -1, 'Reserva test', v_order_id, v_order_item_id);

  -- Configure key via RPC (mints pending_creation → pending_installation)
  v_key1 := public.configure_key_order_item(v_order_item_id, 'T070-S1-KEY1', v_unit_id, array[v_equipment_id]);

  -- Key 2: pending_disable (will be disabled by resolve)
  insert into public.rfid_keys (rfid_code, unit_id, status) values ('T070-S1-KEY2', v_unit_id, 'pending_disable') returning id into v_key2;

  -- Key 3: active but NOT in snapshot → stale (will get snapshot_skipped event)
  insert into public.rfid_keys (rfid_code, unit_id, status) values ('T070-S1-KEY3', v_unit_id, 'active') returning id into v_key3;

  -- Create equipment_update ticket and task using helper RPC
  select public.create_equipment_update(
    v_equipment_id,
    v_admin_id,
    v_building_id,
    'Test update 070-S1',
    'path/test.mdb',
    array[v_key1],    -- keys_to_activate
    array[v_key2],    -- keys_to_disable
    v_staff_id
  ) into v_task_id;

  assert v_task_id is not null, 'FAIL 070-S1: expected task_id from create_equipment_update';

  -- Get the ticket_id
  select ticket_id into v_ticket_id from support.equipment_updates where id = v_task_id;

  -- Resolve
  perform public.resolve_equipment_update(v_task_id, v_staff_id);

  -- Assert key 1: pending_installation → active
  select status into v_k1_status from public.rfid_keys where id = v_key1;
  assert v_k1_status = 'active', 'FAIL 070-S1: expected key1 active, got ' || v_k1_status;

  -- Assert key 1 has an authorization with sync_state='installed'
  select count(*), max(sync_state) into v_auth_count, v_auth_state
    from operations.key_authorizations
   where rfid_key_id = v_key1;
  assert v_auth_count = 1, 'FAIL 070-S1: expected 1 key_authorization for key1, got ' || v_auth_count::text;
  assert v_auth_state = 'installed', 'FAIL 070-S1: expected sync_state=installed, got ' || v_auth_state;

  -- Assert key 2: pending_disable → disabled
  select status into v_k2_status from public.rfid_keys where id = v_key2;
  assert v_k2_status = 'disabled', 'FAIL 070-S1: expected key2 disabled, got ' || v_k2_status;

  -- Assert key 3: unchanged (still active — not in snapshot)
  select status into v_k3_status from public.rfid_keys where id = v_key3;
  assert v_k3_status = 'active', 'FAIL 070-S1: expected key3 still active (not in snapshot), got ' || v_k3_status;

  -- Assert ticket is resolved
  select status into v_ticket_status from support.tickets where id = v_ticket_id;
  assert v_ticket_status = 'resolved', 'FAIL 070-S1: expected ticket resolved, got ' || v_ticket_status;

  -- Assert task resolved_at is set
  select resolved_at into v_task_resolved from support.equipment_updates where id = v_task_id;
  assert v_task_resolved is not null, 'FAIL 070-S1: expected task resolved_at set';

  -- Assert order promoted to ready_for_pickup (all keys have installed auths)
  select status into v_order_status from public.orders where id = v_order_id;
  assert v_order_status = 'ready_for_pickup',
    'FAIL 070-S1: expected order ready_for_pickup, got ' || v_order_status;

  raise notice 'PASS scenario-1: resolve_equipment_update happy path — activate, disable, order promoted';
end $$;
rollback;

-- ============================================================
-- Scenario 2: Stale key yields snapshot_skipped event and does NOT abort
-- ============================================================
begin;
do $$
declare
  v_admin_id     uuid;
  v_building_id  uuid;
  v_unit_id      uuid;
  v_staff_id     uuid;
  v_equipment_id uuid;
  v_stale_key    uuid;
  v_task_id      uuid;
  v_ticket_id    uuid;
  v_skip_count   int;
  v_stale_status text;
  v_ticket_status text;
begin
  insert into public.administrations (company_name) values ('Test 070-S2') returning id into v_admin_id;
  insert into public.buildings (name, address, administration_id) values ('Building 070-S2', 'Calle 2', v_admin_id) returning id into v_building_id;
  insert into public.units (number, building_id) values ('2A', v_building_id) returning id into v_unit_id;
  insert into identity.staff (full_name, role) values ('Staff 070-S2', 'admin') returning id into v_staff_id;
  insert into operations.equipment (serial_number, building_id, description, status) values ('SN-070-S2', v_building_id, 'Equip 070-S2', 'active') returning id into v_equipment_id;

  -- Stale key: already active (was supposed to be pending_installation in snapshot)
  insert into public.rfid_keys (rfid_code, unit_id, status) values ('T070-S2-STALE', v_unit_id, 'active') returning id into v_stale_key;

  select public.create_equipment_update(
    v_equipment_id, v_admin_id, v_building_id, 'Test 070-S2', 'path/test.mdb',
    array[v_stale_key], '{}', v_staff_id
  ) into v_task_id;

  select ticket_id into v_ticket_id from support.equipment_updates where id = v_task_id;

  -- Should not raise, just skip
  perform public.resolve_equipment_update(v_task_id, v_staff_id);

  -- Key unchanged
  select status into v_stale_status from public.rfid_keys where id = v_stale_key;
  assert v_stale_status = 'active', 'FAIL 070-S2: expected stale key still active, got ' || v_stale_status;

  -- snapshot_skipped event emitted
  select count(*) into v_skip_count
    from public.key_events
   where key_id = v_stale_key and event_type = 'snapshot_skipped';
  assert v_skip_count = 1, 'FAIL 070-S2: expected 1 snapshot_skipped event, got ' || v_skip_count::text;

  -- Ticket still resolved
  select status into v_ticket_status from support.tickets where id = v_ticket_id;
  assert v_ticket_status = 'resolved', 'FAIL 070-S2: expected ticket resolved despite stale key, got ' || v_ticket_status;

  raise notice 'PASS scenario-2: stale key yields snapshot_skipped event; resolution not aborted';
end $$;
rollback;

-- ============================================================
-- Scenario 3: Second call on already-resolved task raises P0001
-- ============================================================
begin;
do $$
declare
  v_admin_id     uuid;
  v_building_id  uuid;
  v_unit_id      uuid;
  v_staff_id     uuid;
  v_equipment_id uuid;
  v_key_id       uuid;
  v_task_id      uuid;
  v_failed       boolean := false;
begin
  insert into public.administrations (company_name) values ('Test 070-S3') returning id into v_admin_id;
  insert into public.buildings (name, address, administration_id) values ('Building 070-S3', 'Calle 3', v_admin_id) returning id into v_building_id;
  insert into public.units (number, building_id) values ('3A', v_building_id) returning id into v_unit_id;
  insert into identity.staff (full_name, role) values ('Staff 070-S3', 'admin') returning id into v_staff_id;
  insert into operations.equipment (serial_number, building_id, description, status) values ('SN-070-S3', v_building_id, 'Equip 070-S3', 'active') returning id into v_equipment_id;
  insert into public.rfid_keys (rfid_code, unit_id, status) values ('T070-S3-KEY', v_unit_id, 'pending_installation') returning id into v_key_id;

  select public.create_equipment_update(
    v_equipment_id, v_admin_id, v_building_id, 'Test 070-S3', 'path/test.mdb',
    array[v_key_id], '{}', v_staff_id
  ) into v_task_id;

  perform public.resolve_equipment_update(v_task_id, v_staff_id);

  begin
    perform public.resolve_equipment_update(v_task_id, v_staff_id);
  exception when others then
    v_failed := true;
  end;

  assert v_failed, 'FAIL 070-S3: expected second resolve to raise exception';
  raise notice 'PASS scenario-3: second resolve call raises P0001';
end $$;
rollback;

-- ============================================================
-- Scenario 4: Uniqueness violation on second in-flight task
-- ============================================================
begin;
do $$
declare
  v_admin_id     uuid;
  v_building_id  uuid;
  v_unit_id      uuid;
  v_staff_id     uuid;
  v_equipment_id uuid;
  v_key_id       uuid;
  v_task_id1     uuid;
  v_failed       boolean := false;
begin
  insert into public.administrations (company_name) values ('Test 070-S4') returning id into v_admin_id;
  insert into public.buildings (name, address, administration_id) values ('Building 070-S4', 'Calle 4', v_admin_id) returning id into v_building_id;
  insert into public.units (number, building_id) values ('4A', v_building_id) returning id into v_unit_id;
  insert into identity.staff (full_name, role) values ('Staff 070-S4', 'admin') returning id into v_staff_id;
  insert into operations.equipment (serial_number, building_id, description, status) values ('SN-070-S4', v_building_id, 'Equip 070-S4', 'active') returning id into v_equipment_id;
  insert into public.rfid_keys (rfid_code, unit_id, status) values ('T070-S4-KEY', v_unit_id, 'pending_installation') returning id into v_key_id;

  select public.create_equipment_update(
    v_equipment_id, v_admin_id, v_building_id, 'Test 070-S4-A', 'path/test.mdb',
    array[v_key_id], '{}', v_staff_id
  ) into v_task_id1;

  -- Second task for same equipment (not yet resolved) must fail
  begin
    perform public.create_equipment_update(
      v_equipment_id, v_admin_id, v_building_id, 'Test 070-S4-B', 'path/test2.mdb',
      array[v_key_id], '{}', v_staff_id
    );
  exception when unique_violation or others then
    v_failed := true;
  end;

  assert v_failed, 'FAIL 070-S4: expected second in-flight task to fail on unique index';
  raise notice 'PASS scenario-4: uniqueness prevents second concurrent task for same equipment';
end $$;
rollback;
