-- ============================================================
-- pgTAP: public.resolve_ticket — state-machine-safe resolution
-- ============================================================
-- Implements: tickets / Resolution and state machine (migration
-- 20260811000058). Regression for: installer resolving an 'open' ticket
-- with a direct open -> resolved UPDATE used to be rejected by
-- support.tickets_validate, leaving the ticket stuck open.
--
-- Prerequisite: migration 20260811000058 applied.
-- Identifier markers: PASS scenario-a through PASS scenario-d preserved.
-- ============================================================

BEGIN;
SELECT plan(4);

-- ============================================================
-- Scenario a (PASS scenario-a): resolve_ticket moves an open ticket straight
-- to resolved with actor + notes set (the installer one-click flow)
-- ============================================================
SELECT lives_ok(
  $q$
    DO $$
    DECLARE
      v_admin_id    uuid;
      v_building_id uuid;
      v_staff_id    uuid;
      v_ticket_id   uuid;
      v_status      text;
      v_by_staff    uuid;
      v_notes       text;
    BEGIN
      INSERT INTO public.administrations (company_name) VALUES ('Test Admin ResolveTicket') RETURNING id INTO v_admin_id;
      INSERT INTO public.buildings (name, address, administration_id) VALUES ('Test Building ResolveTicket', 'Street 1', v_admin_id) RETURNING id INTO v_building_id;
      INSERT INTO identity.staff (full_name, role) VALUES ('Test Installer ResolveTicket', 'installer') RETURNING id INTO v_staff_id;

      INSERT INTO support.tickets (
        administration_id, building_id, category, description, status, assigned_to_staff_id
      ) VALUES (
        v_admin_id, v_building_id, 'key_configuration', 'Configurar llave en lector', 'open', v_staff_id
      ) RETURNING id INTO v_ticket_id;

      PERFORM public.resolve_ticket(v_ticket_id, 'Instalada en el lector', v_staff_id);

      SELECT status, resolved_by_staff_id, resolution_notes
        INTO v_status, v_by_staff, v_notes
        FROM support.tickets WHERE id = v_ticket_id;

      ASSERT v_status = 'resolved', 'FAIL scenario-a: expected resolved, got ' || v_status;
      ASSERT v_by_staff = v_staff_id, 'FAIL scenario-a: expected actor as resolved_by_staff_id';
      ASSERT v_notes = 'Instalada en el lector', 'FAIL scenario-a: resolution notes missing';
    END $$;
  $q$,
  'PASS scenario-a: resolve_ticket resolves an open ticket in one call'
);

-- ============================================================
-- Scenario b (PASS scenario-b): resolve_ticket on an in_progress ticket
-- ============================================================
SELECT lives_ok(
  $q$
    DO $$
    DECLARE
      v_admin_id    uuid;
      v_building_id uuid;
      v_staff_id    uuid;
      v_ticket_id   uuid;
      v_status      text;
    BEGIN
      INSERT INTO public.administrations (company_name) VALUES ('Test Admin ResolveInProgress') RETURNING id INTO v_admin_id;
      INSERT INTO public.buildings (name, address, administration_id) VALUES ('Test Building ResolveInProgress', 'Street 2', v_admin_id) RETURNING id INTO v_building_id;
      INSERT INTO identity.staff (full_name, role) VALUES ('Test Installer ResolveInProgress', 'installer') RETURNING id INTO v_staff_id;

      INSERT INTO support.tickets (
        administration_id, building_id, category, description, status, assigned_to_staff_id
      ) VALUES (
        v_admin_id, v_building_id, 'key_configuration', 'Configurar llave (ya en progreso)', 'in_progress', v_staff_id
      ) RETURNING id INTO v_ticket_id;

      PERFORM public.resolve_ticket(v_ticket_id, NULL, v_staff_id);

      SELECT status INTO v_status FROM support.tickets WHERE id = v_ticket_id;
      ASSERT v_status = 'resolved', 'FAIL scenario-b: expected resolved from in_progress, got ' || v_status;
    END $$;
  $q$,
  'PASS scenario-b: resolve_ticket resolves an in_progress ticket'
);

-- ============================================================
-- Scenario c (PASS scenario-c): resolve_ticket on already-resolved ticket fails
-- ============================================================
SELECT throws_ok(
  $q$
    DO $$
    DECLARE
      v_admin_id    uuid;
      v_building_id uuid;
      v_staff_id    uuid;
      v_ticket_id   uuid;
    BEGIN
      INSERT INTO public.administrations (company_name) VALUES ('Test Admin ResolveTwice') RETURNING id INTO v_admin_id;
      INSERT INTO public.buildings (name, address, administration_id) VALUES ('Test Building ResolveTwice', 'Street 3', v_admin_id) RETURNING id INTO v_building_id;
      INSERT INTO identity.staff (full_name, role) VALUES ('Test Installer ResolveTwice', 'installer') RETURNING id INTO v_staff_id;

      INSERT INTO support.tickets (
        administration_id, building_id, category, description, status, assigned_to_staff_id
      ) VALUES (
        v_admin_id, v_building_id, 'key_configuration', 'Configurar llave (ya resuelta)', 'open', v_staff_id
      ) RETURNING id INTO v_ticket_id;

      PERFORM public.resolve_ticket(v_ticket_id, 'Primera vez', v_staff_id);
      PERFORM public.resolve_ticket(v_ticket_id, 'Segunda vez', v_staff_id);
    END $$;
  $q$,
  NULL,
  NULL,
  'PASS scenario-c: resolve_ticket rejects a second resolution'
);

-- ============================================================
-- Scenario d (PASS scenario-d): direct open -> resolved UPDATE is still rejected
-- ============================================================
SELECT throws_ok(
  $q$
    DO $$
    DECLARE
      v_admin_id    uuid;
      v_building_id uuid;
      v_staff_id    uuid;
      v_ticket_id   uuid;
    BEGIN
      INSERT INTO public.administrations (company_name) VALUES ('Test Admin DirectHop') RETURNING id INTO v_admin_id;
      INSERT INTO public.buildings (name, address, administration_id) VALUES ('Test Building DirectHop', 'Street 4', v_admin_id) RETURNING id INTO v_building_id;
      INSERT INTO identity.staff (full_name, role) VALUES ('Test Installer DirectHop', 'installer') RETURNING id INTO v_staff_id;

      INSERT INTO support.tickets (
        administration_id, building_id, category, description, status, assigned_to_staff_id
      ) VALUES (
        v_admin_id, v_building_id, 'key_configuration', 'Configurar llave (hop directo)', 'open', v_staff_id
      ) RETURNING id INTO v_ticket_id;

      UPDATE support.tickets SET status = 'resolved' WHERE id = v_ticket_id;
    END $$;
  $q$,
  NULL,
  NULL,
  'PASS scenario-d: state machine still rejects direct open -> resolved'
);

SELECT * FROM finish();
ROLLBACK;
