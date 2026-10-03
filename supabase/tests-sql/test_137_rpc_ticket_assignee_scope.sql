-- ============================================================
-- pgTAP: staff-level ticket RPCs are scoped to the ticket assignee
-- ============================================================
-- Covers migration 20260913100000_scope_staff_ticket_rpcs_to_assignee.sql.
-- Through a client API role (`SET LOCAL role authenticated`, like PostgREST):
--   - the installer assigned to the ticket   -> succeeds
--   - any other installer                    -> P0001, ticket left untouched
--   - an active admin                        -> succeeds (not assignee-scoped)
-- for configure_technical_ticket_equipment, resolve_equipment_update and
-- resolve_ticket. Complements test_131 (role guards).
-- ============================================================

BEGIN;
SELECT plan(9);

DO $$
DECLARE
  v_admin_auth_id uuid := '13711371-1371-1371-1371-137113711371';
  v_inst_auth_id  uuid := '13721372-1372-1372-1372-137213721372';
  v_other_auth_id uuid := '13731373-1373-1373-1373-137313731373';
  v_inst_id       uuid;
  v_org_id        uuid;
  v_building_id   uuid;
  v_unit_id       uuid;
  v_eq            uuid[] := '{}';
  v_eq_id         uuid;
  v_key_id        uuid;
  v_ticket_id     uuid;
  v_task_id       uuid;
  v_product_id    uuid;
  v_order_id      uuid;
  i               int;
BEGIN
  INSERT INTO auth.users (id) VALUES (v_admin_auth_id), (v_inst_auth_id), (v_other_auth_id);
  INSERT INTO identity.staff (auth_user_id, full_name, role, status) VALUES
    (v_admin_auth_id, 'Test 137 Admin',           'admin',     'active'),
    (v_other_auth_id, 'Test 137 Other Installer', 'installer', 'active');
  INSERT INTO identity.staff (auth_user_id, full_name, role, status)
    VALUES (v_inst_auth_id, 'Test 137 Installer', 'installer', 'active')
    RETURNING id INTO v_inst_id;

  INSERT INTO public.administrations (company_name) VALUES ('Test 137 Client') RETURNING id INTO v_org_id;
  INSERT INTO public.buildings (name, address, administration_id)
    VALUES ('Test 137 Building', 'Calle 137', v_org_id) RETURNING id INTO v_building_id;
  INSERT INTO public.units (number, building_id) VALUES ('1A', v_building_id) RETURNING id INTO v_unit_id;

  FOR i IN 1..6 LOOP
    INSERT INTO operations.equipment (serial_number, building_id, description, status)
      VALUES ('SN-137-' || i, v_building_id, 'Test 137 Equip ' || i, 'active') RETURNING id INTO v_eq_id;
    v_eq := v_eq || v_eq_id;
  END LOOP;

  CREATE TEMP TABLE _t137 (k text primary key, v uuid) ON COMMIT DROP;

  -- resolve_ticket targets: one for the installer path, one for the admin path.
  INSERT INTO support.tickets (administration_id, building_id, category, description, status, assigned_to_staff_id, equipment_id)
    VALUES (v_org_id, v_building_id, 'maintain_equipment', 'Test 137 resolve (installer)', 'open', v_inst_id, v_eq[1])
    RETURNING id INTO v_ticket_id;
  INSERT INTO _t137 VALUES ('resolve_inst', v_ticket_id);
  INSERT INTO support.tickets (administration_id, building_id, category, description, status, assigned_to_staff_id, equipment_id)
    VALUES (v_org_id, v_building_id, 'maintain_equipment', 'Test 137 resolve (admin)', 'open', v_inst_id, v_eq[2])
    RETURNING id INTO v_ticket_id;
  INSERT INTO _t137 VALUES ('resolve_admin', v_ticket_id);

  -- configure_technical_ticket_equipment targets: replace_equipment tickets
  -- need a technical order item (tickets_equipment_required), so each comes
  -- from its own confirmed technical order assigned to the installer.
  INSERT INTO public.products (name, category, stock_total, stock_reservado)
    VALUES ('Test 137 Product', 'equipment', 10, 0) RETURNING id INTO v_product_id;
  FOR i IN 5..6 LOOP
    v_order_id := public.create_technical_order_with_items(
      jsonb_build_object('client_type', 'administration', 'administration_id', v_org_id),
      ARRAY[jsonb_build_object(
        'item_type', 'replace_equipment',
        'building_id', v_building_id,
        'intended_assignee_staff_id', v_inst_id,
        'intended_equipment_id', v_eq[i],
        'product_id', v_product_id,
        'quantity', 1,
        'unit_price', 500
      )]::jsonb[],
      true
    );
    SELECT t.id INTO v_ticket_id
      FROM support.tickets t
      JOIN public.technical_order_items toi ON toi.id = t.technical_order_item_id
     WHERE toi.order_id = v_order_id;
    INSERT INTO _t137 VALUES (CASE i WHEN 5 THEN 'configure_inst' ELSE 'configure_admin' END, v_ticket_id);
  END LOOP;

  -- resolve_equipment_update targets (one equipment each: one open task per equipment).
  FOR i IN 3..4 LOOP
    INSERT INTO public.rfid_keys (rfid_code, unit_id, status)
      VALUES ('T137-KEY-' || i, v_unit_id, 'pending_installation') RETURNING id INTO v_key_id;
    v_task_id := public.create_equipment_update(
      p_equipment_id         => v_eq[i],
      p_administration_id    => v_org_id,
      p_building_id          => v_building_id,
      p_description          => 'Test 137 equipment update ' || i,
      p_mdb_storage_path     => '137-' || i || '/db.mdb',
      p_keys_to_activate     => ARRAY[v_key_id],
      p_keys_to_disable      => '{}'::uuid[],
      p_actor_staff_id       => v_inst_id,
      p_assigned_to_staff_id => v_inst_id
    );
    INSERT INTO _t137 VALUES (CASE i WHEN 3 THEN 'task_inst' ELSE 'task_admin' END, v_task_id);
  END LOOP;

  GRANT SELECT ON _t137 TO authenticated;
END $$;

-- ------------------------------------------------------------
-- resolve_ticket
-- ------------------------------------------------------------
SELECT lives_ok(
  $q$
    DO $$
    DECLARE
      v_ticket uuid := (SELECT v FROM _t137 WHERE k = 'resolve_inst');
      v_state  text := 'none';
      v_status text;
    BEGIN
      SET LOCAL role authenticated;
      SET LOCAL request.jwt.claims TO '{"sub": "13731373-1373-1373-1373-137313731373"}';
      BEGIN
        PERFORM public.resolve_ticket(v_ticket, 'not mine');
      EXCEPTION WHEN OTHERS THEN v_state := SQLSTATE;
      END;
      RESET role;
      SELECT status INTO v_status FROM support.tickets WHERE id = v_ticket;
      ASSERT v_state = 'P0001', 'FAIL 137-S1: other installer on resolve_ticket should be P0001, got ' || v_state;
      ASSERT v_status = 'open', 'FAIL 137-S1: ticket must stay open, got ' || v_status;
    END $$;
  $q$,
  'PASS 137-S1: an installer cannot resolve a ticket assigned to someone else'
);

SELECT lives_ok(
  $q$
    DO $$
    DECLARE
      v_ticket uuid := (SELECT v FROM _t137 WHERE k = 'resolve_inst');
      v_status text;
    BEGIN
      SET LOCAL role authenticated;
      SET LOCAL request.jwt.claims TO '{"sub": "13721372-1372-1372-1372-137213721372"}';
      PERFORM public.resolve_ticket(v_ticket, 'done');
      RESET role;
      SELECT status INTO v_status FROM support.tickets WHERE id = v_ticket;
      ASSERT v_status = 'resolved', 'FAIL 137-S2: expected resolved, got ' || v_status;
    END $$;
  $q$,
  'PASS 137-S2: the assigned installer resolves their ticket'
);

SELECT lives_ok(
  $q$
    DO $$
    DECLARE
      v_ticket uuid := (SELECT v FROM _t137 WHERE k = 'resolve_admin');
      v_status text;
    BEGIN
      SET LOCAL role authenticated;
      SET LOCAL request.jwt.claims TO '{"sub": "13711371-1371-1371-1371-137113711371"}';
      PERFORM public.resolve_ticket(v_ticket, 'admin override');
      RESET role;
      SELECT status INTO v_status FROM support.tickets WHERE id = v_ticket;
      ASSERT v_status = 'resolved', 'FAIL 137-S3: expected resolved, got ' || v_status;
    END $$;
  $q$,
  'PASS 137-S3: an admin resolves a ticket assigned to an installer'
);

-- ------------------------------------------------------------
-- configure_technical_ticket_equipment
-- ------------------------------------------------------------
SELECT lives_ok(
  $q$
    DO $$
    DECLARE
      v_ticket uuid := (SELECT v FROM _t137 WHERE k = 'configure_inst');
      v_state  text := 'none';
      v_serial text;
    BEGIN
      SET LOCAL role authenticated;
      SET LOCAL request.jwt.claims TO '{"sub": "13731373-1373-1373-1373-137313731373"}';
      BEGIN
        PERFORM public.configure_technical_ticket_equipment(v_ticket, 'SN-137-HIJACK');
      EXCEPTION WHEN OTHERS THEN v_state := SQLSTATE;
      END;
      RESET role;
      SELECT pending_new_serial INTO v_serial FROM support.tickets WHERE id = v_ticket;
      ASSERT v_state = 'P0001', 'FAIL 137-S4: other installer on configure should be P0001, got ' || v_state;
      ASSERT v_serial IS NULL, 'FAIL 137-S4: pending serial must stay unset, got ' || v_serial;
    END $$;
  $q$,
  'PASS 137-S4: an installer cannot configure equipment on a ticket assigned to someone else'
);

SELECT lives_ok(
  $q$
    DO $$
    DECLARE
      v_ticket uuid := (SELECT v FROM _t137 WHERE k = 'configure_inst');
      v_serial text;
    BEGIN
      SET LOCAL role authenticated;
      SET LOCAL request.jwt.claims TO '{"sub": "13721372-1372-1372-1372-137213721372"}';
      PERFORM public.configure_technical_ticket_equipment(v_ticket, 'SN-137-NEW-A');
      RESET role;
      SELECT pending_new_serial INTO v_serial FROM support.tickets WHERE id = v_ticket;
      ASSERT v_serial = 'SN-137-NEW-A', 'FAIL 137-S5: expected pending serial SN-137-NEW-A, got ' || coalesce(v_serial, 'null');
    END $$;
  $q$,
  'PASS 137-S5: the assigned installer configures equipment on their ticket'
);

SELECT lives_ok(
  $q$
    DO $$
    DECLARE
      v_ticket uuid := (SELECT v FROM _t137 WHERE k = 'configure_admin');
      v_serial text;
    BEGIN
      SET LOCAL role authenticated;
      SET LOCAL request.jwt.claims TO '{"sub": "13711371-1371-1371-1371-137113711371"}';
      PERFORM public.configure_technical_ticket_equipment(v_ticket, 'SN-137-NEW-B');
      RESET role;
      SELECT pending_new_serial INTO v_serial FROM support.tickets WHERE id = v_ticket;
      ASSERT v_serial = 'SN-137-NEW-B', 'FAIL 137-S6: expected pending serial SN-137-NEW-B, got ' || coalesce(v_serial, 'null');
    END $$;
  $q$,
  'PASS 137-S6: an admin configures equipment on a ticket assigned to an installer'
);

-- ------------------------------------------------------------
-- resolve_equipment_update
-- ------------------------------------------------------------
SELECT lives_ok(
  $q$
    DO $$
    DECLARE
      v_task   uuid := (SELECT v FROM _t137 WHERE k = 'task_inst');
      v_state  text := 'none';
      v_status text;
    BEGIN
      SET LOCAL role authenticated;
      SET LOCAL request.jwt.claims TO '{"sub": "13731373-1373-1373-1373-137313731373"}';
      BEGIN
        PERFORM public.resolve_equipment_update(v_task);
      EXCEPTION WHEN OTHERS THEN v_state := SQLSTATE;
      END;
      RESET role;
      SELECT t.status INTO v_status
        FROM support.equipment_updates eu JOIN support.tickets t ON t.id = eu.ticket_id
       WHERE eu.id = v_task;
      ASSERT v_state = 'P0001', 'FAIL 137-S7: other installer on resolve_equipment_update should be P0001, got ' || v_state;
      ASSERT v_status NOT IN ('resolved', 'cancelled'), 'FAIL 137-S7: ticket must stay unresolved, got ' || v_status;
    END $$;
  $q$,
  'PASS 137-S7: an installer cannot resolve an equipment update assigned to someone else'
);

SELECT lives_ok(
  $q$
    DO $$
    DECLARE
      v_task   uuid := (SELECT v FROM _t137 WHERE k = 'task_inst');
      v_status text;
    BEGIN
      SET LOCAL role authenticated;
      SET LOCAL request.jwt.claims TO '{"sub": "13721372-1372-1372-1372-137213721372"}';
      PERFORM public.resolve_equipment_update(v_task);
      RESET role;
      SELECT t.status INTO v_status
        FROM support.equipment_updates eu JOIN support.tickets t ON t.id = eu.ticket_id
       WHERE eu.id = v_task;
      ASSERT v_status = 'resolved', 'FAIL 137-S8: expected resolved, got ' || v_status;
    END $$;
  $q$,
  'PASS 137-S8: the assigned installer resolves their equipment update'
);

SELECT lives_ok(
  $q$
    DO $$
    DECLARE
      v_task   uuid := (SELECT v FROM _t137 WHERE k = 'task_admin');
      v_status text;
    BEGIN
      SET LOCAL role authenticated;
      SET LOCAL request.jwt.claims TO '{"sub": "13711371-1371-1371-1371-137113711371"}';
      PERFORM public.resolve_equipment_update(v_task);
      RESET role;
      SELECT t.status INTO v_status
        FROM support.equipment_updates eu JOIN support.tickets t ON t.id = eu.ticket_id
       WHERE eu.id = v_task;
      ASSERT v_status = 'resolved', 'FAIL 137-S9: expected resolved, got ' || v_status;
    END $$;
  $q$,
  'PASS 137-S9: an admin resolves an equipment update assigned to an installer'
);

SELECT * FROM finish();
ROLLBACK;
