-- ============================================================
-- pgTAP: public.confirm_key_order
-- ============================================================
-- Spec: key-orders / Key Orders State Machine (draft → confirmed)
-- Prerequisite: migrations 001–095 applied.
-- Identifier markers: PASS 101-S1 through PASS 101-S4 preserved.
-- ============================================================

BEGIN;
SELECT plan(4);

-- ============================================================
-- Scenario 1 (PASS 101-S1): draft → confirmed status transition
-- ============================================================
SELECT lives_ok(
  $q$
    DO $$
    DECLARE
      v_admin_id    uuid;
      v_building_id uuid;
      v_order_id    uuid;
      v_status      text;
    BEGIN
      INSERT INTO public.administrations (company_name) VALUES ('Test 101-S1 Admin') RETURNING id INTO v_admin_id;
      INSERT INTO public.buildings (name, address, administration_id)
        VALUES ('Test 101-S1 Building', 'Calle 1', v_admin_id) RETURNING id INTO v_building_id;

      v_order_id := public.create_key_order_with_items(
        jsonb_build_object('client_type', 'administration', 'administration_id', v_admin_id),
        ARRAY[
          jsonb_build_object('item_type', 'key', 'building_id', v_building_id, 'quantity', 1, 'unit_price', 100)
        ]::jsonb[],
        false
      );

      PERFORM public.confirm_key_order(v_order_id);

      SELECT status INTO v_status FROM public.key_orders WHERE id = v_order_id;
      ASSERT v_status = 'confirmed', 'FAIL 101-S1: expected confirmed after confirm_key_order, got ' || v_status;
    END $$;
  $q$,
  'PASS 101-S1: confirm_key_order advances draft → confirmed'
);

-- ============================================================
-- Scenario 2 (PASS 101-S2): stock reservations created per item with product_id
-- ============================================================
SELECT lives_ok(
  $q$
    DO $$
    DECLARE
      v_admin_id      uuid;
      v_building_id   uuid;
      v_product_id    uuid;
      v_order_id      uuid;
      v_reserva_count int;
    BEGIN
      INSERT INTO public.administrations (company_name) VALUES ('Test 101-S2 Admin') RETURNING id INTO v_admin_id;
      INSERT INTO public.buildings (name, address, administration_id)
        VALUES ('Test 101-S2 Building', 'Calle 2', v_admin_id) RETURNING id INTO v_building_id;

      INSERT INTO public.products (name, category)
        VALUES ('Test 101-S2 Key Product', 'rfid_key') RETURNING id INTO v_product_id;

      v_order_id := public.create_key_order_with_items(
        jsonb_build_object('client_type', 'administration', 'administration_id', v_admin_id),
        ARRAY[
          jsonb_build_object(
            'item_type', 'key', 'building_id', v_building_id,
            'quantity', 1, 'unit_price', 100, 'product_id', v_product_id
          )
        ]::jsonb[],
        true
      );

      SELECT count(*) INTO v_reserva_count
        FROM public.stock_movements
       WHERE order_id = v_order_id
         AND order_kind = 'key'
         AND type = 'reserva';

      ASSERT v_reserva_count = 1, 'FAIL 101-S2: expected 1 reserva movement after confirm, got ' || v_reserva_count::text;
    END $$;
  $q$,
  'PASS 101-S2: confirm_key_order creates stock reservations for items with product_id'
);

-- ============================================================
-- Scenario 3 (PASS 101-S3): double-confirm raises KEY_ORDER_NOT_DRAFT
-- ============================================================
SELECT throws_ok(
  $q$
    DO $$
    DECLARE
      v_admin_id    uuid;
      v_building_id uuid;
      v_order_id    uuid;
    BEGIN
      INSERT INTO public.administrations (company_name) VALUES ('Test 101-S3 Admin') RETURNING id INTO v_admin_id;
      INSERT INTO public.buildings (name, address, administration_id)
        VALUES ('Test 101-S3 Building', 'Calle 3', v_admin_id) RETURNING id INTO v_building_id;

      v_order_id := public.create_key_order_with_items(
        jsonb_build_object('client_type', 'administration', 'administration_id', v_admin_id),
        ARRAY[
          jsonb_build_object('item_type', 'key', 'building_id', v_building_id, 'quantity', 1, 'unit_price', 100)
        ]::jsonb[],
        true
      );

      PERFORM public.confirm_key_order(v_order_id);
    END $$;
  $q$,
  'P0001',
  NULL,
  'PASS 101-S3: double-confirm raises KEY_ORDER_NOT_DRAFT'
);

-- ============================================================
-- Scenario 4 (PASS 101-S4): confirm non-existent order raises KEY_ORDER_NOT_FOUND
-- ============================================================
SELECT throws_ok(
  $q$ SELECT public.confirm_key_order(gen_random_uuid()); $q$,
  'P0001',
  NULL,
  'PASS 101-S4: confirm_key_order on non-existent order raises KEY_ORDER_NOT_FOUND'
);

SELECT * FROM finish();
ROLLBACK;
