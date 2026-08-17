-- ============================================================
-- DB smoke test: request_key_disable + cancel_key_disable RPCs
-- ============================================================
-- Prerequisite: migrations 064-069 applied.
-- ============================================================

-- ============================================================
-- Scenario 1: request_key_disable on active key → pending_disable + disable_requested event
-- ============================================================
begin;
do $$
declare
  v_admin_id    uuid;
  v_building_id uuid;
  v_unit_id     uuid;
  v_staff_id    uuid;
  v_key_id      uuid;
  v_status      text;
  v_event_count int;
begin
  insert into public.administrations (company_name) values ('Test 069-S1') returning id into v_admin_id;
  insert into public.buildings (name, address, administration_id) values ('Building 069-S1', 'Calle 1', v_admin_id) returning id into v_building_id;
  insert into public.units (number, building_id) values ('1A', v_building_id) returning id into v_unit_id;
  insert into identity.staff (full_name, role) values ('Staff 069-S1', 'admin') returning id into v_staff_id;
  insert into public.rfid_keys (rfid_code, unit_id, status) values ('T069-S1-KEY', v_unit_id, 'active') returning id into v_key_id;

  perform public.request_key_disable(v_key_id, v_staff_id, 'Test disable S1');

  select status into v_status from public.rfid_keys where id = v_key_id;
  assert v_status = 'pending_disable', 'FAIL 069-S1: expected pending_disable, got ' || v_status;

  select count(*) into v_event_count
    from public.key_events
   where key_id = v_key_id and event_type = 'disable_requested';
  assert v_event_count = 1, 'FAIL 069-S1: expected 1 disable_requested event, got ' || v_event_count::text;

  raise notice 'PASS scenario-1: request_key_disable sets pending_disable + emits disable_requested';
end $$;
rollback;

-- ============================================================
-- Scenario 2: cancel_key_disable on pending_disable key → active + disable_cancelled event + deactivated_at cleared
-- ============================================================
begin;
do $$
declare
  v_admin_id    uuid;
  v_building_id uuid;
  v_unit_id     uuid;
  v_staff_id    uuid;
  v_key_id      uuid;
  v_status      text;
  v_deactivated timestamptz;
  v_event_count int;
begin
  insert into public.administrations (company_name) values ('Test 069-S2') returning id into v_admin_id;
  insert into public.buildings (name, address, administration_id) values ('Building 069-S2', 'Calle 2', v_admin_id) returning id into v_building_id;
  insert into public.units (number, building_id) values ('2A', v_building_id) returning id into v_unit_id;
  insert into identity.staff (full_name, role) values ('Staff 069-S2', 'admin') returning id into v_staff_id;
  insert into public.rfid_keys (rfid_code, unit_id, status) values ('T069-S2-KEY', v_unit_id, 'active') returning id into v_key_id;

  perform public.request_key_disable(v_key_id, v_staff_id, 'Test disable S2');
  perform public.cancel_key_disable(v_key_id, v_staff_id, 'Test cancel S2');

  select status, deactivated_at into v_status, v_deactivated from public.rfid_keys where id = v_key_id;
  assert v_status = 'active', 'FAIL 069-S2: expected active after cancel, got ' || v_status;
  assert v_deactivated is null, 'FAIL 069-S2: expected deactivated_at cleared after cancel';

  select count(*) into v_event_count
    from public.key_events
   where key_id = v_key_id and event_type = 'disable_cancelled';
  assert v_event_count = 1, 'FAIL 069-S2: expected 1 disable_cancelled event, got ' || v_event_count::text;

  raise notice 'PASS scenario-2: cancel_key_disable restores active + emits disable_cancelled + clears deactivated_at';
end $$;
rollback;

-- ============================================================
-- Scenario 3: Idempotency — request_key_disable on already pending_disable is no-op
-- ============================================================
begin;
do $$
declare
  v_admin_id    uuid;
  v_building_id uuid;
  v_unit_id     uuid;
  v_staff_id    uuid;
  v_key_id      uuid;
  v_status      text;
  v_event_count int;
begin
  insert into public.administrations (company_name) values ('Test 069-S3') returning id into v_admin_id;
  insert into public.buildings (name, address, administration_id) values ('Building 069-S3', 'Calle 3', v_admin_id) returning id into v_building_id;
  insert into public.units (number, building_id) values ('3A', v_building_id) returning id into v_unit_id;
  insert into identity.staff (full_name, role) values ('Staff 069-S3', 'admin') returning id into v_staff_id;
  insert into public.rfid_keys (rfid_code, unit_id, status) values ('T069-S3-KEY', v_unit_id, 'active') returning id into v_key_id;

  perform public.request_key_disable(v_key_id, v_staff_id, 'First disable');
  perform public.request_key_disable(v_key_id, v_staff_id, 'Second disable (idempotent)');

  select status into v_status from public.rfid_keys where id = v_key_id;
  assert v_status = 'pending_disable', 'FAIL 069-S3: expected pending_disable after double call';

  -- Only 1 event should exist (idempotent no-op on second call)
  select count(*) into v_event_count
    from public.key_events
   where key_id = v_key_id and event_type = 'disable_requested';
  assert v_event_count = 1, 'FAIL 069-S3: expected 1 disable_requested event (idempotent), got ' || v_event_count::text;

  raise notice 'PASS scenario-3: request_key_disable is idempotent on already pending_disable key';
end $$;
rollback;

-- ============================================================
-- Scenario 4: request_key_disable on non-active key is rejected
-- ============================================================
begin;
do $$
declare
  v_admin_id    uuid;
  v_building_id uuid;
  v_unit_id     uuid;
  v_staff_id    uuid;
  v_key_id      uuid;
  v_failed      boolean := false;
begin
  insert into public.administrations (company_name) values ('Test 069-S4') returning id into v_admin_id;
  insert into public.buildings (name, address, administration_id) values ('Building 069-S4', 'Calle 4', v_admin_id) returning id into v_building_id;
  insert into public.units (number, building_id) values ('4A', v_building_id) returning id into v_unit_id;
  insert into identity.staff (full_name, role) values ('Staff 069-S4', 'admin') returning id into v_staff_id;
  -- Insert key as pending_installation (non-active)
  insert into public.rfid_keys (rfid_code, unit_id, status) values ('T069-S4-KEY', v_unit_id, 'pending_installation') returning id into v_key_id;

  begin
    perform public.request_key_disable(v_key_id, v_staff_id, null);
  exception when others then
    v_failed := true;
  end;

  assert v_failed, 'FAIL 069-S4: expected request_key_disable on non-active key to fail';
  raise notice 'PASS scenario-4: request_key_disable rejected on non-active key';
end $$;
rollback;

-- ============================================================
-- Scenario 5: disabled key cannot be transitioned
-- ============================================================
begin;
do $$
declare
  v_admin_id    uuid;
  v_building_id uuid;
  v_unit_id     uuid;
  v_staff_id    uuid;
  v_key_id      uuid;
  v_failed      boolean := false;
begin
  insert into public.administrations (company_name) values ('Test 069-S5') returning id into v_admin_id;
  insert into public.buildings (name, address, administration_id) values ('Building 069-S5', 'Calle 5', v_admin_id) returning id into v_building_id;
  insert into public.units (number, building_id) values ('5A', v_building_id) returning id into v_unit_id;
  insert into identity.staff (full_name, role) values ('Staff 069-S5', 'admin') returning id into v_staff_id;
  insert into public.rfid_keys (rfid_code, unit_id, status) values ('T069-S5-KEY', v_unit_id, 'disabled') returning id into v_key_id;

  begin
    perform public.request_key_disable(v_key_id, v_staff_id, null);
  exception when others then
    v_failed := true;
  end;

  assert v_failed, 'FAIL 069-S5: expected request_key_disable on disabled key to fail';
  raise notice 'PASS scenario-5: disabled key cannot be transitioned via request_key_disable';
end $$;
rollback;
