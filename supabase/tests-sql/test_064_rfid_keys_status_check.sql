-- ============================================================
-- DB smoke test: rfid_keys 5-state lifecycle CHECK + sync_deactivated_at trigger
-- ============================================================
-- Prerequisite: migration 20260818000064 applied.
-- Each scenario runs in its own transaction and rolls back.
-- ============================================================

-- ============================================================
-- Scenario 1: All 5 valid statuses are accepted by the CHECK constraint
-- ============================================================
begin;
do $$
declare
  v_admin_id    uuid;
  v_building_id uuid;
  v_unit_id     uuid;
  v_key_id      uuid;
  v_count       int;
begin
  insert into public.administrations (company_name) values ('Test 064-S1') returning id into v_admin_id;
  insert into public.buildings (name, address, administration_id) values ('Building 064-S1', 'Calle 1', v_admin_id) returning id into v_building_id;
  insert into public.units (number, building_id) values ('1A', v_building_id) returning id into v_unit_id;

  -- Insert each valid status in turn.
  insert into public.rfid_keys (rfid_code, unit_id, status) values ('T064-S1-PENDING-CREATION', v_unit_id, 'pending_creation') returning id into v_key_id;
  assert v_key_id is not null, 'FAIL 064-S1: pending_creation not accepted';

  insert into public.rfid_keys (rfid_code, unit_id, status) values ('T064-S1-PENDING-INSTALL', v_unit_id, 'pending_installation') returning id into v_key_id;
  assert v_key_id is not null, 'FAIL 064-S1: pending_installation not accepted';

  insert into public.rfid_keys (rfid_code, unit_id, status) values ('T064-S1-ACTIVE', v_unit_id, 'active') returning id into v_key_id;
  assert v_key_id is not null, 'FAIL 064-S1: active not accepted';

  insert into public.rfid_keys (rfid_code, unit_id, status) values ('T064-S1-PENDING-DISABLE', v_unit_id, 'pending_disable') returning id into v_key_id;
  assert v_key_id is not null, 'FAIL 064-S1: pending_disable not accepted';

  insert into public.rfid_keys (rfid_code, unit_id, status) values ('T064-S1-DISABLED', v_unit_id, 'disabled') returning id into v_key_id;
  assert v_key_id is not null, 'FAIL 064-S1: disabled not accepted';

  select count(*) into v_count from public.rfid_keys where rfid_code like 'T064-S1-%';
  assert v_count = 5, 'FAIL 064-S1: expected 5 inserted rows, got ' || v_count::text;

  raise notice 'PASS scenario-1: all 5 valid statuses accepted by CHECK';
end $$;
rollback;

-- ============================================================
-- Scenario 2: 'revoked' is rejected by the CHECK constraint
-- ============================================================
begin;
do $$
declare
  v_admin_id    uuid;
  v_building_id uuid;
  v_unit_id     uuid;
  v_failed      boolean := false;
begin
  insert into public.administrations (company_name) values ('Test 064-S2') returning id into v_admin_id;
  insert into public.buildings (name, address, administration_id) values ('Building 064-S2', 'Calle 2', v_admin_id) returning id into v_building_id;
  insert into public.units (number, building_id) values ('2A', v_building_id) returning id into v_unit_id;

  begin
    insert into public.rfid_keys (rfid_code, unit_id, status) values ('T064-S2-REVOKED', v_unit_id, 'revoked');
  exception when check_violation or others then
    v_failed := true;
  end;

  assert v_failed, 'FAIL 064-S2: expected revoked to be rejected by CHECK constraint';
  raise notice 'PASS scenario-2: revoked rejected by CHECK constraint';
end $$;
rollback;

-- ============================================================
-- Scenario 3: Transitioning to 'disabled' sets deactivated_at
-- ============================================================
begin;
do $$
declare
  v_admin_id     uuid;
  v_building_id  uuid;
  v_unit_id      uuid;
  v_key_id       uuid;
  v_deactivated  timestamptz;
begin
  insert into public.administrations (company_name) values ('Test 064-S3') returning id into v_admin_id;
  insert into public.buildings (name, address, administration_id) values ('Building 064-S3', 'Calle 3', v_admin_id) returning id into v_building_id;
  insert into public.units (number, building_id) values ('3A', v_building_id) returning id into v_unit_id;

  insert into public.rfid_keys (rfid_code, unit_id, status) values ('T064-S3-KEY', v_unit_id, 'active') returning id into v_key_id;

  -- deactivated_at must be null while active
  select deactivated_at into v_deactivated from public.rfid_keys where id = v_key_id;
  assert v_deactivated is null, 'FAIL 064-S3: expected deactivated_at null while active, got ' || v_deactivated::text;

  -- Transition to disabled; trigger should set deactivated_at
  update public.rfid_keys set status = 'disabled' where id = v_key_id;

  select deactivated_at into v_deactivated from public.rfid_keys where id = v_key_id;
  assert v_deactivated is not null, 'FAIL 064-S3: expected deactivated_at set after disabled transition';

  raise notice 'PASS scenario-3: transition to disabled sets deactivated_at';
end $$;
rollback;

-- ============================================================
-- Scenario 4: pending_disable → active clears deactivated_at
-- ============================================================
begin;
do $$
declare
  v_admin_id     uuid;
  v_building_id  uuid;
  v_unit_id      uuid;
  v_key_id       uuid;
  v_deactivated  timestamptz;
begin
  insert into public.administrations (company_name) values ('Test 064-S4') returning id into v_admin_id;
  insert into public.buildings (name, address, administration_id) values ('Building 064-S4', 'Calle 4', v_admin_id) returning id into v_building_id;
  insert into public.units (number, building_id) values ('4A', v_building_id) returning id into v_unit_id;

  -- Insert directly as pending_disable with a stale deactivated_at to simulate a previous value
  insert into public.rfid_keys (rfid_code, unit_id, status, deactivated_at)
    values ('T064-S4-KEY', v_unit_id, 'pending_disable', now() - interval '1 day')
    returning id into v_key_id;

  -- Transition back to active; trigger should clear deactivated_at
  update public.rfid_keys set status = 'active' where id = v_key_id;

  select deactivated_at into v_deactivated from public.rfid_keys where id = v_key_id;
  assert v_deactivated is null, 'FAIL 064-S4: expected deactivated_at cleared after pending_disable → active, got ' || v_deactivated::text;

  raise notice 'PASS scenario-4: pending_disable to active clears deactivated_at';
end $$;
rollback;

-- ============================================================
-- Scenario 5: 'disabled' inserted directly sets deactivated_at (INSERT path)
-- ============================================================
begin;
do $$
declare
  v_admin_id     uuid;
  v_building_id  uuid;
  v_unit_id      uuid;
  v_key_id       uuid;
  v_deactivated  timestamptz;
begin
  insert into public.administrations (company_name) values ('Test 064-S5') returning id into v_admin_id;
  insert into public.buildings (name, address, administration_id) values ('Building 064-S5', 'Calle 5', v_admin_id) returning id into v_building_id;
  insert into public.units (number, building_id) values ('5A', v_building_id) returning id into v_unit_id;

  insert into public.rfid_keys (rfid_code, unit_id, status) values ('T064-S5-KEY', v_unit_id, 'disabled') returning id into v_key_id;

  select deactivated_at into v_deactivated from public.rfid_keys where id = v_key_id;
  assert v_deactivated is not null, 'FAIL 064-S5: expected deactivated_at auto-set on INSERT with disabled status';

  raise notice 'PASS scenario-5: direct INSERT with disabled sets deactivated_at';
end $$;
rollback;
