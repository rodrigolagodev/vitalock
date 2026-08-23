-- ============================================================
-- pgTAP: key_events event_type CHECK expansion
-- ============================================================
-- Prerequisite: migrations 20260818000064 + 20260818000065 applied.
-- Identifier markers: PASS 065-S1 through PASS 065-S3 preserved.
-- ============================================================

BEGIN;
SELECT plan(3);

-- ============================================================
-- Scenario 1 (PASS 065-S1): all 6 new event types accepted
-- ============================================================
SELECT lives_ok(
  $q$
    DO $$
    DECLARE
      v_admin_id    uuid;
      v_building_id uuid;
      v_unit_id     uuid;
      v_key_id      uuid;
      v_count       int;
    BEGIN
      INSERT INTO public.administrations (company_name) VALUES ('Test 065-S1') RETURNING id INTO v_admin_id;
      INSERT INTO public.buildings (name, address, administration_id) VALUES ('Building 065-S1', 'Calle 1', v_admin_id) RETURNING id INTO v_building_id;
      INSERT INTO public.units (number, building_id) VALUES ('1A', v_building_id) RETURNING id INTO v_unit_id;
      INSERT INTO public.rfid_keys (rfid_code, unit_id, status) VALUES ('T065-S1-KEY', v_unit_id, 'active') RETURNING id INTO v_key_id;

      INSERT INTO public.key_events (key_id, event_type, note) VALUES (v_key_id, 'creation_requested', 'test');
      INSERT INTO public.key_events (key_id, event_type, note) VALUES (v_key_id, 'configured', 'test');
      INSERT INTO public.key_events (key_id, event_type, note) VALUES (v_key_id, 'disable_requested', 'test');
      INSERT INTO public.key_events (key_id, event_type, note) VALUES (v_key_id, 'disable_cancelled', 'test');
      INSERT INTO public.key_events (key_id, event_type, note) VALUES (v_key_id, 'snapshot_skipped', 'test');
      INSERT INTO public.key_events (key_id, event_type, note) VALUES (v_key_id, 'disabled', 'test');

      SELECT count(*) INTO v_count
        FROM public.key_events
       WHERE key_id = v_key_id
         AND event_type IN ('creation_requested','configured','disable_requested','disable_cancelled','snapshot_skipped','disabled');

      ASSERT v_count = 6, 'FAIL 065-S1: expected 6 new event_type rows, got ' || v_count::text;
    END $$;
  $q$,
  'PASS 065-S1: all 6 new event_types accepted'
);

-- ============================================================
-- Scenario 2 (PASS 065-S2): historical event types still accepted
-- ============================================================
SELECT lives_ok(
  $q$
    DO $$
    DECLARE
      v_admin_id    uuid;
      v_building_id uuid;
      v_unit_id     uuid;
      v_key_id      uuid;
      v_count       int;
    BEGIN
      INSERT INTO public.administrations (company_name) VALUES ('Test 065-S2') RETURNING id INTO v_admin_id;
      INSERT INTO public.buildings (name, address, administration_id) VALUES ('Building 065-S2', 'Calle 2', v_admin_id) RETURNING id INTO v_building_id;
      INSERT INTO public.units (number, building_id) VALUES ('2A', v_building_id) RETURNING id INTO v_unit_id;
      INSERT INTO public.rfid_keys (rfid_code, unit_id, status) VALUES ('T065-S2-KEY', v_unit_id, 'active') RETURNING id INTO v_key_id;

      INSERT INTO public.key_events (key_id, event_type, note) VALUES (v_key_id, 'activated', 'historical');
      INSERT INTO public.key_events (key_id, event_type, note) VALUES (v_key_id, 'deactivated', 'historical');

      SELECT count(*) INTO v_count
        FROM public.key_events
       WHERE key_id = v_key_id
         AND event_type IN ('activated', 'deactivated');

      ASSERT v_count = 2, 'FAIL 065-S2: expected 2 historical event rows, got ' || v_count::text;
    END $$;
  $q$,
  'PASS 065-S2: historical event types still accepted'
);

-- ============================================================
-- Scenario 3 (PASS 065-S3): unknown event type rejected by CHECK
-- ============================================================
SELECT throws_ok(
  $q$
    DO $$
    DECLARE
      v_admin_id    uuid;
      v_building_id uuid;
      v_unit_id     uuid;
      v_key_id      uuid;
    BEGIN
      INSERT INTO public.administrations (company_name) VALUES ('Test 065-S3') RETURNING id INTO v_admin_id;
      INSERT INTO public.buildings (name, address, administration_id) VALUES ('Building 065-S3', 'Calle 3', v_admin_id) RETURNING id INTO v_building_id;
      INSERT INTO public.units (number, building_id) VALUES ('3A', v_building_id) RETURNING id INTO v_unit_id;
      INSERT INTO public.rfid_keys (rfid_code, unit_id, status) VALUES ('T065-S3-KEY', v_unit_id, 'active') RETURNING id INTO v_key_id;
      INSERT INTO public.key_events (key_id, event_type, note) VALUES (v_key_id, 'unknown_event', 'test');
    END $$;
  $q$,
  NULL,
  NULL,
  'PASS 065-S3: unknown event_type rejected by CHECK'
);

SELECT * FROM finish();
ROLLBACK;
