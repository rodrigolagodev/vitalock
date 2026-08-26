-- ============================================================
-- pgTAP: public.equipment_inventory VIEW (Slice 2 / admin-navigation-object-model)
-- ============================================================
-- Verifies that public.equipment_inventory is a SECURITY INVOKER VIEW that
-- correctly pre-joins operations.equipment → buildings → administrations,
-- aggregates active key_authorizations (sync_state='installed', removed_at IS NULL)
-- into key_count (int), key_ids (uuid[]), and key_labels (text[]).
--
-- RLS model: Vitalock admin app is single-tenant. All authenticated users are
-- Vitalock staff with full-system access. RLS boundary = authenticated vs anon only.
-- There is NO per-administration tenancy.
--
-- Test scenarios:
--   116-S1  VIEW exists, is a VIEW, has security_invoker = on
--   116-S2  Column set + types match contract (key_ids uuid[], key_labels text[])
--   116-S3  GRANT SELECT to authenticated; INSERT/UPDATE/DELETE revoked
--   116-S4  Authenticated staff sees all equipment (count matches base table)
--   116-S5  Anon (empty JWT) sees zero rows, no error
--   116-S6  Equipment with 0 active key_authorizations → key_count=0, key_ids='{}'::uuid[]
--   116-S7  Equipment with 2 active key_authorizations → key_count=2, both key_ids present
--   116-S8  Equipment with pending_install authorizations only → key_count=0
--   116-S9  Equipment with 1 removed + 1 installed authorization → key_count=1
--
-- Note on composite record checks: use FOUND after SELECT INTO rather than
-- "record IS NOT NULL" — a composite evaluates to false when ANY field is null.
--
-- Prerequisite: migrations 001–100 applied (including 20260824000100).
-- ============================================================

BEGIN;
SELECT plan(9);

-- ============================================================
-- Shared fixtures (created as postgres/superuser, bypasses RLS)
-- ============================================================
DO $$
DECLARE
  v_admin_auth_id  uuid := 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  v_admin_org_id   uuid;
  v_building_id    uuid;
  v_unit_id        uuid;
BEGIN
  -- auth.users + staff (admin role — required for is_admin() to return true)
  INSERT INTO auth.users (id) VALUES (v_admin_auth_id);
  INSERT INTO identity.staff (auth_user_id, full_name, role, status)
    VALUES (v_admin_auth_id, 'Test 116 Admin', 'admin', 'active');

  -- Administration → Building → Unit chain (shared by all scenarios)
  INSERT INTO public.administrations (company_name)
    VALUES ('Test 116 Admin Corp') RETURNING id INTO v_admin_org_id;
  INSERT INTO public.buildings (name, address, administration_id)
    VALUES ('Test 116 Building', 'Av. Test 116', v_admin_org_id) RETURNING id INTO v_building_id;
  INSERT INTO public.units (number, building_id)
    VALUES ('1A-116', v_building_id) RETURNING id INTO v_unit_id;
END $$;

-- ============================================================
-- Scenario 1 (PASS 116-S1): VIEW exists, is a VIEW, security_invoker = on
-- ============================================================
SELECT lives_ok(
  $q$
    DO $$
    DECLARE
      v_relkind  char;
      v_sec_inv  boolean;
    BEGIN
      SELECT relkind INTO v_relkind
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relname = 'equipment_inventory';
      ASSERT v_relkind = 'v',
        'FAIL 116-S1: equipment_inventory not found or is not a VIEW (relkind=' ||
        coalesce(v_relkind::text, 'NULL') || ')';

      SELECT (reloptions @> ARRAY['security_invoker=on']) INTO v_sec_inv
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relname = 'equipment_inventory';
      ASSERT v_sec_inv = true,
        'FAIL 116-S1: equipment_inventory does not have security_invoker=on';
    END $$;
  $q$,
  'PASS 116-S1: equipment_inventory VIEW exists and has security_invoker=on'
);

-- ============================================================
-- Scenario 2 (PASS 116-S2): Column set + types match contract
-- ============================================================
SELECT lives_ok(
  $q$
    DO $$
    DECLARE
      v_required text[][] := ARRAY[
        ARRAY['id',                        'uuid'],
        ARRAY['serial_number',             'text'],
        ARRAY['model',                     'text'],
        ARRAY['status',                    'text'],
        ARRAY['access_type',               'text'],
        ARRAY['building_id',               'uuid'],
        ARRAY['building_name',             'text'],
        ARRAY['administration_id',         'uuid'],
        ARRAY['administration_company_name','text'],
        ARRAY['key_count',                 'bigint'],
        ARRAY['key_ids',                   'ARRAY'],
        ARRAY['key_labels',                'ARRAY']
      ];
      v_pair     text[];
      v_col      text;
      v_type     text;
      v_exists   boolean;
    BEGIN
      FOREACH v_pair SLICE 1 IN ARRAY v_required
      LOOP
        v_col  := v_pair[1];
        v_type := v_pair[2];

        IF v_type = 'ARRAY' THEN
          -- array columns: check existence only via information_schema
          SELECT EXISTS (
            SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public'
               AND table_name   = 'equipment_inventory'
               AND column_name  = v_col
               AND data_type    = 'ARRAY'
          ) INTO v_exists;
          ASSERT v_exists,
            'FAIL 116-S2: column ' || v_col || ' missing or not ARRAY type in equipment_inventory';
        ELSIF v_type = 'uuid' THEN
          SELECT EXISTS (
            SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public'
               AND table_name   = 'equipment_inventory'
               AND column_name  = v_col
               AND udt_name     = 'uuid'
          ) INTO v_exists;
          ASSERT v_exists,
            'FAIL 116-S2: column ' || v_col || ' missing or wrong type (expected uuid) in equipment_inventory';
        ELSIF v_type = 'bigint' THEN
          SELECT EXISTS (
            SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public'
               AND table_name   = 'equipment_inventory'
               AND column_name  = v_col
               AND udt_name     = 'int8'
          ) INTO v_exists;
          ASSERT v_exists,
            'FAIL 116-S2: column ' || v_col || ' missing or wrong type (expected bigint/int8) in equipment_inventory';
        ELSE
          -- text
          SELECT EXISTS (
            SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public'
               AND table_name   = 'equipment_inventory'
               AND column_name  = v_col
               AND udt_name     = 'text'
          ) INTO v_exists;
          ASSERT v_exists,
            'FAIL 116-S2: column ' || v_col || ' missing or wrong type (expected text) in equipment_inventory';
        END IF;
      END LOOP;
    END $$;
  $q$,
  'PASS 116-S2: equipment_inventory has all required columns with correct types'
);

-- ============================================================
-- Scenario 3 (PASS 116-S3): GRANT SELECT to authenticated; DML revoked
-- ============================================================
SELECT lives_ok(
  $q$
    DO $$
    DECLARE
      v_has_select  boolean;
      v_has_insert  boolean;
      v_has_update  boolean;
      v_has_delete  boolean;
    BEGIN
      SELECT EXISTS (
        SELECT 1 FROM information_schema.role_table_grants
         WHERE table_schema   = 'public'
           AND table_name     = 'equipment_inventory'
           AND grantee        = 'authenticated'
           AND privilege_type = 'SELECT'
      ) INTO v_has_select;
      ASSERT v_has_select,
        'FAIL 116-S3: SELECT not granted to authenticated on equipment_inventory';

      SELECT EXISTS (
        SELECT 1 FROM information_schema.role_table_grants
         WHERE table_schema   = 'public'
           AND table_name     = 'equipment_inventory'
           AND grantee        IN ('authenticated', 'public')
           AND privilege_type = 'INSERT'
      ) INTO v_has_insert;
      ASSERT NOT v_has_insert,
        'FAIL 116-S3: INSERT should not be granted on equipment_inventory';

      SELECT EXISTS (
        SELECT 1 FROM information_schema.role_table_grants
         WHERE table_schema   = 'public'
           AND table_name     = 'equipment_inventory'
           AND grantee        IN ('authenticated', 'public')
           AND privilege_type = 'UPDATE'
      ) INTO v_has_update;
      ASSERT NOT v_has_update,
        'FAIL 116-S3: UPDATE should not be granted on equipment_inventory';

      SELECT EXISTS (
        SELECT 1 FROM information_schema.role_table_grants
         WHERE table_schema   = 'public'
           AND table_name     = 'equipment_inventory'
           AND grantee        IN ('authenticated', 'public')
           AND privilege_type = 'DELETE'
      ) INTO v_has_delete;
      ASSERT NOT v_has_delete,
        'FAIL 116-S3: DELETE should not be granted on equipment_inventory';
    END $$;
  $q$,
  'PASS 116-S3: SELECT granted to authenticated; INSERT/UPDATE/DELETE revoked'
);

-- ============================================================
-- Scenario 4 (PASS 116-S4): Authenticated staff sees all equipment
-- ============================================================
SELECT lives_ok(
  $q$
    DO $$
    DECLARE
      v_base_count  bigint;
      v_view_count  bigint;
    BEGIN
      -- Baseline as superuser (bypasses RLS)
      SELECT count(*) INTO v_base_count FROM operations.equipment;

      -- Simulate authenticated admin via JWT claim
      SET LOCAL role authenticated;
      SET LOCAL request.jwt.claims TO '{"sub": "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"}';

      SELECT count(*) INTO v_view_count FROM public.equipment_inventory;

      RESET role;

      ASSERT v_view_count = v_base_count,
        'FAIL 116-S4: authenticated admin should see all ' || v_base_count::text ||
        ' equipment rows through VIEW, got ' || v_view_count::text;
    END $$;
  $q$,
  'PASS 116-S4: authenticated staff sees all equipment through equipment_inventory VIEW'
);

-- ============================================================
-- Scenario 5 (PASS 116-S5): Anon (empty JWT) sees zero rows
-- ============================================================
SELECT lives_ok(
  $q$
    DO $$
    DECLARE
      v_count bigint;
    BEGIN
      SET LOCAL role authenticated;
      SET LOCAL request.jwt.claims TO '{}';

      SELECT count(*) INTO v_count FROM public.equipment_inventory;

      RESET role;

      ASSERT v_count = 0,
        'FAIL 116-S5: anon (empty JWT) should see 0 rows in equipment_inventory, got ' ||
        v_count::text;
    END $$;
  $q$,
  'PASS 116-S5: anon (empty JWT claims) sees zero rows in equipment_inventory'
);

-- ============================================================
-- Scenario 6 (PASS 116-S6): Equipment with 0 active key_authorizations
--   → key_count=0, key_ids='{}'::uuid[]
-- ============================================================
SELECT lives_ok(
  $q$
    DO $$
    DECLARE
      v_building_id  uuid;
      v_equip_id     uuid;
      v_key_count    bigint;
      v_key_ids      uuid[];
    BEGIN
      SELECT id INTO v_building_id FROM public.buildings WHERE name = 'Test 116 Building';

      INSERT INTO operations.equipment (serial_number, model, building_id, description, status)
        VALUES ('SN-116-S6', 'M-S6', v_building_id, 'Test door S6', 'active')
        RETURNING id INTO v_equip_id;

      SELECT key_count, key_ids
        INTO v_key_count, v_key_ids
        FROM public.equipment_inventory WHERE id = v_equip_id;

      ASSERT FOUND,
        'FAIL 116-S6: equipment SN-116-S6 not found in equipment_inventory';
      ASSERT v_key_count = 0,
        'FAIL 116-S6: key_count should be 0, got ' || v_key_count::text;
      ASSERT v_key_ids = '{}'::uuid[],
        'FAIL 116-S6: key_ids should be empty array, got ' || v_key_ids::text;
    END $$;
  $q$,
  'PASS 116-S6: equipment with 0 active authorizations returns key_count=0 and empty key_ids'
);

-- ============================================================
-- Scenario 7 (PASS 116-S7): Equipment with 2 active key_authorizations
--   → key_count=2, key_ids contains both
-- ============================================================
-- Note: key_authorizations_validate() trigger forces sync_state='pending_install'
-- on INSERT. Advance to 'installed' via UPDATE.
SELECT lives_ok(
  $q$
    DO $$
    DECLARE
      v_building_id  uuid;
      v_unit_id      uuid;
      v_equip_id     uuid;
      v_key_id_a     uuid;
      v_key_id_b     uuid;
      v_ka_id        uuid;
      v_key_count    bigint;
      v_key_ids      uuid[];
    BEGIN
      SELECT id INTO v_building_id FROM public.buildings WHERE name = 'Test 116 Building';
      SELECT id INTO v_unit_id     FROM public.units     WHERE number = '1A-116';

      INSERT INTO operations.equipment (serial_number, model, building_id, description, status)
        VALUES ('SN-116-S7', 'M-S7', v_building_id, 'Test door S7', 'active')
        RETURNING id INTO v_equip_id;

      -- Key A
      INSERT INTO public.rfid_keys (rfid_code, unit_id)
        VALUES ('TEST-116-S7-A', v_unit_id) RETURNING id INTO v_key_id_a;
      INSERT INTO operations.key_authorizations (rfid_key_id, equipment_id)
        VALUES (v_key_id_a, v_equip_id) RETURNING id INTO v_ka_id;
      UPDATE operations.key_authorizations SET sync_state = 'installed' WHERE id = v_ka_id;

      -- Key B
      INSERT INTO public.rfid_keys (rfid_code, unit_id)
        VALUES ('TEST-116-S7-B', v_unit_id) RETURNING id INTO v_key_id_b;
      INSERT INTO operations.key_authorizations (rfid_key_id, equipment_id)
        VALUES (v_key_id_b, v_equip_id) RETURNING id INTO v_ka_id;
      UPDATE operations.key_authorizations SET sync_state = 'installed' WHERE id = v_ka_id;

      SELECT key_count, key_ids
        INTO v_key_count, v_key_ids
        FROM public.equipment_inventory WHERE id = v_equip_id;

      ASSERT FOUND, 'FAIL 116-S7: equipment SN-116-S7 not found in equipment_inventory';
      ASSERT v_key_count = 2,
        'FAIL 116-S7: key_count should be 2, got ' || v_key_count::text;
      ASSERT v_key_id_a = ANY(v_key_ids),
        'FAIL 116-S7: key_id_a missing from key_ids';
      ASSERT v_key_id_b = ANY(v_key_ids),
        'FAIL 116-S7: key_id_b missing from key_ids';
    END $$;
  $q$,
  'PASS 116-S7: equipment with 2 installed authorizations returns key_count=2 with both key_ids'
);

-- ============================================================
-- Scenario 8 (PASS 116-S8): Equipment with pending_install authorizations only
--   → key_count=0
-- ============================================================
SELECT lives_ok(
  $q$
    DO $$
    DECLARE
      v_building_id  uuid;
      v_unit_id      uuid;
      v_equip_id     uuid;
      v_key_id       uuid;
      v_key_count    bigint;
      v_key_ids      uuid[];
    BEGIN
      SELECT id INTO v_building_id FROM public.buildings WHERE name = 'Test 116 Building';
      SELECT id INTO v_unit_id     FROM public.units     WHERE number = '1A-116';

      INSERT INTO operations.equipment (serial_number, model, building_id, description, status)
        VALUES ('SN-116-S8', 'M-S8', v_building_id, 'Test door S8', 'active')
        RETURNING id INTO v_equip_id;

      INSERT INTO public.rfid_keys (rfid_code, unit_id)
        VALUES ('TEST-116-S8', v_unit_id) RETURNING id INTO v_key_id;

      -- INSERT always lands in pending_install due to trigger
      INSERT INTO operations.key_authorizations (rfid_key_id, equipment_id, sync_state)
        VALUES (v_key_id, v_equip_id, 'pending_install');

      SELECT key_count, key_ids
        INTO v_key_count, v_key_ids
        FROM public.equipment_inventory WHERE id = v_equip_id;

      ASSERT FOUND, 'FAIL 116-S8: equipment SN-116-S8 not found in equipment_inventory';
      ASSERT v_key_count = 0,
        'FAIL 116-S8: key_count should be 0 for pending_install only, got ' || v_key_count::text;
      ASSERT v_key_ids = '{}'::uuid[],
        'FAIL 116-S8: key_ids should be empty for pending_install only, got ' || v_key_ids::text;
    END $$;
  $q$,
  'PASS 116-S8: equipment with pending_install-only authorizations returns key_count=0'
);

-- ============================================================
-- Scenario 9 (PASS 116-S9): Equipment with 1 removed + 1 installed → key_count=1
-- ============================================================
SELECT lives_ok(
  $q$
    DO $$
    DECLARE
      v_building_id  uuid;
      v_unit_id      uuid;
      v_equip_id     uuid;
      v_key_id_rm    uuid;
      v_key_id_ok    uuid;
      v_ka_id        uuid;
      v_key_count    bigint;
      v_key_ids      uuid[];
    BEGIN
      SELECT id INTO v_building_id FROM public.buildings WHERE name = 'Test 116 Building';
      SELECT id INTO v_unit_id     FROM public.units     WHERE number = '1A-116';

      INSERT INTO operations.equipment (serial_number, model, building_id, description, status)
        VALUES ('SN-116-S9', 'M-S9', v_building_id, 'Test door S9', 'active')
        RETURNING id INTO v_equip_id;

      -- Key that will be removed
      INSERT INTO public.rfid_keys (rfid_code, unit_id)
        VALUES ('TEST-116-S9-RM', v_unit_id) RETURNING id INTO v_key_id_rm;
      INSERT INTO operations.key_authorizations (rfid_key_id, equipment_id)
        VALUES (v_key_id_rm, v_equip_id) RETURNING id INTO v_ka_id;
      UPDATE operations.key_authorizations SET sync_state = 'installed' WHERE id = v_ka_id;
      -- Advance through pending_removal → removed (set removed_at to satisfy trigger)
      UPDATE operations.key_authorizations
        SET sync_state = 'pending_removal'
        WHERE id = v_ka_id;
      UPDATE operations.key_authorizations
        SET sync_state = 'removed', removed_at = now()
        WHERE id = v_ka_id;

      -- Key that stays installed
      INSERT INTO public.rfid_keys (rfid_code, unit_id)
        VALUES ('TEST-116-S9-OK', v_unit_id) RETURNING id INTO v_key_id_ok;
      INSERT INTO operations.key_authorizations (rfid_key_id, equipment_id)
        VALUES (v_key_id_ok, v_equip_id) RETURNING id INTO v_ka_id;
      UPDATE operations.key_authorizations SET sync_state = 'installed' WHERE id = v_ka_id;

      SELECT key_count, key_ids
        INTO v_key_count, v_key_ids
        FROM public.equipment_inventory WHERE id = v_equip_id;

      ASSERT FOUND, 'FAIL 116-S9: equipment SN-116-S9 not found in equipment_inventory';
      ASSERT v_key_count = 1,
        'FAIL 116-S9: key_count should be 1 (one removed, one installed), got ' || v_key_count::text;
      ASSERT v_key_id_ok = ANY(v_key_ids),
        'FAIL 116-S9: installed key_id missing from key_ids';
      ASSERT NOT (v_key_id_rm = ANY(v_key_ids)),
        'FAIL 116-S9: removed key_id should not appear in key_ids';
    END $$;
  $q$,
  'PASS 116-S9: equipment with 1 removed + 1 installed authorization returns key_count=1'
);

SELECT * FROM finish();
ROLLBACK;
