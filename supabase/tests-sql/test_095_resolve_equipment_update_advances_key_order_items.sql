-- ============================================================
-- pgTAP: resolve_equipment_update advances key_order_items
-- ============================================================
-- Verifies that resolve_equipment_update sets key_order_items.status
-- to 'installed' when a new-path key (order_item_id = NULL) is activated,
-- and that the trigger drives key_orders.status to 'ready_for_pickup'.
--
-- Prerequisite: migrations 001–104 applied.
-- ============================================================

BEGIN;
SELECT plan(5);

-- ============================================================
-- Scenario 095-1: new-path single key → key_order_items installed,
-- order → ready_for_pickup
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
      v_koi_status         text;
      v_order_status       text;
    BEGIN
      INSERT INTO public.administrations (company_name) VALUES ('Test 095-1 Admin') RETURNING id INTO v_admin_id;
      INSERT INTO public.buildings (name, address, administration_id) VALUES ('Test 095-1 Building', 'Calle 095-1', v_admin_id) RETURNING id INTO v_building_id;
      INSERT INTO public.units (number, building_id) VALUES ('095-1A', v_building_id) RETURNING id INTO v_unit_id;
      INSERT INTO identity.staff (full_name, role) VALUES ('Test 095-1 Staff', 'admin') RETURNING id INTO v_staff_id;
      INSERT INTO public.products (name, category, stock_total, stock_reservado) VALUES ('Test 095-1 Key', 'rfid_key', 10, 0) RETURNING id INTO v_product_id;
      INSERT INTO operations.equipment (serial_number, building_id, description, status) VALUES ('SN-095-1', v_building_id, 'Equip 095-1', 'active') RETURNING id INTO v_equipment_id;

      INSERT INTO public.key_orders (order_number, status, administration_id, client_type)
        VALUES ('ORD-LLV-095-1', 'confirmed', v_admin_id, 'administration')
        RETURNING id INTO v_key_order_id;

      INSERT INTO public.key_order_items (order_id, item_type, description, unit_price, product_id, status, quantity, building_id)
        VALUES (v_key_order_id, 'key', 'Llave test 095-1', 50.00, v_product_id, 'pending', 1, v_building_id)
        RETURNING id INTO v_key_order_item_id;

      INSERT INTO public.stock_movements (product_id, type, quantity, note, order_id, order_item_id, order_kind)
        VALUES (v_product_id, 'reserva', -1, 'Reserva test 095-1', v_key_order_id, v_key_order_item_id, 'key');

      -- configure_key_order_item sets order_item_id = NULL on the new-path key
      v_key_id := public.configure_key_order_item(v_key_order_item_id, 'T095-1-KEY1', v_unit_id, array[v_equipment_id]);

      SELECT public.create_equipment_update(v_equipment_id, v_admin_id, v_building_id, 'Update 095-1', 'path/095-1.mdb', array[v_key_id], '{}', v_staff_id) INTO v_task_id;
      SELECT public.resolve_equipment_update(v_task_id, v_staff_id) INTO v_result;

      -- Assert key_order_items advanced to 'installed'
      SELECT status INTO v_koi_status FROM public.key_order_items WHERE id = v_key_order_item_id;
      ASSERT v_koi_status = 'installed',
        'FAIL 095-1: key_order_items not advanced — expected installed, got ' || coalesce(v_koi_status, 'NULL');

      -- Assert key_orders advanced to 'ready_for_pickup'
      SELECT status INTO v_order_status FROM public.key_orders WHERE id = v_key_order_id;
      ASSERT v_order_status = 'ready_for_pickup',
        'FAIL 095-1: key_order not ready_for_pickup — got ' || coalesce(v_order_status, 'NULL');
    END $$;
  $q$,
  'PASS 095-1: new-path key resolve advances key_order_items to installed and order to ready_for_pickup'
);

-- ============================================================
-- Scenario 095-2: key with a cancelled key_order_items row →
-- key activates, the cancelled koi row is NOT advanced (only 'configured' items advance)
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
      v_koi_status         text;
    BEGIN
      INSERT INTO public.administrations (company_name) VALUES ('Test 095-2 Admin') RETURNING id INTO v_admin_id;
      INSERT INTO public.buildings (name, address, administration_id) VALUES ('Test 095-2 Building', 'Calle 095-2', v_admin_id) RETURNING id INTO v_building_id;
      INSERT INTO public.units (number, building_id) VALUES ('095-2A', v_building_id) RETURNING id INTO v_unit_id;
      INSERT INTO identity.staff (full_name, role) VALUES ('Test 095-2 Staff', 'admin') RETURNING id INTO v_staff_id;
      INSERT INTO public.products (name, category, stock_total, stock_reservado) VALUES ('Test 095-2 Key', 'rfid_key', 10, 0) RETURNING id INTO v_product_id;
      INSERT INTO operations.equipment (serial_number, building_id, description, status) VALUES ('SN-095-2', v_building_id, 'Equip 095-2', 'active') RETURNING id INTO v_equipment_id;

      INSERT INTO public.key_orders (order_number, status, administration_id, client_type)
        VALUES ('ORD-LLV-095-2', 'confirmed', v_admin_id, 'administration')
        RETURNING id INTO v_key_order_id;

      INSERT INTO public.key_order_items (order_id, item_type, description, unit_price, product_id, status, quantity, building_id)
        VALUES (v_key_order_id, 'key', 'Llave test 095-2', 50.00, v_product_id, 'pending', 1, v_building_id)
        RETURNING id INTO v_key_order_item_id;

      INSERT INTO public.stock_movements (product_id, type, quantity, note, order_id, order_item_id, order_kind)
        VALUES (v_product_id, 'reserva', -1, 'Reserva test 095-2', v_key_order_id, v_key_order_item_id, 'key');

      v_key_id := public.configure_key_order_item(v_key_order_item_id, 'T095-2-KEY1', v_unit_id, array[v_equipment_id]);

      -- Manually set the key_order_items row to 'cancelled' (simulates cancelled order item)
      UPDATE public.key_order_items SET status = 'cancelled' WHERE id = v_key_order_item_id;

      SELECT public.create_equipment_update(v_equipment_id, v_admin_id, v_building_id, 'Update 095-2', 'path/095-2.mdb', array[v_key_id], '{}', v_staff_id) INTO v_task_id;
      SELECT public.resolve_equipment_update(v_task_id, v_staff_id) INTO v_result;

      -- Key must still activate (the activation path is independent of koi status)
      SELECT status INTO v_key_status FROM public.rfid_keys WHERE id = v_key_id;
      ASSERT v_key_status = 'active',
        'FAIL 095-2: expected key active, got ' || coalesce(v_key_status, 'NULL');

      -- The cancelled koi row must NOT be advanced to installed
      SELECT status INTO v_koi_status FROM public.key_order_items WHERE id = v_key_order_item_id;
      ASSERT v_koi_status = 'cancelled',
        'FAIL 095-2: cancelled key_order_items row should remain cancelled, got ' || coalesce(v_koi_status, 'NULL');
    END $$;
  $q$,
  'PASS 095-2: cancelled key_order_items row is not advanced to installed on resolve_equipment_update'
);

-- ============================================================
-- Scenario 095-3: skip scenario — key already active →
-- RPC skips, key_order_items.status unchanged
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
      v_koi_status         text;
    BEGIN
      INSERT INTO public.administrations (company_name) VALUES ('Test 095-3 Admin') RETURNING id INTO v_admin_id;
      INSERT INTO public.buildings (name, address, administration_id) VALUES ('Test 095-3 Building', 'Calle 095-3', v_admin_id) RETURNING id INTO v_building_id;
      INSERT INTO public.units (number, building_id) VALUES ('095-3A', v_building_id) RETURNING id INTO v_unit_id;
      INSERT INTO identity.staff (full_name, role) VALUES ('Test 095-3 Staff', 'admin') RETURNING id INTO v_staff_id;
      INSERT INTO public.products (name, category, stock_total, stock_reservado) VALUES ('Test 095-3 Key', 'rfid_key', 10, 0) RETURNING id INTO v_product_id;
      INSERT INTO operations.equipment (serial_number, building_id, description, status) VALUES ('SN-095-3', v_building_id, 'Equip 095-3', 'active') RETURNING id INTO v_equipment_id;

      INSERT INTO public.key_orders (order_number, status, administration_id, client_type)
        VALUES ('ORD-LLV-095-3', 'confirmed', v_admin_id, 'administration')
        RETURNING id INTO v_key_order_id;

      INSERT INTO public.key_order_items (order_id, item_type, description, unit_price, product_id, status, quantity, building_id)
        VALUES (v_key_order_id, 'key', 'Llave test 095-3', 50.00, v_product_id, 'pending', 1, v_building_id)
        RETURNING id INTO v_key_order_item_id;

      INSERT INTO public.stock_movements (product_id, type, quantity, note, order_id, order_item_id, order_kind)
        VALUES (v_product_id, 'reserva', -1, 'Reserva test 095-3', v_key_order_id, v_key_order_item_id, 'key');

      v_key_id := public.configure_key_order_item(v_key_order_item_id, 'T095-3-KEY1', v_unit_id, array[v_equipment_id]);

      -- Forcibly set the key to 'active' to simulate already-resolved state
      UPDATE public.rfid_keys SET status = 'active' WHERE id = v_key_id;

      SELECT public.create_equipment_update(v_equipment_id, v_admin_id, v_building_id, 'Update 095-3', 'path/095-3.mdb', array[v_key_id], '{}', v_staff_id) INTO v_task_id;
      SELECT public.resolve_equipment_update(v_task_id, v_staff_id) INTO v_result;

      -- key is already active → RPC skips it → skipped_key_ids = [v_key_id]
      ASSERT jsonb_array_length(v_result->'skipped_key_ids') = 1,
        'FAIL 095-3: expected 1 skipped key for already-active key, got ' || jsonb_array_length(v_result->'skipped_key_ids')::text;

      -- key_order_items must remain 'configured' (was not touched by the skip path)
      SELECT status INTO v_koi_status FROM public.key_order_items WHERE id = v_key_order_item_id;
      ASSERT v_koi_status = 'configured',
        'FAIL 095-3: skip path should leave key_order_items at configured, got ' || coalesce(v_koi_status, 'NULL');
    END $$;
  $q$,
  'PASS 095-3: already-active key is skipped and key_order_items.status remains configured'
);

-- ============================================================
-- Scenario 095-4: two keys in a single equipment_update →
-- both key_order_items rows advance to 'installed'
-- ============================================================
SELECT lives_ok(
  $q$
    DO $$
    DECLARE
      v_admin_id           uuid;
      v_building_id        uuid;
      v_unit_id_a          uuid;
      v_unit_id_b          uuid;
      v_staff_id           uuid;
      v_product_id         uuid;
      v_equipment_id       uuid;
      v_key_order_id       uuid;
      v_koi_id_a           uuid;
      v_koi_id_b           uuid;
      v_key_id_a           uuid;
      v_key_id_b           uuid;
      v_task_id            uuid;
      v_result             jsonb;
      v_koi_status_a       text;
      v_koi_status_b       text;
    BEGIN
      INSERT INTO public.administrations (company_name) VALUES ('Test 095-4 Admin') RETURNING id INTO v_admin_id;
      INSERT INTO public.buildings (name, address, administration_id) VALUES ('Test 095-4 Building', 'Calle 095-4', v_admin_id) RETURNING id INTO v_building_id;
      INSERT INTO public.units (number, building_id) VALUES ('095-4A', v_building_id) RETURNING id INTO v_unit_id_a;
      INSERT INTO public.units (number, building_id) VALUES ('095-4B', v_building_id) RETURNING id INTO v_unit_id_b;
      INSERT INTO identity.staff (full_name, role) VALUES ('Test 095-4 Staff', 'admin') RETURNING id INTO v_staff_id;
      INSERT INTO public.products (name, category, stock_total, stock_reservado) VALUES ('Test 095-4 Key', 'rfid_key', 10, 0) RETURNING id INTO v_product_id;
      INSERT INTO operations.equipment (serial_number, building_id, description, status) VALUES ('SN-095-4', v_building_id, 'Equip 095-4', 'active') RETURNING id INTO v_equipment_id;

      INSERT INTO public.key_orders (order_number, status, administration_id, client_type)
        VALUES ('ORD-LLV-095-4', 'confirmed', v_admin_id, 'administration')
        RETURNING id INTO v_key_order_id;

      INSERT INTO public.key_order_items (order_id, item_type, description, unit_price, product_id, status, quantity, building_id)
        VALUES (v_key_order_id, 'key', 'Llave 095-4A', 50.00, v_product_id, 'pending', 1, v_building_id)
        RETURNING id INTO v_koi_id_a;
      INSERT INTO public.key_order_items (order_id, item_type, description, unit_price, product_id, status, quantity, building_id)
        VALUES (v_key_order_id, 'key', 'Llave 095-4B', 50.00, v_product_id, 'pending', 1, v_building_id)
        RETURNING id INTO v_koi_id_b;

      INSERT INTO public.stock_movements (product_id, type, quantity, note, order_id, order_item_id, order_kind)
        VALUES (v_product_id, 'reserva', -1, 'Reserva 095-4A', v_key_order_id, v_koi_id_a, 'key');
      INSERT INTO public.stock_movements (product_id, type, quantity, note, order_id, order_item_id, order_kind)
        VALUES (v_product_id, 'reserva', -1, 'Reserva 095-4B', v_key_order_id, v_koi_id_b, 'key');

      v_key_id_a := public.configure_key_order_item(v_koi_id_a, 'T095-4-KEY-A', v_unit_id_a, array[v_equipment_id]);
      v_key_id_b := public.configure_key_order_item(v_koi_id_b, 'T095-4-KEY-B', v_unit_id_b, array[v_equipment_id]);

      -- Single equipment_update resolves both keys at once
      SELECT public.create_equipment_update(v_equipment_id, v_admin_id, v_building_id, 'Update 095-4', 'path/095-4.mdb', array[v_key_id_a, v_key_id_b], '{}', v_staff_id) INTO v_task_id;
      SELECT public.resolve_equipment_update(v_task_id, v_staff_id) INTO v_result;

      -- Both key_order_items must advance to 'installed'
      SELECT status INTO v_koi_status_a FROM public.key_order_items WHERE id = v_koi_id_a;
      ASSERT v_koi_status_a = 'installed',
        'FAIL 095-4: koi_a not advanced — expected installed, got ' || coalesce(v_koi_status_a, 'NULL');

      SELECT status INTO v_koi_status_b FROM public.key_order_items WHERE id = v_koi_id_b;
      ASSERT v_koi_status_b = 'installed',
        'FAIL 095-4: koi_b not advanced — expected installed, got ' || coalesce(v_koi_status_b, 'NULL');
    END $$;
  $q$,
  'PASS 095-4: two keys in single equipment_update both advance their key_order_items to installed'
);

-- ============================================================
-- Scenario 095-5: key with no key_order_items row (produced_key_id absent) →
-- no error, key still activates
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
      v_key_id       uuid;
      v_task_id      uuid;
      v_result       jsonb;
      v_key_status   text;
    BEGIN
      INSERT INTO public.administrations (company_name) VALUES ('Test 095-5 Admin') RETURNING id INTO v_admin_id;
      INSERT INTO public.buildings (name, address, administration_id) VALUES ('Test 095-5 Building', 'Calle 095-5', v_admin_id) RETURNING id INTO v_building_id;
      INSERT INTO public.units (number, building_id) VALUES ('095-5A', v_building_id) RETURNING id INTO v_unit_id;
      INSERT INTO identity.staff (full_name, role) VALUES ('Test 095-5 Staff', 'admin') RETURNING id INTO v_staff_id;
      INSERT INTO operations.equipment (serial_number, building_id, description, status) VALUES ('SN-095-5', v_building_id, 'Equip 095-5', 'active') RETURNING id INTO v_equipment_id;

      -- Insert key directly with no order_item_id and no key_order_items row
      INSERT INTO public.rfid_keys (rfid_code, status, unit_id)
        VALUES ('T095-5-ORPHAN', 'pending_installation', v_unit_id)
        RETURNING id INTO v_key_id;

      SELECT public.create_equipment_update(v_equipment_id, v_admin_id, v_building_id, 'Update 095-5', 'path/095-5.mdb', array[v_key_id], '{}', v_staff_id) INTO v_task_id;
      SELECT public.resolve_equipment_update(v_task_id, v_staff_id) INTO v_result;

      -- Key must still activate even without a key_order_items row
      SELECT status INTO v_key_status FROM public.rfid_keys WHERE id = v_key_id;
      ASSERT v_key_status = 'active',
        'FAIL 095-5: key without key_order_items row should still activate, got ' || coalesce(v_key_status, 'NULL');

      -- No key_order_items.installed row should have appeared
      ASSERT NOT EXISTS (
        SELECT 1 FROM public.key_order_items WHERE produced_key_id = v_key_id
      ), 'FAIL 095-5: key with no key_order_items row should not create one on resolve';
    END $$;
  $q$,
  'PASS 095-5: key with no key_order_items row activates without error'
);

SELECT * FROM finish();
ROLLBACK;
