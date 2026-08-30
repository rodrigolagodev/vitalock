-- ============================================================
-- pgTAP: public.create_and_assign_equipment
-- ============================================================
-- Covers migration 20260830000107_create_and_assign_equipment.sql
-- (REQ-DB-CREATE-ASSIGN-EQUIP-1.1..1.5).
--
--   S1: Happy path — new equipment row created and ticket.equipment_id linked.
--   S2: Invalid p_ticket_id → P0001 with 'create_and_assign_equipment'.
--   S3: Installer caller (no INSERT on operations.equipment) → 42501.
--   S4: Duplicate serial_number → 23505.
--   S5: Second-step failure (ticket-not-found) rolls back the INSERT —
--       no equipment row leaks into operations.equipment with that serial.
-- ============================================================

BEGIN;
SELECT plan(5);

-- ============================================================
-- Shared fixtures (created as postgres, bypasses RLS)
-- ============================================================
DO $$
DECLARE
  v_installer_auth_id uuid := '55555555-5555-5555-5555-555555555555';
  v_installer_id      uuid;
  v_admin_org_id      uuid;
  v_building_id       uuid;
  v_ticket_ok         uuid;
  v_ticket_dupe       uuid;
  v_dupe_equipment_id uuid;
BEGIN
  INSERT INTO auth.users (id) VALUES (v_installer_auth_id);

  INSERT INTO identity.staff (auth_user_id, full_name, role, status)
    VALUES (v_installer_auth_id, 'Test 122 Installer', 'installer', 'active')
    RETURNING id INTO v_installer_id;

  INSERT INTO public.administrations (company_name)
    VALUES ('Test 122 Client')
    RETURNING id INTO v_admin_org_id;

  INSERT INTO public.buildings (name, address, administration_id)
    VALUES ('Test 122 Building', 'Calle 1', v_admin_org_id)
    RETURNING id INTO v_building_id;

  INSERT INTO support.tickets (administration_id, building_id, category, description, status)
    VALUES (v_admin_org_id, v_building_id, 'installation', 'Test 122 ticket happy', 'open')
    RETURNING id INTO v_ticket_ok;

  INSERT INTO support.tickets (administration_id, building_id, category, description, status)
    VALUES (v_admin_org_id, v_building_id, 'installation', 'Test 122 ticket dupe', 'open')
    RETURNING id INTO v_ticket_dupe;

  -- Pre-existing equipment with a serial we will attempt to duplicate in S4.
  INSERT INTO operations.equipment (serial_number, building_id, description, status)
    VALUES ('SN-122-DUPE', v_building_id, 'Test 122 pre-existing', 'active')
    RETURNING id INTO v_dupe_equipment_id;

  CREATE TEMP TABLE _t122 (k text primary key, v uuid) ON COMMIT DROP;
  INSERT INTO _t122 VALUES
    ('installer_auth', v_installer_auth_id),
    ('installer',      v_installer_id),
    ('admin_org',      v_admin_org_id),
    ('building',       v_building_id),
    ('ticket_ok',      v_ticket_ok),
    ('ticket_dupe',    v_ticket_dupe),
    ('dupe_equipment', v_dupe_equipment_id);
END $$;

-- ============================================================
-- S1 (PASS 122-S1): Happy path
-- ============================================================
SELECT lives_ok(
  $q$
    DO $$
    DECLARE
      v_new_equipment_id uuid;
      v_linked_id        uuid;
      v_serial           text;
    BEGIN
      v_new_equipment_id := public.create_and_assign_equipment(
        p_ticket_id   => (SELECT v FROM _t122 WHERE k = 'ticket_ok'),
        p_building_id => (SELECT v FROM _t122 WHERE k = 'building'),
        p_serial      => 'SN-122-S1',
        p_model       => 'Model-122',
        p_description => 'S1 door',
        p_access_type => 'principal'
      );

      SELECT equipment_id INTO v_linked_id
        FROM support.tickets
       WHERE id = (SELECT v FROM _t122 WHERE k = 'ticket_ok');
      ASSERT v_linked_id = v_new_equipment_id,
        'FAIL 122-S1: ticket.equipment_id should equal returned uuid';

      SELECT serial_number INTO v_serial
        FROM operations.equipment
       WHERE id = v_new_equipment_id;
      ASSERT v_serial = 'SN-122-S1',
        'FAIL 122-S1: equipment row not persisted with expected serial';
    END $$;
  $q$,
  'PASS 122-S1: create_and_assign_equipment creates row and links ticket atomically'
);

-- ============================================================
-- S2 (PASS 122-S2): Invalid p_ticket_id raises P0001
-- ============================================================
SELECT throws_ok(
  $q$
    SELECT public.create_and_assign_equipment(
      p_ticket_id   => '00000000-0000-0000-0000-000000000000',
      p_building_id => (SELECT v FROM _t122 WHERE k = 'building'),
      p_serial      => 'SN-122-S2',
      p_model       => 'Model-122',
      p_description => 'S2 door',
      p_access_type => 'principal'
    );
  $q$,
  'P0001',
  NULL,
  'PASS 122-S2: unknown ticket_id raises P0001'
);

-- ============================================================
-- S3 (PASS 122-S3): Installer caller (no INSERT policy) → 42501
-- ============================================================
-- Impersonate installer via JWT + authenticated role. RLS admin_all_equipment
-- fails the WITH CHECK because identity.is_admin() is false.
SELECT throws_ok(
  $q$
    DO $$
    DECLARE
      v_auth uuid := (SELECT v FROM _t122 WHERE k = 'installer_auth');
    BEGIN
      SET LOCAL role authenticated;
      PERFORM set_config('request.jwt.claims',
        json_build_object('sub', v_auth::text)::text,
        true);
      PERFORM public.create_and_assign_equipment(
        p_ticket_id   => (SELECT v FROM _t122 WHERE k = 'ticket_ok'),
        p_building_id => (SELECT v FROM _t122 WHERE k = 'building'),
        p_serial      => 'SN-122-S3',
        p_model       => 'Model-122',
        p_description => 'S3 door',
        p_access_type => 'principal'
      );
    END $$;
  $q$,
  '42501',
  NULL,
  'PASS 122-S3: non-admin caller raises 42501'
);

-- ============================================================
-- S4 (PASS 122-S4): Duplicate serial_number raises 23505
-- ============================================================
SELECT throws_ok(
  $q$
    SELECT public.create_and_assign_equipment(
      p_ticket_id   => (SELECT v FROM _t122 WHERE k = 'ticket_dupe'),
      p_building_id => (SELECT v FROM _t122 WHERE k = 'building'),
      p_serial      => 'SN-122-DUPE',
      p_model       => 'Model-122',
      p_description => 'S4 door',
      p_access_type => 'principal'
    );
  $q$,
  '23505',
  NULL,
  'PASS 122-S4: duplicate serial_number raises 23505'
);

-- ============================================================
-- S5 (PASS 122-S5): Second-step failure rolls back INSERT
-- ============================================================
-- Fire the RPC against an unknown ticket_id with a fresh serial;
-- assert afterwards that no equipment row with that serial was persisted.
DO $$
BEGIN
  BEGIN
    PERFORM public.create_and_assign_equipment(
      p_ticket_id   => '00000000-0000-0000-0000-000000000000',
      p_building_id => (SELECT v FROM _t122 WHERE k = 'building'),
      p_serial      => 'SN-122-S5-ROLLBACK',
      p_model       => 'Model-122',
      p_description => 'S5 door',
      p_access_type => 'principal'
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;  -- swallow — we want to inspect state after rollback
  END;
END $$;

SELECT is(
  (SELECT count(*)::int FROM operations.equipment WHERE serial_number = 'SN-122-S5-ROLLBACK'),
  0,
  'PASS 122-S5: rolled-back second-step leaves no orphan equipment row'
);

SELECT * FROM finish();
ROLLBACK;
