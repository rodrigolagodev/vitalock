-- ============================================================
-- pgTAP: tickets category CHECK + cancel guard + require_equipment
-- ============================================================
-- Prerequisite: migrations 064 + 065 + 066 + 067 applied.
-- Identifier markers: PASS 067-S1 through PASS 067-S6 preserved.
-- ============================================================

BEGIN;
SELECT plan(6);

-- ============================================================
-- Scenario 1 (PASS 067-S1): equipment_update category accepted
-- ============================================================
SELECT lives_ok(
  $q$
    DO $$
    DECLARE
      v_admin_id     uuid;
      v_building_id  uuid;
      v_equipment_id uuid;
      v_ticket_id    uuid;
    BEGIN
      INSERT INTO public.administrations (company_name) VALUES ('Test 067-S1') RETURNING id INTO v_admin_id;
      INSERT INTO public.buildings (name, address, administration_id) VALUES ('Building 067-S1', 'Calle 1', v_admin_id) RETURNING id INTO v_building_id;
      INSERT INTO operations.equipment (serial_number, building_id, description, status) VALUES ('SN-067-S1', v_building_id, 'Equip 067-S1', 'active') RETURNING id INTO v_equipment_id;

      INSERT INTO support.tickets (
        administration_id, building_id, category, description, status, equipment_id
      ) VALUES (
        v_admin_id, v_building_id, 'equipment_update', 'Test 067-S1', 'open', v_equipment_id
      ) RETURNING id INTO v_ticket_id;

      ASSERT v_ticket_id IS NOT NULL, 'FAIL 067-S1: equipment_update category not accepted';
    END $$;
  $q$,
  'PASS 067-S1: equipment_update category accepted'
);

-- ============================================================
-- Scenario 2 (PASS 067-S2): unknown category rejected
-- ============================================================
SELECT throws_ok(
  $q$
    DO $$
    DECLARE
      v_admin_id    uuid;
      v_building_id uuid;
    BEGIN
      INSERT INTO public.administrations (company_name) VALUES ('Test 067-S2') RETURNING id INTO v_admin_id;
      INSERT INTO public.buildings (name, address, administration_id) VALUES ('Building 067-S2', 'Calle 2', v_admin_id) RETURNING id INTO v_building_id;
      INSERT INTO support.tickets (administration_id, building_id, category, description, status)
        VALUES (v_admin_id, v_building_id, 'unknown_type', 'Test 067-S2', 'open');
    END $$;
  $q$,
  NULL,
  NULL,
  'PASS 067-S2: unknown category rejected'
);

-- ============================================================
-- Scenario 3 (PASS 067-S3): open equipment_update → cancel succeeds
-- ============================================================
SELECT lives_ok(
  $q$
    DO $$
    DECLARE
      v_admin_id     uuid;
      v_building_id  uuid;
      v_equipment_id uuid;
      v_ticket_id    uuid;
      v_status       text;
    BEGIN
      INSERT INTO public.administrations (company_name) VALUES ('Test 067-S3') RETURNING id INTO v_admin_id;
      INSERT INTO public.buildings (name, address, administration_id) VALUES ('Building 067-S3', 'Calle 3', v_admin_id) RETURNING id INTO v_building_id;
      INSERT INTO operations.equipment (serial_number, building_id, description, status) VALUES ('SN-067-S3', v_building_id, 'Equip 067-S3', 'active') RETURNING id INTO v_equipment_id;

      INSERT INTO support.tickets (administration_id, building_id, category, description, status, equipment_id)
        VALUES (v_admin_id, v_building_id, 'equipment_update', 'Test 067-S3', 'open', v_equipment_id)
        RETURNING id INTO v_ticket_id;

      UPDATE support.tickets
         SET status = 'cancelled', cancellation_reason = 'Test cancel S3'
       WHERE id = v_ticket_id;

      SELECT status INTO v_status FROM support.tickets WHERE id = v_ticket_id;
      ASSERT v_status = 'cancelled', 'FAIL 067-S3: expected cancelled status, got ' || v_status;
    END $$;
  $q$,
  'PASS 067-S3: open equipment_update can be cancelled'
);

-- ============================================================
-- Scenario 4 (PASS 067-S4): in_progress equipment_update → cancel blocked
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
      INSERT INTO public.administrations (company_name) VALUES ('Test 067-S4') RETURNING id INTO v_admin_id;
      INSERT INTO public.buildings (name, address, administration_id) VALUES ('Building 067-S4', 'Calle 4', v_admin_id) RETURNING id INTO v_building_id;
      INSERT INTO operations.equipment (serial_number, building_id, description, status) VALUES ('SN-067-S4', v_building_id, 'Equip 067-S4', 'active') RETURNING id INTO v_equipment_id;

      INSERT INTO support.tickets (administration_id, building_id, category, description, status, equipment_id)
        VALUES (v_admin_id, v_building_id, 'equipment_update', 'Test 067-S4', 'open', v_equipment_id)
        RETURNING id INTO v_ticket_id;

      UPDATE support.tickets SET status = 'in_progress' WHERE id = v_ticket_id AND status = 'open';

      UPDATE support.tickets
         SET status = 'cancelled', cancellation_reason = 'Test cancel S4'
       WHERE id = v_ticket_id;
    END $$;
  $q$,
  NULL,
  NULL,
  'PASS 067-S4: in_progress equipment_update cancel blocked by trigger'
);

-- ============================================================
-- Scenario 5 (PASS 067-S5): in_progress maintenance → cancel succeeds
-- ============================================================
SELECT lives_ok(
  $q$
    DO $$
    DECLARE
      v_admin_id     uuid;
      v_building_id  uuid;
      v_equipment_id uuid;
      v_ticket_id    uuid;
      v_status       text;
    BEGIN
      INSERT INTO public.administrations (company_name) VALUES ('Test 067-S5') RETURNING id INTO v_admin_id;
      INSERT INTO public.buildings (name, address, administration_id) VALUES ('Building 067-S5', 'Calle 5', v_admin_id) RETURNING id INTO v_building_id;
      INSERT INTO operations.equipment (serial_number, building_id, description, status) VALUES ('SN-067-S5', v_building_id, 'Equip 067-S5', 'active') RETURNING id INTO v_equipment_id;

      INSERT INTO support.tickets (administration_id, building_id, category, description, status, equipment_id)
        VALUES (v_admin_id, v_building_id, 'maintenance', 'Test 067-S5', 'open', v_equipment_id)
        RETURNING id INTO v_ticket_id;

      UPDATE support.tickets SET status = 'in_progress' WHERE id = v_ticket_id AND status = 'open';

      UPDATE support.tickets
         SET status = 'cancelled', cancellation_reason = 'Test cancel S5'
       WHERE id = v_ticket_id;

      SELECT status INTO v_status FROM support.tickets WHERE id = v_ticket_id;
      ASSERT v_status = 'cancelled', 'FAIL 067-S5: expected maintenance cancel to succeed, got ' || v_status;
    END $$;
  $q$,
  'PASS 067-S5: in_progress maintenance can be cancelled'
);

-- ============================================================
-- Scenario 6 (PASS 067-S6): equipment_update requires equipment_id on resolve
-- ============================================================
SELECT throws_ok(
  $q$
    DO $$
    DECLARE
      v_admin_id     uuid;
      v_building_id  uuid;
      v_ticket_id    uuid;
    BEGIN
      INSERT INTO public.administrations (company_name) VALUES ('Test 067-S6') RETURNING id INTO v_admin_id;
      INSERT INTO public.buildings (name, address, administration_id) VALUES ('Building 067-S6', 'Calle 6', v_admin_id) RETURNING id INTO v_building_id;

      INSERT INTO support.tickets (administration_id, building_id, category, description, status)
        VALUES (v_admin_id, v_building_id, 'equipment_update', 'Test 067-S6', 'open')
        RETURNING id INTO v_ticket_id;

      UPDATE support.tickets SET status = 'in_progress' WHERE id = v_ticket_id AND status = 'open';

      UPDATE support.tickets
         SET status = 'resolved', resolved_by_staff_id = NULL, resolution_notes = 'Test resolve'
       WHERE id = v_ticket_id;
    END $$;
  $q$,
  NULL,
  NULL,
  'PASS 067-S6: equipment_update requires equipment_id on resolve'
);

SELECT * FROM finish();
ROLLBACK;
