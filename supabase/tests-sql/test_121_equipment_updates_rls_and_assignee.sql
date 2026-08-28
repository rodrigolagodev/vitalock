-- ============================================================
-- pgTAP: RLS fix on support.equipment_updates + assignee on create RPC
-- ============================================================
-- Covers migration 20260828000105:
--   S1: create_equipment_update stores p_assigned_to_staff_id on the ticket.
--   S2: create_equipment_update without assignee leaves NULL (backward compat).
--   S3: Installer can SELECT the equipment_update assigned to them
--       (previously blocked by broken auth.uid() comparison).
--   S4: Installer CANNOT SELECT an equipment_update assigned to someone else.
-- ============================================================

BEGIN;
SELECT plan(4);

-- ============================================================
-- Shared fixtures (created as postgres, bypasses RLS)
-- ============================================================
DO $$
DECLARE
  v_installer_auth_id uuid := '33333333-3333-3333-3333-333333333333';
  v_other_auth_id     uuid := '44444444-4444-4444-4444-444444444444';
  v_installer_id      uuid;
  v_other_id          uuid;
  v_admin_org_id      uuid;
  v_building_id       uuid;
  v_unit_id           uuid;
  v_eq_s1             uuid;
  v_eq_s2             uuid;
  v_eq_s3             uuid;
  v_eq_s4             uuid;
  v_key_s1            uuid;
  v_key_s2            uuid;
  v_key_s3            uuid;
  v_key_s4            uuid;
BEGIN
  INSERT INTO auth.users (id) VALUES (v_installer_auth_id), (v_other_auth_id);

  INSERT INTO identity.staff (auth_user_id, full_name, role, status)
    VALUES (v_installer_auth_id, 'Test 121 Installer', 'installer', 'active')
    RETURNING id INTO v_installer_id;
  INSERT INTO identity.staff (auth_user_id, full_name, role, status)
    VALUES (v_other_auth_id, 'Test 121 Other Installer', 'installer', 'active')
    RETURNING id INTO v_other_id;

  INSERT INTO public.administrations (company_name) VALUES ('Test 121 Client') RETURNING id INTO v_admin_org_id;
  INSERT INTO public.buildings (name, address, administration_id)
    VALUES ('Test 121 Building', 'Calle 1', v_admin_org_id) RETURNING id INTO v_building_id;
  INSERT INTO public.units (number, building_id)
    VALUES ('1A', v_building_id) RETURNING id INTO v_unit_id;

  -- One equipment + one key per scenario to sidestep the
  -- equipment_updates_one_open_per_equipment_uidx unique constraint.
  INSERT INTO operations.equipment (serial_number, building_id, description, status)
    VALUES ('SN-121-S1', v_building_id, 'Test 121 Equip S1', 'active') RETURNING id INTO v_eq_s1;
  INSERT INTO operations.equipment (serial_number, building_id, description, status)
    VALUES ('SN-121-S2', v_building_id, 'Test 121 Equip S2', 'active') RETURNING id INTO v_eq_s2;
  INSERT INTO operations.equipment (serial_number, building_id, description, status)
    VALUES ('SN-121-S3', v_building_id, 'Test 121 Equip S3', 'active') RETURNING id INTO v_eq_s3;
  INSERT INTO operations.equipment (serial_number, building_id, description, status)
    VALUES ('SN-121-S4', v_building_id, 'Test 121 Equip S4', 'active') RETURNING id INTO v_eq_s4;

  INSERT INTO public.rfid_keys (rfid_code, unit_id, status)
    VALUES ('T121-KEY-S1', v_unit_id, 'pending_installation') RETURNING id INTO v_key_s1;
  INSERT INTO public.rfid_keys (rfid_code, unit_id, status)
    VALUES ('T121-KEY-S2', v_unit_id, 'pending_installation') RETURNING id INTO v_key_s2;
  INSERT INTO public.rfid_keys (rfid_code, unit_id, status)
    VALUES ('T121-KEY-S3', v_unit_id, 'pending_installation') RETURNING id INTO v_key_s3;
  INSERT INTO public.rfid_keys (rfid_code, unit_id, status)
    VALUES ('T121-KEY-S4', v_unit_id, 'pending_installation') RETURNING id INTO v_key_s4;

  -- Stash ids for later scenarios via a temp table.
  CREATE TEMP TABLE _t121 (k text primary key, v uuid) ON COMMIT DROP;
  INSERT INTO _t121 VALUES
    ('installer_auth', v_installer_auth_id),
    ('other_auth',     v_other_auth_id),
    ('installer',      v_installer_id),
    ('other',          v_other_id),
    ('admin_org',      v_admin_org_id),
    ('building',       v_building_id),
    ('eq_s1',          v_eq_s1),
    ('eq_s2',          v_eq_s2),
    ('eq_s3',          v_eq_s3),
    ('eq_s4',          v_eq_s4),
    ('key_s1',         v_key_s1),
    ('key_s2',         v_key_s2),
    ('key_s3',         v_key_s3),
    ('key_s4',         v_key_s4);
END $$;

-- ============================================================
-- Scenario 1 (PASS 121-S1): create_equipment_update stores assignee
-- ============================================================
SELECT lives_ok(
  $q$
    DO $$
    DECLARE
      v_task_id     uuid;
      v_ticket_id   uuid;
      v_ticket_asg  uuid;
    BEGIN
      v_task_id := public.create_equipment_update(
        p_equipment_id         => (SELECT v FROM _t121 WHERE k = 'eq_s1'),
        p_administration_id    => (SELECT v FROM _t121 WHERE k = 'admin_org'),
        p_building_id          => (SELECT v FROM _t121 WHERE k = 'building'),
        p_description          => 'Test 121-S1',
        p_mdb_storage_path     => '121-S1/db.mdb',
        p_keys_to_activate     => array[(SELECT v FROM _t121 WHERE k = 'key_s1')]::uuid[],
        p_keys_to_disable      => '{}'::uuid[],
        p_actor_staff_id       => (SELECT v FROM _t121 WHERE k = 'installer'),
        p_assigned_to_staff_id => (SELECT v FROM _t121 WHERE k = 'installer')
      );
      SELECT ticket_id INTO v_ticket_id FROM support.equipment_updates WHERE id = v_task_id;
      SELECT assigned_to_staff_id INTO v_ticket_asg FROM support.tickets WHERE id = v_ticket_id;
      ASSERT v_ticket_asg = (SELECT v FROM _t121 WHERE k = 'installer'),
        'FAIL 121-S1: expected ticket assigned to installer, got ' || COALESCE(v_ticket_asg::text, 'NULL');
    END $$;
  $q$,
  'PASS 121-S1: create_equipment_update stores p_assigned_to_staff_id on ticket'
);

-- ============================================================
-- Scenario 2 (PASS 121-S2): assignee omitted → NULL (backward compat)
-- ============================================================
SELECT lives_ok(
  $q$
    DO $$
    DECLARE
      v_task_id     uuid;
      v_ticket_id   uuid;
      v_ticket_asg  uuid;
    BEGIN
      v_task_id := public.create_equipment_update(
        p_equipment_id       => (SELECT v FROM _t121 WHERE k = 'eq_s2'),
        p_administration_id  => (SELECT v FROM _t121 WHERE k = 'admin_org'),
        p_building_id        => (SELECT v FROM _t121 WHERE k = 'building'),
        p_description        => 'Test 121-S2',
        p_mdb_storage_path   => '121-S2/db.mdb',
        p_keys_to_activate   => array[(SELECT v FROM _t121 WHERE k = 'key_s2')]::uuid[],
        p_keys_to_disable    => '{}'::uuid[],
        p_actor_staff_id     => (SELECT v FROM _t121 WHERE k = 'installer')
      );
      SELECT ticket_id INTO v_ticket_id FROM support.equipment_updates WHERE id = v_task_id;
      SELECT assigned_to_staff_id INTO v_ticket_asg FROM support.tickets WHERE id = v_ticket_id;
      ASSERT v_ticket_asg IS NULL,
        'FAIL 121-S2: expected NULL assigned_to_staff_id, got ' || COALESCE(v_ticket_asg::text, 'NULL');
    END $$;
  $q$,
  'PASS 121-S2: create_equipment_update without assignee stores NULL'
);

-- ============================================================
-- Scenario 3 (PASS 121-S3): Installer can SELECT their own equipment_update
-- ============================================================
-- Impersonate the installer via JWT claims + authenticated role.
DO $$
DECLARE
  v_task_id uuid;
BEGIN
  v_task_id := public.create_equipment_update(
    p_equipment_id         => (SELECT v FROM _t121 WHERE k = 'eq_s3'),
    p_administration_id    => (SELECT v FROM _t121 WHERE k = 'admin_org'),
    p_building_id          => (SELECT v FROM _t121 WHERE k = 'building'),
    p_description          => 'Test 121-S3',
    p_mdb_storage_path     => '121-S3/db.mdb',
    p_keys_to_activate     => array[(SELECT v FROM _t121 WHERE k = 'key_s3')]::uuid[],
    p_keys_to_disable      => '{}'::uuid[],
    p_actor_staff_id       => (SELECT v FROM _t121 WHERE k = 'installer'),
    p_assigned_to_staff_id => (SELECT v FROM _t121 WHERE k = 'installer')
  );
  INSERT INTO _t121 VALUES ('task_own', v_task_id);
END $$;

SELECT lives_ok(
  $q$
    DO $$
    DECLARE
      v_count int;
      v_task  uuid := (SELECT v FROM _t121 WHERE k = 'task_own');
      v_auth  uuid := (SELECT v FROM _t121 WHERE k = 'installer_auth');
    BEGIN
      SET LOCAL role authenticated;
      PERFORM set_config('request.jwt.claims', json_build_object('sub', v_auth::text)::text, true);
      SELECT count(*) INTO v_count FROM support.equipment_updates WHERE id = v_task;
      ASSERT v_count = 1,
        'FAIL 121-S3: installer should see their own equipment_update, got count=' || v_count;
      RESET role;
    END $$;
  $q$,
  'PASS 121-S3: installer can SELECT their assigned equipment_update'
);

-- ============================================================
-- Scenario 4 (PASS 121-S4): Installer cannot SELECT someone else's task
-- ============================================================
DO $$
DECLARE
  v_task_id uuid;
BEGIN
  v_task_id := public.create_equipment_update(
    p_equipment_id         => (SELECT v FROM _t121 WHERE k = 'eq_s4'),
    p_administration_id    => (SELECT v FROM _t121 WHERE k = 'admin_org'),
    p_building_id          => (SELECT v FROM _t121 WHERE k = 'building'),
    p_description          => 'Test 121-S4',
    p_mdb_storage_path     => '121-S4/db.mdb',
    p_keys_to_activate     => array[(SELECT v FROM _t121 WHERE k = 'key_s4')]::uuid[],
    p_keys_to_disable      => '{}'::uuid[],
    p_actor_staff_id       => (SELECT v FROM _t121 WHERE k = 'other'),
    p_assigned_to_staff_id => (SELECT v FROM _t121 WHERE k = 'other')
  );
  INSERT INTO _t121 VALUES ('task_other', v_task_id);
END $$;

SELECT lives_ok(
  $q$
    DO $$
    DECLARE
      v_count int;
      v_task  uuid := (SELECT v FROM _t121 WHERE k = 'task_other');
      v_auth  uuid := (SELECT v FROM _t121 WHERE k = 'installer_auth');
    BEGIN
      SET LOCAL role authenticated;
      PERFORM set_config('request.jwt.claims', json_build_object('sub', v_auth::text)::text, true);
      SELECT count(*) INTO v_count FROM support.equipment_updates WHERE id = v_task;
      ASSERT v_count = 0,
        'FAIL 121-S4: installer should NOT see another installer''s equipment_update, got count=' || v_count;
      RESET role;
    END $$;
  $q$,
  'PASS 121-S4: installer cannot SELECT another installer''s equipment_update'
);

SELECT * FROM finish();
ROLLBACK;
