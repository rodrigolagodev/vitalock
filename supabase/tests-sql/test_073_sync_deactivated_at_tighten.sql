-- ============================================================
-- pgTAP: rfid_keys_sync_deactivated_at trigger — tightened semantics
-- ============================================================
-- Prerequisite: migrations 064 + 073 applied.
-- Identifier markers: PASS 073-S1 through PASS 073-S5 preserved.
-- ============================================================

BEGIN;
SELECT plan(5);

-- ============================================================
-- Scenario 1 (PASS 073-S1): pending_disable → active CLEARS deactivated_at
-- ============================================================
SELECT lives_ok(
  $q$
    DO $$
    DECLARE
      v_admin_id    uuid;
      v_building_id uuid;
      v_unit_id     uuid;
      v_key_id      uuid;
      v_deact       timestamptz;
    BEGIN
      INSERT INTO public.administrations (company_name) VALUES ('Test 073-S1') RETURNING id INTO v_admin_id;
      INSERT INTO public.buildings (name, address, administration_id) VALUES ('Building 073-S1', 'Calle 1', v_admin_id) RETURNING id INTO v_building_id;
      INSERT INTO public.units (number, building_id) VALUES ('1A', v_building_id) RETURNING id INTO v_unit_id;

      INSERT INTO public.rfid_keys (rfid_code, unit_id, status) VALUES ('T073-S1-KEY', v_unit_id, 'active') RETURNING id INTO v_key_id;
      UPDATE public.rfid_keys SET status = 'disabled' WHERE id = v_key_id;

      SELECT deactivated_at INTO v_deact FROM public.rfid_keys WHERE id = v_key_id;
      ASSERT v_deact IS NOT NULL, 'FAIL 073-S1: deactivated_at should be set after disabled';

      UPDATE public.rfid_keys SET status = 'pending_disable' WHERE id = v_key_id;
      UPDATE public.rfid_keys SET status = 'active'          WHERE id = v_key_id;

      SELECT deactivated_at INTO v_deact FROM public.rfid_keys WHERE id = v_key_id;
      ASSERT v_deact IS NULL, 'FAIL 073-S1: deactivated_at should be cleared after pending_disable → active';
    END $$;
  $q$,
  'PASS 073-S1: pending_disable → active clears deactivated_at'
);

-- ============================================================
-- Scenario 2 (PASS 073-S2): active → disabled SETS deactivated_at
-- ============================================================
SELECT lives_ok(
  $q$
    DO $$
    DECLARE
      v_admin_id    uuid;
      v_building_id uuid;
      v_unit_id     uuid;
      v_key_id      uuid;
      v_deact       timestamptz;
    BEGIN
      INSERT INTO public.administrations (company_name) VALUES ('Test 073-S2') RETURNING id INTO v_admin_id;
      INSERT INTO public.buildings (name, address, administration_id) VALUES ('Building 073-S2', 'Calle 2', v_admin_id) RETURNING id INTO v_building_id;
      INSERT INTO public.units (number, building_id) VALUES ('2A', v_building_id) RETURNING id INTO v_unit_id;

      INSERT INTO public.rfid_keys (rfid_code, unit_id, status) VALUES ('T073-S2-KEY', v_unit_id, 'active') RETURNING id INTO v_key_id;

      SELECT deactivated_at INTO v_deact FROM public.rfid_keys WHERE id = v_key_id;
      ASSERT v_deact IS NULL, 'FAIL 073-S2: new active key should have null deactivated_at';

      UPDATE public.rfid_keys SET status = 'disabled' WHERE id = v_key_id;

      SELECT deactivated_at INTO v_deact FROM public.rfid_keys WHERE id = v_key_id;
      ASSERT v_deact IS NOT NULL, 'FAIL 073-S2: deactivated_at should be set after active → disabled';
    END $$;
  $q$,
  'PASS 073-S2: active → disabled sets deactivated_at'
);

-- ============================================================
-- Scenario 3 (PASS 073-S3): pending_creation → pending_installation does NOT modify deactivated_at
-- ============================================================
SELECT lives_ok(
  $q$
    DO $$
    DECLARE
      v_admin_id     uuid;
      v_building_id  uuid;
      v_unit_id      uuid;
      v_key_id       uuid;
      v_deact_before timestamptz;
      v_deact_after  timestamptz;
    BEGIN
      INSERT INTO public.administrations (company_name) VALUES ('Test 073-S3') RETURNING id INTO v_admin_id;
      INSERT INTO public.buildings (name, address, administration_id) VALUES ('Building 073-S3', 'Calle 3', v_admin_id) RETURNING id INTO v_building_id;
      INSERT INTO public.units (number, building_id) VALUES ('3A', v_building_id) RETURNING id INTO v_unit_id;

      INSERT INTO public.rfid_keys (rfid_code, unit_id, status) VALUES ('T073-S3-KEY', v_unit_id, 'pending_creation') RETURNING id INTO v_key_id;

      SELECT deactivated_at INTO v_deact_before FROM public.rfid_keys WHERE id = v_key_id;

      UPDATE public.rfid_keys SET status = 'pending_installation' WHERE id = v_key_id;

      SELECT deactivated_at INTO v_deact_after FROM public.rfid_keys WHERE id = v_key_id;

      ASSERT v_deact_before IS NULL, 'FAIL 073-S3: deactivated_at should be null before transition';
      ASSERT v_deact_after  IS NULL, 'FAIL 073-S3: deactivated_at should remain null after pending_creation → pending_installation';
    END $$;
  $q$,
  'PASS 073-S3: pending_creation → pending_installation leaves deactivated_at unchanged'
);

-- ============================================================
-- Scenario 4 (PASS 073-S4): active → pending_disable does NOT set deactivated_at
-- ============================================================
SELECT lives_ok(
  $q$
    DO $$
    DECLARE
      v_admin_id    uuid;
      v_building_id uuid;
      v_unit_id     uuid;
      v_key_id      uuid;
      v_deact       timestamptz;
    BEGIN
      INSERT INTO public.administrations (company_name) VALUES ('Test 073-S4') RETURNING id INTO v_admin_id;
      INSERT INTO public.buildings (name, address, administration_id) VALUES ('Building 073-S4', 'Calle 4', v_admin_id) RETURNING id INTO v_building_id;
      INSERT INTO public.units (number, building_id) VALUES ('4A', v_building_id) RETURNING id INTO v_unit_id;

      INSERT INTO public.rfid_keys (rfid_code, unit_id, status) VALUES ('T073-S4-KEY', v_unit_id, 'active') RETURNING id INTO v_key_id;

      UPDATE public.rfid_keys SET status = 'pending_disable' WHERE id = v_key_id;

      SELECT deactivated_at INTO v_deact FROM public.rfid_keys WHERE id = v_key_id;
      ASSERT v_deact IS NULL, 'FAIL 073-S4: deactivated_at should still be null after active → pending_disable (reversible)';
    END $$;
  $q$,
  'PASS 073-S4: active → pending_disable does not set deactivated_at'
);

-- ============================================================
-- Scenario 5 (PASS 073-S5): non-cancel transition leaves deactivated_at unchanged
-- ============================================================
SELECT lives_ok(
  $q$
    DO $$
    DECLARE
      v_admin_id    uuid;
      v_building_id uuid;
      v_unit_id     uuid;
      v_key_id      uuid;
      v_ts          timestamptz;
      v_deact_after timestamptz;
    BEGIN
      INSERT INTO public.administrations (company_name) VALUES ('Test 073-S5') RETURNING id INTO v_admin_id;
      INSERT INTO public.buildings (name, address, administration_id) VALUES ('Building 073-S5', 'Calle 5', v_admin_id) RETURNING id INTO v_building_id;
      INSERT INTO public.units (number, building_id) VALUES ('5A', v_building_id) RETURNING id INTO v_unit_id;

      v_ts := now() - interval '1 hour';
      INSERT INTO public.rfid_keys (rfid_code, unit_id, status, deactivated_at)
        VALUES ('T073-S5-KEY', v_unit_id, 'pending_installation', v_ts)
        RETURNING id INTO v_key_id;

      UPDATE public.rfid_keys SET status = 'active' WHERE id = v_key_id;

      SELECT deactivated_at INTO v_deact_after FROM public.rfid_keys WHERE id = v_key_id;
      ASSERT v_deact_after = v_ts,
        'FAIL 073-S5: deactivated_at should be unchanged after pending_installation → active transition';
    END $$;
  $q$,
  'PASS 073-S5: non-cancel transition leaves deactivated_at unchanged'
);

SELECT * FROM finish();
ROLLBACK;
