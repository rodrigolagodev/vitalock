-- ============================================================
-- pgTAP: table-level CHECK constraint violations (W-4)
-- ============================================================
-- Closes W-4 from verify report obs #230. RPC-driven negative-path tests
-- (test_100..test_108) exercise validation errors via RAISE EXCEPTION,
-- but bare INSERT → CHECK violation paths were never asserted directly.
-- These scenarios validate the domain constraints on:
--   - key_orders_client_consistency
--   - technical_orders_client_consistency
--   - technical_orders.status (excludes 'ready_for_pickup')
--   - key_order_items.item_type (must be 'key')
--   - technical_order_items.item_type (4-value domain)
-- All CHECK violations surface as SQLSTATE 23514 (check_violation).
-- Prerequisite: migrations 001–095 applied.
-- Identifier markers: PASS 111-S1 through PASS 111-S5 preserved.
-- ============================================================

BEGIN;
SELECT plan(5);

-- ============================================================
-- Scenario 1 (PASS 111-S1): key_orders_client_consistency rejects mixed fields
-- ============================================================
-- client_type='administration' with particular_full_name populated must fail.
SELECT throws_ok(
  $q$
    DO $$
    DECLARE
      v_admin_id uuid;
    BEGIN
      INSERT INTO public.administrations (company_name) VALUES ('Test 111-S1 Admin') RETURNING id INTO v_admin_id;
      INSERT INTO public.key_orders (
        client_type, administration_id, particular_full_name
      ) VALUES (
        'administration', v_admin_id, 'Should Not Be Here'
      );
    END $$;
  $q$,
  '23514',
  NULL,
  'PASS 111-S1: key_orders_client_consistency rejects administration + particular_full_name'
);

-- ============================================================
-- Scenario 2 (PASS 111-S2): technical_orders_client_consistency rejects mixed fields
-- ============================================================
SELECT throws_ok(
  $q$
    DO $$
    DECLARE
      v_admin_id uuid;
    BEGIN
      INSERT INTO public.administrations (company_name) VALUES ('Test 111-S2 Admin') RETURNING id INTO v_admin_id;
      INSERT INTO public.technical_orders (
        client_type, administration_id, particular_full_name
      ) VALUES (
        'administration', v_admin_id, 'Should Not Be Here'
      );
    END $$;
  $q$,
  '23514',
  NULL,
  'PASS 111-S2: technical_orders_client_consistency rejects administration + particular_full_name'
);

-- ============================================================
-- Scenario 3 (PASS 111-S3): technical_orders.status excludes 'ready_for_pickup'
-- ============================================================
-- technical orders do NOT use the key-pickup flow — the status domain must
-- exclude 'ready_for_pickup' even on direct INSERT.
SELECT throws_ok(
  $q$
    DO $$
    DECLARE
      v_admin_id uuid;
    BEGIN
      INSERT INTO public.administrations (company_name) VALUES ('Test 111-S3 Admin') RETURNING id INTO v_admin_id;
      INSERT INTO public.technical_orders (
        client_type, administration_id, status
      ) VALUES (
        'administration', v_admin_id, 'ready_for_pickup'
      );
    END $$;
  $q$,
  '23514',
  NULL,
  'PASS 111-S3: technical_orders.status CHECK rejects ready_for_pickup on direct INSERT'
);

-- ============================================================
-- Scenario 4 (PASS 111-S4): key_order_items.item_type must be 'key'
-- ============================================================
SELECT throws_ok(
  $q$
    DO $$
    DECLARE
      v_admin_id    uuid;
      v_building_id uuid;
      v_order_id    uuid;
    BEGIN
      INSERT INTO public.administrations (company_name) VALUES ('Test 111-S4 Admin') RETURNING id INTO v_admin_id;
      INSERT INTO public.buildings (name, address, administration_id)
        VALUES ('Test 111-S4 Building', 'Calle 4', v_admin_id) RETURNING id INTO v_building_id;
      INSERT INTO public.key_orders (
        client_type, administration_id
      ) VALUES (
        'administration', v_admin_id
      ) RETURNING id INTO v_order_id;

      INSERT INTO public.key_order_items (
        order_id, item_type, building_id, quantity, unit_price
      ) VALUES (
        v_order_id, 'maintenance', v_building_id, 1, 100
      );
    END $$;
  $q$,
  '23514',
  NULL,
  'PASS 111-S4: key_order_items.item_type CHECK rejects non-key value'
);

-- ============================================================
-- Scenario 5 (PASS 111-S5): technical_order_items.item_type domain
-- ============================================================
SELECT throws_ok(
  $q$
    DO $$
    DECLARE
      v_admin_id    uuid;
      v_building_id uuid;
      v_order_id    uuid;
    BEGIN
      INSERT INTO public.administrations (company_name) VALUES ('Test 111-S5 Admin') RETURNING id INTO v_admin_id;
      INSERT INTO public.buildings (name, address, administration_id)
        VALUES ('Test 111-S5 Building', 'Calle 5', v_admin_id) RETURNING id INTO v_building_id;
      INSERT INTO public.technical_orders (
        client_type, administration_id
      ) VALUES (
        'administration', v_admin_id
      ) RETURNING id INTO v_order_id;

      INSERT INTO public.technical_order_items (
        order_id, item_type, building_id, quantity, unit_price
      ) VALUES (
        v_order_id, 'key', v_building_id, 1, 100
      );
    END $$;
  $q$,
  '23514',
  NULL,
  'PASS 111-S5: technical_order_items.item_type CHECK rejects value outside 4-type domain'
);

SELECT * FROM finish();
ROLLBACK;
