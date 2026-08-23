-- ============================================================
-- pgTAP: rfid_keys 5-state lifecycle CHECK + sync_deactivated_at trigger
-- ============================================================
-- Prerequisite: migration 20260818000064 applied.
-- Identifier markers: PASS 064-S1 through PASS 064-S5 preserved.
-- ============================================================

BEGIN;
SELECT plan(5);

-- ============================================================
-- Scenario 1 (PASS 064-S1): All 5 valid statuses accepted by CHECK
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
      INSERT INTO public.administrations (company_name) VALUES ('Test 064-S1') RETURNING id INTO v_admin_id;
      INSERT INTO public.buildings (name, address, administration_id) VALUES ('Building 064-S1', 'Calle 1', v_admin_id) RETURNING id INTO v_building_id;
      INSERT INTO public.units (number, building_id) VALUES ('1A', v_building_id) RETURNING id INTO v_unit_id;

      INSERT INTO public.rfid_keys (rfid_code, unit_id, status) VALUES ('T064-S1-PENDING-CREATION', v_unit_id, 'pending_creation') RETURNING id INTO v_key_id;
      ASSERT v_key_id IS NOT NULL, 'FAIL 064-S1: pending_creation not accepted';

      INSERT INTO public.rfid_keys (rfid_code, unit_id, status) VALUES ('T064-S1-PENDING-INSTALL', v_unit_id, 'pending_installation') RETURNING id INTO v_key_id;
      ASSERT v_key_id IS NOT NULL, 'FAIL 064-S1: pending_installation not accepted';

      INSERT INTO public.rfid_keys (rfid_code, unit_id, status) VALUES ('T064-S1-ACTIVE', v_unit_id, 'active') RETURNING id INTO v_key_id;
      ASSERT v_key_id IS NOT NULL, 'FAIL 064-S1: active not accepted';

      INSERT INTO public.rfid_keys (rfid_code, unit_id, status) VALUES ('T064-S1-PENDING-DISABLE', v_unit_id, 'pending_disable') RETURNING id INTO v_key_id;
      ASSERT v_key_id IS NOT NULL, 'FAIL 064-S1: pending_disable not accepted';

      INSERT INTO public.rfid_keys (rfid_code, unit_id, status) VALUES ('T064-S1-DISABLED', v_unit_id, 'disabled') RETURNING id INTO v_key_id;
      ASSERT v_key_id IS NOT NULL, 'FAIL 064-S1: disabled not accepted';

      SELECT count(*) INTO v_count FROM public.rfid_keys WHERE rfid_code LIKE 'T064-S1-%';
      ASSERT v_count = 5, 'FAIL 064-S1: expected 5 inserted rows, got ' || v_count::text;
    END $$;
  $q$,
  'PASS 064-S1: all 5 valid statuses accepted by CHECK'
);

-- ============================================================
-- Scenario 2 (PASS 064-S2): revoked status rejected by CHECK
-- ============================================================
SELECT throws_ok(
  $q$
    DO $$
    DECLARE
      v_admin_id    uuid;
      v_building_id uuid;
      v_unit_id     uuid;
    BEGIN
      INSERT INTO public.administrations (company_name) VALUES ('Test 064-S2') RETURNING id INTO v_admin_id;
      INSERT INTO public.buildings (name, address, administration_id) VALUES ('Building 064-S2', 'Calle 2', v_admin_id) RETURNING id INTO v_building_id;
      INSERT INTO public.units (number, building_id) VALUES ('2A', v_building_id) RETURNING id INTO v_unit_id;
      INSERT INTO public.rfid_keys (rfid_code, unit_id, status) VALUES ('T064-S2-REVOKED', v_unit_id, 'revoked');
    END $$;
  $q$,
  NULL,
  NULL,
  'PASS 064-S2: revoked status rejected by CHECK constraint'
);

-- ============================================================
-- Scenario 3 (PASS 064-S3): Transition to disabled sets deactivated_at
-- ============================================================
SELECT lives_ok(
  $q$
    DO $$
    DECLARE
      v_admin_id    uuid;
      v_building_id uuid;
      v_unit_id     uuid;
      v_key_id      uuid;
      v_deactivated timestamptz;
    BEGIN
      INSERT INTO public.administrations (company_name) VALUES ('Test 064-S3') RETURNING id INTO v_admin_id;
      INSERT INTO public.buildings (name, address, administration_id) VALUES ('Building 064-S3', 'Calle 3', v_admin_id) RETURNING id INTO v_building_id;
      INSERT INTO public.units (number, building_id) VALUES ('3A', v_building_id) RETURNING id INTO v_unit_id;
      INSERT INTO public.rfid_keys (rfid_code, unit_id, status) VALUES ('T064-S3-KEY', v_unit_id, 'active') RETURNING id INTO v_key_id;

      SELECT deactivated_at INTO v_deactivated FROM public.rfid_keys WHERE id = v_key_id;
      ASSERT v_deactivated IS NULL, 'FAIL 064-S3: expected deactivated_at null while active';

      UPDATE public.rfid_keys SET status = 'disabled' WHERE id = v_key_id;

      SELECT deactivated_at INTO v_deactivated FROM public.rfid_keys WHERE id = v_key_id;
      ASSERT v_deactivated IS NOT NULL, 'FAIL 064-S3: expected deactivated_at set after disabled transition';
    END $$;
  $q$,
  'PASS 064-S3: transition to disabled sets deactivated_at'
);

-- ============================================================
-- Scenario 4 (PASS 064-S4): pending_disable → active clears deactivated_at
-- ============================================================
SELECT lives_ok(
  $q$
    DO $$
    DECLARE
      v_admin_id    uuid;
      v_building_id uuid;
      v_unit_id     uuid;
      v_key_id      uuid;
      v_deactivated timestamptz;
    BEGIN
      INSERT INTO public.administrations (company_name) VALUES ('Test 064-S4') RETURNING id INTO v_admin_id;
      INSERT INTO public.buildings (name, address, administration_id) VALUES ('Building 064-S4', 'Calle 4', v_admin_id) RETURNING id INTO v_building_id;
      INSERT INTO public.units (number, building_id) VALUES ('4A', v_building_id) RETURNING id INTO v_unit_id;
      INSERT INTO public.rfid_keys (rfid_code, unit_id, status, deactivated_at)
        VALUES ('T064-S4-KEY', v_unit_id, 'pending_disable', now() - interval '1 day')
        RETURNING id INTO v_key_id;

      UPDATE public.rfid_keys SET status = 'active' WHERE id = v_key_id;

      SELECT deactivated_at INTO v_deactivated FROM public.rfid_keys WHERE id = v_key_id;
      ASSERT v_deactivated IS NULL, 'FAIL 064-S4: expected deactivated_at cleared after pending_disable → active, got ' || v_deactivated::text;
    END $$;
  $q$,
  'PASS 064-S4: pending_disable to active clears deactivated_at'
);

-- ============================================================
-- Scenario 5 (PASS 064-S5): direct INSERT with disabled sets deactivated_at
-- ============================================================
SELECT lives_ok(
  $q$
    DO $$
    DECLARE
      v_admin_id    uuid;
      v_building_id uuid;
      v_unit_id     uuid;
      v_key_id      uuid;
      v_deactivated timestamptz;
    BEGIN
      INSERT INTO public.administrations (company_name) VALUES ('Test 064-S5') RETURNING id INTO v_admin_id;
      INSERT INTO public.buildings (name, address, administration_id) VALUES ('Building 064-S5', 'Calle 5', v_admin_id) RETURNING id INTO v_building_id;
      INSERT INTO public.units (number, building_id) VALUES ('5A', v_building_id) RETURNING id INTO v_unit_id;
      INSERT INTO public.rfid_keys (rfid_code, unit_id, status) VALUES ('T064-S5-KEY', v_unit_id, 'disabled') RETURNING id INTO v_key_id;

      SELECT deactivated_at INTO v_deactivated FROM public.rfid_keys WHERE id = v_key_id;
      ASSERT v_deactivated IS NOT NULL, 'FAIL 064-S5: expected deactivated_at auto-set on INSERT with disabled status';
    END $$;
  $q$,
  'PASS 064-S5: direct INSERT with disabled sets deactivated_at'
);

SELECT * FROM finish();
ROLLBACK;
