-- ============================================================
-- DB smoke test: key_events event_type CHECK expansion
-- ============================================================
-- Prerequisite: migrations 20260818000064 + 20260818000065 applied.
-- ============================================================

-- ============================================================
-- Scenario 1: new event types are accepted
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
  insert into public.administrations (company_name) values ('Test 065-S1') returning id into v_admin_id;
  insert into public.buildings (name, address, administration_id) values ('Building 065-S1', 'Calle 1', v_admin_id) returning id into v_building_id;
  insert into public.units (number, building_id) values ('1A', v_building_id) returning id into v_unit_id;
  insert into public.rfid_keys (rfid_code, unit_id, status) values ('T065-S1-KEY', v_unit_id, 'active') returning id into v_key_id;

  -- Insert each new event_type; note key_events requires a non-empty note.
  insert into public.key_events (key_id, event_type, note) values (v_key_id, 'creation_requested', 'test');
  insert into public.key_events (key_id, event_type, note) values (v_key_id, 'configured', 'test');
  insert into public.key_events (key_id, event_type, note) values (v_key_id, 'disable_requested', 'test');
  insert into public.key_events (key_id, event_type, note) values (v_key_id, 'disable_cancelled', 'test');
  insert into public.key_events (key_id, event_type, note) values (v_key_id, 'snapshot_skipped', 'test');
  insert into public.key_events (key_id, event_type, note) values (v_key_id, 'disabled', 'test');

  select count(*) into v_count
    from public.key_events
   where key_id = v_key_id
     and event_type in ('creation_requested','configured','disable_requested','disable_cancelled','snapshot_skipped','disabled');

  assert v_count = 6, 'FAIL 065-S1: expected 6 new event_type rows, got ' || v_count::text;
  raise notice 'PASS scenario-1: all 6 new event_types accepted';
end $$;
rollback;

-- ============================================================
-- Scenario 2: historical event types still accepted
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
  insert into public.administrations (company_name) values ('Test 065-S2') returning id into v_admin_id;
  insert into public.buildings (name, address, administration_id) values ('Building 065-S2', 'Calle 2', v_admin_id) returning id into v_building_id;
  insert into public.units (number, building_id) values ('2A', v_building_id) returning id into v_unit_id;
  insert into public.rfid_keys (rfid_code, unit_id, status) values ('T065-S2-KEY', v_unit_id, 'active') returning id into v_key_id;

  insert into public.key_events (key_id, event_type, note) values (v_key_id, 'activated', 'historical');
  insert into public.key_events (key_id, event_type, note) values (v_key_id, 'deactivated', 'historical');

  select count(*) into v_count
    from public.key_events
   where key_id = v_key_id
     and event_type in ('activated', 'deactivated');

  assert v_count = 2, 'FAIL 065-S2: expected 2 historical event rows, got ' || v_count::text;
  raise notice 'PASS scenario-2: historical event types still accepted';
end $$;
rollback;

-- ============================================================
-- Scenario 3: unknown event type is rejected
-- ============================================================
begin;
do $$
declare
  v_admin_id    uuid;
  v_building_id uuid;
  v_unit_id     uuid;
  v_key_id      uuid;
  v_failed      boolean := false;
begin
  insert into public.administrations (company_name) values ('Test 065-S3') returning id into v_admin_id;
  insert into public.buildings (name, address, administration_id) values ('Building 065-S3', 'Calle 3', v_admin_id) returning id into v_building_id;
  insert into public.units (number, building_id) values ('3A', v_building_id) returning id into v_unit_id;
  insert into public.rfid_keys (rfid_code, unit_id, status) values ('T065-S3-KEY', v_unit_id, 'active') returning id into v_key_id;

  begin
    insert into public.key_events (key_id, event_type, note) values (v_key_id, 'unknown_event', 'test');
  exception when check_violation or others then
    v_failed := true;
  end;

  assert v_failed, 'FAIL 065-S3: expected unknown_event to be rejected by CHECK';
  raise notice 'PASS scenario-3: unknown event_type rejected by CHECK';
end $$;
rollback;
