-- ============================================================
-- pgTAP: record_order_key_pickup rewrite (migration 20260823000098)
-- ============================================================
-- Covers:
--   * rfid_keys_validate_pickup accepts key_orders origin via key_order_items
--   * record_order_key_pickup writes pickup fields and auto-completes the order
--   * record_order_key_pickup rejects when order status is not ready_for_pickup
--   * record_order_key_pickup rejects administration-client orders
--   * record_order_key_pickup rejects DNI mismatches
--
-- Identifier markers: PASS 114-S1 through PASS 114-S4.
-- Prerequisite: migrations 001–098 applied.
-- ============================================================

BEGIN;
SELECT plan(4);

-- ============================================================
-- Scenario 1 (PASS 114-S1): full pickup path advances the order to completed
-- ============================================================
SELECT lives_ok(
  $q$
    DO $$
    DECLARE
      v_admin_id     uuid;
      v_building_id  uuid;
      v_unit_id      uuid;
      v_part_id      uuid;
      v_order_id     uuid;
      v_item_id      uuid;
      v_key_id       uuid;
      v_order_status text;
    BEGIN
      INSERT INTO public.administrations (company_name) VALUES ('Test 114-S1 Admin') RETURNING id INTO v_admin_id;
      INSERT INTO public.buildings (name, address, administration_id)
        VALUES ('Test 114-S1 Building', 'Calle 1', v_admin_id) RETURNING id INTO v_building_id;
      INSERT INTO public.units (number, building_id)
        VALUES ('1A', v_building_id) RETURNING id INTO v_unit_id;
      INSERT INTO public.particulares (full_name, dni, unit_id)
        VALUES ('Juan Perez', '20111222', v_unit_id) RETURNING id INTO v_part_id;

      v_order_id := public.create_key_order_with_items(
        jsonb_build_object(
          'client_type', 'particular',
          'particular_id', v_part_id,
          'particular_full_name', 'Juan Perez',
          'particular_dni', '20111222'
        ),
        ARRAY[
          jsonb_build_object('item_type', 'key', 'building_id', v_building_id, 'quantity', 1, 'unit_price', 100)
        ]::jsonb[],
        true
      );

      SELECT id INTO v_item_id FROM public.key_order_items WHERE order_id = v_order_id LIMIT 1;
      v_key_id := public.configure_key_order_item(v_item_id, 'RFID-114-S1', v_unit_id, NULL);
      PERFORM public.mark_key_order_item_installed(v_item_id);

      -- Sanity: after install, order should be ready_for_pickup.
      SELECT status INTO v_order_status FROM public.key_orders WHERE id = v_order_id;
      ASSERT v_order_status = 'ready_for_pickup',
        'FAIL 114-S1 (pre): expected ready_for_pickup, got ' || v_order_status;

      PERFORM public.record_order_key_pickup(v_key_id, 'Juan', 'Perez', '20111222');

      SELECT status INTO v_order_status FROM public.key_orders WHERE id = v_order_id;
      ASSERT v_order_status = 'completed',
        'FAIL 114-S1 (post): expected completed after single-item pickup, got ' || v_order_status;
    END $$;
  $q$,
  'PASS 114-S1: record_order_key_pickup validates DNI and auto-completes the order'
);

-- ============================================================
-- Scenario 2 (PASS 114-S2): rejects pickup when order is not ready_for_pickup
-- ============================================================
SELECT throws_ok(
  $q$
    DO $$
    DECLARE
      v_admin_id     uuid;
      v_building_id  uuid;
      v_unit_id      uuid;
      v_part_id      uuid;
      v_order_id     uuid;
      v_item_id      uuid;
      v_key_id       uuid;
    BEGIN
      INSERT INTO public.administrations (company_name) VALUES ('Test 114-S2 Admin') RETURNING id INTO v_admin_id;
      INSERT INTO public.buildings (name, address, administration_id)
        VALUES ('Test 114-S2 Building', 'Calle 2', v_admin_id) RETURNING id INTO v_building_id;
      INSERT INTO public.units (number, building_id)
        VALUES ('2A', v_building_id) RETURNING id INTO v_unit_id;
      INSERT INTO public.particulares (full_name, dni, unit_id)
        VALUES ('Ana Diaz', '20222333', v_unit_id) RETURNING id INTO v_part_id;

      v_order_id := public.create_key_order_with_items(
        jsonb_build_object(
          'client_type', 'particular',
          'particular_id', v_part_id,
          'particular_full_name', 'Ana Diaz',
          'particular_dni', '20222333'
        ),
        ARRAY[
          jsonb_build_object('item_type', 'key', 'building_id', v_building_id, 'quantity', 1, 'unit_price', 100)
        ]::jsonb[],
        true
      );

      SELECT id INTO v_item_id FROM public.key_order_items WHERE order_id = v_order_id LIMIT 1;
      v_key_id := public.configure_key_order_item(v_item_id, 'RFID-114-S2', v_unit_id, NULL);
      -- Skip install → order stays in pending_installation.
      PERFORM public.record_order_key_pickup(v_key_id, 'Ana', 'Diaz', '20222333');
    END $$;
  $q$,
  'P0001',
  NULL,
  'PASS 114-S2: record_order_key_pickup rejects when order is not ready_for_pickup'
);

-- ============================================================
-- Scenario 3 (PASS 114-S3): rejects administration-client orders
-- ============================================================
SELECT throws_ok(
  $q$
    DO $$
    DECLARE
      v_admin_id     uuid;
      v_building_id  uuid;
      v_unit_id      uuid;
      v_order_id     uuid;
      v_item_id      uuid;
      v_key_id       uuid;
    BEGIN
      INSERT INTO public.administrations (company_name) VALUES ('Test 114-S3 Admin') RETURNING id INTO v_admin_id;
      INSERT INTO public.buildings (name, address, administration_id)
        VALUES ('Test 114-S3 Building', 'Calle 3', v_admin_id) RETURNING id INTO v_building_id;
      INSERT INTO public.units (number, building_id)
        VALUES ('3A', v_building_id) RETURNING id INTO v_unit_id;

      v_order_id := public.create_key_order_with_items(
        jsonb_build_object('client_type', 'administration', 'administration_id', v_admin_id),
        ARRAY[
          jsonb_build_object('item_type', 'key', 'building_id', v_building_id, 'quantity', 1, 'unit_price', 100)
        ]::jsonb[],
        true
      );

      SELECT id INTO v_item_id FROM public.key_order_items WHERE order_id = v_order_id LIMIT 1;
      v_key_id := public.configure_key_order_item(v_item_id, 'RFID-114-S3', v_unit_id, NULL);
      PERFORM public.mark_key_order_item_installed(v_item_id);
      -- Order is ready_for_pickup but client_type = 'administration' → reject.
      PERFORM public.record_order_key_pickup(v_key_id, 'Test', 'Admin', '99999999');
    END $$;
  $q$,
  'P0001',
  NULL,
  'PASS 114-S3: record_order_key_pickup rejects administration-client orders'
);

-- ============================================================
-- Scenario 4 (PASS 114-S4): validate_pickup rejects DNI mismatch
-- ============================================================
SELECT throws_ok(
  $q$
    DO $$
    DECLARE
      v_admin_id     uuid;
      v_building_id  uuid;
      v_unit_id      uuid;
      v_part_id      uuid;
      v_order_id     uuid;
      v_item_id      uuid;
      v_key_id       uuid;
    BEGIN
      INSERT INTO public.administrations (company_name) VALUES ('Test 114-S4 Admin') RETURNING id INTO v_admin_id;
      INSERT INTO public.buildings (name, address, administration_id)
        VALUES ('Test 114-S4 Building', 'Calle 4', v_admin_id) RETURNING id INTO v_building_id;
      INSERT INTO public.units (number, building_id)
        VALUES ('4A', v_building_id) RETURNING id INTO v_unit_id;
      INSERT INTO public.particulares (full_name, dni, unit_id)
        VALUES ('Luis Torres', '20333444', v_unit_id) RETURNING id INTO v_part_id;

      v_order_id := public.create_key_order_with_items(
        jsonb_build_object(
          'client_type', 'particular',
          'particular_id', v_part_id,
          'particular_full_name', 'Luis Torres',
          'particular_dni', '20333444'
        ),
        ARRAY[
          jsonb_build_object('item_type', 'key', 'building_id', v_building_id, 'quantity', 1, 'unit_price', 100)
        ]::jsonb[],
        true
      );

      SELECT id INTO v_item_id FROM public.key_order_items WHERE order_id = v_order_id LIMIT 1;
      v_key_id := public.configure_key_order_item(v_item_id, 'RFID-114-S4', v_unit_id, NULL);
      PERFORM public.mark_key_order_item_installed(v_item_id);

      -- DNI does not match the buyer nor any pickup person → validate_pickup rejects.
      PERFORM public.record_order_key_pickup(v_key_id, 'Otro', 'Nombre', '99000111');
    END $$;
  $q$,
  '23514',
  NULL,
  'PASS 114-S4: rfid_keys_validate_pickup rejects DNI mismatch (check_violation)'
);

SELECT * FROM finish();
ROLLBACK;
