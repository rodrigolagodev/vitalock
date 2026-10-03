-- ============================================================
-- pgTAP: installer UPDATEs on key_authorizations are limited to pending rows
-- ============================================================
-- Covers migration 20260915100000_scope_installer_key_authorization_updates.sql.
-- The worklist is SHARED (any installer completes any pending row), so the
-- policy scopes by state, not by installer. Through `authenticated`:
--   - installer completes a pending_install row via complete_authorizations
--   - installer can still edit a pending row (notes)
--   - installer cannot update a settled (installed) row -> 0 rows, unchanged
--   - installer cannot cancel a pending row (cancelled is admin-only) -> 42501
--   - admin can update a settled row (unaffected)
-- ============================================================

BEGIN;
SELECT plan(6);

DO $$
DECLARE
  v_admin_auth_id uuid := '13911391-1391-1391-1391-139113911391';
  v_inst_auth_id  uuid := '13921392-1392-1392-1392-139213921392';
  v_org_id        uuid;
  v_building_id   uuid;
  v_unit_id       uuid;
  v_eq_id         uuid;
  v_key_id        uuid;
  v_auth_id       uuid;
  i               int;
BEGIN
  INSERT INTO auth.users (id) VALUES (v_admin_auth_id), (v_inst_auth_id);
  INSERT INTO identity.staff (auth_user_id, full_name, role, status) VALUES
    (v_admin_auth_id, 'Test 139 Admin',     'admin',     'active'),
    (v_inst_auth_id,  'Test 139 Installer', 'installer', 'active');

  INSERT INTO public.administrations (company_name) VALUES ('Test 139 Client') RETURNING id INTO v_org_id;
  INSERT INTO public.buildings (name, address, administration_id)
    VALUES ('Test 139 Building', 'Calle 139', v_org_id) RETURNING id INTO v_building_id;
  INSERT INTO public.units (number, building_id) VALUES ('1A', v_building_id) RETURNING id INTO v_unit_id;
  INSERT INTO operations.equipment (serial_number, building_id, description, status)
    VALUES ('SN-139', v_building_id, 'Test 139 Equip', 'active') RETURNING id INTO v_eq_id;

  CREATE TEMP TABLE _t139 (k text primary key, v uuid) ON COMMIT DROP;
  GRANT SELECT ON _t139 TO authenticated;

  -- pending_a: completed by the installer; pending_b: edited / cancel attempt;
  -- settled: moved to installed up front.
  FOR i IN 1..3 LOOP
    INSERT INTO public.rfid_keys (rfid_code, unit_id, status)
      VALUES ('T139-KEY-' || i, v_unit_id, 'active') RETURNING id INTO v_key_id;
    INSERT INTO operations.key_authorizations (rfid_key_id, equipment_id)
      VALUES (v_key_id, v_eq_id) RETURNING id INTO v_auth_id;
    INSERT INTO _t139 VALUES ((ARRAY['pending_a', 'pending_b', 'settled'])[i], v_auth_id);
  END LOOP;

  UPDATE operations.key_authorizations SET sync_state = 'installed'
   WHERE id = (SELECT v FROM _t139 WHERE k = 'settled');
END $$;

-- ---- installer ------------------------------------------------------------
SET LOCAL role authenticated;
SET LOCAL request.jwt.claims TO '{"sub": "13921392-1392-1392-1392-139213921392"}';

SELECT lives_ok(
  $$ SELECT public.complete_authorizations(
       ARRAY[(SELECT v FROM _t139 WHERE k = 'pending_a')],
       ARRAY[]::uuid[],
       identity.current_staff_id()) $$,
  'installer completes a pending_install authorization via complete_authorizations'
);

SELECT lives_ok(
  $$ UPDATE operations.key_authorizations SET notes = 'nota installer'
      WHERE id = (SELECT v FROM _t139 WHERE k = 'pending_b') $$,
  'installer can still edit a pending authorization'
);

-- RLS USING filters the settled row out: the UPDATE matches nothing.
UPDATE operations.key_authorizations SET notes = 'reescritura de historial'
 WHERE id = (SELECT v FROM _t139 WHERE k = 'settled');

SELECT throws_ok(
  $$ UPDATE operations.key_authorizations SET sync_state = 'cancelled'
      WHERE id = (SELECT v FROM _t139 WHERE k = 'pending_b') $$,
  '42501',
  NULL,
  'installer cannot cancel a pending authorization (admin-only)'
);

-- ---- admin ----------------------------------------------------------------
SET LOCAL request.jwt.claims TO '{"sub": "13911391-1391-1391-1391-139113911391"}';
UPDATE operations.key_authorizations SET remove_reason = 'ajuste admin'
 WHERE id = (SELECT v FROM _t139 WHERE k = 'settled');

RESET role;

SELECT is(
  (SELECT sync_state FROM operations.key_authorizations
    WHERE id = (SELECT v FROM _t139 WHERE k = 'pending_a')),
  'installed',
  'the completed authorization is installed'
);

SELECT is(
  (SELECT notes FROM operations.key_authorizations
    WHERE id = (SELECT v FROM _t139 WHERE k = 'settled')),
  NULL,
  'installer UPDATE on an installed (settled) authorization changed nothing'
);

SELECT is(
  (SELECT remove_reason FROM operations.key_authorizations
    WHERE id = (SELECT v FROM _t139 WHERE k = 'settled')),
  'ajuste admin',
  'admin can still update a settled authorization'
);

SELECT * FROM finish();
ROLLBACK;
