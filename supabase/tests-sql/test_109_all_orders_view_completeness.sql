-- ============================================================
-- pgTAP: public.all_orders VIEW — cross-context completeness
-- ============================================================
-- Spec: all-orders-view / UNION ALL view correctness
-- Extends test_093 with cross-context seeding and filter axes.
-- Prerequisite: migrations 001–095 applied.
-- Identifier markers: PASS 109-S1 through PASS 109-S5 preserved.
-- ============================================================

BEGIN;
SELECT plan(5);

-- ============================================================
-- Scenario 1 (PASS 109-S1): UNION ALL returns rows from both contexts, correct order_kind
-- ============================================================
SELECT lives_ok(
  $q$
    DO $$
    DECLARE
      v_admin_id_1         uuid;
      v_admin_id_2         uuid;
      v_building_id        uuid;
      v_staff_id           uuid;
      v_key_order_id       uuid;
      v_technical_order_id uuid;
      v_key_count          int;
      v_tech_count         int;
    BEGIN
      INSERT INTO public.administrations (company_name) VALUES ('Test 109-S1 KeyAdmin') RETURNING id INTO v_admin_id_1;
      INSERT INTO public.administrations (company_name) VALUES ('Test 109-S1 TechAdmin') RETURNING id INTO v_admin_id_2;
      INSERT INTO public.buildings (name, address, administration_id)
        VALUES ('Test 109-S1 Building', 'Calle 1', v_admin_id_2) RETURNING id INTO v_building_id;
      INSERT INTO identity.staff (full_name, role) VALUES ('Test 109-S1 Staff', 'installer') RETURNING id INTO v_staff_id;

      v_key_order_id := public.create_key_order_with_items(
        jsonb_build_object('client_type', 'administration', 'administration_id', v_admin_id_1),
        ARRAY[
          jsonb_build_object('item_type', 'key', 'building_id', v_building_id, 'quantity', 1, 'unit_price', 100)
        ]::jsonb[],
        false
      );

      v_technical_order_id := public.create_technical_order_with_items(
        jsonb_build_object('client_type', 'administration', 'administration_id', v_admin_id_2),
        ARRAY[
          jsonb_build_object(
            'item_type', 'installation',
            'building_id', v_building_id,
            'intended_assignee_staff_id', v_staff_id,
            'quantity', 1,
            'unit_price', 300
          )
        ]::jsonb[],
        false
      );

      SELECT count(*) INTO v_key_count
        FROM public.all_orders
       WHERE id = v_key_order_id AND order_kind = 'key';
      ASSERT v_key_count = 1, 'FAIL 109-S1: expected 1 key order in all_orders with order_kind=key, got ' || v_key_count::text;

      SELECT count(*) INTO v_tech_count
        FROM public.all_orders
       WHERE id = v_technical_order_id AND order_kind = 'technical';
      ASSERT v_tech_count = 1, 'FAIL 109-S1: expected 1 technical order in all_orders with order_kind=technical, got ' || v_tech_count::text;
    END $$;
  $q$,
  'PASS 109-S1: all_orders VIEW UNION ALL returns both key and technical orders with correct order_kind'
);

-- ============================================================
-- Scenario 2 (PASS 109-S2): order_kind filter axis works correctly
-- ============================================================
SELECT lives_ok(
  $q$
    DO $$
    DECLARE
      v_admin_id   uuid;
      v_building_id uuid;
      v_staff_id   uuid;
      v_key_id     uuid;
      v_tech_id    uuid;
      v_key_count  int;
      v_tech_count int;
    BEGIN
      INSERT INTO public.administrations (company_name) VALUES ('Test 109-S2 Admin') RETURNING id INTO v_admin_id;
      INSERT INTO public.buildings (name, address, administration_id)
        VALUES ('Test 109-S2 Building', 'Calle 2', v_admin_id) RETURNING id INTO v_building_id;
      INSERT INTO identity.staff (full_name, role) VALUES ('Test 109-S2 Staff', 'installer') RETURNING id INTO v_staff_id;

      v_key_id := public.create_key_order_with_items(
        jsonb_build_object('client_type', 'administration', 'administration_id', v_admin_id),
        ARRAY[
          jsonb_build_object('item_type', 'key', 'building_id', v_building_id, 'quantity', 1, 'unit_price', 100)
        ]::jsonb[],
        false
      );

      v_tech_id := public.create_technical_order_with_items(
        jsonb_build_object('client_type', 'administration', 'administration_id', v_admin_id),
        ARRAY[
          jsonb_build_object(
            'item_type', 'installation',
            'building_id', v_building_id,
            'intended_assignee_staff_id', v_staff_id,
            'quantity', 1,
            'unit_price', 300
          )
        ]::jsonb[],
        false
      );

      SELECT count(*) INTO v_key_count
        FROM public.all_orders
       WHERE id IN (v_key_id, v_tech_id)
         AND order_kind = 'key';

      SELECT count(*) INTO v_tech_count
        FROM public.all_orders
       WHERE id IN (v_key_id, v_tech_id)
         AND order_kind = 'technical';

      ASSERT v_key_count = 1, 'FAIL 109-S2: filter order_kind=key should return 1, got ' || v_key_count::text;
      ASSERT v_tech_count = 1, 'FAIL 109-S2: filter order_kind=technical should return 1, got ' || v_tech_count::text;
    END $$;
  $q$,
  'PASS 109-S2: all_orders order_kind filter axis returns correct subset'
);

-- ============================================================
-- Scenario 3 (PASS 109-S3): PII columns absent from VIEW
-- ============================================================
SELECT lives_ok(
  $q$
    DO $$
    DECLARE
      v_col_exists boolean := false;
      v_colname    text;
    BEGIN
      FOR v_colname IN
        SELECT column_name FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name   = 'all_orders'
           AND column_name  IN ('particular_dni', 'particular_phone', 'particular_email')
      LOOP
        v_col_exists := true;
      END LOOP;

      ASSERT NOT v_col_exists,
        'FAIL 109-S3: PII columns (particular_dni/phone/email) must not appear in all_orders VIEW';
    END $$;
  $q$,
  'PASS 109-S3: all_orders VIEW excludes PII columns (dni, phone, email)'
);

-- ============================================================
-- Scenario 4 (PASS 109-S4): status filter axis returns correct subset
-- ============================================================
SELECT lives_ok(
  $q$
    DO $$
    DECLARE
      v_admin_id    uuid;
      v_building_id uuid;
      v_staff_id    uuid;
      v_draft_id    uuid;
      v_confirmed_id uuid;
      v_draft_count int;
      v_conf_count  int;
    BEGIN
      INSERT INTO public.administrations (company_name) VALUES ('Test 109-S4 Admin') RETURNING id INTO v_admin_id;
      INSERT INTO public.buildings (name, address, administration_id)
        VALUES ('Test 109-S4 Building', 'Calle 4', v_admin_id) RETURNING id INTO v_building_id;
      INSERT INTO identity.staff (full_name, role) VALUES ('Test 109-S4 Staff', 'installer') RETURNING id INTO v_staff_id;

      v_draft_id := public.create_key_order_with_items(
        jsonb_build_object('client_type', 'administration', 'administration_id', v_admin_id),
        ARRAY[
          jsonb_build_object('item_type', 'key', 'building_id', v_building_id, 'quantity', 1, 'unit_price', 100)
        ]::jsonb[],
        false
      );

      v_confirmed_id := public.create_key_order_with_items(
        jsonb_build_object('client_type', 'administration', 'administration_id', v_admin_id),
        ARRAY[
          jsonb_build_object('item_type', 'key', 'building_id', v_building_id, 'quantity', 1, 'unit_price', 100)
        ]::jsonb[],
        true
      );

      SELECT count(*) INTO v_draft_count
        FROM public.all_orders
       WHERE id IN (v_draft_id, v_confirmed_id)
         AND status = 'draft';

      SELECT count(*) INTO v_conf_count
        FROM public.all_orders
       WHERE id IN (v_draft_id, v_confirmed_id)
         AND status = 'confirmed';

      ASSERT v_draft_count = 1, 'FAIL 109-S4: expected 1 draft order, got ' || v_draft_count::text;
      ASSERT v_conf_count = 1, 'FAIL 109-S4: expected 1 confirmed order, got ' || v_conf_count::text;
    END $$;
  $q$,
  'PASS 109-S4: all_orders status filter axis returns correct subset'
);

-- ============================================================
-- Scenario 5 (PASS 109-S5): created_at range filter axis returns correct subset
-- ============================================================
-- Closes W-2 (verify report obs #230): the all_orders VIEW spec obs #225
-- requires a created_at range filter axis; this scenario asserts the axis
-- works end-to-end via bare WHERE clauses on the view.
SELECT lives_ok(
  $q$
    DO $$
    DECLARE
      v_admin_id    uuid;
      v_building_id uuid;
      v_order_id    uuid;
      v_created_at  timestamptz;
      v_in_range    int;
      v_from_past   int;
      v_from_future int;
    BEGIN
      INSERT INTO public.administrations (company_name) VALUES ('Test 109-S5 Admin') RETURNING id INTO v_admin_id;
      INSERT INTO public.buildings (name, address, administration_id)
        VALUES ('Test 109-S5 Building', 'Calle 5', v_admin_id) RETURNING id INTO v_building_id;

      v_order_id := public.create_key_order_with_items(
        jsonb_build_object('client_type', 'administration', 'administration_id', v_admin_id),
        ARRAY[
          jsonb_build_object('item_type', 'key', 'building_id', v_building_id, 'quantity', 1, 'unit_price', 100)
        ]::jsonb[],
        false
      );

      SELECT created_at INTO v_created_at FROM public.all_orders WHERE id = v_order_id;

      -- Both bounds inclusive (window contains the order)
      SELECT count(*) INTO v_in_range
        FROM public.all_orders
       WHERE id = v_order_id
         AND created_at >= v_created_at - interval '1 second'
         AND created_at <= v_created_at + interval '1 second';
      ASSERT v_in_range = 1,
        'FAIL 109-S5: expected 1 row inside inclusive window, got ' || v_in_range::text;

      -- Only from bound in the past (order after from → included)
      SELECT count(*) INTO v_from_past
        FROM public.all_orders
       WHERE id = v_order_id
         AND created_at >= v_created_at - interval '1 hour';
      ASSERT v_from_past = 1,
        'FAIL 109-S5: expected 1 row with from bound in past, got ' || v_from_past::text;

      -- From bound in the future (order before from → excluded)
      SELECT count(*) INTO v_from_future
        FROM public.all_orders
       WHERE id = v_order_id
         AND created_at >= v_created_at + interval '1 hour';
      ASSERT v_from_future = 0,
        'FAIL 109-S5: expected 0 rows with from bound in future, got ' || v_from_future::text;
    END $$;
  $q$,
  'PASS 109-S5: all_orders created_at range filter axis returns correct subset'
);

SELECT * FROM finish();
ROLLBACK;
