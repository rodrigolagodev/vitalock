-- ============================================================
-- pgTAP: RLS policies on key_orders / technical_orders / all_orders (W-1)
-- ============================================================
-- Closes W-1 from verify report obs #230. Prior scaffold had no auth
-- context; RLS requirements in spec obs #219 / #220 / #225 were
-- unverified. This file exercises the admin-only policies via
-- role-switching + JWT-claim impersonation inside a rolled-back tx.
--
-- Approach:
--   - Seed one admin staff row linked to auth.users(id=admin-uuid)
--   - Seed one non-admin staff row linked to auth.users(id=user-uuid)
--   - Seed one key_order + one technical_order as postgres (bypasses RLS)
--   - SET LOCAL role authenticated + SET LOCAL request.jwt.claims to
--     simulate each identity; SELECT and assert visibility.
--
-- identity.is_admin() reads auth.uid() (from JWT claim 'sub') and joins
-- identity.staff. The postgres/superuser role bypasses RLS, so tests
-- must run under the 'authenticated' role to see policy behavior.
--
-- Prerequisite: migrations 001–095 applied.
-- Identifier markers: PASS 112-S1 through PASS 112-S3 preserved.
-- ============================================================

BEGIN;
SELECT plan(3);

-- ============================================================
-- Shared fixtures for all scenarios (created as postgres/superuser)
-- ============================================================
DO $$
DECLARE
  v_admin_auth_id uuid := '11111111-1111-1111-1111-111111111111';
  v_user_auth_id  uuid := '22222222-2222-2222-2222-222222222222';
  v_admin_org_id  uuid;
  v_building_id   uuid;
  v_key_order_id  uuid;
  v_tech_order_id uuid;
BEGIN
  -- auth.users rows (only id is NOT NULL in Supabase auth schema).
  INSERT INTO auth.users (id) VALUES (v_admin_auth_id), (v_user_auth_id);

  -- Staff: one admin, one non-admin (installer).
  INSERT INTO identity.staff (auth_user_id, full_name, role, status)
    VALUES (v_admin_auth_id, 'Test 112 Admin', 'admin', 'active');
  INSERT INTO identity.staff (auth_user_id, full_name, role, status)
    VALUES (v_user_auth_id, 'Test 112 Installer', 'installer', 'active');

  -- Seed one key_order + one technical_order + parent admin/building.
  INSERT INTO public.administrations (company_name) VALUES ('Test 112 Client') RETURNING id INTO v_admin_org_id;
  INSERT INTO public.buildings (name, address, administration_id)
    VALUES ('Test 112 Building', 'Calle 1', v_admin_org_id) RETURNING id INTO v_building_id;

  v_key_order_id := public.create_key_order_with_items(
    jsonb_build_object('client_type', 'administration', 'administration_id', v_admin_org_id),
    ARRAY[
      jsonb_build_object('item_type', 'key', 'building_id', v_building_id, 'quantity', 1, 'unit_price', 100)
    ]::jsonb[],
    false
  );

  v_tech_order_id := public.create_technical_order_with_items(
    jsonb_build_object('client_type', 'administration', 'administration_id', v_admin_org_id),
    ARRAY[
      jsonb_build_object('item_type', 'installation', 'building_id', v_building_id,
                         'quantity', 1, 'unit_price', 300)
    ]::jsonb[],
    false
  );
END $$;

-- ============================================================
-- Scenario 1 (PASS 112-S1): anon (no JWT sub) sees zero rows
-- ============================================================
-- Empty JWT claims → auth.uid() is null → is_admin() returns false →
-- admin-only policy filters everything out.
SELECT lives_ok(
  $q$
    DO $$
    DECLARE
      v_key_count  int;
      v_tech_count int;
      v_all_count  int;
    BEGIN
      SET LOCAL role authenticated;
      SET LOCAL request.jwt.claims TO '{}';

      SELECT count(*) INTO v_key_count  FROM public.key_orders;
      SELECT count(*) INTO v_tech_count FROM public.technical_orders;
      SELECT count(*) INTO v_all_count  FROM public.all_orders;

      RESET role;

      ASSERT v_key_count  = 0, 'FAIL 112-S1: anon should see 0 key_orders, saw ' || v_key_count::text;
      ASSERT v_tech_count = 0, 'FAIL 112-S1: anon should see 0 technical_orders, saw ' || v_tech_count::text;
      ASSERT v_all_count  = 0, 'FAIL 112-S1: anon should see 0 all_orders rows, saw ' || v_all_count::text;
    END $$;
  $q$,
  'PASS 112-S1: anon (empty JWT) sees zero rows in key_orders, technical_orders, all_orders'
);

-- ============================================================
-- Scenario 2 (PASS 112-S2): authenticated non-admin sees zero rows
-- ============================================================
-- Valid sub claim but staff.role='installer' → is_admin() false → filtered.
SELECT lives_ok(
  $q$
    DO $$
    DECLARE
      v_key_count  int;
      v_tech_count int;
      v_all_count  int;
    BEGIN
      SET LOCAL role authenticated;
      SET LOCAL request.jwt.claims TO '{"sub": "22222222-2222-2222-2222-222222222222"}';

      SELECT count(*) INTO v_key_count  FROM public.key_orders;
      SELECT count(*) INTO v_tech_count FROM public.technical_orders;
      SELECT count(*) INTO v_all_count  FROM public.all_orders;

      RESET role;

      ASSERT v_key_count  = 0, 'FAIL 112-S2: installer should see 0 key_orders, saw ' || v_key_count::text;
      ASSERT v_tech_count = 0, 'FAIL 112-S2: installer should see 0 technical_orders, saw ' || v_tech_count::text;
      ASSERT v_all_count  = 0, 'FAIL 112-S2: installer should see 0 all_orders rows, saw ' || v_all_count::text;
    END $$;
  $q$,
  'PASS 112-S2: authenticated non-admin (installer) sees zero rows in the three surfaces'
);

-- ============================================================
-- Scenario 3 (PASS 112-S3): authenticated admin sees the seeded rows
-- ============================================================
-- sub claim matches admin staff.auth_user_id → is_admin() true → policy passes.
SELECT lives_ok(
  $q$
    DO $$
    DECLARE
      v_key_count  int;
      v_tech_count int;
      v_all_count  int;
    BEGIN
      SET LOCAL role authenticated;
      SET LOCAL request.jwt.claims TO '{"sub": "11111111-1111-1111-1111-111111111111"}';

      SELECT count(*) INTO v_key_count  FROM public.key_orders  WHERE order_number LIKE 'ORD-LLV-%';
      SELECT count(*) INTO v_tech_count FROM public.technical_orders WHERE order_number LIKE 'ORD-TEC-%';
      SELECT count(*) INTO v_all_count  FROM public.all_orders  WHERE order_number LIKE 'ORD-%';

      RESET role;

      ASSERT v_key_count  >= 1, 'FAIL 112-S3: admin should see >=1 key_order, saw ' || v_key_count::text;
      ASSERT v_tech_count >= 1, 'FAIL 112-S3: admin should see >=1 technical_order, saw ' || v_tech_count::text;
      ASSERT v_all_count  >= 2, 'FAIL 112-S3: admin should see >=2 all_orders rows, saw ' || v_all_count::text;
    END $$;
  $q$,
  'PASS 112-S3: authenticated admin sees seeded rows across key_orders, technical_orders, all_orders'
);

SELECT * FROM finish();
ROLLBACK;
