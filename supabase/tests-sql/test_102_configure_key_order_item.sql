-- ============================================================
-- pgTAP: public.configure_key_order_item (key_order_items path)
-- ============================================================
-- Spec: key-orders / configure_key_order_item
-- Tests the NEW path (key_order_items) — not the legacy order_items path.
-- Prerequisite: migrations 001–095 applied.
-- Identifier markers: PASS 102-S1 through PASS 102-S4 preserved.
-- ============================================================

BEGIN;
SELECT plan(4);

-- ============================================================
-- Scenario 1 (PASS 102-S1): configuring a pending item mints an rfid_key
-- ============================================================
SELECT lives_ok(
  $q$
    DO $$
    DECLARE
      v_admin_id    uuid;
      v_building_id uuid;
      v_unit_id     uuid;
      v_order_id    uuid;
      v_item_id     uuid;
      v_key_id      uuid;
      v_item_status text;
    BEGIN
      INSERT INTO public.administrations (company_name) VALUES ('Test 102-S1 Admin') RETURNING id INTO v_admin_id;
      INSERT INTO public.buildings (name, address, administration_id)
        VALUES ('Test 102-S1 Building', 'Calle 1', v_admin_id) RETURNING id INTO v_building_id;
      INSERT INTO public.units (number, building_id)
        VALUES ('1A', v_building_id) RETURNING id INTO v_unit_id;

      v_order_id := public.create_key_order_with_items(
        jsonb_build_object('client_type', 'administration', 'administration_id', v_admin_id),
        ARRAY[
          jsonb_build_object('item_type', 'key', 'building_id', v_building_id, 'quantity', 1, 'unit_price', 100)
        ]::jsonb[],
        true
      );

      SELECT id INTO v_item_id FROM public.key_order_items WHERE order_id = v_order_id LIMIT 1;

      v_key_id := public.configure_key_order_item(v_item_id, 'RFID-102-S1', v_unit_id, NULL);

      ASSERT v_key_id IS NOT NULL, 'FAIL 102-S1: returned key_id should not be null';

      SELECT status INTO v_item_status FROM public.key_order_items WHERE id = v_item_id;
      ASSERT v_item_status = 'configured', 'FAIL 102-S1: item should be configured, got ' || v_item_status;
    END $$;
  $q$,
  'PASS 102-S1: configure_key_order_item mints rfid_key and marks item as configured'
);

-- ============================================================
-- Scenario 2 (PASS 102-S2): configuring advances order to in_progress
-- ============================================================
SELECT lives_ok(
  $q$
    DO $$
    DECLARE
      v_admin_id    uuid;
      v_building_id uuid;
      v_unit_id     uuid;
      v_order_id    uuid;
      v_item_id     uuid;
      v_order_status text;
    BEGIN
      INSERT INTO public.administrations (company_name) VALUES ('Test 102-S2 Admin') RETURNING id INTO v_admin_id;
      INSERT INTO public.buildings (name, address, administration_id)
        VALUES ('Test 102-S2 Building', 'Calle 2', v_admin_id) RETURNING id INTO v_building_id;
      INSERT INTO public.units (number, building_id)
        VALUES ('2A', v_building_id) RETURNING id INTO v_unit_id;

      -- Create with 2 items; configure 1 → should go in_progress (not ready_for_pickup)
      v_order_id := public.create_key_order_with_items(
        jsonb_build_object('client_type', 'administration', 'administration_id', v_admin_id),
        ARRAY[
          jsonb_build_object('item_type', 'key', 'building_id', v_building_id, 'quantity', 1, 'unit_price', 100),
          jsonb_build_object('item_type', 'key', 'building_id', v_building_id, 'quantity', 1, 'unit_price', 100)
        ]::jsonb[],
        true
      );

      SELECT id INTO v_item_id FROM public.key_order_items WHERE order_id = v_order_id LIMIT 1;
      PERFORM public.configure_key_order_item(v_item_id, 'RFID-102-S2A', v_unit_id, NULL);

      SELECT status INTO v_order_status FROM public.key_orders WHERE id = v_order_id;
      ASSERT v_order_status = 'in_progress',
        'FAIL 102-S2: expected in_progress after configuring 1 of 2 items, got ' || v_order_status;
    END $$;
  $q$,
  'PASS 102-S2: configuring first item of 2 advances order to in_progress'
);

-- ============================================================
-- Scenario 3 (PASS 102-S3): configuring all items advances order to pending_installation
-- ============================================================
-- Post-097: all-configured no longer jumps to ready_for_pickup. The installer
-- must first mark each item as installed via mark_key_order_item_installed.
SELECT lives_ok(
  $q$
    DO $$
    DECLARE
      v_admin_id    uuid;
      v_building_id uuid;
      v_unit_id     uuid;
      v_order_id    uuid;
      v_item_id     uuid;
      v_order_status text;
      v_idx          int := 0;
    BEGIN
      INSERT INTO public.administrations (company_name) VALUES ('Test 102-S3 Admin') RETURNING id INTO v_admin_id;
      INSERT INTO public.buildings (name, address, administration_id)
        VALUES ('Test 102-S3 Building', 'Calle 3', v_admin_id) RETURNING id INTO v_building_id;
      INSERT INTO public.units (number, building_id)
        VALUES ('3A', v_building_id) RETURNING id INTO v_unit_id;

      v_order_id := public.create_key_order_with_items(
        jsonb_build_object('client_type', 'administration', 'administration_id', v_admin_id),
        ARRAY[
          jsonb_build_object('item_type', 'key', 'building_id', v_building_id, 'quantity', 1, 'unit_price', 100),
          jsonb_build_object('item_type', 'key', 'building_id', v_building_id, 'quantity', 1, 'unit_price', 100)
        ]::jsonb[],
        true
      );

      FOR v_item_id IN SELECT id FROM public.key_order_items WHERE order_id = v_order_id LOOP
        v_idx := v_idx + 1;
        PERFORM public.configure_key_order_item(v_item_id, 'RFID-102-S3-' || v_idx::text, v_unit_id, NULL);
      END LOOP;

      SELECT status INTO v_order_status FROM public.key_orders WHERE id = v_order_id;
      ASSERT v_order_status = 'pending_installation',
        'FAIL 102-S3: expected pending_installation after all items configured, got ' || v_order_status;
    END $$;
  $q$,
  'PASS 102-S3: configuring all items advances order to pending_installation'
);

-- ============================================================
-- Scenario 4 (PASS 102-S4): configuring an already-configured item is idempotent
-- ============================================================
SELECT lives_ok(
  $q$
    DO $$
    DECLARE
      v_admin_id    uuid;
      v_building_id uuid;
      v_unit_id     uuid;
      v_order_id    uuid;
      v_item_id     uuid;
      v_key_id_1    uuid;
      v_key_id_2    uuid;
    BEGIN
      INSERT INTO public.administrations (company_name) VALUES ('Test 102-S4 Admin') RETURNING id INTO v_admin_id;
      INSERT INTO public.buildings (name, address, administration_id)
        VALUES ('Test 102-S4 Building', 'Calle 4', v_admin_id) RETURNING id INTO v_building_id;
      INSERT INTO public.units (number, building_id)
        VALUES ('4A', v_building_id) RETURNING id INTO v_unit_id;

      v_order_id := public.create_key_order_with_items(
        jsonb_build_object('client_type', 'administration', 'administration_id', v_admin_id),
        ARRAY[
          jsonb_build_object('item_type', 'key', 'building_id', v_building_id, 'quantity', 1, 'unit_price', 100)
        ]::jsonb[],
        true
      );

      SELECT id INTO v_item_id FROM public.key_order_items WHERE order_id = v_order_id LIMIT 1;

      v_key_id_1 := public.configure_key_order_item(v_item_id, 'RFID-102-S4', v_unit_id, NULL);
      -- Second call should be idempotent, returns same key
      v_key_id_2 := public.configure_key_order_item(v_item_id, 'RFID-102-S4-DUP', v_unit_id, NULL);

      ASSERT v_key_id_1 = v_key_id_2, 'FAIL 102-S4: second configure should return the same key_id (idempotent)';
    END $$;
  $q$,
  'PASS 102-S4: configure_key_order_item is idempotent on already-configured item'
);

SELECT * FROM finish();
ROLLBACK;
