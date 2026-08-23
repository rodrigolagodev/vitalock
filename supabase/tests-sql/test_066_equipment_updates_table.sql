-- ============================================================
-- pgTAP: support.equipment_updates table
-- ============================================================
-- Prerequisite: migrations 064 + 065 + 066 applied.
-- Identifier markers: PASS 066-S1 through PASS 066-S4 preserved.
-- ============================================================

BEGIN;
SELECT plan(4);

-- ============================================================
-- Scenario 1 (PASS 066-S1): Valid row can be inserted
-- ============================================================
SELECT lives_ok(
  $q$
    DO $$
    DECLARE
      v_admin_id     uuid;
      v_building_id  uuid;
      v_unit_id      uuid;
      v_staff_id     uuid;
      v_equipment_id uuid;
      v_ticket_id    uuid;
      v_key_id       uuid;
      v_task_id      uuid;
    BEGIN
      INSERT INTO public.administrations (company_name) VALUES ('Test 066-S1') RETURNING id INTO v_admin_id;
      INSERT INTO public.buildings (name, address, administration_id) VALUES ('Building 066-S1', 'Calle 1', v_admin_id) RETURNING id INTO v_building_id;
      INSERT INTO public.units (number, building_id) VALUES ('1A', v_building_id) RETURNING id INTO v_unit_id;
      INSERT INTO identity.staff (full_name, role) VALUES ('Staff 066-S1', 'admin') RETURNING id INTO v_staff_id;
      INSERT INTO operations.equipment (serial_number, building_id, description, status) VALUES ('SN-066-S1', v_building_id, 'Equip 066-S1', 'active') RETURNING id INTO v_equipment_id;
      INSERT INTO public.rfid_keys (rfid_code, unit_id, status) VALUES ('T066-S1-KEY', v_unit_id, 'pending_installation') RETURNING id INTO v_key_id;

      INSERT INTO support.tickets (administration_id, building_id, category, description, status, equipment_id)
        VALUES (v_admin_id, v_building_id, 'equipment_update', 'Test update S1', 'open', v_equipment_id)
        RETURNING id INTO v_ticket_id;

      INSERT INTO support.equipment_updates (
        ticket_id, equipment_id, mdb_storage_path, keys_to_activate,
        created_by_staff_id
      ) VALUES (
        v_ticket_id, v_equipment_id, v_ticket_id::text || '/test.mdb',
        array[v_key_id], v_staff_id
      ) RETURNING id INTO v_task_id;

      ASSERT v_task_id IS NOT NULL, 'FAIL 066-S1: expected row inserted';
    END $$;
  $q$,
  'PASS 066-S1: valid equipment_update row inserted'
);

-- ============================================================
-- Scenario 2 (PASS 066-S2): Partial unique index blocks second open task for same equipment
-- ============================================================
SELECT throws_ok(
  $q$
    DO $$
    DECLARE
      v_admin_id     uuid;
      v_building_id  uuid;
      v_unit_id      uuid;
      v_staff_id     uuid;
      v_equipment_id uuid;
      v_ticket_id1   uuid;
      v_ticket_id2   uuid;
      v_key_id       uuid;
    BEGIN
      INSERT INTO public.administrations (company_name) VALUES ('Test 066-S2') RETURNING id INTO v_admin_id;
      INSERT INTO public.buildings (name, address, administration_id) VALUES ('Building 066-S2', 'Calle 2', v_admin_id) RETURNING id INTO v_building_id;
      INSERT INTO public.units (number, building_id) VALUES ('2A', v_building_id) RETURNING id INTO v_unit_id;
      INSERT INTO identity.staff (full_name, role) VALUES ('Staff 066-S2', 'admin') RETURNING id INTO v_staff_id;
      INSERT INTO operations.equipment (serial_number, building_id, description, status) VALUES ('SN-066-S2', v_building_id, 'Equip 066-S2', 'active') RETURNING id INTO v_equipment_id;
      INSERT INTO public.rfid_keys (rfid_code, unit_id, status) VALUES ('T066-S2-KEY', v_unit_id, 'pending_installation') RETURNING id INTO v_key_id;

      INSERT INTO support.tickets (administration_id, building_id, category, description, status, equipment_id)
        VALUES (v_admin_id, v_building_id, 'equipment_update', 'Test update S2-A', 'open', v_equipment_id)
        RETURNING id INTO v_ticket_id1;
      INSERT INTO support.equipment_updates (ticket_id, equipment_id, mdb_storage_path, keys_to_activate)
        VALUES (v_ticket_id1, v_equipment_id, 'path/test1.mdb', array[v_key_id]);

      INSERT INTO support.tickets (administration_id, building_id, category, description, status, equipment_id)
        VALUES (v_admin_id, v_building_id, 'equipment_update', 'Test update S2-B', 'open', v_equipment_id)
        RETURNING id INTO v_ticket_id2;
      INSERT INTO support.equipment_updates (ticket_id, equipment_id, mdb_storage_path, keys_to_activate)
        VALUES (v_ticket_id2, v_equipment_id, 'path/test2.mdb', array[v_key_id]);
    END $$;
  $q$,
  NULL,
  NULL,
  'PASS 066-S2: partial unique index blocks second open task for same equipment'
);

-- ============================================================
-- Scenario 3 (PASS 066-S3): Resolved task allows a new insert
-- ============================================================
SELECT lives_ok(
  $q$
    DO $$
    DECLARE
      v_admin_id     uuid;
      v_building_id  uuid;
      v_unit_id      uuid;
      v_equipment_id uuid;
      v_ticket_id1   uuid;
      v_ticket_id2   uuid;
      v_key_id       uuid;
      v_task_id2     uuid;
    BEGIN
      INSERT INTO public.administrations (company_name) VALUES ('Test 066-S3') RETURNING id INTO v_admin_id;
      INSERT INTO public.buildings (name, address, administration_id) VALUES ('Building 066-S3', 'Calle 3', v_admin_id) RETURNING id INTO v_building_id;
      INSERT INTO public.units (number, building_id) VALUES ('3A', v_building_id) RETURNING id INTO v_unit_id;
      INSERT INTO operations.equipment (serial_number, building_id, description, status) VALUES ('SN-066-S3', v_building_id, 'Equip 066-S3', 'active') RETURNING id INTO v_equipment_id;
      INSERT INTO public.rfid_keys (rfid_code, unit_id, status) VALUES ('T066-S3-KEY', v_unit_id, 'pending_installation') RETURNING id INTO v_key_id;

      INSERT INTO support.tickets (administration_id, building_id, category, description, status, equipment_id)
        VALUES (v_admin_id, v_building_id, 'equipment_update', 'Test update S3-A', 'open', v_equipment_id)
        RETURNING id INTO v_ticket_id1;
      INSERT INTO support.equipment_updates (ticket_id, equipment_id, mdb_storage_path, keys_to_activate)
        VALUES (v_ticket_id1, v_equipment_id, 'path/test.mdb', array[v_key_id]);

      UPDATE support.equipment_updates SET resolved_at = now() WHERE ticket_id = v_ticket_id1;

      INSERT INTO support.tickets (administration_id, building_id, category, description, status, equipment_id)
        VALUES (v_admin_id, v_building_id, 'equipment_update', 'Test update S3-B', 'open', v_equipment_id)
        RETURNING id INTO v_ticket_id2;
      INSERT INTO support.equipment_updates (ticket_id, equipment_id, mdb_storage_path, keys_to_activate)
        VALUES (v_ticket_id2, v_equipment_id, 'path/test2.mdb', array[v_key_id])
        RETURNING id INTO v_task_id2;

      ASSERT v_task_id2 IS NOT NULL, 'FAIL 066-S3: expected second task after resolved first to succeed';
    END $$;
  $q$,
  'PASS 066-S3: resolved task allows new insert'
);

-- ============================================================
-- Scenario 4 (PASS 066-S4): Cardinality CHECK blocks empty arrays
-- ============================================================
SELECT throws_ok(
  $q$
    DO $$
    DECLARE
      v_admin_id     uuid;
      v_building_id  uuid;
      v_equipment_id uuid;
      v_ticket_id    uuid;
    BEGIN
      INSERT INTO public.administrations (company_name) VALUES ('Test 066-S4') RETURNING id INTO v_admin_id;
      INSERT INTO public.buildings (name, address, administration_id) VALUES ('Building 066-S4', 'Calle 4', v_admin_id) RETURNING id INTO v_building_id;
      INSERT INTO operations.equipment (serial_number, building_id, description, status) VALUES ('SN-066-S4', v_building_id, 'Equip 066-S4', 'active') RETURNING id INTO v_equipment_id;

      INSERT INTO support.tickets (administration_id, building_id, category, description, status, equipment_id)
        VALUES (v_admin_id, v_building_id, 'equipment_update', 'Test update S4', 'open', v_equipment_id)
        RETURNING id INTO v_ticket_id;

      INSERT INTO support.equipment_updates (ticket_id, equipment_id, mdb_storage_path, keys_to_activate, keys_to_disable)
        VALUES (v_ticket_id, v_equipment_id, 'path/test.mdb', '{}', '{}');
    END $$;
  $q$,
  NULL,
  NULL,
  'PASS 066-S4: empty arrays rejected by cardinality CHECK'
);

SELECT * FROM finish();
ROLLBACK;
