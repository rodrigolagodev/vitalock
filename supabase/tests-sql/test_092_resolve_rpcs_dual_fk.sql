-- ============================================================
-- pgTAP: resolve_* RPCs dual-FK awareness
-- ============================================================
-- Tests that resolve_equipment_installation, resolve_equipment_replacement,
-- and resolve_equipment_update all correctly follow the
-- technical_order_item_id path when tickets are linked via the dual-FK
-- schema (PR-3, migration 092).
--
-- Prerequisite: migrations 001–092 applied.
-- Identifier markers: PASS 092-A through PASS 092-E preserved.
-- ============================================================

BEGIN;
SELECT plan(7);

-- ============================================================
-- Scenario A (PASS 092-A): resolve_equipment_installation on a ticket linked
-- via technical_order_item_id emits egreso_instalacion + liberacion_reserva
-- ============================================================
SELECT lives_ok(
  $q$
    DO $$
    DECLARE
      v_admin_id              uuid;
      v_building_id           uuid;
      v_staff_id              uuid;
      v_product_id            uuid;
      v_technical_order_id    uuid;
      v_technical_item_id     uuid;
      v_ticket_id             uuid;
      v_equipment_id          uuid;
      v_egreso_count          int;
      v_liberacion_count      int;
    BEGIN
      INSERT INTO public.administrations (company_name) VALUES ('Test 092-A Admin') RETURNING id INTO v_admin_id;
      INSERT INTO public.buildings (name, address, administration_id) VALUES ('Test 092-A Building', 'Calle 1', v_admin_id) RETURNING id INTO v_building_id;
      INSERT INTO identity.staff (full_name, role) VALUES ('Test 092-A Staff', 'admin') RETURNING id INTO v_staff_id;
      INSERT INTO public.products (name, category, stock_total, stock_reservado) VALUES ('Test 092-A Product', 'equipment', 10, 0) RETURNING id INTO v_product_id;

      INSERT INTO public.technical_orders (order_number, status, administration_id, client_type)
        VALUES ('ORD-TEC-092-A', 'confirmed', v_admin_id, 'administration')
        RETURNING id INTO v_technical_order_id;

      INSERT INTO public.technical_order_items (
        order_id, item_type, description, unit_price, product_id,
        status, quantity, building_id
      ) VALUES (
        v_technical_order_id, 'installation', 'Instalación test 092-A', 100.00,
        v_product_id, 'pending', 1, v_building_id
      ) RETURNING id INTO v_technical_item_id;

      INSERT INTO public.stock_movements (product_id, type, quantity, note, order_id, order_item_id, order_kind)
        VALUES (v_product_id, 'reserva', -1, 'Reserva test 092-A', v_technical_order_id, v_technical_item_id, 'technical');

      INSERT INTO support.tickets (
        administration_id, building_id, category, description, status,
        assigned_to_staff_id, technical_order_item_id
      ) VALUES (
        v_admin_id, v_building_id, 'equipment_installation', 'Instalar equipo 092-A',
        'open', v_staff_id, v_technical_item_id
      ) RETURNING id INTO v_ticket_id;

      PERFORM public.resolve_equipment_installation(v_ticket_id, 'SN-092-A', NULL, 'Instalado OK', v_staff_id);

      SELECT equipment_id INTO v_equipment_id FROM support.tickets WHERE id = v_ticket_id;
      ASSERT v_equipment_id IS NOT NULL, 'FAIL 092-A: equipment_id not set on ticket after resolution';

      SELECT count(*) INTO v_egreso_count
        FROM public.stock_movements
       WHERE order_item_id = v_technical_item_id AND type = 'egreso_instalacion';
      ASSERT v_egreso_count = 1, 'FAIL 092-A: expected 1 egreso_instalacion, got ' || v_egreso_count::text;

      SELECT count(*) INTO v_liberacion_count
        FROM public.stock_movements
       WHERE order_item_id = v_technical_item_id AND type = 'liberacion_reserva';
      ASSERT v_liberacion_count = 1, 'FAIL 092-A: expected 1 liberacion_reserva, got ' || v_liberacion_count::text;

      DECLARE v_status text;
      BEGIN
        SELECT status INTO v_status FROM support.tickets WHERE id = v_ticket_id;
        ASSERT v_status = 'resolved', 'FAIL 092-A: expected ticket resolved, got ' || coalesce(v_status, 'NULL');
      END;
    END $$;
  $q$,
  'PASS 092-A: resolve_equipment_installation correctly uses technical_order_item path'
);

-- ============================================================
-- Scenario B (PASS 092-B): resolve_equipment_replacement on a ticket linked
-- via technical_order_item_id emits egreso_reemplazo + liberacion_reserva
-- ============================================================
SELECT lives_ok(
  $q$
    DO $$
    DECLARE
      v_admin_id              uuid;
      v_building_id           uuid;
      v_staff_id              uuid;
      v_product_id            uuid;
      v_technical_order_id    uuid;
      v_technical_item_id     uuid;
      v_old_equipment_id      uuid;
      v_ticket_id             uuid;
      v_new_equipment_id      uuid;
      v_egreso_count          int;
      v_liberacion_count      int;
    BEGIN
      INSERT INTO public.administrations (company_name) VALUES ('Test 092-B Admin') RETURNING id INTO v_admin_id;
      INSERT INTO public.buildings (name, address, administration_id) VALUES ('Test 092-B Building', 'Calle 2', v_admin_id) RETURNING id INTO v_building_id;
      INSERT INTO identity.staff (full_name, role) VALUES ('Test 092-B Staff', 'admin') RETURNING id INTO v_staff_id;
      INSERT INTO public.products (name, category, stock_total, stock_reservado) VALUES ('Test 092-B Product', 'equipment', 10, 0) RETURNING id INTO v_product_id;

      INSERT INTO operations.equipment (serial_number, building_id, description, status)
        VALUES ('OLD-SN-092-B', v_building_id, 'Equipo viejo 092-B', 'active')
        RETURNING id INTO v_old_equipment_id;

      INSERT INTO public.technical_orders (order_number, status, administration_id, client_type)
        VALUES ('ORD-TEC-092-B', 'confirmed', v_admin_id, 'administration')
        RETURNING id INTO v_technical_order_id;

      INSERT INTO public.technical_order_items (
        order_id, item_type, description, unit_price, product_id,
        intended_equipment_id, status, quantity, building_id
      ) VALUES (
        v_technical_order_id, 'equipment_replacement', 'Reemplazo test 092-B', 200.00,
        v_product_id, v_old_equipment_id, 'pending', 1, v_building_id
      ) RETURNING id INTO v_technical_item_id;

      INSERT INTO public.stock_movements (product_id, type, quantity, note, order_id, order_item_id, order_kind)
        VALUES (v_product_id, 'reserva', -1, 'Reserva test 092-B', v_technical_order_id, v_technical_item_id, 'technical');

      INSERT INTO support.tickets (
        administration_id, building_id, category, description, status,
        assigned_to_staff_id, technical_order_item_id, equipment_id
      ) VALUES (
        v_admin_id, v_building_id, 'equipment_replacement', 'Reemplazar equipo 092-B',
        'open', v_staff_id, v_technical_item_id, v_old_equipment_id
      ) RETURNING id INTO v_ticket_id;

      SELECT public.resolve_equipment_replacement(
        v_ticket_id, v_old_equipment_id, 'NEW-SN-092-B', 'Modelo 092-B',
        'Reemplazo de prueba', 'Reemplazado OK', v_staff_id
      ) INTO v_new_equipment_id;

      ASSERT v_new_equipment_id IS NOT NULL, 'FAIL 092-B: expected new equipment_id from resolve_equipment_replacement';

      SELECT count(*) INTO v_egreso_count
        FROM public.stock_movements
       WHERE order_item_id = v_technical_item_id AND type = 'egreso_reemplazo';
      ASSERT v_egreso_count = 1, 'FAIL 092-B: expected 1 egreso_reemplazo, got ' || v_egreso_count::text;

      SELECT count(*) INTO v_liberacion_count
        FROM public.stock_movements
       WHERE order_item_id = v_technical_item_id AND type = 'liberacion_reserva';
      ASSERT v_liberacion_count = 1, 'FAIL 092-B: expected 1 liberacion_reserva, got ' || v_liberacion_count::text;

      DECLARE v_status text;
      BEGIN
        SELECT status INTO v_status FROM support.tickets WHERE id = v_ticket_id;
        ASSERT v_status = 'resolved', 'FAIL 092-B: expected ticket resolved, got ' || coalesce(v_status, 'NULL');
      END;
    END $$;
  $q$,
  'PASS 092-B: resolve_equipment_replacement correctly uses technical_order_item path'
);

-- ============================================================
-- Scenario C (PASS 092-C): resolve_equipment_update with new-path key
-- (rfid_keys.order_item_id = NULL) completes and activates the key
-- ============================================================
SELECT lives_ok(
  $q$
    DO $$
    DECLARE
      v_admin_id           uuid;
      v_building_id        uuid;
      v_unit_id            uuid;
      v_staff_id           uuid;
      v_product_id         uuid;
      v_equipment_id       uuid;
      v_key_order_id       uuid;
      v_key_order_item_id  uuid;
      v_key_id             uuid;
      v_task_id            uuid;
      v_result             jsonb;
      v_key_status         text;
      v_order_status       text;
    BEGIN
      INSERT INTO public.administrations (company_name) VALUES ('Test 092-C Admin') RETURNING id INTO v_admin_id;
      INSERT INTO public.buildings (name, address, administration_id) VALUES ('Test 092-C Building', 'Calle 3', v_admin_id) RETURNING id INTO v_building_id;
      INSERT INTO public.units (number, building_id) VALUES ('3A', v_building_id) RETURNING id INTO v_unit_id;
      INSERT INTO identity.staff (full_name, role) VALUES ('Test 092-C Staff', 'admin') RETURNING id INTO v_staff_id;
      INSERT INTO public.products (name, category, stock_total, stock_reservado) VALUES ('Test 092-C Product', 'rfid_key', 10, 0) RETURNING id INTO v_product_id;
      INSERT INTO operations.equipment (serial_number, building_id, description, status) VALUES ('SN-092-C', v_building_id, 'Equip 092-C', 'active') RETURNING id INTO v_equipment_id;

      INSERT INTO public.key_orders (order_number, status, administration_id, client_type)
        VALUES ('ORD-LLV-092-C', 'confirmed', v_admin_id, 'administration')
        RETURNING id INTO v_key_order_id;

      INSERT INTO public.key_order_items (order_id, item_type, description, unit_price, product_id, status, quantity, building_id)
        VALUES (v_key_order_id, 'key', 'Llave test 092-C', 50.00, v_product_id, 'pending', 1, v_building_id)
        RETURNING id INTO v_key_order_item_id;

      INSERT INTO public.stock_movements (product_id, type, quantity, note, order_id, order_item_id, order_kind)
        VALUES (v_product_id, 'reserva', -1, 'Reserva test 092-C', v_key_order_id, v_key_order_item_id, 'key');

      v_key_id := public.configure_key_order_item(v_key_order_item_id, 'T092-C-KEY1', v_unit_id, array[v_equipment_id]);

      DECLARE v_key_oi uuid;
      BEGIN
        SELECT order_item_id, status INTO v_key_oi, v_key_status FROM public.rfid_keys WHERE id = v_key_id;
        ASSERT v_key_oi IS NULL, 'FAIL 092-C precondition: expected rfid_keys.order_item_id = NULL for new-path key';
        ASSERT v_key_status = 'pending_installation', 'FAIL 092-C precondition: expected pending_installation, got ' || coalesce(v_key_status, 'NULL');
      END;

      SELECT status INTO v_order_status FROM public.key_orders WHERE id = v_key_order_id;
      -- Post-097: all-configured advances to pending_installation, not ready_for_pickup.
      ASSERT v_order_status = 'pending_installation', 'FAIL 092-C precondition: expected key_order in pending_installation, got ' || coalesce(v_order_status, 'NULL');

      SELECT public.create_equipment_update(v_equipment_id, v_admin_id, v_building_id, 'Update 092-C', 'path/092c.mdb', array[v_key_id], '{}', v_staff_id) INTO v_task_id;

      SELECT public.resolve_equipment_update(v_task_id, v_staff_id) INTO v_result;

      ASSERT v_result IS NOT NULL, 'FAIL 092-C: resolve_equipment_update returned NULL for new-path key';
      ASSERT jsonb_typeof(v_result) = 'object', 'FAIL 092-C: expected jsonb result, got ' || jsonb_typeof(v_result);

      SELECT status INTO v_key_status FROM public.rfid_keys WHERE id = v_key_id;
      ASSERT v_key_status = 'active', 'FAIL 092-C: expected key active after resolve, got ' || coalesce(v_key_status, 'NULL');

      -- T-1-1: key_order_items.status must have advanced to 'installed'
      DECLARE v_koi_status text;
      BEGIN
        SELECT status INTO v_koi_status
          FROM public.key_order_items
         WHERE id = v_key_order_item_id;
        ASSERT v_koi_status = 'installed', 'FAIL 092-C: key_order_items not advanced — expected installed, got ' || coalesce(v_koi_status, 'NULL');
      END;

      -- T-1-1: key_orders.status must have advanced to 'ready_for_pickup'
      DECLARE v_order_status_after text;
      BEGIN
        SELECT status INTO v_order_status_after
          FROM public.key_orders
         WHERE id = v_key_order_id;
        ASSERT v_order_status_after = 'ready_for_pickup', 'FAIL 092-C: key_order not ready_for_pickup — got ' || coalesce(v_order_status_after, 'NULL');
      END;

      ASSERT jsonb_array_length(v_result->'skipped_key_ids') = 0, 'FAIL 092-C: expected 0 skipped keys for new-path activation';
    END $$;
  $q$,
  'PASS 092-C: resolve_equipment_update works correctly for new-path keys (rfid_keys.order_item_id = NULL)'
);

-- T-1-1 extra check: after resolve_equipment_update on a new-path key, key_order_items reaches 'installed'
SELECT ok(
  EXISTS (SELECT 1 FROM public.key_order_items WHERE status = 'installed'),
  'PASS 092-C: key_order_items.status = installed after resolve_equipment_update on new-path key'
);

-- T-1-1 extra check: after all items installed, key_orders advances to 'ready_for_pickup'
SELECT ok(
  EXISTS (SELECT 1 FROM public.key_orders WHERE status = 'ready_for_pickup'),
  'PASS 092-C: key_orders.status = ready_for_pickup after single-item order fully installed'
);

-- ============================================================
-- Scenario D (PASS 092-D): resolve_ticket with technical_order_item_id — regression guard
-- ============================================================
SELECT lives_ok(
  $q$
    DO $$
    DECLARE
      v_admin_id              uuid;
      v_building_id           uuid;
      v_staff_id              uuid;
      v_technical_order_id    uuid;
      v_technical_item_id     uuid;
      v_ticket_id             uuid;
      v_status                text;
    BEGIN
      INSERT INTO public.administrations (company_name) VALUES ('Test 092-D Admin') RETURNING id INTO v_admin_id;
      INSERT INTO public.buildings (name, address, administration_id) VALUES ('Test 092-D Building', 'Calle 4', v_admin_id) RETURNING id INTO v_building_id;
      INSERT INTO identity.staff (full_name, role) VALUES ('Test 092-D Staff', 'admin') RETURNING id INTO v_staff_id;

      INSERT INTO public.technical_orders (order_number, status, administration_id, client_type)
        VALUES ('ORD-TEC-092-D', 'confirmed', v_admin_id, 'administration')
        RETURNING id INTO v_technical_order_id;

      INSERT INTO public.technical_order_items (order_id, item_type, description, unit_price, status, quantity, building_id)
        VALUES (v_technical_order_id, 'maintenance', 'Mant 092-D', 80.00, 'pending', 1, v_building_id)
        RETURNING id INTO v_technical_item_id;

      INSERT INTO support.tickets (
        administration_id, building_id, category, description, status,
        assigned_to_staff_id, technical_order_item_id
      ) VALUES (
        v_admin_id, v_building_id, 'key_configuration', 'Ticket 092-D',
        'open', v_staff_id, v_technical_item_id
      ) RETURNING id INTO v_ticket_id;

      PERFORM public.resolve_ticket(v_ticket_id, 'Resuelto 092-D', v_staff_id);

      SELECT status INTO v_status FROM support.tickets WHERE id = v_ticket_id;
      ASSERT v_status = 'resolved', 'FAIL 092-D: expected resolved, got ' || coalesce(v_status, 'NULL');
    END $$;
  $q$,
  'PASS 092-D: resolve_ticket works unchanged for technical_order_item_id tickets'
);

-- ============================================================
-- Scenario E (PASS 092-E): resolve_equipment_installation with no order link
-- ============================================================
SELECT lives_ok(
  $q$
    DO $$
    DECLARE
      v_admin_id     uuid;
      v_building_id  uuid;
      v_staff_id     uuid;
      v_ticket_id    uuid;
      v_equipment_id uuid;
      v_status       text;
    BEGIN
      INSERT INTO public.administrations (company_name) VALUES ('Test 092-E Admin') RETURNING id INTO v_admin_id;
      INSERT INTO public.buildings (name, address, administration_id) VALUES ('Test 092-E Building', 'Calle 5', v_admin_id) RETURNING id INTO v_building_id;
      INSERT INTO identity.staff (full_name, role) VALUES ('Test 092-E Staff', 'admin') RETURNING id INTO v_staff_id;

      INSERT INTO support.tickets (
        administration_id, building_id, category, description, status, assigned_to_staff_id
      ) VALUES (
        v_admin_id, v_building_id, 'equipment_installation', 'Install freestanding 092-E', 'open', v_staff_id
      ) RETURNING id INTO v_ticket_id;

      SELECT public.resolve_equipment_installation(v_ticket_id, 'SN-FREE-092-E', NULL, 'Sin orden', v_staff_id) INTO v_equipment_id;

      ASSERT v_equipment_id IS NOT NULL, 'FAIL 092-E: expected equipment_id, got NULL';

      SELECT status INTO v_status FROM support.tickets WHERE id = v_ticket_id;
      ASSERT v_status = 'resolved', 'FAIL 092-E: expected resolved, got ' || coalesce(v_status, 'NULL');
    END $$;
  $q$,
  'PASS 092-E: resolve_equipment_installation with no order link still works'
);

SELECT * FROM finish();
ROLLBACK;
