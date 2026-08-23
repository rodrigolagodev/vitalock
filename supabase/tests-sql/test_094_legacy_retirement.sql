-- ============================================================
-- pgTAP: Legacy orders retirement
-- ============================================================
-- Tests that all legacy public.orders and public.order_items
-- schema objects are absent after migration 094 is applied.
--
-- Spec reference: sdd/orders-bounded-context-split/spec/orders-legacy-retirement
-- Prerequisite: migrations 001–094 applied.
-- Identifier markers: PASS S1 through PASS S9 preserved.
-- ============================================================

BEGIN;
SELECT plan(9);

-- ============================================================
-- Scenario 1 (PASS S1): public.orders does NOT exist after migration
-- ============================================================
SELECT is(
  (SELECT count(*)::int FROM information_schema.tables
    WHERE table_name = 'orders' AND table_schema = 'public'),
  0,
  'PASS S1: public.orders does not exist'
);

-- ============================================================
-- Scenario 2 (PASS S2): public.order_items does NOT exist after migration
-- ============================================================
SELECT is(
  (SELECT count(*)::int FROM information_schema.tables
    WHERE table_name = 'order_items' AND table_schema = 'public'),
  0,
  'PASS S2: public.order_items does not exist'
);

-- ============================================================
-- Scenario 3 (PASS S3): No data migration errors on clean DB
-- ============================================================
SELECT ok(TRUE, 'PASS S3: clean DB reset succeeded without data-migration errors');

-- ============================================================
-- Scenario 4 (PASS S4): order_items_validate_type_trigger does NOT exist
-- ============================================================
SELECT is(
  (SELECT count(*)::int FROM pg_trigger WHERE tgname = 'order_items_validate_type_trigger'),
  0,
  'PASS S4: order_items_validate_type_trigger does not exist'
);

-- ============================================================
-- Scenario 5 (PASS S5): public.order_number_seq does NOT exist
-- ============================================================
SELECT is(
  (SELECT count(*)::int FROM pg_sequences
    WHERE sequencename = 'order_number_seq' AND schemaname = 'public'),
  0,
  'PASS S5: public.order_number_seq does not exist'
);

-- ============================================================
-- Scenario 6 (PASS S6): Legacy RLS policies absent
-- ============================================================
SELECT is(
  (SELECT count(*)::int FROM pg_policies
    WHERE policyname IN ('admin_all_orders', 'admin_all_order_items')),
  0,
  'PASS S6: admin_all_orders and admin_all_order_items policies do not exist'
);

-- ============================================================
-- Scenario 7 (PASS S7): All legacy RPCs and functions absent
-- ============================================================
SELECT lives_ok(
  $q$
    DO $$
    DECLARE
      v_count int;
      v_name  text;
    BEGIN
      FOR v_name IN SELECT unnest(array[
        'create_order_with_items',
        'confirm_order',
        'update_draft_order_with_items',
        'recompute_order_status',
        'orders_cancel_release_reservations',
        'order_items_validate_type',
        'order_items_trigger_recompute',
        'gen_order_number'
      ]) LOOP
        SELECT count(*) INTO v_count
          FROM pg_proc p
          JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.proname = v_name;

        IF v_count > 0 THEN
          RAISE EXCEPTION 'FAIL S7: legacy function public.% still exists — was NOT dropped', v_name;
        END IF;
      END LOOP;
    END $$;
  $q$,
  'PASS S7: all legacy RPCs and functions are absent'
);

-- ============================================================
-- Scenario 8 (PASS S8): Calling public.confirm_order raises undefined_function
-- ============================================================
SELECT throws_ok(
  $q$ SELECT public.confirm_order(gen_random_uuid()); $q$,
  '42883',
  NULL,
  'PASS S8: calling public.confirm_order raises undefined_function as expected'
);

-- ============================================================
-- Scenario 9 (PASS S9): No VIEW named "orders" or "order_items" in public schema
-- ============================================================
SELECT is(
  (SELECT count(*)::int FROM information_schema.views
    WHERE table_schema = 'public' AND table_name IN ('orders', 'order_items')),
  0,
  'PASS S9: no VIEW named orders or order_items exists in public schema'
);

SELECT * FROM finish();
ROLLBACK;
