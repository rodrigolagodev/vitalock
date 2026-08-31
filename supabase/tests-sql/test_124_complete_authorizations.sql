-- ============================================================
-- pgTAP: public.complete_authorizations
-- ============================================================
-- Covers migration 20260830000109_complete_authorizations.sql
-- (REQ-DB-COMPLETE-AUTH-1.1..1.7).
--
--   S1  Install-only batch → all install ids move to installed.
--   S2  Remove-only batch → all remove ids move to removed.
--   S3  Mixed batch → both branches applied atomically.
--   S4  Empty arrays → no-op, no error.
--   S5  Non-privileged caller → mutation blocked (rollback preserved).
--   S6  Terminal-state authorization → RPC raises, no rows updated.
--   S7  Partial batch failure → transaction rolled back (first row
--       stays pending_install).
-- ============================================================

BEGIN;
SELECT plan(8);

-- ============================================================
-- Fixtures — all under postgres role (bypasses RLS)
-- ============================================================
DO $$
DECLARE
  v_installer_auth uuid := '66666666-6666-6666-6666-666666666666';
  v_installer_id   uuid;
  v_admin_org      uuid;
  v_building       uuid;
  v_unit           uuid;
  v_eq_1           uuid;
  v_eq_2           uuid;
  v_eq_3           uuid;
  v_eq_4           uuid;
  v_eq_5           uuid;
  v_eq_6           uuid;
  v_eq_7           uuid;
  v_key_1          uuid;
  v_key_2          uuid;
  v_key_3          uuid;
  v_key_4          uuid;
  v_key_5          uuid;
  v_key_6          uuid;
  v_key_7          uuid;
  v_auth_install_a uuid;
  v_auth_install_b uuid;
  v_auth_remove_a  uuid;
  v_auth_remove_b  uuid;
  v_auth_mixed_i   uuid;
  v_auth_mixed_r   uuid;
  v_auth_s5        uuid;
  v_auth_s6_ok     uuid;
  v_auth_s6_bad    uuid;
  v_auth_s7_ok     uuid;
BEGIN
  INSERT INTO auth.users (id) VALUES (v_installer_auth);
  INSERT INTO identity.staff (auth_user_id, full_name, role, status)
    VALUES (v_installer_auth, 'Test 124 Installer', 'installer', 'active')
    RETURNING id INTO v_installer_id;

  INSERT INTO public.administrations (company_name)
    VALUES ('Test 124 Client') RETURNING id INTO v_admin_org;

  INSERT INTO public.buildings (name, address, administration_id)
    VALUES ('Test 124 Building', 'Calle 1', v_admin_org) RETURNING id INTO v_building;
  INSERT INTO public.units (number, building_id)
    VALUES ('1A', v_building) RETURNING id INTO v_unit;

  -- Seven equipment rows (one per scenario slot to sidestep the
  -- one-authorization-per-(key,equipment) unique constraint).
  INSERT INTO operations.equipment (serial_number, building_id, description, status)
    VALUES ('SN-124-EQ1', v_building, 'Eq 1', 'active') RETURNING id INTO v_eq_1;
  INSERT INTO operations.equipment (serial_number, building_id, description, status)
    VALUES ('SN-124-EQ2', v_building, 'Eq 2', 'active') RETURNING id INTO v_eq_2;
  INSERT INTO operations.equipment (serial_number, building_id, description, status)
    VALUES ('SN-124-EQ3', v_building, 'Eq 3', 'active') RETURNING id INTO v_eq_3;
  INSERT INTO operations.equipment (serial_number, building_id, description, status)
    VALUES ('SN-124-EQ4', v_building, 'Eq 4', 'active') RETURNING id INTO v_eq_4;
  INSERT INTO operations.equipment (serial_number, building_id, description, status)
    VALUES ('SN-124-EQ5', v_building, 'Eq 5', 'active') RETURNING id INTO v_eq_5;
  INSERT INTO operations.equipment (serial_number, building_id, description, status)
    VALUES ('SN-124-EQ6', v_building, 'Eq 6', 'active') RETURNING id INTO v_eq_6;
  INSERT INTO operations.equipment (serial_number, building_id, description, status)
    VALUES ('SN-124-EQ7', v_building, 'Eq 7', 'active') RETURNING id INTO v_eq_7;

  -- Seven rfid_keys.
  INSERT INTO public.rfid_keys (rfid_code, unit_id, status)
    VALUES ('T124-K1', v_unit, 'active') RETURNING id INTO v_key_1;
  INSERT INTO public.rfid_keys (rfid_code, unit_id, status)
    VALUES ('T124-K2', v_unit, 'active') RETURNING id INTO v_key_2;
  INSERT INTO public.rfid_keys (rfid_code, unit_id, status)
    VALUES ('T124-K3', v_unit, 'active') RETURNING id INTO v_key_3;
  INSERT INTO public.rfid_keys (rfid_code, unit_id, status)
    VALUES ('T124-K4', v_unit, 'active') RETURNING id INTO v_key_4;
  INSERT INTO public.rfid_keys (rfid_code, unit_id, status)
    VALUES ('T124-K5', v_unit, 'active') RETURNING id INTO v_key_5;
  INSERT INTO public.rfid_keys (rfid_code, unit_id, status)
    VALUES ('T124-K6', v_unit, 'active') RETURNING id INTO v_key_6;
  INSERT INTO public.rfid_keys (rfid_code, unit_id, status)
    VALUES ('T124-K7', v_unit, 'active') RETURNING id INTO v_key_7;

  -- Authorizations. All start in pending_install by trigger fiat.
  INSERT INTO operations.key_authorizations (rfid_key_id, equipment_id)
    VALUES (v_key_1, v_eq_1) RETURNING id INTO v_auth_install_a;
  INSERT INTO operations.key_authorizations (rfid_key_id, equipment_id)
    VALUES (v_key_2, v_eq_2) RETURNING id INTO v_auth_install_b;

  INSERT INTO operations.key_authorizations (rfid_key_id, equipment_id)
    VALUES (v_key_3, v_eq_3) RETURNING id INTO v_auth_remove_a;
  INSERT INTO operations.key_authorizations (rfid_key_id, equipment_id)
    VALUES (v_key_4, v_eq_4) RETURNING id INTO v_auth_remove_b;

  INSERT INTO operations.key_authorizations (rfid_key_id, equipment_id)
    VALUES (v_key_5, v_eq_5) RETURNING id INTO v_auth_mixed_i;
  INSERT INTO operations.key_authorizations (rfid_key_id, equipment_id)
    VALUES (v_key_6, v_eq_6) RETURNING id INTO v_auth_mixed_r;

  INSERT INTO operations.key_authorizations (rfid_key_id, equipment_id)
    VALUES (v_key_7, v_eq_7) RETURNING id INTO v_auth_s5;

  -- Two extra auth rows for the terminal-state and partial-failure scenarios.
  INSERT INTO operations.equipment (serial_number, building_id, description, status)
    VALUES ('SN-124-EQ8', v_building, 'Eq 8', 'active');
  INSERT INTO public.rfid_keys (rfid_code, unit_id, status)
    VALUES ('T124-K8', v_unit, 'active');
  INSERT INTO operations.key_authorizations (rfid_key_id, equipment_id)
    SELECT rk.id, eq.id
      FROM public.rfid_keys rk, operations.equipment eq
     WHERE rk.rfid_code = 'T124-K8' AND eq.serial_number = 'SN-124-EQ8'
    RETURNING id INTO v_auth_s6_ok;

  INSERT INTO operations.equipment (serial_number, building_id, description, status)
    VALUES ('SN-124-EQ9', v_building, 'Eq 9', 'active');
  INSERT INTO public.rfid_keys (rfid_code, unit_id, status)
    VALUES ('T124-K9', v_unit, 'active');
  INSERT INTO operations.key_authorizations (rfid_key_id, equipment_id)
    SELECT rk.id, eq.id
      FROM public.rfid_keys rk, operations.equipment eq
     WHERE rk.rfid_code = 'T124-K9' AND eq.serial_number = 'SN-124-EQ9'
    RETURNING id INTO v_auth_s6_bad;

  INSERT INTO operations.equipment (serial_number, building_id, description, status)
    VALUES ('SN-124-EQ10', v_building, 'Eq 10', 'active');
  INSERT INTO public.rfid_keys (rfid_code, unit_id, status)
    VALUES ('T124-K10', v_unit, 'active');
  INSERT INTO operations.key_authorizations (rfid_key_id, equipment_id)
    SELECT rk.id, eq.id
      FROM public.rfid_keys rk, operations.equipment eq
     WHERE rk.rfid_code = 'T124-K10' AND eq.serial_number = 'SN-124-EQ10'
    RETURNING id INTO v_auth_s7_ok;

  -- Preload the ones that need a different starting state:
  --   v_auth_remove_* need to reach 'pending_removal' → transition install→install→pending_removal.
  UPDATE operations.key_authorizations
     SET sync_state = 'installed'
   WHERE id IN (v_auth_remove_a, v_auth_remove_b, v_auth_mixed_r, v_auth_s6_bad);
  UPDATE operations.key_authorizations
     SET sync_state = 'pending_removal'
   WHERE id IN (v_auth_remove_a, v_auth_remove_b, v_auth_mixed_r);

  -- v_auth_s6_bad advances all the way to 'installed' — terminal for install branch.

  CREATE TEMP TABLE _t124 (k text primary key, v uuid) ON COMMIT DROP;
  INSERT INTO _t124 VALUES
    ('installer_auth',   v_installer_auth),
    ('installer',        v_installer_id),
    ('auth_install_a',   v_auth_install_a),
    ('auth_install_b',   v_auth_install_b),
    ('auth_remove_a',    v_auth_remove_a),
    ('auth_remove_b',    v_auth_remove_b),
    ('auth_mixed_i',     v_auth_mixed_i),
    ('auth_mixed_r',     v_auth_mixed_r),
    ('auth_s5',          v_auth_s5),
    ('auth_s6_ok',       v_auth_s6_ok),
    ('auth_s6_bad',      v_auth_s6_bad),
    ('auth_s7_ok',       v_auth_s7_ok);
END $$;

-- ============================================================
-- S1: Install-only batch
-- ============================================================
SELECT lives_ok(
  $q$
    DO $$
    DECLARE
      v_installed int;
    BEGIN
      PERFORM public.complete_authorizations(
        p_install_ids => array[
          (SELECT v FROM _t124 WHERE k = 'auth_install_a'),
          (SELECT v FROM _t124 WHERE k = 'auth_install_b')
        ]::uuid[],
        p_remove_ids  => '{}'::uuid[],
        p_staff_id    => (SELECT v FROM _t124 WHERE k = 'installer')
      );
      SELECT count(*) INTO v_installed
        FROM operations.key_authorizations
       WHERE id IN (
         (SELECT v FROM _t124 WHERE k = 'auth_install_a'),
         (SELECT v FROM _t124 WHERE k = 'auth_install_b')
       ) AND sync_state = 'installed';
      ASSERT v_installed = 2, 'FAIL 124-S1: expected 2 installed, got ' || v_installed;
    END $$;
  $q$,
  'PASS 124-S1: install-only batch transitions both rows to installed'
);

-- ============================================================
-- S2: Remove-only batch
-- ============================================================
SELECT lives_ok(
  $q$
    DO $$
    DECLARE
      v_removed int;
    BEGIN
      PERFORM public.complete_authorizations(
        p_install_ids => '{}'::uuid[],
        p_remove_ids  => array[
          (SELECT v FROM _t124 WHERE k = 'auth_remove_a'),
          (SELECT v FROM _t124 WHERE k = 'auth_remove_b')
        ]::uuid[],
        p_staff_id    => (SELECT v FROM _t124 WHERE k = 'installer')
      );
      SELECT count(*) INTO v_removed
        FROM operations.key_authorizations
       WHERE id IN (
         (SELECT v FROM _t124 WHERE k = 'auth_remove_a'),
         (SELECT v FROM _t124 WHERE k = 'auth_remove_b')
       ) AND sync_state = 'removed';
      ASSERT v_removed = 2, 'FAIL 124-S2: expected 2 removed, got ' || v_removed;
    END $$;
  $q$,
  'PASS 124-S2: remove-only batch transitions both rows to removed'
);

-- ============================================================
-- S3: Mixed batch
-- ============================================================
SELECT lives_ok(
  $q$
    DO $$
    DECLARE
      v_state_i text;
      v_state_r text;
    BEGIN
      PERFORM public.complete_authorizations(
        p_install_ids => array[(SELECT v FROM _t124 WHERE k = 'auth_mixed_i')]::uuid[],
        p_remove_ids  => array[(SELECT v FROM _t124 WHERE k = 'auth_mixed_r')]::uuid[],
        p_staff_id    => (SELECT v FROM _t124 WHERE k = 'installer')
      );
      SELECT sync_state INTO v_state_i FROM operations.key_authorizations
       WHERE id = (SELECT v FROM _t124 WHERE k = 'auth_mixed_i');
      SELECT sync_state INTO v_state_r FROM operations.key_authorizations
       WHERE id = (SELECT v FROM _t124 WHERE k = 'auth_mixed_r');
      ASSERT v_state_i = 'installed' AND v_state_r = 'removed',
        'FAIL 124-S3: mixed batch did not apply both branches (i=' || v_state_i || ', r=' || v_state_r || ')';
    END $$;
  $q$,
  'PASS 124-S3: mixed batch applies install + remove atomically'
);

-- ============================================================
-- S4: Empty arrays no-op
-- ============================================================
SELECT lives_ok(
  $q$
    SELECT public.complete_authorizations(
      p_install_ids => '{}'::uuid[],
      p_remove_ids  => '{}'::uuid[],
      p_staff_id    => (SELECT v FROM _t124 WHERE k = 'installer')
    );
  $q$,
  'PASS 124-S4: empty arrays return without error (no-op)'
);

-- ============================================================
-- S5: Non-privileged caller (authenticated without staff row) → mutation blocked
-- ============================================================
-- Anon authenticated user has no identity.staff row → is_admin()/is_installer()
-- both return false → RLS blocks UPDATE → row count 0 → RPC raises P0001
-- "install batch mismatch" and the transaction rolls back.
-- Resolve the target UUID BEFORE switching role — _t124 is a temp table
-- owned by postgres and is not visible to `authenticated`.
DO $$
DECLARE
  v_auth_s5 uuid := (SELECT v FROM _t124 WHERE k = 'auth_s5');
BEGIN
  CREATE TEMP TABLE IF NOT EXISTS _t124_s5 (v uuid) ON COMMIT DROP;
  INSERT INTO _t124_s5 VALUES (v_auth_s5);
  GRANT SELECT ON _t124_s5 TO authenticated;
END $$;

SELECT throws_ok(
  $q$
    DO $$
    DECLARE
      v_ghost_auth uuid := '77777777-7777-7777-7777-777777777777';
      v_target     uuid;
    BEGIN
      SET LOCAL role authenticated;
      PERFORM set_config('request.jwt.claims',
        json_build_object('sub', v_ghost_auth::text)::text,
        true);
      SELECT v INTO v_target FROM _t124_s5 LIMIT 1;
      PERFORM public.complete_authorizations(
        p_install_ids => array[v_target]::uuid[],
        p_remove_ids  => '{}'::uuid[],
        p_staff_id    => v_ghost_auth
      );
    END $$;
  $q$,
  'P0001',
  NULL,
  'PASS 124-S5: non-privileged caller cannot mutate (batch mismatch raised)'
);

-- Row still pending_install (rollback preserved)
SELECT is(
  (SELECT sync_state FROM operations.key_authorizations
    WHERE id = (SELECT v FROM _t124 WHERE k = 'auth_s5')),
  'pending_install',
  'PASS 124-S5b: non-privileged failed call left row in original state'
);

-- ============================================================
-- S6: Terminal-state authorization → RPC raises, no rows updated
-- ============================================================
-- s6_ok is pending_install (good); s6_bad is already 'installed' (terminal
-- for install branch). Row count will be 1 (only s6_ok updates), expected 2
-- → P0001 raised → rollback → s6_ok stays pending_install.
SELECT throws_ok(
  $q$
    DO $$
    BEGIN
      PERFORM public.complete_authorizations(
        p_install_ids => array[
          (SELECT v FROM _t124 WHERE k = 'auth_s6_ok'),
          (SELECT v FROM _t124 WHERE k = 'auth_s6_bad')
        ]::uuid[],
        p_remove_ids  => '{}'::uuid[],
        p_staff_id    => (SELECT v FROM _t124 WHERE k = 'installer')
      );
    END $$;
  $q$,
  'P0001',
  NULL,
  'PASS 124-S6: terminal-state row in batch raises P0001'
);

-- ============================================================
-- S7: Partial batch failure rolls back all rows
-- ============================================================
-- One valid id + one non-existent id → row_count = 1 vs expected 2 → P0001.
-- Verify the valid row stays in pending_install.
DO $$
BEGIN
  BEGIN
    PERFORM public.complete_authorizations(
      p_install_ids => array[
        (SELECT v FROM _t124 WHERE k = 'auth_s7_ok'),
        '00000000-0000-0000-0000-000000000000'::uuid
      ]::uuid[],
      p_remove_ids  => '{}'::uuid[],
      p_staff_id    => (SELECT v FROM _t124 WHERE k = 'installer')
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
END $$;

SELECT is(
  (SELECT sync_state FROM operations.key_authorizations
    WHERE id = (SELECT v FROM _t124 WHERE k = 'auth_s7_ok')),
  'pending_install',
  'PASS 124-S7: partial-batch failure rolls back valid row'
);

SELECT * FROM finish();
ROLLBACK;
