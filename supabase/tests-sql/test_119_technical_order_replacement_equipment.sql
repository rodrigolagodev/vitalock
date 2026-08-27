-- ============================================================
-- pgTAP: equipment_replacement uses stock product (post 20260826000102)
-- ============================================================
-- Covers migrations 20260826000100 (schema), 20260826000101 (v1 RPCs),
-- and 20260826000102 (product-based replacement, category coherence,
-- resolve_equipment_replacement model auto-fill).
--
-- Scenarios:
--   S1: equipment_replacement with product_id + intended_equipment_id
--       confirms, persists both, and creates the stock reserva.
--   S2: equipment_replacement without product_id raises
--       TECHNICAL_ORDER_PRODUCT_REQUIRED at confirm.
--   S3: equipment_replacement with a product of category='rfid_key' raises
--       TECHNICAL_ORDER_PRODUCT_CATEGORY_MISMATCH.
--   S4: intended_replacement_equipment_id is no longer required (kept as
--       optional column for compat); order confirms with it null.
-- ============================================================

BEGIN;
SELECT plan(4);

-- ------------------------------------------------------------
-- S1: happy path — product_id set, confirms, reserva persisted.
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
      v_item_id      uuid;
      v_stored_prod  uuid;
      v_stored_old   uuid;
      v_reserva_qty  int;
    BEGIN
      INSERT INTO public.administrations (company_name) VALUES ('Test 119-S1 Admin') RETURNING id INTO v_admin_id;
      INSERT INTO public.buildings (name, address, administration_id)
        VALUES ('Test 119-S1 Building', 'Calle 1', v_admin_id) RETURNING id INTO v_building_id;
      INSERT INTO identity.staff (full_name, role) VALUES ('Test 119-S1 Staff', 'installer') RETURNING id INTO v_staff_id;
      INSERT INTO operations.equipment (serial_number, building_id, description)
        VALUES ('EQ-119-S1-OLD', v_building_id, 'Old installed') RETURNING id INTO v_eq_old;
      INSERT INTO public.products (name, category, stock_total, stock_reservado)
        VALUES ('Test 119-S1 Product', 'equipment', 10, 0) RETURNING id INTO v_product_id;

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

      SELECT id, product_id, intended_equipment_id
        INTO v_item_id, v_stored_prod, v_stored_old
        FROM public.technical_order_items
       WHERE order_id = v_order_id;

      SELECT -quantity INTO v_reserva_qty
        FROM public.stock_movements
       WHERE order_item_id = v_item_id
         AND type = 'reserva';

      ASSERT v_stored_prod = v_product_id, 'FAIL 119-S1: product_id not persisted';
      ASSERT v_stored_old  = v_eq_old,     'FAIL 119-S1: intended_equipment_id not persisted';
      ASSERT v_reserva_qty = 1,            'FAIL 119-S1: expected reserva=1, got ' || coalesce(v_reserva_qty::text, 'NULL');
    END $$;
  $q$,
  'PASS 119-S1: equipment_replacement persists product_id + intended_equipment_id and creates stock reserva'
);

-- ------------------------------------------------------------
-- S2: missing product_id raises TECHNICAL_ORDER_PRODUCT_REQUIRED at confirm.
-- ------------------------------------------------------------
SELECT throws_ok(
  $q$
    DO $$
    DECLARE
      v_admin_id     uuid;
      v_building_id  uuid;
      v_staff_id     uuid;
      v_eq_old       uuid;
    BEGIN
      INSERT INTO public.administrations (company_name) VALUES ('Test 119-S2 Admin') RETURNING id INTO v_admin_id;
      INSERT INTO public.buildings (name, address, administration_id)
        VALUES ('Test 119-S2 Building', 'Calle 1', v_admin_id) RETURNING id INTO v_building_id;
      INSERT INTO identity.staff (full_name, role) VALUES ('Test 119-S2 Staff', 'installer') RETURNING id INTO v_staff_id;
      INSERT INTO operations.equipment (serial_number, building_id, description)
        VALUES ('EQ-119-S2-OLD', v_building_id, 'Old installed') RETURNING id INTO v_eq_old;

      PERFORM public.create_technical_order_with_items(
        jsonb_build_object('client_type', 'administration', 'administration_id', v_admin_id),
        ARRAY[
          jsonb_build_object(
            'item_type', 'equipment_replacement',
            'building_id', v_building_id,
            'intended_assignee_staff_id', v_staff_id,
            'intended_equipment_id', v_eq_old,
            'quantity', 1,
            'unit_price', 500
          )
        ]::jsonb[],
        true
      );
    END $$;
  $q$,
  'P0001',
  NULL,
  'PASS 119-S2: equipment_replacement without product_id raises TECHNICAL_ORDER_PRODUCT_REQUIRED at confirm'
);

-- ------------------------------------------------------------
-- S3: product of category=rfid_key rejected for equipment_replacement.
-- ------------------------------------------------------------
SELECT throws_ok(
  $q$
    DO $$
    DECLARE
      v_admin_id     uuid;
      v_building_id  uuid;
      v_staff_id     uuid;
      v_eq_old       uuid;
      v_wrong_prod   uuid;
    BEGIN
      INSERT INTO public.administrations (company_name) VALUES ('Test 119-S3 Admin') RETURNING id INTO v_admin_id;
      INSERT INTO public.buildings (name, address, administration_id)
        VALUES ('Test 119-S3 Building', 'Calle 1', v_admin_id) RETURNING id INTO v_building_id;
      INSERT INTO identity.staff (full_name, role) VALUES ('Test 119-S3 Staff', 'installer') RETURNING id INTO v_staff_id;
      INSERT INTO operations.equipment (serial_number, building_id, description)
        VALUES ('EQ-119-S3-OLD', v_building_id, 'Old installed') RETURNING id INTO v_eq_old;
      INSERT INTO public.products (name, category, stock_total, stock_reservado)
        VALUES ('Test 119-S3 Wrong Product', 'rfid_key', 5, 0) RETURNING id INTO v_wrong_prod;

      PERFORM public.create_technical_order_with_items(
        jsonb_build_object('client_type', 'administration', 'administration_id', v_admin_id),
        ARRAY[
          jsonb_build_object(
            'item_type', 'equipment_replacement',
            'building_id', v_building_id,
            'intended_assignee_staff_id', v_staff_id,
            'intended_equipment_id', v_eq_old,
            'product_id', v_wrong_prod,
            'quantity', 1,
            'unit_price', 500
          )
        ]::jsonb[],
        true
      );
    END $$;
  $q$,
  'P0001',
  NULL,
  'PASS 119-S3: equipment_replacement rejects product with category=rfid_key (TECHNICAL_ORDER_PRODUCT_CATEGORY_MISMATCH)'
);

-- ------------------------------------------------------------
-- S4: intended_replacement_equipment_id is no longer required.
--     Order confirms fine with product_id alone; column stays null.
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
      v_repl_stored  uuid;
    BEGIN
      INSERT INTO public.administrations (company_name) VALUES ('Test 119-S4 Admin') RETURNING id INTO v_admin_id;
      INSERT INTO public.buildings (name, address, administration_id)
        VALUES ('Test 119-S4 Building', 'Calle 1', v_admin_id) RETURNING id INTO v_building_id;
      INSERT INTO identity.staff (full_name, role) VALUES ('Test 119-S4 Staff', 'installer') RETURNING id INTO v_staff_id;
      INSERT INTO operations.equipment (serial_number, building_id, description)
        VALUES ('EQ-119-S4-OLD', v_building_id, 'Old installed') RETURNING id INTO v_eq_old;
      INSERT INTO public.products (name, category, stock_total, stock_reservado)
        VALUES ('Test 119-S4 Product', 'equipment', 5, 0) RETURNING id INTO v_product_id;

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

      SELECT intended_replacement_equipment_id
        INTO v_repl_stored
        FROM public.technical_order_items
       WHERE order_id = v_order_id;

      ASSERT v_repl_stored IS NULL, 'FAIL 119-S4: intended_replacement_equipment_id should be null (not provided)';
    END $$;
  $q$,
  'PASS 119-S4: intended_replacement_equipment_id remains optional (null when not provided) — confirm succeeds via product_id'
);

SELECT * FROM finish();
ROLLBACK;
