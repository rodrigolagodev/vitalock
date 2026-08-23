-- ============================================================
-- pgTAP: public.cancel_key_order
-- ============================================================
-- Spec: key-orders / Key Orders State Machine (cancel path)
-- Prerequisite: migrations 001–095 applied.
-- Identifier markers: PASS 103-S1 through PASS 103-S4 preserved.
-- ============================================================

BEGIN;
SELECT plan(4);

-- ============================================================
-- Scenario 1 (PASS 103-S1): cancel_key_order sets status=cancelled
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
      INSERT INTO public.administrations (company_name) VALUES ('Test 103-S1 Admin') RETURNING id INTO v_admin_id;
      INSERT INTO public.buildings (name, address, administration_id)
        VALUES ('Test 103-S1 Building', 'Calle 1', v_admin_id) RETURNING id INTO v_building_id;

      v_order_id := public.create_key_order_with_items(
        jsonb_build_object('client_type', 'administration', 'administration_id', v_admin_id),
        ARRAY[
          jsonb_build_object('item_type', 'key', 'building_id', v_building_id, 'quantity', 1, 'unit_price', 100)
        ]::jsonb[],
        true
      );

      PERFORM public.cancel_key_order(v_order_id);

      SELECT status INTO v_status FROM public.key_orders WHERE id = v_order_id;
      ASSERT v_status = 'cancelled', 'FAIL 103-S1: expected cancelled, got ' || v_status;
    END $$;
  $q$,
  'PASS 103-S1: cancel_key_order sets status to cancelled'
);

-- ============================================================
-- Scenario 2 (PASS 103-S2): cancel releases stock reservations
-- ============================================================
SELECT lives_ok(
  $q$
    DO $$
    DECLARE
      v_admin_id     uuid;
      v_building_id  uuid;
      v_product_id   uuid;
      v_order_id     uuid;
      v_lib_count    int;
    BEGIN
      INSERT INTO public.administrations (company_name) VALUES ('Test 103-S2 Admin') RETURNING id INTO v_admin_id;
      INSERT INTO public.buildings (name, address, administration_id)
        VALUES ('Test 103-S2 Building', 'Calle 2', v_admin_id) RETURNING id INTO v_building_id;
      INSERT INTO public.products (name, category, stock_total, stock_reservado)
        VALUES ('Test 103-S2 Product', 'rfid_key', 10, 0) RETURNING id INTO v_product_id;

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

      PERFORM public.cancel_key_order(v_order_id);

      SELECT count(*) INTO v_lib_count
        FROM public.stock_movements
       WHERE order_id = v_order_id
         AND order_kind = 'key'
         AND type = 'liberacion_reserva';

      ASSERT v_lib_count >= 1,
        'FAIL 103-S2: expected at least 1 liberacion_reserva after cancel, got ' || v_lib_count::text;
    END $$;
  $q$,
  'PASS 103-S2: cancel_key_order releases stock reservations via liberacion_reserva'
);

-- ============================================================
-- Scenario 3 (PASS 103-S3): cancel also cancels pending items
-- ============================================================
SELECT lives_ok(
  $q$
    DO $$
    DECLARE
      v_admin_id    uuid;
      v_building_id uuid;
      v_order_id    uuid;
      v_item_count  int;
    BEGIN
      INSERT INTO public.administrations (company_name) VALUES ('Test 103-S3 Admin') RETURNING id INTO v_admin_id;
      INSERT INTO public.buildings (name, address, administration_id)
        VALUES ('Test 103-S3 Building', 'Calle 3', v_admin_id) RETURNING id INTO v_building_id;

      v_order_id := public.create_key_order_with_items(
        jsonb_build_object('client_type', 'administration', 'administration_id', v_admin_id),
        ARRAY[
          jsonb_build_object('item_type', 'key', 'building_id', v_building_id, 'quantity', 2, 'unit_price', 100)
        ]::jsonb[],
        true
      );

      PERFORM public.cancel_key_order(v_order_id);

      SELECT count(*) INTO v_item_count
        FROM public.key_order_items
       WHERE order_id = v_order_id
         AND status = 'cancelled';

      ASSERT v_item_count = 2, 'FAIL 103-S3: expected 2 cancelled items after cancel, got ' || v_item_count::text;
    END $$;
  $q$,
  'PASS 103-S3: cancel_key_order cascades cancel to all pending items'
);

-- ============================================================
-- Scenario 4 (PASS 103-S4): cancelling an already-cancelled order raises
-- ============================================================
SELECT throws_ok(
  $q$
    DO $$
    DECLARE
      v_admin_id    uuid;
      v_building_id uuid;
      v_order_id    uuid;
    BEGIN
      INSERT INTO public.administrations (company_name) VALUES ('Test 103-S4 Admin') RETURNING id INTO v_admin_id;
      INSERT INTO public.buildings (name, address, administration_id)
        VALUES ('Test 103-S4 Building', 'Calle 4', v_admin_id) RETURNING id INTO v_building_id;

      v_order_id := public.create_key_order_with_items(
        jsonb_build_object('client_type', 'administration', 'administration_id', v_admin_id),
        ARRAY[
          jsonb_build_object('item_type', 'key', 'building_id', v_building_id, 'quantity', 1, 'unit_price', 100)
        ]::jsonb[],
        true
      );

      PERFORM public.cancel_key_order(v_order_id);
      PERFORM public.cancel_key_order(v_order_id);
    END $$;
  $q$,
  'P0001',
  NULL,
  'PASS 103-S4: double-cancel raises KEY_ORDER_TERMINAL_STATE'
);

SELECT * FROM finish();
ROLLBACK;
