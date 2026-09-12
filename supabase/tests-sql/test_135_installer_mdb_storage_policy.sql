-- ============================================================
-- pgTAP: installer SELECT on equipment-updates-mdb storage objects
-- ============================================================
-- Covers migration 20260912100000_fix_installer_mdb_storage_policy.
-- The admin app uploads to `pending-<equipment_id>/<file>` (the ticket does
-- not exist yet at upload time), so the policy must bind the object to the
-- equipment_update row that references it, not to a ticket-id path prefix.
--   S1: installer sees the object referenced by their assigned update.
--   S2: installer does NOT see the object of an update assigned to someone else.
--   S3: installer does NOT see an object in the bucket that no update references.
-- ============================================================

BEGIN;
SELECT plan(3);

DO $$
DECLARE
  v_installer_auth_id uuid := '35353535-3535-3535-3535-353535353535';
  v_other_auth_id     uuid := '36363636-3636-3636-3636-363636363636';
  v_installer_id      uuid;
  v_other_id          uuid;
  v_admin_org_id      uuid;
  v_building_id       uuid;
  v_unit_id           uuid;
  v_eq_own            uuid;
  v_eq_other          uuid;
  v_key_own           uuid;
  v_key_other         uuid;
  v_path_own          text;
  v_path_other        text;
  v_path_orphan       text := 'pending-00000000-0000-0000-0000-000000000135/orphan.mdb';
BEGIN
  INSERT INTO auth.users (id) VALUES (v_installer_auth_id), (v_other_auth_id);

  INSERT INTO identity.staff (auth_user_id, full_name, role, status)
    VALUES (v_installer_auth_id, 'Test 135 Installer', 'installer', 'active')
    RETURNING id INTO v_installer_id;
  INSERT INTO identity.staff (auth_user_id, full_name, role, status)
    VALUES (v_other_auth_id, 'Test 135 Other Installer', 'installer', 'active')
    RETURNING id INTO v_other_id;

  INSERT INTO public.administrations (company_name) VALUES ('Test 135 Client') RETURNING id INTO v_admin_org_id;
  INSERT INTO public.buildings (name, address, administration_id)
    VALUES ('Test 135 Building', 'Calle 1', v_admin_org_id) RETURNING id INTO v_building_id;
  INSERT INTO public.units (number, building_id)
    VALUES ('1A', v_building_id) RETURNING id INTO v_unit_id;

  INSERT INTO operations.equipment (serial_number, building_id, description, status)
    VALUES ('SN-135-OWN', v_building_id, 'Test 135 Equip own', 'active') RETURNING id INTO v_eq_own;
  INSERT INTO operations.equipment (serial_number, building_id, description, status)
    VALUES ('SN-135-OTHER', v_building_id, 'Test 135 Equip other', 'active') RETURNING id INTO v_eq_other;

  INSERT INTO public.rfid_keys (rfid_code, unit_id, status)
    VALUES ('T135-KEY-OWN', v_unit_id, 'pending_installation') RETURNING id INTO v_key_own;
  INSERT INTO public.rfid_keys (rfid_code, unit_id, status)
    VALUES ('T135-KEY-OTHER', v_unit_id, 'pending_installation') RETURNING id INTO v_key_other;

  -- Same path shape the admin app writes in production.
  v_path_own   := 'pending-' || v_eq_own::text   || '/db.mdb';
  v_path_other := 'pending-' || v_eq_other::text || '/db.mdb';

  PERFORM public.create_equipment_update(
    p_equipment_id         => v_eq_own,
    p_administration_id    => v_admin_org_id,
    p_building_id          => v_building_id,
    p_description          => 'Test 135 own',
    p_mdb_storage_path     => v_path_own,
    p_keys_to_activate     => array[v_key_own]::uuid[],
    p_keys_to_disable      => '{}'::uuid[],
    p_actor_staff_id       => v_installer_id,
    p_assigned_to_staff_id => v_installer_id
  );
  PERFORM public.create_equipment_update(
    p_equipment_id         => v_eq_other,
    p_administration_id    => v_admin_org_id,
    p_building_id          => v_building_id,
    p_description          => 'Test 135 other',
    p_mdb_storage_path     => v_path_other,
    p_keys_to_activate     => array[v_key_other]::uuid[],
    p_keys_to_disable      => '{}'::uuid[],
    p_actor_staff_id       => v_other_id,
    p_assigned_to_staff_id => v_other_id
  );

  -- Objects are inserted directly (as postgres) — the Storage API is not
  -- part of the SQL suite; only the RLS predicate is under test here.
  INSERT INTO storage.objects (bucket_id, name)
    VALUES ('equipment-updates-mdb', v_path_own),
           ('equipment-updates-mdb', v_path_other),
           ('equipment-updates-mdb', v_path_orphan);

  CREATE TEMP TABLE _t135 (k text primary key, v text) ON COMMIT DROP;
  INSERT INTO _t135 VALUES
    ('installer_auth', v_installer_auth_id::text),
    ('path_own',       v_path_own),
    ('path_other',     v_path_other),
    ('path_orphan',    v_path_orphan);
END $$;

-- ============================================================
-- Scenario 1 (PASS 135-S1): installer sees the .mdb of their assigned task
-- ============================================================
SELECT lives_ok(
  $q$
    DO $$
    DECLARE
      v_count int;
      v_auth  uuid := (SELECT v::uuid FROM _t135 WHERE k = 'installer_auth');
      v_path  text := (SELECT v FROM _t135 WHERE k = 'path_own');
    BEGIN
      SET LOCAL role authenticated;
      PERFORM set_config('request.jwt.claims', json_build_object('sub', v_auth::text)::text, true);
      SELECT count(*) INTO v_count FROM storage.objects
       WHERE bucket_id = 'equipment-updates-mdb' AND name = v_path;
      ASSERT v_count = 1,
        'FAIL 135-S1: installer should see the .mdb of their assigned update, got count=' || v_count;
      RESET role;
    END $$;
  $q$,
  'PASS 135-S1: installer can SELECT the .mdb object referenced by their assigned equipment_update'
);

-- ============================================================
-- Scenario 2 (PASS 135-S2): installer cannot see another installer's .mdb
-- ============================================================
SELECT lives_ok(
  $q$
    DO $$
    DECLARE
      v_count int;
      v_auth  uuid := (SELECT v::uuid FROM _t135 WHERE k = 'installer_auth');
      v_path  text := (SELECT v FROM _t135 WHERE k = 'path_other');
    BEGIN
      SET LOCAL role authenticated;
      PERFORM set_config('request.jwt.claims', json_build_object('sub', v_auth::text)::text, true);
      SELECT count(*) INTO v_count FROM storage.objects
       WHERE bucket_id = 'equipment-updates-mdb' AND name = v_path;
      ASSERT v_count = 0,
        'FAIL 135-S2: installer should NOT see another installer''s .mdb, got count=' || v_count;
      RESET role;
    END $$;
  $q$,
  'PASS 135-S2: installer cannot SELECT the .mdb object of an update assigned to someone else'
);

-- ============================================================
-- Scenario 3 (PASS 135-S3): unreferenced objects stay hidden
-- ============================================================
SELECT lives_ok(
  $q$
    DO $$
    DECLARE
      v_count int;
      v_auth  uuid := (SELECT v::uuid FROM _t135 WHERE k = 'installer_auth');
      v_path  text := (SELECT v FROM _t135 WHERE k = 'path_orphan');
    BEGIN
      SET LOCAL role authenticated;
      PERFORM set_config('request.jwt.claims', json_build_object('sub', v_auth::text)::text, true);
      SELECT count(*) INTO v_count FROM storage.objects
       WHERE bucket_id = 'equipment-updates-mdb' AND name = v_path;
      ASSERT v_count = 0,
        'FAIL 135-S3: installer should NOT see an .mdb no equipment_update references, got count=' || v_count;
      RESET role;
    END $$;
  $q$,
  'PASS 135-S3: installer cannot SELECT an .mdb object that no equipment_update references'
);

SELECT * FROM finish();
ROLLBACK;
