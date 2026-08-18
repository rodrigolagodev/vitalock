-- ============================================================
-- DB smoke test: rfid_keys_sync_deactivated_at trigger — tightened semantics
-- ============================================================
-- Prerequisite: migrations 064 + 073 applied.
-- ============================================================

-- ============================================================
-- Scenario 1: pending_disable → active CLEARS deactivated_at (regression from 064)
-- ============================================================
begin;
do $$
declare
  v_admin_id    uuid;
  v_building_id uuid;
  v_unit_id     uuid;
  v_key_id      uuid;
  v_deact       timestamptz;
begin
  insert into public.administrations (company_name) values ('Test 073-S1') returning id into v_admin_id;
  insert into public.buildings (name, address, administration_id) values ('Building 073-S1', 'Calle 1', v_admin_id) returning id into v_building_id;
  insert into public.units (number, building_id) values ('1A', v_building_id) returning id into v_unit_id;

  -- Create an active key, then disable it to set deactivated_at.
  insert into public.rfid_keys (rfid_code, unit_id, status) values ('T073-S1-KEY', v_unit_id, 'active') returning id into v_key_id;
  update public.rfid_keys set status = 'disabled' where id = v_key_id;

  select deactivated_at into v_deact from public.rfid_keys where id = v_key_id;
  assert v_deact is not null, 'FAIL 073-S1: deactivated_at should be set after disabled';

  -- Now simulate the cancel path: pending_disable → active
  -- (directly for test; in production this is via cancel_key_disable RPC)
  update public.rfid_keys set status = 'pending_disable' where id = v_key_id;
  update public.rfid_keys set status = 'active'          where id = v_key_id;

  select deactivated_at into v_deact from public.rfid_keys where id = v_key_id;
  assert v_deact is null, 'FAIL 073-S1: deactivated_at should be cleared after pending_disable → active';

  raise notice 'PASS scenario-1: pending_disable → active clears deactivated_at';
end $$;
rollback;

-- ============================================================
-- Scenario 2: active → disabled SETS deactivated_at (regression from 064)
-- ============================================================
begin;
do $$
declare
  v_admin_id    uuid;
  v_building_id uuid;
  v_unit_id     uuid;
  v_key_id      uuid;
  v_deact       timestamptz;
begin
  insert into public.administrations (company_name) values ('Test 073-S2') returning id into v_admin_id;
  insert into public.buildings (name, address, administration_id) values ('Building 073-S2', 'Calle 2', v_admin_id) returning id into v_building_id;
  insert into public.units (number, building_id) values ('2A', v_building_id) returning id into v_unit_id;

  insert into public.rfid_keys (rfid_code, unit_id, status) values ('T073-S2-KEY', v_unit_id, 'active') returning id into v_key_id;

  select deactivated_at into v_deact from public.rfid_keys where id = v_key_id;
  assert v_deact is null, 'FAIL 073-S2: new active key should have null deactivated_at';

  update public.rfid_keys set status = 'disabled' where id = v_key_id;

  select deactivated_at into v_deact from public.rfid_keys where id = v_key_id;
  assert v_deact is not null, 'FAIL 073-S2: deactivated_at should be set after active → disabled';

  raise notice 'PASS scenario-2: active → disabled sets deactivated_at';
end $$;
rollback;

-- ============================================================
-- Scenario 3: pending_creation → pending_installation does NOT modify deactivated_at
-- ============================================================
begin;
do $$
declare
  v_admin_id    uuid;
  v_building_id uuid;
  v_unit_id     uuid;
  v_key_id      uuid;
  v_deact_before timestamptz;
  v_deact_after  timestamptz;
begin
  insert into public.administrations (company_name) values ('Test 073-S3') returning id into v_admin_id;
  insert into public.buildings (name, address, administration_id) values ('Building 073-S3', 'Calle 3', v_admin_id) returning id into v_building_id;
  insert into public.units (number, building_id) values ('3A', v_building_id) returning id into v_unit_id;

  insert into public.rfid_keys (rfid_code, unit_id, status) values ('T073-S3-KEY', v_unit_id, 'pending_creation') returning id into v_key_id;

  select deactivated_at into v_deact_before from public.rfid_keys where id = v_key_id;

  update public.rfid_keys set status = 'pending_installation' where id = v_key_id;

  select deactivated_at into v_deact_after from public.rfid_keys where id = v_key_id;

  -- Both should be null; neither triggers a deactivated_at change
  assert v_deact_before is null, 'FAIL 073-S3: deactivated_at should be null before transition';
  assert v_deact_after is null,  'FAIL 073-S3: deactivated_at should remain null after pending_creation → pending_installation';

  raise notice 'PASS scenario-3: pending_creation → pending_installation leaves deactivated_at unchanged';
end $$;
rollback;

-- ============================================================
-- Scenario 4: active → pending_disable does NOT set deactivated_at (only disabled does)
-- ============================================================
begin;
do $$
declare
  v_admin_id    uuid;
  v_building_id uuid;
  v_unit_id     uuid;
  v_key_id      uuid;
  v_deact       timestamptz;
begin
  insert into public.administrations (company_name) values ('Test 073-S4') returning id into v_admin_id;
  insert into public.buildings (name, address, administration_id) values ('Building 073-S4', 'Calle 4', v_admin_id) returning id into v_building_id;
  insert into public.units (number, building_id) values ('4A', v_building_id) returning id into v_unit_id;

  insert into public.rfid_keys (rfid_code, unit_id, status) values ('T073-S4-KEY', v_unit_id, 'active') returning id into v_key_id;

  update public.rfid_keys set status = 'pending_disable' where id = v_key_id;

  select deactivated_at into v_deact from public.rfid_keys where id = v_key_id;
  assert v_deact is null, 'FAIL 073-S4: deactivated_at should still be null after active → pending_disable (reversible)';

  raise notice 'PASS scenario-4: active → pending_disable does not set deactivated_at';
end $$;
rollback;

-- ============================================================
-- Scenario 5: non-cancel status transition (e.g. pending_installation → active)
--             does NOT clear deactivated_at if it was pre-existing
-- ============================================================
-- Note: in normal operation deactivated_at is only set when status='disabled',
-- so this scenario manually sets deactivated_at to verify the trigger doesn't
-- clear it on an unrelated transition.
begin;
do $$
declare
  v_admin_id    uuid;
  v_building_id uuid;
  v_unit_id     uuid;
  v_key_id      uuid;
  v_ts          timestamptz;
  v_deact_after timestamptz;
begin
  insert into public.administrations (company_name) values ('Test 073-S5') returning id into v_admin_id;
  insert into public.buildings (name, address, administration_id) values ('Building 073-S5', 'Calle 5', v_admin_id) returning id into v_building_id;
  insert into public.units (number, building_id) values ('5A', v_building_id) returning id into v_unit_id;

  -- Insert a key at pending_installation with a manually set deactivated_at
  -- (artificial scenario to verify the trigger ignores unrelated transitions)
  v_ts := now() - interval '1 hour';
  insert into public.rfid_keys (rfid_code, unit_id, status, deactivated_at)
    values ('T073-S5-KEY', v_unit_id, 'pending_installation', v_ts)
    returning id into v_key_id;

  -- Transition to active (not the pending_disable → active cancel path)
  update public.rfid_keys set status = 'active' where id = v_key_id;

  select deactivated_at into v_deact_after from public.rfid_keys where id = v_key_id;
  -- Tightened trigger: only clears on pending_disable → active, so this should be unchanged
  assert v_deact_after = v_ts,
    'FAIL 073-S5: deactivated_at should be unchanged after pending_installation → active transition';

  raise notice 'PASS scenario-5: non-cancel transition leaves deactivated_at unchanged';
end $$;
rollback;
