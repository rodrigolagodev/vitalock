-- ============================================================
-- pgTAP: request_key_disable + cancel_key_disable RPCs
-- ============================================================
-- Prerequisite: migrations 064-069 applied.
-- Identifier markers: PASS 069-S1 through PASS 069-S5 preserved.
-- ============================================================

BEGIN;
SELECT plan(5);

-- ============================================================
-- Scenario 1 (PASS 069-S1): request_key_disable on active key
--   → pending_disable + disable_requested event
-- ============================================================
SELECT lives_ok(
  $q$
    DO $$
    DECLARE
      v_admin_id    uuid;
      v_building_id uuid;
      v_unit_id     uuid;
      v_staff_id    uuid;
      v_key_id      uuid;
      v_status      text;
      v_event_count int;
    BEGIN
      INSERT INTO public.administrations (company_name) VALUES ('Test 069-S1') RETURNING id INTO v_admin_id;
      INSERT INTO public.buildings (name, address, administration_id) VALUES ('Building 069-S1', 'Calle 1', v_admin_id) RETURNING id INTO v_building_id;
      INSERT INTO public.units (number, building_id) VALUES ('1A', v_building_id) RETURNING id INTO v_unit_id;
      INSERT INTO identity.staff (full_name, role) VALUES ('Staff 069-S1', 'admin') RETURNING id INTO v_staff_id;
      INSERT INTO public.rfid_keys (rfid_code, unit_id, status) VALUES ('T069-S1-KEY', v_unit_id, 'active') RETURNING id INTO v_key_id;

      PERFORM public.request_key_disable(v_key_id, v_staff_id, 'Test disable S1');

      SELECT status INTO v_status FROM public.rfid_keys WHERE id = v_key_id;
      ASSERT v_status = 'pending_disable', 'FAIL 069-S1: expected pending_disable, got ' || v_status;

      SELECT count(*) INTO v_event_count
        FROM public.key_events
       WHERE key_id = v_key_id AND event_type = 'disable_requested';
      ASSERT v_event_count = 1, 'FAIL 069-S1: expected 1 disable_requested event, got ' || v_event_count::text;
    END $$;
  $q$,
  'PASS 069-S1: request_key_disable sets pending_disable + emits disable_requested'
);

-- ============================================================
-- Scenario 2 (PASS 069-S2): cancel_key_disable restores active + clears deactivated_at
-- ============================================================
SELECT lives_ok(
  $q$
    DO $$
    DECLARE
      v_admin_id    uuid;
      v_building_id uuid;
      v_unit_id     uuid;
      v_staff_id    uuid;
      v_key_id      uuid;
      v_status      text;
      v_deactivated timestamptz;
      v_event_count int;
    BEGIN
      INSERT INTO public.administrations (company_name) VALUES ('Test 069-S2') RETURNING id INTO v_admin_id;
      INSERT INTO public.buildings (name, address, administration_id) VALUES ('Building 069-S2', 'Calle 2', v_admin_id) RETURNING id INTO v_building_id;
      INSERT INTO public.units (number, building_id) VALUES ('2A', v_building_id) RETURNING id INTO v_unit_id;
      INSERT INTO identity.staff (full_name, role) VALUES ('Staff 069-S2', 'admin') RETURNING id INTO v_staff_id;
      INSERT INTO public.rfid_keys (rfid_code, unit_id, status) VALUES ('T069-S2-KEY', v_unit_id, 'active') RETURNING id INTO v_key_id;

      PERFORM public.request_key_disable(v_key_id, v_staff_id, 'Test disable S2');
      PERFORM public.cancel_key_disable(v_key_id, v_staff_id, 'Test cancel S2');

      SELECT status, deactivated_at INTO v_status, v_deactivated FROM public.rfid_keys WHERE id = v_key_id;
      ASSERT v_status = 'active', 'FAIL 069-S2: expected active after cancel, got ' || v_status;
      ASSERT v_deactivated IS NULL, 'FAIL 069-S2: expected deactivated_at cleared after cancel';

      SELECT count(*) INTO v_event_count
        FROM public.key_events
       WHERE key_id = v_key_id AND event_type = 'disable_cancelled';
      ASSERT v_event_count = 1, 'FAIL 069-S2: expected 1 disable_cancelled event, got ' || v_event_count::text;
    END $$;
  $q$,
  'PASS 069-S2: cancel_key_disable restores active + emits disable_cancelled + clears deactivated_at'
);

-- ============================================================
-- Scenario 3 (PASS 069-S3): request_key_disable is idempotent on pending_disable
-- ============================================================
SELECT lives_ok(
  $q$
    DO $$
    DECLARE
      v_admin_id    uuid;
      v_building_id uuid;
      v_unit_id     uuid;
      v_staff_id    uuid;
      v_key_id      uuid;
      v_status      text;
      v_event_count int;
    BEGIN
      INSERT INTO public.administrations (company_name) VALUES ('Test 069-S3') RETURNING id INTO v_admin_id;
      INSERT INTO public.buildings (name, address, administration_id) VALUES ('Building 069-S3', 'Calle 3', v_admin_id) RETURNING id INTO v_building_id;
      INSERT INTO public.units (number, building_id) VALUES ('3A', v_building_id) RETURNING id INTO v_unit_id;
      INSERT INTO identity.staff (full_name, role) VALUES ('Staff 069-S3', 'admin') RETURNING id INTO v_staff_id;
      INSERT INTO public.rfid_keys (rfid_code, unit_id, status) VALUES ('T069-S3-KEY', v_unit_id, 'active') RETURNING id INTO v_key_id;

      PERFORM public.request_key_disable(v_key_id, v_staff_id, 'First disable');
      PERFORM public.request_key_disable(v_key_id, v_staff_id, 'Second disable (idempotent)');

      SELECT status INTO v_status FROM public.rfid_keys WHERE id = v_key_id;
      ASSERT v_status = 'pending_disable', 'FAIL 069-S3: expected pending_disable after double call';

      SELECT count(*) INTO v_event_count
        FROM public.key_events
       WHERE key_id = v_key_id AND event_type = 'disable_requested';
      ASSERT v_event_count = 1, 'FAIL 069-S3: expected 1 disable_requested event (idempotent), got ' || v_event_count::text;
    END $$;
  $q$,
  'PASS 069-S3: request_key_disable is idempotent on already pending_disable key'
);

-- ============================================================
-- Scenario 4 (PASS 069-S4): request_key_disable on non-active key rejected
-- ============================================================
SELECT throws_ok(
  $q$
    DO $$
    DECLARE
      v_admin_id    uuid;
      v_building_id uuid;
      v_unit_id     uuid;
      v_staff_id    uuid;
      v_key_id      uuid;
    BEGIN
      INSERT INTO public.administrations (company_name) VALUES ('Test 069-S4') RETURNING id INTO v_admin_id;
      INSERT INTO public.buildings (name, address, administration_id) VALUES ('Building 069-S4', 'Calle 4', v_admin_id) RETURNING id INTO v_building_id;
      INSERT INTO public.units (number, building_id) VALUES ('4A', v_building_id) RETURNING id INTO v_unit_id;
      INSERT INTO identity.staff (full_name, role) VALUES ('Staff 069-S4', 'admin') RETURNING id INTO v_staff_id;
      INSERT INTO public.rfid_keys (rfid_code, unit_id, status) VALUES ('T069-S4-KEY', v_unit_id, 'pending_installation') RETURNING id INTO v_key_id;

      PERFORM public.request_key_disable(v_key_id, v_staff_id, NULL);
    END $$;
  $q$,
  NULL,
  NULL,
  'PASS 069-S4: request_key_disable rejected on non-active key'
);

-- ============================================================
-- Scenario 5 (PASS 069-S5): disabled key cannot be transitioned
-- ============================================================
SELECT throws_ok(
  $q$
    DO $$
    DECLARE
      v_admin_id    uuid;
      v_building_id uuid;
      v_unit_id     uuid;
      v_staff_id    uuid;
      v_key_id      uuid;
    BEGIN
      INSERT INTO public.administrations (company_name) VALUES ('Test 069-S5') RETURNING id INTO v_admin_id;
      INSERT INTO public.buildings (name, address, administration_id) VALUES ('Building 069-S5', 'Calle 5', v_admin_id) RETURNING id INTO v_building_id;
      INSERT INTO public.units (number, building_id) VALUES ('5A', v_building_id) RETURNING id INTO v_unit_id;
      INSERT INTO identity.staff (full_name, role) VALUES ('Staff 069-S5', 'admin') RETURNING id INTO v_staff_id;
      INSERT INTO public.rfid_keys (rfid_code, unit_id, status) VALUES ('T069-S5-KEY', v_unit_id, 'disabled') RETURNING id INTO v_key_id;

      PERFORM public.request_key_disable(v_key_id, v_staff_id, NULL);
    END $$;
  $q$,
  NULL,
  NULL,
  'PASS 069-S5: disabled key cannot be transitioned via request_key_disable'
);

SELECT * FROM finish();
ROLLBACK;
