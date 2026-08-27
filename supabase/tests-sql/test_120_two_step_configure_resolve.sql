-- ============================================================
-- pgTAP: two-step configure + resolve for equipment tickets
-- ============================================================
-- Covers migration 20260826000103:
--   * public.configure_technical_ticket_equipment (Step 1)
--   * public.resolve_ticket extended for equipment_installation and
--     equipment_replacement (Step 2)
--   * operations.replace_equipment with p_activate_keys_directly=true
--
-- Scenarios:
--   S1: configure writes pending_new_serial/pending_new_model and
--       transitions the ticket open → in_progress. Order stays confirmed
--       until any ticket enters in_progress via recompute cascade.
--   S2: configure auto-fills pending_new_model from products.name when
--       the caller passes NULL as p_new_model.
--   S3: configure is idempotent on an already-in_progress ticket.
--   S4: configure rejects a ticket whose category is not configurable.
--   S5: resolve_ticket for equipment_replacement without a prior configure
--       raises P0001 (pending_new_serial is required).
--   S6: resolve_ticket for equipment_replacement (happy path):
--         * new equipment created with correct serial/model
--         * old equipment marked dead
--         * old authorizations closed as removed
--         * new authorizations installed on the new equipment
--         * egreso_reemplazo + liberacion_reserva movements emitted
--         * ticket transitions to resolved
--         * technical order cascades to completed
--   S7: resolve_ticket for equipment_installation (happy path):
--         * equipment row created and linked to ticket
--         * egreso_instalacion + liberacion_reserva movements emitted
--         * ticket transitions to resolved
--         * technical order cascades to completed
-- ============================================================

BEGIN;
SELECT plan(8);

-- ------------------------------------------------------------
-- S1: configure writes intent + transitions ticket open → in_progress.
-- ------------------------------------------------------------
SELECT lives_ok(
  $q$
    DO $$
    DECLARE
      v_admin_id     uuid;
      v_building_id  uuid;
      v_staff_id     uuid;
      v_eq_old       uuid;
      v_product_id   uuid;
      v_order_id     uuid;
      v_ticket_id    uuid;
      v_ticket_row   record;
    BEGIN
      INSERT INTO public.administrations (company_name) VALUES ('Test 120-S1 Admin') RETURNING id INTO v_admin_id;
      INSERT INTO public.buildings (name, address, administration_id)
        VALUES ('Test 120-S1 Building', 'Calle 1', v_admin_id) RETURNING id INTO v_building_id;
      INSERT INTO identity.staff (full_name, role) VALUES ('Test 120-S1 Staff', 'installer') RETURNING id INTO v_staff_id;
      INSERT INTO operations.equipment (serial_number, building_id, description)
        VALUES ('EQ-120-S1-OLD', v_building_id, 'Old installed') RETURNING id INTO v_eq_old;
      INSERT INTO public.products (name, category, stock_total, stock_reservado)
        VALUES ('Test 120-S1 Product', 'equipment', 10, 0) RETURNING id INTO v_product_id;

      v_order_id := public.create_technical_order_with_items(
        jsonb_build_object('client_type', 'administration', 'administration_id', v_admin_id),
        ARRAY[
          jsonb_build_object(
            'item_type', 'equipment_replacement',
            'building_id', v_building_id,
            'intended_assignee_staff_id', v_staff_id,
            'intended_equipment_id', v_eq_old,
            'product_id', v_product_id,
            'quantity', 1,
            'unit_price', 500
          )
        ]::jsonb[],
        true
      );

      SELECT t.id INTO v_ticket_id
        FROM support.tickets t
        JOIN public.technical_order_items toi ON toi.id = t.technical_order_item_id
       WHERE toi.order_id = v_order_id;

      PERFORM public.configure_technical_ticket_equipment(
        v_ticket_id, 'SN-NEW-120-S1', 'ModelCustom'
      );

      SELECT status, pending_new_serial, pending_new_model
        INTO v_ticket_row
        FROM support.tickets
       WHERE id = v_ticket_id;

      ASSERT v_ticket_row.status = 'in_progress',
        'FAIL 120-S1: ticket should be in_progress, got ' || coalesce(v_ticket_row.status, 'NULL');
      ASSERT v_ticket_row.pending_new_serial = 'SN-NEW-120-S1',
        'FAIL 120-S1: pending_new_serial mismatch, got ' || coalesce(v_ticket_row.pending_new_serial, 'NULL');
      ASSERT v_ticket_row.pending_new_model = 'ModelCustom',
        'FAIL 120-S1: pending_new_model mismatch, got ' || coalesce(v_ticket_row.pending_new_model, 'NULL');
    END $$;
  $q$,
  'PASS 120-S1: configure writes intent and transitions ticket to in_progress'
);

-- ------------------------------------------------------------
-- S2: configure auto-fills model from products.name when NULL passed.
-- ------------------------------------------------------------
SELECT lives_ok(
  $q$
    DO $$
    DECLARE
      v_admin_id     uuid;
      v_building_id  uuid;
      v_staff_id     uuid;
      v_eq_old       uuid;
      v_product_id   uuid;
      v_order_id     uuid;
      v_ticket_id    uuid;
      v_stored_model text;
    BEGIN
      INSERT INTO public.administrations (company_name) VALUES ('Test 120-S2 Admin') RETURNING id INTO v_admin_id;
      INSERT INTO public.buildings (name, address, administration_id)
        VALUES ('Test 120-S2 Building', 'Calle 1', v_admin_id) RETURNING id INTO v_building_id;
      INSERT INTO identity.staff (full_name, role) VALUES ('Test 120-S2 Staff', 'installer') RETURNING id INTO v_staff_id;
      INSERT INTO operations.equipment (serial_number, building_id, description)
        VALUES ('EQ-120-S2-OLD', v_building_id, 'Old') RETURNING id INTO v_eq_old;
      INSERT INTO public.products (name, category, stock_total, stock_reservado)
        VALUES ('Smart Lock Pro v3', 'equipment', 10, 0) RETURNING id INTO v_product_id;

      v_order_id := public.create_technical_order_with_items(
        jsonb_build_object('client_type', 'administration', 'administration_id', v_admin_id),
        ARRAY[jsonb_build_object(
          'item_type', 'equipment_replacement',
          'building_id', v_building_id,
          'intended_assignee_staff_id', v_staff_id,
          'intended_equipment_id', v_eq_old,
          'product_id', v_product_id,
          'quantity', 1,
          'unit_price', 500
        )]::jsonb[],
        true
      );
      SELECT t.id INTO v_ticket_id FROM support.tickets t
        JOIN public.technical_order_items toi ON toi.id = t.technical_order_item_id
       WHERE toi.order_id = v_order_id;

      PERFORM public.configure_technical_ticket_equipment(v_ticket_id, 'SN-120-S2', NULL);

      SELECT pending_new_model INTO v_stored_model FROM support.tickets WHERE id = v_ticket_id;
      ASSERT v_stored_model = 'Smart Lock Pro v3',
        'FAIL 120-S2: expected model auto-filled from product name, got ' || coalesce(v_stored_model, 'NULL');
    END $$;
  $q$,
  'PASS 120-S2: configure auto-fills pending_new_model from product name'
);

-- ------------------------------------------------------------
-- S3: configure is idempotent on already-in_progress ticket (edit typo).
-- ------------------------------------------------------------
SELECT lives_ok(
  $q$
    DO $$
    DECLARE
      v_admin_id     uuid;
      v_building_id  uuid;
      v_staff_id     uuid;
      v_eq_old       uuid;
      v_product_id   uuid;
      v_order_id     uuid;
      v_ticket_id    uuid;
      v_serial       text;
    BEGIN
      INSERT INTO public.administrations (company_name) VALUES ('Test 120-S3 Admin') RETURNING id INTO v_admin_id;
      INSERT INTO public.buildings (name, address, administration_id)
        VALUES ('Test 120-S3 Building', 'Calle 1', v_admin_id) RETURNING id INTO v_building_id;
      INSERT INTO identity.staff (full_name, role) VALUES ('Test 120-S3 Staff', 'installer') RETURNING id INTO v_staff_id;
      INSERT INTO operations.equipment (serial_number, building_id, description)
        VALUES ('EQ-120-S3-OLD', v_building_id, 'Old') RETURNING id INTO v_eq_old;
      INSERT INTO public.products (name, category, stock_total, stock_reservado)
        VALUES ('Test 120-S3 Product', 'equipment', 10, 0) RETURNING id INTO v_product_id;

      v_order_id := public.create_technical_order_with_items(
        jsonb_build_object('client_type', 'administration', 'administration_id', v_admin_id),
        ARRAY[jsonb_build_object(
          'item_type', 'equipment_replacement',
          'building_id', v_building_id,
          'intended_assignee_staff_id', v_staff_id,
          'intended_equipment_id', v_eq_old,
          'product_id', v_product_id,
          'quantity', 1, 'unit_price', 500
        )]::jsonb[], true
      );
      SELECT t.id INTO v_ticket_id FROM support.tickets t
        JOIN public.technical_order_items toi ON toi.id = t.technical_order_item_id
       WHERE toi.order_id = v_order_id;

      PERFORM public.configure_technical_ticket_equipment(v_ticket_id, 'WRONG', NULL);
      PERFORM public.configure_technical_ticket_equipment(v_ticket_id, 'CORRECTED-120-S3', NULL);

      SELECT pending_new_serial INTO v_serial FROM support.tickets WHERE id = v_ticket_id;
      ASSERT v_serial = 'CORRECTED-120-S3',
        'FAIL 120-S3: expected corrected serial, got ' || coalesce(v_serial, 'NULL');
    END $$;
  $q$,
  'PASS 120-S3: configure idempotent — can overwrite serial while ticket is in_progress'
);

-- ------------------------------------------------------------
-- S4: configure rejects non-configurable category (maintenance).
-- ------------------------------------------------------------
SELECT throws_ok(
  $q$
    DO $$
    DECLARE
      v_admin_id     uuid;
      v_building_id  uuid;
      v_staff_id     uuid;
      v_eq_target    uuid;
      v_ticket_id    uuid;
    BEGIN
      INSERT INTO public.administrations (company_name) VALUES ('Test 120-S4 Admin') RETURNING id INTO v_admin_id;
      INSERT INTO public.buildings (name, address, administration_id)
        VALUES ('Test 120-S4 Building', 'Calle 1', v_admin_id) RETURNING id INTO v_building_id;
      INSERT INTO identity.staff (full_name, role) VALUES ('Test 120-S4 Staff', 'installer') RETURNING id INTO v_staff_id;
      INSERT INTO operations.equipment (serial_number, building_id, description)
        VALUES ('EQ-120-S4', v_building_id, 'Target') RETURNING id INTO v_eq_target;

      INSERT INTO support.tickets (
        administration_id, building_id, equipment_id, assigned_to_staff_id,
        category, description, status, notes
      ) VALUES (
        v_admin_id, v_building_id, v_eq_target, v_staff_id,
        'maintenance', 'Regular maintenance', 'open', 'test'
      ) RETURNING id INTO v_ticket_id;

      PERFORM public.configure_technical_ticket_equipment(v_ticket_id, 'SN-X', NULL);
    END $$;
  $q$,
  'P0001', NULL,
  'PASS 120-S4: configure rejects maintenance category (P0001)'
);

-- ------------------------------------------------------------
-- S5: resolve_ticket for equipment_replacement without configure raises.
-- ------------------------------------------------------------
SELECT throws_ok(
  $q$
    DO $$
    DECLARE
      v_admin_id     uuid;
      v_building_id  uuid;
      v_staff_id     uuid;
      v_eq_old       uuid;
      v_product_id   uuid;
      v_order_id     uuid;
      v_ticket_id    uuid;
    BEGIN
      INSERT INTO public.administrations (company_name) VALUES ('Test 120-S5 Admin') RETURNING id INTO v_admin_id;
      INSERT INTO public.buildings (name, address, administration_id)
        VALUES ('Test 120-S5 Building', 'Calle 1', v_admin_id) RETURNING id INTO v_building_id;
      INSERT INTO identity.staff (full_name, role) VALUES ('Test 120-S5 Staff', 'installer') RETURNING id INTO v_staff_id;
      INSERT INTO operations.equipment (serial_number, building_id, description)
        VALUES ('EQ-120-S5-OLD', v_building_id, 'Old') RETURNING id INTO v_eq_old;
      INSERT INTO public.products (name, category, stock_total, stock_reservado)
        VALUES ('Test 120-S5 Product', 'equipment', 10, 0) RETURNING id INTO v_product_id;

      v_order_id := public.create_technical_order_with_items(
        jsonb_build_object('client_type', 'administration', 'administration_id', v_admin_id),
        ARRAY[jsonb_build_object(
          'item_type', 'equipment_replacement', 'building_id', v_building_id,
          'intended_assignee_staff_id', v_staff_id, 'intended_equipment_id', v_eq_old,
          'product_id', v_product_id, 'quantity', 1, 'unit_price', 500
        )]::jsonb[], true
      );
      SELECT t.id INTO v_ticket_id FROM support.tickets t
        JOIN public.technical_order_items toi ON toi.id = t.technical_order_item_id
       WHERE toi.order_id = v_order_id;

      -- No configure — resolve should fail.
      PERFORM public.resolve_ticket(v_ticket_id, 'note', v_staff_id);
    END $$;
  $q$,
  'P0001', NULL,
  'PASS 120-S5: resolve without prior configure raises P0001'
);

-- ------------------------------------------------------------
-- S6: resolve_ticket happy path — equipment_replacement with active keys.
-- ------------------------------------------------------------
SELECT lives_ok(
  $q$
    DO $$
    DECLARE
      v_admin_id       uuid;
      v_building_id    uuid;
      v_unit_id        uuid;
      v_staff_id       uuid;
      v_eq_old         uuid;
      v_key_id         uuid;
      v_product_id     uuid;
      v_order_id       uuid;
      v_ticket_id      uuid;
      v_new_eq_id      uuid;
      v_new_eq_serial  text;
      v_new_eq_model   text;
      v_old_status     text;
      v_new_auth_state text;
      v_old_auth_state text;
      v_ticket_status  text;
      v_order_status   text;
      v_egreso_qty     int;
      v_liberacion_qty int;
    BEGIN
      INSERT INTO public.administrations (company_name) VALUES ('Test 120-S6 Admin') RETURNING id INTO v_admin_id;
      INSERT INTO public.buildings (name, address, administration_id)
        VALUES ('Test 120-S6 Building', 'Calle 1', v_admin_id) RETURNING id INTO v_building_id;
      INSERT INTO public.units (number, building_id) VALUES ('1A', v_building_id) RETURNING id INTO v_unit_id;
      INSERT INTO identity.staff (full_name, role) VALUES ('Test 120-S6 Staff', 'installer') RETURNING id INTO v_staff_id;
      INSERT INTO operations.equipment (serial_number, building_id, description, status)
        VALUES ('EQ-120-S6-OLD', v_building_id, 'Old', 'active') RETURNING id INTO v_eq_old;
      INSERT INTO public.rfid_keys (rfid_code, unit_id, status)
        VALUES ('KEY-120-S6', v_unit_id, 'active') RETURNING id INTO v_key_id;
      -- key_authorizations_validate forces sync_state=pending_install on INSERT;
      -- follow with the legal pending_install → installed hop so the old auth
      -- starts in the state replace_equipment's snapshot query looks for.
      INSERT INTO operations.key_authorizations (rfid_key_id, equipment_id)
        VALUES (v_key_id, v_eq_old);
      UPDATE operations.key_authorizations
         SET sync_state = 'installed'
       WHERE rfid_key_id = v_key_id AND equipment_id = v_eq_old;
      INSERT INTO public.products (name, category, stock_total, stock_reservado)
        VALUES ('Repl Product 120-S6', 'equipment', 10, 0) RETURNING id INTO v_product_id;

      v_order_id := public.create_technical_order_with_items(
        jsonb_build_object('client_type', 'administration', 'administration_id', v_admin_id),
        ARRAY[jsonb_build_object(
          'item_type', 'equipment_replacement', 'building_id', v_building_id,
          'intended_assignee_staff_id', v_staff_id, 'intended_equipment_id', v_eq_old,
          'product_id', v_product_id, 'quantity', 1, 'unit_price', 500
        )]::jsonb[], true
      );
      SELECT t.id INTO v_ticket_id FROM support.tickets t
        JOIN public.technical_order_items toi ON toi.id = t.technical_order_item_id
       WHERE toi.order_id = v_order_id;

      PERFORM public.configure_technical_ticket_equipment(v_ticket_id, 'EQ-120-S6-NEW', NULL);
      PERFORM public.resolve_ticket(v_ticket_id, 'Instalado por test', v_staff_id);

      -- Ticket resolved + linked to new equipment.
      SELECT status, equipment_id INTO v_ticket_status, v_new_eq_id
        FROM support.tickets WHERE id = v_ticket_id;
      ASSERT v_ticket_status = 'resolved',
        'FAIL 120-S6: ticket not resolved, got ' || coalesce(v_ticket_status, 'NULL');

      -- New equipment created with correct serial + model auto-filled.
      SELECT serial_number, model INTO v_new_eq_serial, v_new_eq_model
        FROM operations.equipment WHERE id = v_new_eq_id;
      ASSERT v_new_eq_serial = 'EQ-120-S6-NEW',
        'FAIL 120-S6: new equipment serial mismatch, got ' || coalesce(v_new_eq_serial, 'NULL');
      ASSERT v_new_eq_model = 'Repl Product 120-S6',
        'FAIL 120-S6: new equipment model auto-fill mismatch, got ' || coalesce(v_new_eq_model, 'NULL');

      -- Old equipment marked dead.
      SELECT status INTO v_old_status FROM operations.equipment WHERE id = v_eq_old;
      ASSERT v_old_status = 'dead',
        'FAIL 120-S6: old equipment should be dead, got ' || coalesce(v_old_status, 'NULL');

      -- New authorization is installed (Option B: keys active on new device).
      SELECT sync_state INTO v_new_auth_state
        FROM operations.key_authorizations
       WHERE rfid_key_id = v_key_id AND equipment_id = v_new_eq_id;
      ASSERT v_new_auth_state = 'installed',
        'FAIL 120-S6: new authorization should be installed, got ' || coalesce(v_new_auth_state, 'NULL');

      -- Old authorization closed as removed.
      SELECT sync_state INTO v_old_auth_state
        FROM operations.key_authorizations
       WHERE rfid_key_id = v_key_id AND equipment_id = v_eq_old;
      ASSERT v_old_auth_state = 'removed',
        'FAIL 120-S6: old authorization should be removed, got ' || coalesce(v_old_auth_state, 'NULL');

      -- Both stock movements emitted.
      SELECT -quantity INTO v_egreso_qty
        FROM public.stock_movements
       WHERE ticket_id = v_ticket_id AND type = 'egreso_reemplazo';
      ASSERT v_egreso_qty = 1,
        'FAIL 120-S6: expected egreso_reemplazo=1, got ' || coalesce(v_egreso_qty::text, 'NULL');
      SELECT quantity INTO v_liberacion_qty
        FROM public.stock_movements
       WHERE ticket_id = v_ticket_id AND type = 'liberacion_reserva';
      ASSERT v_liberacion_qty = 1,
        'FAIL 120-S6: expected liberacion_reserva=1, got ' || coalesce(v_liberacion_qty::text, 'NULL');

      -- Order cascaded to completed.
      SELECT status INTO v_order_status FROM public.technical_orders WHERE id = v_order_id;
      ASSERT v_order_status = 'completed',
        'FAIL 120-S6: order should cascade to completed, got ' || coalesce(v_order_status, 'NULL');
    END $$;
  $q$,
  'PASS 120-S6: replacement happy path — new eq created, keys transferred as installed, order completed'
);

-- ------------------------------------------------------------
-- S7: resolve_ticket happy path — equipment_installation.
-- ------------------------------------------------------------
SELECT lives_ok(
  $q$
    DO $$
    DECLARE
      v_admin_id       uuid;
      v_building_id    uuid;
      v_staff_id       uuid;
      v_product_id     uuid;
      v_order_id       uuid;
      v_ticket_id      uuid;
      v_new_eq_id      uuid;
      v_new_eq_serial  text;
      v_ticket_status  text;
      v_order_status   text;
      v_egreso_qty     int;
      v_liberacion_qty int;
    BEGIN
      INSERT INTO public.administrations (company_name) VALUES ('Test 120-S7 Admin') RETURNING id INTO v_admin_id;
      INSERT INTO public.buildings (name, address, administration_id)
        VALUES ('Test 120-S7 Building', 'Calle 1', v_admin_id) RETURNING id INTO v_building_id;
      INSERT INTO identity.staff (full_name, role) VALUES ('Test 120-S7 Staff', 'installer') RETURNING id INTO v_staff_id;
      INSERT INTO public.products (name, category, stock_total, stock_reservado)
        VALUES ('Install Product 120-S7', 'equipment', 10, 0) RETURNING id INTO v_product_id;

      v_order_id := public.create_technical_order_with_items(
        jsonb_build_object('client_type', 'administration', 'administration_id', v_admin_id),
        ARRAY[jsonb_build_object(
          'item_type', 'equipment', 'building_id', v_building_id,
          'intended_assignee_staff_id', v_staff_id,
          'product_id', v_product_id, 'quantity', 1, 'unit_price', 500
        )]::jsonb[], true
      );
      SELECT t.id INTO v_ticket_id FROM support.tickets t
        JOIN public.technical_order_items toi ON toi.id = t.technical_order_item_id
       WHERE toi.order_id = v_order_id;

      PERFORM public.configure_technical_ticket_equipment(v_ticket_id, 'EQ-120-S7-NEW', NULL);
      PERFORM public.resolve_ticket(v_ticket_id, 'Instalado por test', v_staff_id);

      SELECT status, equipment_id INTO v_ticket_status, v_new_eq_id
        FROM support.tickets WHERE id = v_ticket_id;
      ASSERT v_ticket_status = 'resolved',
        'FAIL 120-S7: ticket not resolved, got ' || coalesce(v_ticket_status, 'NULL');
      ASSERT v_new_eq_id IS NOT NULL,
        'FAIL 120-S7: ticket.equipment_id not linked';

      SELECT serial_number INTO v_new_eq_serial FROM operations.equipment WHERE id = v_new_eq_id;
      ASSERT v_new_eq_serial = 'EQ-120-S7-NEW',
        'FAIL 120-S7: new equipment serial mismatch, got ' || coalesce(v_new_eq_serial, 'NULL');

      SELECT -quantity INTO v_egreso_qty
        FROM public.stock_movements
       WHERE ticket_id = v_ticket_id AND type = 'egreso_instalacion';
      ASSERT v_egreso_qty = 1,
        'FAIL 120-S7: expected egreso_instalacion=1, got ' || coalesce(v_egreso_qty::text, 'NULL');
      SELECT quantity INTO v_liberacion_qty
        FROM public.stock_movements
       WHERE ticket_id = v_ticket_id AND type = 'liberacion_reserva';
      ASSERT v_liberacion_qty = 1,
        'FAIL 120-S7: expected liberacion_reserva=1, got ' || coalesce(v_liberacion_qty::text, 'NULL');

      SELECT status INTO v_order_status FROM public.technical_orders WHERE id = v_order_id;
      ASSERT v_order_status = 'completed',
        'FAIL 120-S7: order should cascade to completed, got ' || coalesce(v_order_status, 'NULL');
    END $$;
  $q$,
  'PASS 120-S7: installation happy path — new eq created, linked, stock moved, order completed'
);

-- ------------------------------------------------------------
-- S8: resolve_ticket runs cleanly from an authenticated installer JWT.
-- Regression for the tickets_enforce_installer_columns trigger that blocked
-- the equipment_id UPDATE during finalize with SQLSTATE 42501.
-- ------------------------------------------------------------
SELECT lives_ok(
  $q$
    DO $$
    DECLARE
      v_admin_id       uuid;
      v_building_id    uuid;
      v_bruno_uid      uuid := '22222222-2222-2222-2222-222222222222';
      v_staff_id       uuid;
      v_eq_old         uuid;
      v_product_id     uuid;
      v_order_id       uuid;
      v_ticket_id      uuid;
      v_ticket_status  text;
    BEGIN
      INSERT INTO auth.users (id, email, role, aud)
        VALUES (v_bruno_uid, 'bruno-120-s8@test', 'authenticated', 'authenticated')
        ON CONFLICT DO NOTHING;
      INSERT INTO public.administrations (company_name) VALUES ('Test 120-S8 Admin') RETURNING id INTO v_admin_id;
      INSERT INTO public.buildings (name, address, administration_id)
        VALUES ('Test 120-S8 Building', 'Calle 1', v_admin_id) RETURNING id INTO v_building_id;
      INSERT INTO identity.staff (full_name, role, auth_user_id, status)
        VALUES ('Bruno 120-S8', 'installer', v_bruno_uid, 'active') RETURNING id INTO v_staff_id;
      INSERT INTO operations.equipment (serial_number, building_id, description, status)
        VALUES ('EQ-120-S8-OLD', v_building_id, 'Old', 'active') RETURNING id INTO v_eq_old;
      INSERT INTO public.products (name, category, stock_total, stock_reservado)
        VALUES ('Repl Product 120-S8', 'equipment', 10, 0) RETURNING id INTO v_product_id;

      v_order_id := public.create_technical_order_with_items(
        jsonb_build_object('client_type', 'administration', 'administration_id', v_admin_id),
        ARRAY[jsonb_build_object(
          'item_type', 'equipment_replacement', 'building_id', v_building_id,
          'intended_assignee_staff_id', v_staff_id, 'intended_equipment_id', v_eq_old,
          'product_id', v_product_id, 'quantity', 1, 'unit_price', 500
        )]::jsonb[], true
      );
      SELECT t.id INTO v_ticket_id FROM support.tickets t
        JOIN public.technical_order_items toi ON toi.id = t.technical_order_item_id
       WHERE toi.order_id = v_order_id;

      PERFORM public.configure_technical_ticket_equipment(v_ticket_id, 'EQ-120-S8-NEW', NULL);

      -- Simulate a call from the installer app: run as authenticated with
      -- Bruno's JWT claims, matching what PostgREST does on RPC.
      SET LOCAL ROLE authenticated;
      PERFORM set_config('request.jwt.claim.sub', v_bruno_uid::text, true);
      PERFORM set_config(
        'request.jwt.claims',
        jsonb_build_object('sub', v_bruno_uid, 'role', 'authenticated')::text,
        true
      );

      PERFORM public.resolve_ticket(v_ticket_id, 'Resuelto por Bruno');

      -- Restore superuser context for post-check.
      RESET ROLE;

      SELECT status INTO v_ticket_status FROM support.tickets WHERE id = v_ticket_id;
      ASSERT v_ticket_status = 'resolved',
        'FAIL 120-S8: ticket not resolved via installer path, got ' || coalesce(v_ticket_status, 'NULL');
    END $$;
  $q$,
  'PASS 120-S8: installer JWT can finalize a two-step replacement ticket'
);

SELECT * FROM finish();
ROLLBACK;
