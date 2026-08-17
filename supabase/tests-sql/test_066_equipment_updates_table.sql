-- ============================================================
-- DB smoke test: support.equipment_updates table
-- ============================================================
-- Prerequisite: migrations 064 + 065 + 066 applied.
-- ============================================================

-- ============================================================
-- Scenario 1: Valid row can be inserted
-- ============================================================
begin;
do $$
declare
  v_admin_id    uuid;
  v_building_id uuid;
  v_unit_id     uuid;
  v_staff_id    uuid;
  v_equipment_id uuid;
  v_ticket_id   uuid;
  v_key_id      uuid;
  v_task_id     uuid;
begin
  insert into public.administrations (company_name) values ('Test 066-S1') returning id into v_admin_id;
  insert into public.buildings (name, address, administration_id) values ('Building 066-S1', 'Calle 1', v_admin_id) returning id into v_building_id;
  insert into public.units (number, building_id) values ('1A', v_building_id) returning id into v_unit_id;
  insert into identity.staff (full_name, role) values ('Staff 066-S1', 'admin') returning id into v_staff_id;
  insert into operations.equipment (serial_number, building_id, description, status) values ('SN-066-S1', v_building_id, 'Equip 066-S1', 'active') returning id into v_equipment_id;
  insert into public.rfid_keys (rfid_code, unit_id, status) values ('T066-S1-KEY', v_unit_id, 'pending_installation') returning id into v_key_id;

  insert into support.tickets (administration_id, building_id, category, description, status, equipment_id)
    values (v_admin_id, v_building_id, 'equipment_update', 'Test update S1', 'open', v_equipment_id)
    returning id into v_ticket_id;

  insert into support.equipment_updates (
    ticket_id, equipment_id, mdb_storage_path, keys_to_activate,
    created_by_staff_id
  ) values (
    v_ticket_id, v_equipment_id, v_ticket_id::text || '/test.mdb',
    array[v_key_id], v_staff_id
  ) returning id into v_task_id;

  assert v_task_id is not null, 'FAIL 066-S1: expected row inserted';
  raise notice 'PASS scenario-1: valid equipment_update row inserted';
end $$;
rollback;

-- ============================================================
-- Scenario 2: Partial unique index blocks second open task for same equipment
-- ============================================================
begin;
do $$
declare
  v_admin_id     uuid;
  v_building_id  uuid;
  v_unit_id      uuid;
  v_staff_id     uuid;
  v_equipment_id uuid;
  v_ticket_id1   uuid;
  v_ticket_id2   uuid;
  v_key_id       uuid;
  v_failed       boolean := false;
begin
  insert into public.administrations (company_name) values ('Test 066-S2') returning id into v_admin_id;
  insert into public.buildings (name, address, administration_id) values ('Building 066-S2', 'Calle 2', v_admin_id) returning id into v_building_id;
  insert into public.units (number, building_id) values ('2A', v_building_id) returning id into v_unit_id;
  insert into identity.staff (full_name, role) values ('Staff 066-S2', 'admin') returning id into v_staff_id;
  insert into operations.equipment (serial_number, building_id, description, status) values ('SN-066-S2', v_building_id, 'Equip 066-S2', 'active') returning id into v_equipment_id;
  insert into public.rfid_keys (rfid_code, unit_id, status) values ('T066-S2-KEY', v_unit_id, 'pending_installation') returning id into v_key_id;

  insert into support.tickets (administration_id, building_id, category, description, status, equipment_id)
    values (v_admin_id, v_building_id, 'equipment_update', 'Test update S2-A', 'open', v_equipment_id)
    returning id into v_ticket_id1;

  insert into support.equipment_updates (ticket_id, equipment_id, mdb_storage_path, keys_to_activate)
    values (v_ticket_id1, v_equipment_id, 'path/test1.mdb', array[v_key_id]);

  -- Second open update for the same equipment must fail on unique index
  insert into support.tickets (administration_id, building_id, category, description, status, equipment_id)
    values (v_admin_id, v_building_id, 'equipment_update', 'Test update S2-B', 'open', v_equipment_id)
    returning id into v_ticket_id2;

  begin
    insert into support.equipment_updates (ticket_id, equipment_id, mdb_storage_path, keys_to_activate)
      values (v_ticket_id2, v_equipment_id, 'path/test2.mdb', array[v_key_id]);
  exception when unique_violation or others then
    v_failed := true;
  end;

  assert v_failed, 'FAIL 066-S2: expected second open task to be rejected by partial unique index';
  raise notice 'PASS scenario-2: partial unique index blocks second open task';
end $$;
rollback;

-- ============================================================
-- Scenario 3: Resolved task allows a new insert (partial index WHERE resolved_at IS NULL)
-- ============================================================
begin;
do $$
declare
  v_admin_id     uuid;
  v_building_id  uuid;
  v_unit_id      uuid;
  v_equipment_id uuid;
  v_ticket_id1   uuid;
  v_ticket_id2   uuid;
  v_key_id       uuid;
  v_task_id2     uuid;
begin
  insert into public.administrations (company_name) values ('Test 066-S3') returning id into v_admin_id;
  insert into public.buildings (name, address, administration_id) values ('Building 066-S3', 'Calle 3', v_admin_id) returning id into v_building_id;
  insert into public.units (number, building_id) values ('3A', v_building_id) returning id into v_unit_id;
  insert into operations.equipment (serial_number, building_id, description, status) values ('SN-066-S3', v_building_id, 'Equip 066-S3', 'active') returning id into v_equipment_id;
  insert into public.rfid_keys (rfid_code, unit_id, status) values ('T066-S3-KEY', v_unit_id, 'pending_installation') returning id into v_key_id;

  insert into support.tickets (administration_id, building_id, category, description, status, equipment_id)
    values (v_admin_id, v_building_id, 'equipment_update', 'Test update S3-A', 'open', v_equipment_id)
    returning id into v_ticket_id1;

  insert into support.equipment_updates (ticket_id, equipment_id, mdb_storage_path, keys_to_activate)
    values (v_ticket_id1, v_equipment_id, 'path/test.mdb', array[v_key_id]);

  -- Mark first task as resolved (set resolved_at)
  update support.equipment_updates set resolved_at = now() where ticket_id = v_ticket_id1;

  -- Now a second task should succeed
  insert into support.tickets (administration_id, building_id, category, description, status, equipment_id)
    values (v_admin_id, v_building_id, 'equipment_update', 'Test update S3-B', 'open', v_equipment_id)
    returning id into v_ticket_id2;

  insert into support.equipment_updates (ticket_id, equipment_id, mdb_storage_path, keys_to_activate)
    values (v_ticket_id2, v_equipment_id, 'path/test2.mdb', array[v_key_id])
    returning id into v_task_id2;

  assert v_task_id2 is not null, 'FAIL 066-S3: expected second task after resolved first to succeed';
  raise notice 'PASS scenario-3: resolved task allows new insert';
end $$;
rollback;

-- ============================================================
-- Scenario 4: Cardinality CHECK blocks empty arrays (both empty)
-- ============================================================
begin;
do $$
declare
  v_admin_id     uuid;
  v_building_id  uuid;
  v_equipment_id uuid;
  v_ticket_id    uuid;
  v_failed       boolean := false;
begin
  insert into public.administrations (company_name) values ('Test 066-S4') returning id into v_admin_id;
  insert into public.buildings (name, address, administration_id) values ('Building 066-S4', 'Calle 4', v_admin_id) returning id into v_building_id;
  insert into operations.equipment (serial_number, building_id, description, status) values ('SN-066-S4', v_building_id, 'Equip 066-S4', 'active') returning id into v_equipment_id;

  insert into support.tickets (administration_id, building_id, category, description, status, equipment_id)
    values (v_admin_id, v_building_id, 'equipment_update', 'Test update S4', 'open', v_equipment_id)
    returning id into v_ticket_id;

  begin
    insert into support.equipment_updates (ticket_id, equipment_id, mdb_storage_path, keys_to_activate, keys_to_disable)
      values (v_ticket_id, v_equipment_id, 'path/test.mdb', '{}', '{}');
  exception when check_violation or others then
    v_failed := true;
  end;

  assert v_failed, 'FAIL 066-S4: expected empty arrays to be rejected by cardinality CHECK';
  raise notice 'PASS scenario-4: empty arrays rejected by cardinality CHECK';
end $$;
rollback;
