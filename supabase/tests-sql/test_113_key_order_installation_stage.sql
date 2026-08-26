-- ============================================================
-- pgTAP: key_orders installation stage (migration 20260823000097)
-- ============================================================
-- Covers:
--   * key_orders.status accepts 'pending_installation'
--   * key_order_items.status accepts 'installed'
--   * recompute_key_order_status 4-lane state machine
--     - some configured, some pending → in_progress
--     - all configured, none installed → pending_installation
--     - some installed, some configured → pending_installation
--     - all installed → ready_for_pickup
--   * mark_key_order_item_installed:
--     - advances item configured → installed
--     - advances rfid_keys pending_installation → active
--     - emits 'installed' key_event
--     - rejects when item is not 'configured'
--     - is idempotent when item is already 'installed'
--
-- Identifier markers: PASS 113-S1 through PASS 113-S6.
-- Prerequisite: migrations 001–098 applied.
-- ============================================================

BEGIN;
SELECT plan(6);

-- ============================================================
-- Scenario 1 (PASS 113-S1): configuring all items advances order to pending_installation
-- ============================================================
SELECT lives_ok(
  $q$
    DO $$
    DECLARE
      v_admin_id     uuid;
      v_building_id  uuid;
      v_unit_id      uuid;
      v_order_id     uuid;
      v_item_id      uuid;
      v_order_status text;
      v_idx          int := 0;
    BEGIN
      INSERT INTO public.administrations (company_name) VALUES ('Test 113-S1 Admin') RETURNING id INTO v_admin_id;
      INSERT INTO public.buildings (name, address, administration_id)
        VALUES ('Test 113-S1 Building', 'Calle 1', v_admin_id) RETURNING id INTO v_building_id;
      INSERT INTO public.units (number, building_id)
        VALUES ('1A', v_building_id) RETURNING id INTO v_unit_id;

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
        PERFORM public.configure_key_order_item(v_item_id, 'RFID-113-S1-' || v_idx::text, v_unit_id, NULL);
      END LOOP;

      SELECT status INTO v_order_status FROM public.key_orders WHERE id = v_order_id;
      ASSERT v_order_status = 'pending_installation',
        'FAIL 113-S1: expected pending_installation after all items configured, got ' || v_order_status;
    END $$;
  $q$,
  'PASS 113-S1: configuring all items advances order to pending_installation'
);

-- ============================================================
-- Scenario 2 (PASS 113-S2): marking all items installed advances order to ready_for_pickup
-- ============================================================
SELECT lives_ok(
  $q$
    DO $$
    DECLARE
      v_admin_id     uuid;
      v_building_id  uuid;
      v_unit_id      uuid;
      v_order_id     uuid;
      v_item_id      uuid;
      v_order_status text;
      v_idx          int := 0;
    BEGIN
      INSERT INTO public.administrations (company_name) VALUES ('Test 113-S2 Admin') RETURNING id INTO v_admin_id;
      INSERT INTO public.buildings (name, address, administration_id)
        VALUES ('Test 113-S2 Building', 'Calle 2', v_admin_id) RETURNING id INTO v_building_id;
      INSERT INTO public.units (number, building_id)
        VALUES ('2A', v_building_id) RETURNING id INTO v_unit_id;

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
        PERFORM public.configure_key_order_item(v_item_id, 'RFID-113-S2-' || v_idx::text, v_unit_id, NULL);
      END LOOP;

      -- Install the first item; order should stay pending_installation.
      SELECT id INTO v_item_id FROM public.key_order_items WHERE order_id = v_order_id LIMIT 1;
      PERFORM public.mark_key_order_item_installed(v_item_id);
      SELECT status INTO v_order_status FROM public.key_orders WHERE id = v_order_id;
      ASSERT v_order_status = 'pending_installation',
        'FAIL 113-S2 (partial): expected pending_installation with mixed installed/configured, got ' || v_order_status;

      -- Install the remaining items.
      FOR v_item_id IN SELECT id FROM public.key_order_items
                        WHERE order_id = v_order_id AND status = 'configured' LOOP
        PERFORM public.mark_key_order_item_installed(v_item_id);
      END LOOP;

      SELECT status INTO v_order_status FROM public.key_orders WHERE id = v_order_id;
      ASSERT v_order_status = 'ready_for_pickup',
        'FAIL 113-S2 (all): expected ready_for_pickup after all items installed, got ' || v_order_status;
    END $$;
  $q$,
  'PASS 113-S2: mark_key_order_item_installed advances order to ready_for_pickup once every item is installed'
);

-- ============================================================
-- Scenario 3 (PASS 113-S3): mark_key_order_item_installed activates the rfid_key and emits event
-- ============================================================
SELECT lives_ok(
  $q$
    DO $$
    DECLARE
      v_admin_id     uuid;
      v_building_id  uuid;
      v_unit_id      uuid;
      v_order_id     uuid;
      v_item_id      uuid;
      v_key_id       uuid;
      v_key_status   text;
      v_event_count  int;
    BEGIN
      INSERT INTO public.administrations (company_name) VALUES ('Test 113-S3 Admin') RETURNING id INTO v_admin_id;
      INSERT INTO public.buildings (name, address, administration_id)
        VALUES ('Test 113-S3 Building', 'Calle 3', v_admin_id) RETURNING id INTO v_building_id;
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
      v_key_id := public.configure_key_order_item(v_item_id, 'RFID-113-S3', v_unit_id, NULL);

      SELECT status INTO v_key_status FROM public.rfid_keys WHERE id = v_key_id;
      ASSERT v_key_status = 'pending_installation',
        'FAIL 113-S3 (pre): expected key pending_installation, got ' || v_key_status;

      PERFORM public.mark_key_order_item_installed(v_item_id);

      SELECT status INTO v_key_status FROM public.rfid_keys WHERE id = v_key_id;
      ASSERT v_key_status = 'active',
        'FAIL 113-S3 (post): expected key active, got ' || v_key_status;

      SELECT count(*) INTO v_event_count
        FROM public.key_events
       WHERE key_id = v_key_id AND event_type = 'installed';
      ASSERT v_event_count = 1,
        'FAIL 113-S3: expected exactly 1 installed key_event, got ' || v_event_count::text;
    END $$;
  $q$,
  'PASS 113-S3: mark_key_order_item_installed activates rfid_key and emits installed event'
);

-- ============================================================
-- Scenario 4 (PASS 113-S4): mark_key_order_item_installed is idempotent
-- ============================================================
SELECT lives_ok(
  $q$
    DO $$
    DECLARE
      v_admin_id     uuid;
      v_building_id  uuid;
      v_unit_id      uuid;
      v_order_id     uuid;
      v_item_id      uuid;
      v_item_status  text;
    BEGIN
      INSERT INTO public.administrations (company_name) VALUES ('Test 113-S4 Admin') RETURNING id INTO v_admin_id;
      INSERT INTO public.buildings (name, address, administration_id)
        VALUES ('Test 113-S4 Building', 'Calle 4', v_admin_id) RETURNING id INTO v_building_id;
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
      PERFORM public.configure_key_order_item(v_item_id, 'RFID-113-S4', v_unit_id, NULL);

      PERFORM public.mark_key_order_item_installed(v_item_id);
      -- Second call should be a no-op.
      PERFORM public.mark_key_order_item_installed(v_item_id);

      SELECT status INTO v_item_status FROM public.key_order_items WHERE id = v_item_id;
      ASSERT v_item_status = 'installed',
        'FAIL 113-S4: expected item installed after idempotent double-install, got ' || v_item_status;
    END $$;
  $q$,
  'PASS 113-S4: mark_key_order_item_installed is idempotent when item is already installed'
);

-- ============================================================
-- Scenario 5 (PASS 113-S5): mark_key_order_item_installed rejects pending items
-- ============================================================
SELECT throws_ok(
  $q$
    DO $$
    DECLARE
      v_admin_id    uuid;
      v_building_id uuid;
      v_order_id    uuid;
      v_item_id     uuid;
    BEGIN
      INSERT INTO public.administrations (company_name) VALUES ('Test 113-S5 Admin') RETURNING id INTO v_admin_id;
      INSERT INTO public.buildings (name, address, administration_id)
        VALUES ('Test 113-S5 Building', 'Calle 5', v_admin_id) RETURNING id INTO v_building_id;

      v_order_id := public.create_key_order_with_items(
        jsonb_build_object('client_type', 'administration', 'administration_id', v_admin_id),
        ARRAY[
          jsonb_build_object('item_type', 'key', 'building_id', v_building_id, 'quantity', 1, 'unit_price', 100)
        ]::jsonb[],
        true
      );

      SELECT id INTO v_item_id FROM public.key_order_items WHERE order_id = v_order_id LIMIT 1;
      -- Skip configure; attempt install directly.
      PERFORM public.mark_key_order_item_installed(v_item_id);
    END $$;
  $q$,
  'P0001',
  NULL,
  'PASS 113-S5: mark_key_order_item_installed rejects items that are not configured'
);

-- ============================================================
-- Scenario 6 (PASS 113-S6): partial configure keeps order in in_progress
-- ============================================================
SELECT lives_ok(
  $q$
    DO $$
    DECLARE
      v_admin_id     uuid;
      v_building_id  uuid;
      v_unit_id      uuid;
      v_order_id     uuid;
      v_item_id      uuid;
      v_order_status text;
    BEGIN
      INSERT INTO public.administrations (company_name) VALUES ('Test 113-S6 Admin') RETURNING id INTO v_admin_id;
      INSERT INTO public.buildings (name, address, administration_id)
        VALUES ('Test 113-S6 Building', 'Calle 6', v_admin_id) RETURNING id INTO v_building_id;
      INSERT INTO public.units (number, building_id)
        VALUES ('6A', v_building_id) RETURNING id INTO v_unit_id;

      v_order_id := public.create_key_order_with_items(
        jsonb_build_object('client_type', 'administration', 'administration_id', v_admin_id),
        ARRAY[
          jsonb_build_object('item_type', 'key', 'building_id', v_building_id, 'quantity', 1, 'unit_price', 100),
          jsonb_build_object('item_type', 'key', 'building_id', v_building_id, 'quantity', 1, 'unit_price', 100)
        ]::jsonb[],
        true
      );

      SELECT id INTO v_item_id FROM public.key_order_items WHERE order_id = v_order_id LIMIT 1;
      PERFORM public.configure_key_order_item(v_item_id, 'RFID-113-S6', v_unit_id, NULL);

      SELECT status INTO v_order_status FROM public.key_orders WHERE id = v_order_id;
      ASSERT v_order_status = 'in_progress',
        'FAIL 113-S6: expected in_progress with 1 of 2 configured, got ' || v_order_status;
    END $$;
  $q$,
  'PASS 113-S6: partial configure leaves order in in_progress (unchanged from prior behavior)'
);

SELECT * FROM finish();
ROLLBACK;
