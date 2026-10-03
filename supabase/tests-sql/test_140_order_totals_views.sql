-- ============================================================
-- pgTAP: total_amount on all_orders / key_orders_summary / technical_orders_summary
-- ============================================================
-- Covers migration 20261003120000_add_total_amount_to_order_views.sql.
-- total_amount = sum(quantity * unit_price) over items whose status <> 'cancelled',
-- 0 when there are none, numeric(12,2), appended as the LAST column.
--   - mixed active + cancelled items, no items, all cancelled, zero-price maintenance
--   - all_orders returns the right total per kind
--   - last ordinal_position + numeric(12,2) on all three views
--   - security_invoker reloption preserved; grants preserved
--   - invoker RLS: a non-admin caller sees no orders through the views
-- ============================================================

BEGIN;
SELECT plan(20);

DO $$
DECLARE
  v_inst_auth_id uuid := '14011401-1401-1401-1401-140114011401';
  v_admin_id     uuid;
  v_building_id  uuid;
  v_ko_mixed     uuid;
  v_ko_empty     uuid;
  v_ko_cancelled uuid;
  v_to_mixed     uuid;
  v_to_zero      uuid;
BEGIN
  INSERT INTO auth.users (id) VALUES (v_inst_auth_id);
  INSERT INTO identity.staff (auth_user_id, full_name, role, status)
    VALUES (v_inst_auth_id, 'Test 140 Installer', 'installer', 'active');

  INSERT INTO public.administrations (company_name) VALUES ('Test 140 Client') RETURNING id INTO v_admin_id;
  INSERT INTO public.buildings (name, address, administration_id)
    VALUES ('Test 140 Building', 'Calle 140', v_admin_id) RETURNING id INTO v_building_id;

  -- key order: 1 x 100 + 2 x 50.50 active, plus a cancelled 1 x 40 -> 201.00
  INSERT INTO public.key_orders (client_type, administration_id, status)
    VALUES ('administration', v_admin_id, 'draft') RETURNING id INTO v_ko_mixed;
  INSERT INTO public.key_order_items (order_id, building_id, item_type, quantity, unit_price, status) VALUES
    (v_ko_mixed, v_building_id, 'key', 1, 100.00, 'pending'),
    (v_ko_mixed, v_building_id, 'key', 2,  50.50, 'configured'),
    (v_ko_mixed, v_building_id, 'key', 1,  40.00, 'cancelled');

  -- key order with no items -> 0
  INSERT INTO public.key_orders (client_type, administration_id, status)
    VALUES ('administration', v_admin_id, 'draft') RETURNING id INTO v_ko_empty;

  -- key order whose only item is cancelled -> 0
  INSERT INTO public.key_orders (client_type, administration_id, status)
    VALUES ('administration', v_admin_id, 'draft') RETURNING id INTO v_ko_cancelled;
  INSERT INTO public.key_order_items (order_id, building_id, item_type, quantity, unit_price, status)
    VALUES (v_ko_cancelled, v_building_id, 'key', 3, 25.00, 'cancelled');

  -- technical order: 80 active + cancelled 20 -> 80.00
  INSERT INTO public.technical_orders (client_type, administration_id, status)
    VALUES ('administration', v_admin_id, 'draft') RETURNING id INTO v_to_mixed;
  INSERT INTO public.technical_order_items (order_id, building_id, item_type, quantity, unit_price, status) VALUES
    (v_to_mixed, v_building_id, 'install_equipment',  1, 80.00, 'pending'),
    (v_to_mixed, v_building_id, 'maintain_equipment', 1, 20.00, 'cancelled');

  -- technical order with a single zero-price maintenance item -> 0
  INSERT INTO public.technical_orders (client_type, administration_id, status)
    VALUES ('administration', v_admin_id, 'draft') RETURNING id INTO v_to_zero;
  INSERT INTO public.technical_order_items (order_id, building_id, item_type, quantity, unit_price, status)
    VALUES (v_to_zero, v_building_id, 'maintain_equipment', 1, 0.00, 'pending');

  CREATE TEMP TABLE _t140 (k text primary key, v uuid) ON COMMIT DROP;
  GRANT SELECT ON _t140 TO authenticated;
  INSERT INTO _t140 VALUES
    ('ko_mixed', v_ko_mixed), ('ko_empty', v_ko_empty), ('ko_cancelled', v_ko_cancelled),
    ('to_mixed', v_to_mixed), ('to_zero', v_to_zero);
END $$;

-- ---- key_orders_summary ---------------------------------------------------
SELECT is(
  (SELECT total_amount FROM public.key_orders_summary WHERE id = (SELECT v FROM _t140 WHERE k = 'ko_mixed')),
  201.00::numeric,
  'key_orders_summary: mixed order sums active items and ignores the cancelled one'
);
SELECT is(
  (SELECT total_amount FROM public.key_orders_summary WHERE id = (SELECT v FROM _t140 WHERE k = 'ko_empty')),
  0.00::numeric,
  'key_orders_summary: order without items totals 0 (never null)'
);
SELECT is(
  (SELECT total_amount FROM public.key_orders_summary WHERE id = (SELECT v FROM _t140 WHERE k = 'ko_cancelled')),
  0.00::numeric,
  'key_orders_summary: fully cancelled order totals 0'
);

-- ---- technical_orders_summary ---------------------------------------------
SELECT is(
  (SELECT total_amount FROM public.technical_orders_summary WHERE id = (SELECT v FROM _t140 WHERE k = 'to_mixed')),
  80.00::numeric,
  'technical_orders_summary: cancelled item excluded from the total'
);
SELECT is(
  (SELECT total_amount FROM public.technical_orders_summary WHERE id = (SELECT v FROM _t140 WHERE k = 'to_zero')),
  0.00::numeric,
  'technical_orders_summary: zero-price maintenance item totals 0'
);

-- ---- all_orders (both UNION branches) --------------------------------------
SELECT is(
  (SELECT total_amount FROM public.all_orders WHERE id = (SELECT v FROM _t140 WHERE k = 'ko_mixed') AND order_kind = 'key'),
  201.00::numeric,
  'all_orders: key branch total matches the key order total'
);
SELECT is(
  (SELECT total_amount FROM public.all_orders WHERE id = (SELECT v FROM _t140 WHERE k = 'to_mixed') AND order_kind = 'technical'),
  80.00::numeric,
  'all_orders: technical branch total matches the technical order total'
);
SELECT is(
  (SELECT total_amount FROM public.all_orders WHERE id = (SELECT v FROM _t140 WHERE k = 'ko_empty')),
  0.00::numeric,
  'all_orders: order without items totals 0 (never null)'
);

-- ---- column position and type ----------------------------------------------
SELECT is(
  (SELECT a.attname::text FROM pg_attribute a
    WHERE a.attrelid = 'public.all_orders'::regclass AND a.attnum > 0 AND NOT a.attisdropped
    ORDER BY a.attnum DESC LIMIT 1),
  'total_amount',
  'all_orders: total_amount is the last column'
);
SELECT is(
  (SELECT a.attname::text FROM pg_attribute a
    WHERE a.attrelid = 'public.key_orders_summary'::regclass AND a.attnum > 0 AND NOT a.attisdropped
    ORDER BY a.attnum DESC LIMIT 1),
  'total_amount',
  'key_orders_summary: total_amount is the last column'
);
SELECT is(
  (SELECT a.attname::text FROM pg_attribute a
    WHERE a.attrelid = 'public.technical_orders_summary'::regclass AND a.attnum > 0 AND NOT a.attisdropped
    ORDER BY a.attnum DESC LIMIT 1),
  'total_amount',
  'technical_orders_summary: total_amount is the last column'
);
SELECT is(
  (SELECT format_type(a.atttypid, a.atttypmod) FROM pg_attribute a
    WHERE a.attrelid = 'public.all_orders'::regclass AND a.attname = 'total_amount'),
  'numeric(12,2)',
  'all_orders: total_amount is numeric(12,2)'
);
SELECT is(
  (SELECT format_type(a.atttypid, a.atttypmod) FROM pg_attribute a
    WHERE a.attrelid = 'public.key_orders_summary'::regclass AND a.attname = 'total_amount'),
  'numeric(12,2)',
  'key_orders_summary: total_amount is numeric(12,2)'
);
SELECT is(
  (SELECT format_type(a.atttypid, a.atttypmod) FROM pg_attribute a
    WHERE a.attrelid = 'public.technical_orders_summary'::regclass AND a.attname = 'total_amount'),
  'numeric(12,2)',
  'technical_orders_summary: total_amount is numeric(12,2)'
);

-- ---- security_invoker preserved --------------------------------------------
SELECT ok(
  (SELECT coalesce(reloptions::text[] && ARRAY['security_invoker=on', 'security_invoker=true'], false)
     FROM pg_class WHERE oid = 'public.all_orders'::regclass),
  'all_orders keeps security_invoker'
);
SELECT ok(
  (SELECT coalesce(reloptions::text[] && ARRAY['security_invoker=on', 'security_invoker=true'], false)
     FROM pg_class WHERE oid = 'public.key_orders_summary'::regclass),
  'key_orders_summary keeps security_invoker'
);
SELECT ok(
  (SELECT coalesce(reloptions::text[] && ARRAY['security_invoker=on', 'security_invoker=true'], false)
     FROM pg_class WHERE oid = 'public.technical_orders_summary'::regclass),
  'technical_orders_summary keeps security_invoker'
);

-- ---- grants preserved -------------------------------------------------------
SELECT ok(
  has_table_privilege('authenticated', 'public.all_orders', 'SELECT')
    AND NOT has_table_privilege('authenticated', 'public.all_orders', 'INSERT'),
  'all_orders: authenticated keeps SELECT and still has no INSERT'
);

-- ---- invoker RLS ------------------------------------------------------------
SET LOCAL role authenticated;
SET LOCAL request.jwt.claims TO '{"sub": "14011401-1401-1401-1401-140114011401"}';

SELECT is(
  (SELECT count(*)::int FROM public.all_orders WHERE id IN (SELECT v FROM _t140)),
  0,
  'invoker RLS: a non-admin caller sees none of the orders through all_orders'
);
SELECT is(
  (SELECT count(*)::int FROM public.key_orders_summary WHERE id IN (SELECT v FROM _t140)),
  0,
  'invoker RLS: a non-admin caller sees none of the orders through key_orders_summary'
);

SELECT * FROM finish();
ROLLBACK;
