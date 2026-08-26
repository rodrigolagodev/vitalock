-- ============================================================
-- pgTAP: record_order_key_pickup admin-client support (migration 20260823000099)
-- ============================================================
-- Covers the fix for orders with client_type='administration' being trapped
-- in ready_for_pickup with no path to completion. After migration 099, the
-- RPC no longer rejects admin orders. Validation still requires that at
-- least one authorized particular (via key_order_items.pickup_particular_id
-- or key_orders.pickup_particular_id) can sign the pickup — same rule as
-- for particular-client orders.
--
-- Scenarios:
--   S1: admin order with per-item pickup_particular_id completes on pickup
--   S2: admin order with no authorized particular is rejected by
--       rfid_keys_validate_pickup ("requires an authorized particular")
--
-- Order-level pickup_particular_id is not exercised here because
-- create_key_order_with_items only persists it at the item level; a
-- separate follow-up is needed to plumb it through the order-level input.
--
-- Identifier markers: PASS 115-S1 through PASS 115-S2.
-- Prerequisite: migrations 001–099 applied.
-- ============================================================

BEGIN;
SELECT plan(2);

-- ============================================================
-- Scenario 1 (PASS 115-S1): admin order with per-item pickup completes
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
      INSERT INTO public.administrations (company_name) VALUES ('Test 115-S1 Admin') RETURNING id INTO v_admin_id;
      INSERT INTO public.buildings (name, address, administration_id)
        VALUES ('Test 115-S1 Building', 'Calle 1', v_admin_id) RETURNING id INTO v_building_id;
      INSERT INTO public.units (number, building_id)
        VALUES ('1A', v_building_id) RETURNING id INTO v_unit_id;
      INSERT INTO public.particulares (full_name, dni, unit_id)
        VALUES ('Encargado Consorcio', '30111222', v_unit_id) RETURNING id INTO v_part_id;

      v_order_id := public.create_key_order_with_items(
        jsonb_build_object('client_type', 'administration', 'administration_id', v_admin_id),
        ARRAY[
          jsonb_build_object(
            'item_type', 'key',
            'building_id', v_building_id,
            'quantity', 1,
            'unit_price', 100,
            'pickup_particular_id', v_part_id
          )
        ]::jsonb[],
        true
      );

      SELECT id INTO v_item_id FROM public.key_order_items WHERE order_id = v_order_id LIMIT 1;
      v_key_id := public.configure_key_order_item(v_item_id, 'RFID-115-S1', v_unit_id, NULL);
      PERFORM public.mark_key_order_item_installed(v_item_id);

      SELECT status INTO v_order_status FROM public.key_orders WHERE id = v_order_id;
      ASSERT v_order_status = 'ready_for_pickup',
        'FAIL 115-S1 (pre): expected ready_for_pickup, got ' || v_order_status;

      PERFORM public.record_order_key_pickup(v_key_id, 'Encargado', 'Consorcio', '30111222');

      SELECT status INTO v_order_status FROM public.key_orders WHERE id = v_order_id;
      ASSERT v_order_status = 'completed',
        'FAIL 115-S1 (post): expected completed after admin pickup, got ' || v_order_status;
    END $$;
  $q$,
  'PASS 115-S1: admin order with per-item pickup_particular completes on pickup'
);

-- ============================================================
-- Scenario 2 (PASS 115-S2): admin with no authorized particular is rejected
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
      INSERT INTO public.administrations (company_name) VALUES ('Test 115-S2 Admin') RETURNING id INTO v_admin_id;
      INSERT INTO public.buildings (name, address, administration_id)
        VALUES ('Test 115-S2 Building', 'Calle 2', v_admin_id) RETURNING id INTO v_building_id;
      INSERT INTO public.units (number, building_id)
        VALUES ('2A', v_building_id) RETURNING id INTO v_unit_id;

      v_order_id := public.create_key_order_with_items(
        jsonb_build_object('client_type', 'administration', 'administration_id', v_admin_id),
        ARRAY[
          jsonb_build_object('item_type', 'key', 'building_id', v_building_id, 'quantity', 1, 'unit_price', 100)
        ]::jsonb[],
        true
      );

      SELECT id INTO v_item_id FROM public.key_order_items WHERE order_id = v_order_id LIMIT 1;
      v_key_id := public.configure_key_order_item(v_item_id, 'RFID-115-S2', v_unit_id, NULL);
      PERFORM public.mark_key_order_item_installed(v_item_id);

      -- No pickup_particular anywhere → validate_pickup rejects.
      PERFORM public.record_order_key_pickup(v_key_id, 'Alguien', 'Sin', '99000111');
    END $$;
  $q$,
  '23514',
  NULL,
  'PASS 115-S2: admin without authorized particular is rejected by validate_pickup'
);

SELECT * FROM finish();
ROLLBACK;
