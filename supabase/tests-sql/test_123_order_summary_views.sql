-- ============================================================
-- pgTAP: public.key_orders_summary + public.technical_orders_summary
-- ============================================================
-- Covers migration 20260830000108_order_summary_views.sql
-- (REQ-DB-ORDERS-VIEW-1.1..1.4 for each of the two views).
--
--   S1  key_orders_summary: server-side ILIKE company_name.
--   S2  key_orders_summary: building_id filter via embed.
--   S3  key_orders_summary: combined company_name + building_id.
--   S4  key_orders_summary: empty result set.
--   S5  technical_orders_summary: server-side ILIKE company_name.
--   S6  technical_orders_summary: building_id filter via embed.
--   S7  technical_orders_summary: combined company_name + building_id.
--   S8  technical_orders_summary: empty result set.
--
-- Embed filter for building_id follows the PostgREST pattern
--   ?select=*,key_order_items!inner(id)&key_order_items.building_id=eq.<B>
-- which SQL-side maps to a JOIN + WHERE against the items table.
-- ============================================================

BEGIN;
SELECT plan(8);

-- ============================================================
-- Fixtures
-- ============================================================
DO $$
DECLARE
  v_admin_sol      uuid;
  v_admin_norte    uuid;
  v_bld_1          uuid;
  v_bld_2          uuid;
  v_ko_sol_bld1    uuid;
  v_ko_norte_bld2  uuid;
  v_to_sol_bld1    uuid;
  v_to_norte_bld2  uuid;
BEGIN
  INSERT INTO public.administrations (company_name)
    VALUES ('Edificio Sol') RETURNING id INTO v_admin_sol;
  INSERT INTO public.administrations (company_name)
    VALUES ('Parque Norte') RETURNING id INTO v_admin_norte;

  INSERT INTO public.buildings (name, address, administration_id)
    VALUES ('Bld 1', 'Calle Sol 1', v_admin_sol) RETURNING id INTO v_bld_1;
  INSERT INTO public.buildings (name, address, administration_id)
    VALUES ('Bld 2', 'Calle Norte 1', v_admin_norte) RETURNING id INTO v_bld_2;

  INSERT INTO public.key_orders (client_type, administration_id, status)
    VALUES ('administration', v_admin_sol, 'draft')
    RETURNING id INTO v_ko_sol_bld1;
  INSERT INTO public.key_orders (client_type, administration_id, status)
    VALUES ('administration', v_admin_norte, 'draft')
    RETURNING id INTO v_ko_norte_bld2;

  INSERT INTO public.key_order_items (order_id, building_id, item_type, quantity, unit_price)
    VALUES (v_ko_sol_bld1, v_bld_1, 'key', 1, 100.00);
  INSERT INTO public.key_order_items (order_id, building_id, item_type, quantity, unit_price)
    VALUES (v_ko_norte_bld2, v_bld_2, 'key', 1, 100.00);

  INSERT INTO public.technical_orders (client_type, administration_id, status)
    VALUES ('administration', v_admin_sol, 'draft')
    RETURNING id INTO v_to_sol_bld1;
  INSERT INTO public.technical_orders (client_type, administration_id, status)
    VALUES ('administration', v_admin_norte, 'draft')
    RETURNING id INTO v_to_norte_bld2;

  INSERT INTO public.technical_order_items (order_id, building_id, item_type, quantity, unit_price)
    VALUES (v_to_sol_bld1, v_bld_1, 'maintenance', 1, 200.00);
  INSERT INTO public.technical_order_items (order_id, building_id, item_type, quantity, unit_price)
    VALUES (v_to_norte_bld2, v_bld_2, 'maintenance', 1, 200.00);

  CREATE TEMP TABLE _t123 (k text primary key, v uuid) ON COMMIT DROP;
  INSERT INTO _t123 VALUES
    ('admin_sol',      v_admin_sol),
    ('admin_norte',    v_admin_norte),
    ('bld_1',          v_bld_1),
    ('bld_2',          v_bld_2),
    ('ko_sol_bld1',    v_ko_sol_bld1),
    ('ko_norte_bld2',  v_ko_norte_bld2),
    ('to_sol_bld1',    v_to_sol_bld1),
    ('to_norte_bld2',  v_to_norte_bld2);
END $$;

-- ============================================================
-- S1: key_orders_summary — company_name ILIKE %sol% returns one row
-- ============================================================
SELECT is(
  (SELECT count(*)::int
     FROM public.key_orders_summary
    WHERE company_name ILIKE '%sol%'
      AND id IN ((SELECT v FROM _t123 WHERE k = 'ko_sol_bld1'),
                 (SELECT v FROM _t123 WHERE k = 'ko_norte_bld2'))),
  1,
  'PASS 123-S1: key_orders_summary ILIKE company_name filters server-side'
);

-- ============================================================
-- S2: key_orders_summary — building_id filter via items join
-- ============================================================
SELECT is(
  (SELECT count(*)::int
     FROM public.key_orders_summary v
     JOIN public.key_order_items i ON i.order_id = v.id
    WHERE i.building_id = (SELECT v FROM _t123 WHERE k = 'bld_1')
      AND v.id IN ((SELECT v FROM _t123 WHERE k = 'ko_sol_bld1'),
                   (SELECT v FROM _t123 WHERE k = 'ko_norte_bld2'))),
  1,
  'PASS 123-S2: key_orders_summary building_id filter returns matching orders only'
);

-- ============================================================
-- S3: key_orders_summary — combined company_name + building_id
-- ============================================================
SELECT is(
  (SELECT count(*)::int
     FROM public.key_orders_summary v
     JOIN public.key_order_items i ON i.order_id = v.id
    WHERE v.company_name ILIKE '%sol%'
      AND i.building_id = (SELECT v FROM _t123 WHERE k = 'bld_1')
      AND v.id IN ((SELECT v FROM _t123 WHERE k = 'ko_sol_bld1'),
                   (SELECT v FROM _t123 WHERE k = 'ko_norte_bld2'))),
  1,
  'PASS 123-S3: key_orders_summary combined filter narrows correctly'
);

-- ============================================================
-- S4: key_orders_summary — empty result set on no match
-- ============================================================
SELECT is(
  (SELECT count(*)::int
     FROM public.key_orders_summary
    WHERE company_name ILIKE '%no-such-admin-xyz%'),
  0,
  'PASS 123-S4: key_orders_summary empty result set returned as 0 rows'
);

-- ============================================================
-- S5: technical_orders_summary — company_name ILIKE %sol%
-- ============================================================
SELECT is(
  (SELECT count(*)::int
     FROM public.technical_orders_summary
    WHERE company_name ILIKE '%sol%'
      AND id IN ((SELECT v FROM _t123 WHERE k = 'to_sol_bld1'),
                 (SELECT v FROM _t123 WHERE k = 'to_norte_bld2'))),
  1,
  'PASS 123-S5: technical_orders_summary ILIKE company_name filters server-side'
);

-- ============================================================
-- S6: technical_orders_summary — building_id filter
-- ============================================================
SELECT is(
  (SELECT count(*)::int
     FROM public.technical_orders_summary v
     JOIN public.technical_order_items i ON i.order_id = v.id
    WHERE i.building_id = (SELECT v FROM _t123 WHERE k = 'bld_1')
      AND v.id IN ((SELECT v FROM _t123 WHERE k = 'to_sol_bld1'),
                   (SELECT v FROM _t123 WHERE k = 'to_norte_bld2'))),
  1,
  'PASS 123-S6: technical_orders_summary building_id filter returns matching orders only'
);

-- ============================================================
-- S7: technical_orders_summary — combined company_name + building_id
-- ============================================================
SELECT is(
  (SELECT count(*)::int
     FROM public.technical_orders_summary v
     JOIN public.technical_order_items i ON i.order_id = v.id
    WHERE v.company_name ILIKE '%sol%'
      AND i.building_id = (SELECT v FROM _t123 WHERE k = 'bld_1')
      AND v.id IN ((SELECT v FROM _t123 WHERE k = 'to_sol_bld1'),
                   (SELECT v FROM _t123 WHERE k = 'to_norte_bld2'))),
  1,
  'PASS 123-S7: technical_orders_summary combined filter narrows correctly'
);

-- ============================================================
-- S8: technical_orders_summary — empty result set
-- ============================================================
SELECT is(
  (SELECT count(*)::int
     FROM public.technical_orders_summary
    WHERE company_name ILIKE '%no-such-admin-xyz%'),
  0,
  'PASS 123-S8: technical_orders_summary empty result set returned as 0 rows'
);

SELECT * FROM finish();
ROLLBACK;
