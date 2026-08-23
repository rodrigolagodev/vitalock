-- ============================================================
-- pgTAP: public.create_key_order_with_items
-- ============================================================
-- Spec: key-orders / Atomic Create-and-Confirm RPC
-- Prerequisite: migrations 001–095 applied (pgTAP installed).
-- Identifier markers: PASS 100-S1 through PASS 100-S5 preserved.
-- ============================================================

BEGIN;
SELECT plan(5);

-- ============================================================
-- Scenario 1 (PASS 100-S1): happy path — creates key_order + key_order_items
-- ============================================================
SELECT lives_ok(
  $q$
    DO $$
    DECLARE
      v_admin_id    uuid;
      v_building_id uuid;
      v_order_id    uuid;
      v_item_count  int;
      v_status      text;
    BEGIN
      INSERT INTO public.administrations (company_name) VALUES ('Test 100-S1 Admin') RETURNING id INTO v_admin_id;
      INSERT INTO public.buildings (name, address, administration_id)
        VALUES ('Test 100-S1 Building', 'Calle 1', v_admin_id) RETURNING id INTO v_building_id;

      v_order_id := public.create_key_order_with_items(
        jsonb_build_object('client_type', 'administration', 'administration_id', v_admin_id),
        ARRAY[
          jsonb_build_object('item_type', 'key', 'building_id', v_building_id, 'quantity', 1, 'unit_price', 100)
        ]::jsonb[],
        false
      );

      ASSERT v_order_id IS NOT NULL, 'FAIL 100-S1: order_id should not be null';

      SELECT status INTO v_status FROM public.key_orders WHERE id = v_order_id;
      ASSERT v_status = 'draft', 'FAIL 100-S1: expected status=draft with p_confirm_immediately=false, got ' || v_status;

      SELECT count(*) INTO v_item_count FROM public.key_order_items WHERE order_id = v_order_id;
      ASSERT v_item_count = 1, 'FAIL 100-S1: expected 1 key_order_item, got ' || v_item_count::text;
    END $$;
  $q$,
  'PASS 100-S1: create_key_order_with_items creates order header and items in draft'
);

-- ============================================================
-- Scenario 2 (PASS 100-S2): quantity > 1 explodes into N items
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
      INSERT INTO public.administrations (company_name) VALUES ('Test 100-S2 Admin') RETURNING id INTO v_admin_id;
      INSERT INTO public.buildings (name, address, administration_id)
        VALUES ('Test 100-S2 Building', 'Calle 2', v_admin_id) RETURNING id INTO v_building_id;

      v_order_id := public.create_key_order_with_items(
        jsonb_build_object('client_type', 'administration', 'administration_id', v_admin_id),
        ARRAY[
          jsonb_build_object('item_type', 'key', 'building_id', v_building_id, 'quantity', 3, 'unit_price', 50)
        ]::jsonb[],
        false
      );

      SELECT count(*) INTO v_item_count FROM public.key_order_items WHERE order_id = v_order_id;
      ASSERT v_item_count = 3, 'FAIL 100-S2: expected 3 items from quantity=3, got ' || v_item_count::text;

      ASSERT (SELECT bool_and(quantity = 1) FROM public.key_order_items WHERE order_id = v_order_id),
        'FAIL 100-S2: all exploded items should have quantity=1';
    END $$;
  $q$,
  'PASS 100-S2: quantity > 1 explodes into N items of quantity=1'
);

-- ============================================================
-- Scenario 3 (PASS 100-S3): invalid item_type raises error
-- ============================================================
SELECT throws_ok(
  $q$
    DO $$
    DECLARE
      v_admin_id    uuid;
      v_building_id uuid;
    BEGIN
      INSERT INTO public.administrations (company_name) VALUES ('Test 100-S3 Admin') RETURNING id INTO v_admin_id;
      INSERT INTO public.buildings (name, address, administration_id)
        VALUES ('Test 100-S3 Building', 'Calle 3', v_admin_id) RETURNING id INTO v_building_id;

      PERFORM public.create_key_order_with_items(
        jsonb_build_object('client_type', 'administration', 'administration_id', v_admin_id),
        ARRAY[
          jsonb_build_object('item_type', 'equipment', 'building_id', v_building_id, 'quantity', 1, 'unit_price', 100)
        ]::jsonb[],
        false
      );
    END $$;
  $q$,
  'P0001',
  NULL,
  'PASS 100-S3: item_type != key raises KEY_ORDER_INVALID_ITEM_TYPE'
);

-- ============================================================
-- Scenario 4 (PASS 100-S4): p_confirm_immediately=true → status=confirmed
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
      INSERT INTO public.administrations (company_name) VALUES ('Test 100-S4 Admin') RETURNING id INTO v_admin_id;
      INSERT INTO public.buildings (name, address, administration_id)
        VALUES ('Test 100-S4 Building', 'Calle 4', v_admin_id) RETURNING id INTO v_building_id;

      v_order_id := public.create_key_order_with_items(
        jsonb_build_object('client_type', 'administration', 'administration_id', v_admin_id),
        ARRAY[
          jsonb_build_object('item_type', 'key', 'building_id', v_building_id, 'quantity', 1, 'unit_price', 100)
        ]::jsonb[],
        true
      );

      SELECT status INTO v_status FROM public.key_orders WHERE id = v_order_id;
      ASSERT v_status = 'confirmed', 'FAIL 100-S4: expected status=confirmed with p_confirm_immediately=true, got ' || v_status;
    END $$;
  $q$,
  'PASS 100-S4: p_confirm_immediately=true produces status=confirmed'
);

-- ============================================================
-- Scenario 5 (PASS 100-S5): unit_price missing raises error
-- ============================================================
SELECT throws_ok(
  $q$
    DO $$
    DECLARE
      v_admin_id    uuid;
      v_building_id uuid;
    BEGIN
      INSERT INTO public.administrations (company_name) VALUES ('Test 100-S5 Admin') RETURNING id INTO v_admin_id;
      INSERT INTO public.buildings (name, address, administration_id)
        VALUES ('Test 100-S5 Building', 'Calle 5', v_admin_id) RETURNING id INTO v_building_id;

      PERFORM public.create_key_order_with_items(
        jsonb_build_object('client_type', 'administration', 'administration_id', v_admin_id),
        ARRAY[
          jsonb_build_object('item_type', 'key', 'building_id', v_building_id, 'quantity', 1)
        ]::jsonb[],
        false
      );
    END $$;
  $q$,
  'P0001',
  NULL,
  'PASS 100-S5: missing unit_price raises KEY_ORDER_PRICE_REQUIRED'
);

SELECT * FROM finish();
ROLLBACK;
