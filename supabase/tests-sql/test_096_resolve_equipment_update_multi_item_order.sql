-- ============================================================
-- pgTAP: resolve_equipment_update multi-item order advancement
-- ============================================================
-- Verifies that a multi-item key_order advances correctly when
-- resolve_equipment_update is called for each key one at a time.
--
-- Prerequisite: migrations 001–104 applied.
-- ============================================================

BEGIN;
SELECT plan(3);

-- ============================================================
-- Scenario 096-1: two-item order, first equipment_update resolves
-- one key → order stays pending_installation
-- ============================================================
SELECT lives_ok(
  $q$
    DO $$
    DECLARE
      v_admin_id            uuid;
      v_building_id         uuid;
      v_unit_id_a           uuid;
      v_unit_id_b           uuid;
      v_staff_id            uuid;
      v_product_id          uuid;
      v_equipment_id        uuid;
      v_key_order_id        uuid;
      v_koi_id_a            uuid;
      v_koi_id_b            uuid;
      v_key_id_a            uuid;
      v_key_id_b            uuid;
      v_task_id             uuid;
      v_order_status        text;
    BEGIN
      INSERT INTO public.administrations (company_name) VALUES ('Test 096-1 Admin') RETURNING id INTO v_admin_id;
      INSERT INTO public.buildings (name, address, administration_id) VALUES ('Test 096-1 Building', 'Calle 096-1', v_admin_id) RETURNING id INTO v_building_id;
      INSERT INTO public.units (number, building_id) VALUES ('096-1A', v_building_id) RETURNING id INTO v_unit_id_a;
      INSERT INTO public.units (number, building_id) VALUES ('096-1B', v_building_id) RETURNING id INTO v_unit_id_b;
      INSERT INTO identity.staff (full_name, role) VALUES ('Test 096-1 Staff', 'admin') RETURNING id INTO v_staff_id;
      INSERT INTO public.products (name, category, stock_total, stock_reservado) VALUES ('Test 096-1 Key', 'rfid_key', 10, 0) RETURNING id INTO v_product_id;
      INSERT INTO operations.equipment (serial_number, building_id, description, status) VALUES ('SN-096-1', v_building_id, 'Equip 096-1', 'active') RETURNING id INTO v_equipment_id;

      INSERT INTO public.key_orders (order_number, status, administration_id, client_type)
        VALUES ('ORD-LLV-096-1', 'confirmed', v_admin_id, 'administration')
        RETURNING id INTO v_key_order_id;

      -- Two items in the same order
      INSERT INTO public.key_order_items (order_id, item_type, description, unit_price, product_id, status, quantity, building_id)
        VALUES (v_key_order_id, 'key', 'Llave 096-1A', 50.00, v_product_id, 'pending', 1, v_building_id)
        RETURNING id INTO v_koi_id_a;

      INSERT INTO public.key_order_items (order_id, item_type, description, unit_price, product_id, status, quantity, building_id)
        VALUES (v_key_order_id, 'key', 'Llave 096-1B', 50.00, v_product_id, 'pending', 1, v_building_id)
        RETURNING id INTO v_koi_id_b;

      INSERT INTO public.stock_movements (product_id, type, quantity, note, order_id, order_item_id, order_kind)
        VALUES (v_product_id, 'reserva', -1, 'Reserva 096-1A', v_key_order_id, v_koi_id_a, 'key');
      INSERT INTO public.stock_movements (product_id, type, quantity, note, order_id, order_item_id, order_kind)
        VALUES (v_product_id, 'reserva', -1, 'Reserva 096-1B', v_key_order_id, v_koi_id_b, 'key');

      v_key_id_a := public.configure_key_order_item(v_koi_id_a, 'T096-1-KEY-A', v_unit_id_a, array[v_equipment_id]);
      v_key_id_b := public.configure_key_order_item(v_koi_id_b, 'T096-1-KEY-B', v_unit_id_b, array[v_equipment_id]);

      -- Resolve only key A
      SELECT public.create_equipment_update(v_equipment_id, v_admin_id, v_building_id, 'Update 096-1A', 'path/096-1A.mdb', array[v_key_id_a], '{}', v_staff_id) INTO v_task_id;
      PERFORM public.resolve_equipment_update(v_task_id, v_staff_id);

      -- Order must remain pending_installation (key B not yet installed)
      SELECT status INTO v_order_status FROM public.key_orders WHERE id = v_key_order_id;
      ASSERT v_order_status = 'pending_installation',
        'FAIL 096-1: order should remain pending_installation after first key resolved, got ' || coalesce(v_order_status, 'NULL');
    END $$;
  $q$,
  'PASS 096-1: two-item order stays pending_installation after first resolve_equipment_update'
);

-- ============================================================
-- Scenario 096-2: second equipment_update resolves last key →
-- order advances to ready_for_pickup
-- ============================================================
SELECT lives_ok(
  $q$
    DO $$
    DECLARE
      v_admin_id            uuid;
      v_building_id         uuid;
      v_unit_id_a           uuid;
      v_unit_id_b           uuid;
      v_staff_id            uuid;
      v_product_id          uuid;
      v_equipment_id        uuid;
      v_key_order_id        uuid;
      v_koi_id_a            uuid;
      v_koi_id_b            uuid;
      v_key_id_a            uuid;
      v_key_id_b            uuid;
      v_task_id_a           uuid;
      v_task_id_b           uuid;
      v_order_status        text;
    BEGIN
      INSERT INTO public.administrations (company_name) VALUES ('Test 096-2 Admin') RETURNING id INTO v_admin_id;
      INSERT INTO public.buildings (name, address, administration_id) VALUES ('Test 096-2 Building', 'Calle 096-2', v_admin_id) RETURNING id INTO v_building_id;
      INSERT INTO public.units (number, building_id) VALUES ('096-2A', v_building_id) RETURNING id INTO v_unit_id_a;
      INSERT INTO public.units (number, building_id) VALUES ('096-2B', v_building_id) RETURNING id INTO v_unit_id_b;
      INSERT INTO identity.staff (full_name, role) VALUES ('Test 096-2 Staff', 'admin') RETURNING id INTO v_staff_id;
      INSERT INTO public.products (name, category, stock_total, stock_reservado) VALUES ('Test 096-2 Key', 'rfid_key', 10, 0) RETURNING id INTO v_product_id;
      INSERT INTO operations.equipment (serial_number, building_id, description, status) VALUES ('SN-096-2', v_building_id, 'Equip 096-2', 'active') RETURNING id INTO v_equipment_id;

      INSERT INTO public.key_orders (order_number, status, administration_id, client_type)
        VALUES ('ORD-LLV-096-2', 'confirmed', v_admin_id, 'administration')
        RETURNING id INTO v_key_order_id;

      INSERT INTO public.key_order_items (order_id, item_type, description, unit_price, product_id, status, quantity, building_id)
        VALUES (v_key_order_id, 'key', 'Llave 096-2A', 50.00, v_product_id, 'pending', 1, v_building_id)
        RETURNING id INTO v_koi_id_a;

      INSERT INTO public.key_order_items (order_id, item_type, description, unit_price, product_id, status, quantity, building_id)
        VALUES (v_key_order_id, 'key', 'Llave 096-2B', 50.00, v_product_id, 'pending', 1, v_building_id)
        RETURNING id INTO v_koi_id_b;

      INSERT INTO public.stock_movements (product_id, type, quantity, note, order_id, order_item_id, order_kind)
        VALUES (v_product_id, 'reserva', -1, 'Reserva 096-2A', v_key_order_id, v_koi_id_a, 'key');
      INSERT INTO public.stock_movements (product_id, type, quantity, note, order_id, order_item_id, order_kind)
        VALUES (v_product_id, 'reserva', -1, 'Reserva 096-2B', v_key_order_id, v_koi_id_b, 'key');

      v_key_id_a := public.configure_key_order_item(v_koi_id_a, 'T096-2-KEY-A', v_unit_id_a, array[v_equipment_id]);
      v_key_id_b := public.configure_key_order_item(v_koi_id_b, 'T096-2-KEY-B', v_unit_id_b, array[v_equipment_id]);

      -- Resolve key A
      SELECT public.create_equipment_update(v_equipment_id, v_admin_id, v_building_id, 'Update 096-2A', 'path/096-2A.mdb', array[v_key_id_a], '{}', v_staff_id) INTO v_task_id_a;
      PERFORM public.resolve_equipment_update(v_task_id_a, v_staff_id);

      -- Resolve key B (second equipment update for the same equipment)
      SELECT public.create_equipment_update(v_equipment_id, v_admin_id, v_building_id, 'Update 096-2B', 'path/096-2B.mdb', array[v_key_id_b], '{}', v_staff_id) INTO v_task_id_b;
      PERFORM public.resolve_equipment_update(v_task_id_b, v_staff_id);

      -- Order must advance to ready_for_pickup (both items installed)
      SELECT status INTO v_order_status FROM public.key_orders WHERE id = v_key_order_id;
      ASSERT v_order_status = 'ready_for_pickup',
        'FAIL 096-2: order should advance to ready_for_pickup after last key resolved, got ' || coalesce(v_order_status, 'NULL');
    END $$;
  $q$,
  'PASS 096-2: two-item order advances to ready_for_pickup after both resolve_equipment_updates'
);

-- ============================================================
-- Scenario 096-3: three-item order, two equipment_updates resolve
-- two keys → order still pending_installation
-- ============================================================
SELECT lives_ok(
  $q$
    DO $$
    DECLARE
      v_admin_id            uuid;
      v_building_id         uuid;
      v_unit_id_a           uuid;
      v_unit_id_b           uuid;
      v_unit_id_c           uuid;
      v_staff_id            uuid;
      v_product_id          uuid;
      v_equipment_id        uuid;
      v_key_order_id        uuid;
      v_koi_id_a            uuid;
      v_koi_id_b            uuid;
      v_koi_id_c            uuid;
      v_key_id_a            uuid;
      v_key_id_b            uuid;
      v_key_id_c            uuid;
      v_task_id_a           uuid;
      v_task_id_b           uuid;
      v_order_status        text;
    BEGIN
      INSERT INTO public.administrations (company_name) VALUES ('Test 096-3 Admin') RETURNING id INTO v_admin_id;
      INSERT INTO public.buildings (name, address, administration_id) VALUES ('Test 096-3 Building', 'Calle 096-3', v_admin_id) RETURNING id INTO v_building_id;
      INSERT INTO public.units (number, building_id) VALUES ('096-3A', v_building_id) RETURNING id INTO v_unit_id_a;
      INSERT INTO public.units (number, building_id) VALUES ('096-3B', v_building_id) RETURNING id INTO v_unit_id_b;
      INSERT INTO public.units (number, building_id) VALUES ('096-3C', v_building_id) RETURNING id INTO v_unit_id_c;
      INSERT INTO identity.staff (full_name, role) VALUES ('Test 096-3 Staff', 'admin') RETURNING id INTO v_staff_id;
      INSERT INTO public.products (name, category, stock_total, stock_reservado) VALUES ('Test 096-3 Key', 'rfid_key', 10, 0) RETURNING id INTO v_product_id;
      INSERT INTO operations.equipment (serial_number, building_id, description, status) VALUES ('SN-096-3', v_building_id, 'Equip 096-3', 'active') RETURNING id INTO v_equipment_id;

      INSERT INTO public.key_orders (order_number, status, administration_id, client_type)
        VALUES ('ORD-LLV-096-3', 'confirmed', v_admin_id, 'administration')
        RETURNING id INTO v_key_order_id;

      INSERT INTO public.key_order_items (order_id, item_type, description, unit_price, product_id, status, quantity, building_id)
        VALUES (v_key_order_id, 'key', 'Llave 096-3A', 50.00, v_product_id, 'pending', 1, v_building_id)
        RETURNING id INTO v_koi_id_a;
      INSERT INTO public.key_order_items (order_id, item_type, description, unit_price, product_id, status, quantity, building_id)
        VALUES (v_key_order_id, 'key', 'Llave 096-3B', 50.00, v_product_id, 'pending', 1, v_building_id)
        RETURNING id INTO v_koi_id_b;
      INSERT INTO public.key_order_items (order_id, item_type, description, unit_price, product_id, status, quantity, building_id)
        VALUES (v_key_order_id, 'key', 'Llave 096-3C', 50.00, v_product_id, 'pending', 1, v_building_id)
        RETURNING id INTO v_koi_id_c;

      INSERT INTO public.stock_movements (product_id, type, quantity, note, order_id, order_item_id, order_kind)
        VALUES (v_product_id, 'reserva', -1, 'Reserva 096-3A', v_key_order_id, v_koi_id_a, 'key');
      INSERT INTO public.stock_movements (product_id, type, quantity, note, order_id, order_item_id, order_kind)
        VALUES (v_product_id, 'reserva', -1, 'Reserva 096-3B', v_key_order_id, v_koi_id_b, 'key');
      INSERT INTO public.stock_movements (product_id, type, quantity, note, order_id, order_item_id, order_kind)
        VALUES (v_product_id, 'reserva', -1, 'Reserva 096-3C', v_key_order_id, v_koi_id_c, 'key');

      v_key_id_a := public.configure_key_order_item(v_koi_id_a, 'T096-3-KEY-A', v_unit_id_a, array[v_equipment_id]);
      v_key_id_b := public.configure_key_order_item(v_koi_id_b, 'T096-3-KEY-B', v_unit_id_b, array[v_equipment_id]);
      v_key_id_c := public.configure_key_order_item(v_koi_id_c, 'T096-3-KEY-C', v_unit_id_c, array[v_equipment_id]);

      -- Resolve keys A and B only (C remains configured)
      SELECT public.create_equipment_update(v_equipment_id, v_admin_id, v_building_id, 'Update 096-3A', 'path/096-3A.mdb', array[v_key_id_a], '{}', v_staff_id) INTO v_task_id_a;
      PERFORM public.resolve_equipment_update(v_task_id_a, v_staff_id);

      SELECT public.create_equipment_update(v_equipment_id, v_admin_id, v_building_id, 'Update 096-3B', 'path/096-3B.mdb', array[v_key_id_b], '{}', v_staff_id) INTO v_task_id_b;
      PERFORM public.resolve_equipment_update(v_task_id_b, v_staff_id);

      -- Order must remain pending_installation (key C still configured)
      SELECT status INTO v_order_status FROM public.key_orders WHERE id = v_key_order_id;
      ASSERT v_order_status = 'pending_installation',
        'FAIL 096-3: order should remain pending_installation with one key still configured, got ' || coalesce(v_order_status, 'NULL');
    END $$;
  $q$,
  'PASS 096-3: three-item order stays pending_installation after two of three resolve_equipment_updates'
);

SELECT * FROM finish();
ROLLBACK;
