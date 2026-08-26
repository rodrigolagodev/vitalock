-- ============================================================
-- pgTAP: public.keys_inventory VIEW (Slice 1 / admin-navigation-object-model)
-- ============================================================
-- Verifies that public.keys_inventory is a SECURITY INVOKER VIEW that
-- correctly pre-joins rfid_keys → units → buildings → administrations,
-- projects active key_authorizations (sync_state='installed') as equipment
-- columns, and projects the latest active key_order (non-terminal status)
-- as active_order_id / active_order_status.
--
-- RLS model: Vitalock admin app is single-tenant. All authenticated users
-- are Vitalock staff with full-system access. RLS boundary = authenticated
-- vs anon only. There is NO per-administration tenancy.
--
-- Test scenarios:
--   115-S1  VIEW exists, is a VIEW, has security_invoker = on
--   115-S2  Column set matches contract (names + types)
--   115-S3  GRANT SELECT to authenticated; INSERT/UPDATE/DELETE revoked
--   115-S4  Authenticated staff sees all rfid_keys (count matches base table)
--   115-S5  Anon role sees zero rows, no error
--   115-S6  Key with no active key_authorization → equipment_id IS NULL
--   115-S7  Key with active authorization (installed) → correct equipment projected
--   115-S8  Key with only pending_install authorization → equipment_id IS NULL
--   115-S9  Key with completed order → active_order_id IS NULL
--   115-S10 Key with confirmed order → correct active_order_id
--   115-S11 Key with two active orders → most-recent created_at wins
--
-- Note on row visibility checks: Use count(*) or FOUND after SELECT INTO v_row
-- rather than "v_row IS NOT NULL". In PostgreSQL, a composite record IS NOT NULL
-- evaluates to false when ANY field is null — since equipment_id and active_order_id
-- are nullable columns, v_row IS NOT NULL would always return false for keys with
-- no active authorization or active order.
--
-- Prerequisite: migrations 001–099 applied (including 20260824000099).
-- ============================================================

BEGIN;
SELECT plan(11);

-- ============================================================
-- Shared fixtures (created as postgres/superuser, bypasses RLS)
-- ============================================================
DO $$
DECLARE
  v_admin_auth_id  uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  v_admin_org_id   uuid;
  v_building_id    uuid;
  v_unit_id        uuid;
  v_equip_id_a     uuid;
  v_equip_id_b     uuid;
BEGIN
  -- auth.users + staff (admin role — required for is_admin() to return true)
  INSERT INTO auth.users (id) VALUES (v_admin_auth_id);
  INSERT INTO identity.staff (auth_user_id, full_name, role, status)
    VALUES (v_admin_auth_id, 'Test 115 Admin', 'admin', 'active');

  -- Administration → Building → Unit chain (used by all scenarios)
  INSERT INTO public.administrations (company_name)
    VALUES ('Test 115 Admin Corp') RETURNING id INTO v_admin_org_id;
  INSERT INTO public.buildings (name, address, administration_id)
    VALUES ('Test 115 Building', 'Av. Test 115', v_admin_org_id) RETURNING id INTO v_building_id;
  INSERT INTO public.units (number, building_id)
    VALUES ('1A-115', v_building_id) RETURNING id INTO v_unit_id;

  -- Two equipment rows for authorization scenarios
  INSERT INTO operations.equipment (serial_number, model, building_id, description, status)
    VALUES ('SN-115-A', 'M-Alpha', v_building_id, 'Test door A', 'active')
    RETURNING id INTO v_equip_id_a;
  INSERT INTO operations.equipment (serial_number, model, building_id, description, status)
    VALUES ('SN-115-B', 'M-Beta', v_building_id, 'Test door B', 'active')
    RETURNING id INTO v_equip_id_b;
END $$;

-- ============================================================
-- Scenario 1 (PASS 115-S1): VIEW exists, is a VIEW, security_invoker = on
-- ============================================================
SELECT lives_ok(
  $q$
    DO $$
    DECLARE
      v_relkind   char;
      v_sec_inv   boolean;
    BEGIN
      SELECT relkind INTO v_relkind
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relname = 'keys_inventory';
      ASSERT v_relkind = 'v',
        'FAIL 115-S1: keys_inventory not found or is not a VIEW (relkind=' ||
        coalesce(v_relkind::text, 'NULL') || ')';

      SELECT (reloptions @> ARRAY['security_invoker=on']) INTO v_sec_inv
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relname = 'keys_inventory';
      ASSERT v_sec_inv = true,
        'FAIL 115-S1: keys_inventory does not have security_invoker=on';
    END $$;
  $q$,
  'PASS 115-S1: keys_inventory VIEW exists and has security_invoker=on'
);

-- ============================================================
-- Scenario 2 (PASS 115-S2): Column set matches contract
-- ============================================================
SELECT lives_ok(
  $q$
    DO $$
    DECLARE
      v_required_cols text[] := ARRAY[
        'id', 'rfid_code', 'physical_status',
        'unit_id', 'unit_number',
        'building_id', 'building_name',
        'administration_id', 'administration_company_name',
        'equipment_id', 'equipment_serial_number', 'equipment_model',
        'active_order_id', 'active_order_status'
      ];
      v_col text;
      v_exists boolean;
    BEGIN
      FOREACH v_col IN ARRAY v_required_cols
      LOOP
        SELECT EXISTS (
          SELECT 1 FROM information_schema.columns
           WHERE table_schema = 'public'
             AND table_name   = 'keys_inventory'
             AND column_name  = v_col
        ) INTO v_exists;
        ASSERT v_exists,
          'FAIL 115-S2: column missing from keys_inventory: ' || v_col;
      END LOOP;
    END $$;
  $q$,
  'PASS 115-S2: keys_inventory has all required columns'
);

-- ============================================================
-- Scenario 3 (PASS 115-S3): GRANT SELECT to authenticated; DML revoked
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
           AND table_name     = 'keys_inventory'
           AND grantee        = 'authenticated'
           AND privilege_type = 'SELECT'
      ) INTO v_has_select;
      ASSERT v_has_select,
        'FAIL 115-S3: SELECT not granted to authenticated on keys_inventory';

      SELECT EXISTS (
        SELECT 1 FROM information_schema.role_table_grants
         WHERE table_schema   = 'public'
           AND table_name     = 'keys_inventory'
           AND grantee        IN ('authenticated', 'public')
           AND privilege_type = 'INSERT'
      ) INTO v_has_insert;
      ASSERT NOT v_has_insert,
        'FAIL 115-S3: INSERT should not be granted on keys_inventory';

      SELECT EXISTS (
        SELECT 1 FROM information_schema.role_table_grants
         WHERE table_schema   = 'public'
           AND table_name     = 'keys_inventory'
           AND grantee        IN ('authenticated', 'public')
           AND privilege_type = 'UPDATE'
      ) INTO v_has_update;
      ASSERT NOT v_has_update,
        'FAIL 115-S3: UPDATE should not be granted on keys_inventory';

      SELECT EXISTS (
        SELECT 1 FROM information_schema.role_table_grants
         WHERE table_schema   = 'public'
           AND table_name     = 'keys_inventory'
           AND grantee        IN ('authenticated', 'public')
           AND privilege_type = 'DELETE'
      ) INTO v_has_delete;
      ASSERT NOT v_has_delete,
        'FAIL 115-S3: DELETE should not be granted on keys_inventory';
    END $$;
  $q$,
  'PASS 115-S3: SELECT granted to authenticated; INSERT/UPDATE/DELETE revoked'
);

-- ============================================================
-- Scenario 4 (PASS 115-S4): Authenticated staff sees all rfid_keys
-- ============================================================
-- RLS uses identity.is_admin() — a global boolean for all Vitalock staff.
-- There is NO per-administration row filter; any admin sees all rows.
SELECT lives_ok(
  $q$
    DO $$
    DECLARE
      v_base_count  bigint;
      v_view_count  bigint;
    BEGIN
      -- Baseline count as superuser (bypasses RLS)
      SELECT count(*) INTO v_base_count FROM public.rfid_keys;

      -- Switch to authenticated role with admin JWT claim
      SET LOCAL role authenticated;
      SET LOCAL request.jwt.claims TO '{"sub": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}';

      SELECT count(*) INTO v_view_count FROM public.keys_inventory;

      RESET role;

      ASSERT v_view_count = v_base_count,
        'FAIL 115-S4: authenticated admin should see all ' || v_base_count::text ||
        ' rfid_keys through VIEW, got ' || v_view_count::text;
    END $$;
  $q$,
  'PASS 115-S4: authenticated staff sees all rfid_keys through keys_inventory VIEW'
);

-- ============================================================
-- Scenario 5 (PASS 115-S5): Anon role sees zero rows
-- ============================================================
-- Empty JWT → auth.uid() is null → is_admin() = false → RLS filters all rows.
SELECT lives_ok(
  $q$
    DO $$
    DECLARE
      v_count bigint;
    BEGIN
      SET LOCAL role authenticated;
      SET LOCAL request.jwt.claims TO '{}';

      SELECT count(*) INTO v_count FROM public.keys_inventory;

      RESET role;

      ASSERT v_count = 0,
        'FAIL 115-S5: anon (empty JWT) should see 0 rows in keys_inventory, got ' ||
        v_count::text;
    END $$;
  $q$,
  'PASS 115-S5: anon (empty JWT claims) sees zero rows in keys_inventory'
);

-- ============================================================
-- Scenario 6 (PASS 115-S6): Key with no active key_authorization → equipment_id IS NULL
-- ============================================================
SELECT lives_ok(
  $q$
    DO $$
    DECLARE
      v_unit_id          uuid;
      v_key_id           uuid;
      v_equipment_id     uuid;
      v_serial_number    text;
      v_found            boolean;
    BEGIN
      SELECT id INTO v_unit_id FROM public.units WHERE number = '1A-115' LIMIT 1;
      INSERT INTO public.rfid_keys (rfid_code, unit_id)
        VALUES ('TEST-115-S6', v_unit_id) RETURNING id INTO v_key_id;

      SELECT equipment_id, equipment_serial_number, true
        INTO v_equipment_id, v_serial_number, v_found
        FROM public.keys_inventory WHERE id = v_key_id;

      ASSERT FOUND,
        'FAIL 115-S6: key TEST-115-S6 not found in keys_inventory (id=' || v_key_id::text || ')';
      ASSERT v_equipment_id IS NULL,
        'FAIL 115-S6: equipment_id should be NULL for key with no authorization, got ' ||
        coalesce(v_equipment_id::text, 'NULL');
      ASSERT v_serial_number IS NULL,
        'FAIL 115-S6: equipment_serial_number should be NULL';
    END $$;
  $q$,
  'PASS 115-S6: key with no active key_authorization returns equipment_id IS NULL'
);

-- ============================================================
-- Scenario 7 (PASS 115-S7): Key with active authorization (installed) → correct equipment
-- ============================================================
-- Note: key_authorizations_validate() trigger always forces sync_state='pending_install'
-- on INSERT. The only valid path to 'installed' is INSERT then UPDATE.
SELECT lives_ok(
  $q$
    DO $$
    DECLARE
      v_unit_id              uuid;
      v_equip_id             uuid;
      v_key_id               uuid;
      v_ka_id                uuid;
      v_view_equip_id        uuid;
      v_view_serial          text;
      v_view_model           text;
    BEGIN
      SELECT id INTO v_unit_id FROM public.units WHERE number = '1A-115' LIMIT 1;
      SELECT id INTO v_equip_id FROM operations.equipment WHERE serial_number = 'SN-115-A';

      INSERT INTO public.rfid_keys (rfid_code, unit_id)
        VALUES ('TEST-115-S7', v_unit_id) RETURNING id INTO v_key_id;

      -- INSERT always results in pending_install (trigger enforces it).
      -- Advance to installed via UPDATE (state machine: pending_install → installed).
      INSERT INTO operations.key_authorizations (rfid_key_id, equipment_id)
        VALUES (v_key_id, v_equip_id) RETURNING id INTO v_ka_id;
      UPDATE operations.key_authorizations
        SET sync_state = 'installed'
        WHERE id = v_ka_id;

      SELECT equipment_id, equipment_serial_number, equipment_model
        INTO v_view_equip_id, v_view_serial, v_view_model
        FROM public.keys_inventory WHERE id = v_key_id;

      ASSERT FOUND, 'FAIL 115-S7: key TEST-115-S7 not found in VIEW';
      ASSERT v_view_equip_id = v_equip_id,
        'FAIL 115-S7: equipment_id mismatch. Expected ' || v_equip_id::text ||
        ', got ' || coalesce(v_view_equip_id::text, 'NULL');
      ASSERT v_view_serial = 'SN-115-A',
        'FAIL 115-S7: equipment_serial_number wrong, got ' ||
        coalesce(v_view_serial, 'NULL');
      ASSERT v_view_model = 'M-Alpha',
        'FAIL 115-S7: equipment_model wrong, got ' ||
        coalesce(v_view_model, 'NULL');
    END $$;
  $q$,
  'PASS 115-S7: key with installed authorization projects correct equipment columns'
);

-- ============================================================
-- Scenario 8 (PASS 115-S8): Key with only pending_install → equipment_id IS NULL
-- ============================================================
SELECT lives_ok(
  $q$
    DO $$
    DECLARE
      v_unit_id       uuid;
      v_equip_id      uuid;
      v_key_id        uuid;
      v_view_equip_id uuid;
    BEGIN
      SELECT id INTO v_unit_id FROM public.units WHERE number = '1A-115' LIMIT 1;
      SELECT id INTO v_equip_id FROM operations.equipment WHERE serial_number = 'SN-115-B';

      INSERT INTO public.rfid_keys (rfid_code, unit_id)
        VALUES ('TEST-115-S8', v_unit_id) RETURNING id INTO v_key_id;

      INSERT INTO operations.key_authorizations (rfid_key_id, equipment_id, sync_state)
        VALUES (v_key_id, v_equip_id, 'pending_install');

      SELECT equipment_id INTO v_view_equip_id
        FROM public.keys_inventory WHERE id = v_key_id;

      ASSERT FOUND, 'FAIL 115-S8: key TEST-115-S8 not found in VIEW';
      ASSERT v_view_equip_id IS NULL,
        'FAIL 115-S8: equipment_id should be NULL for pending_install, got ' ||
        coalesce(v_view_equip_id::text, 'NULL');
    END $$;
  $q$,
  'PASS 115-S8: key with only pending_install authorization returns equipment_id IS NULL'
);

-- ============================================================
-- Scenario 9 (PASS 115-S9): Key with completed order → active_order_id IS NULL
-- ============================================================
SELECT lives_ok(
  $q$
    DO $$
    DECLARE
      v_unit_id       uuid;
      v_building_id   uuid;
      v_admin_id      uuid;
      v_key_id        uuid;
      v_order_id      uuid;
      v_view_order_id uuid;
    BEGIN
      SELECT u.id, u.building_id INTO v_unit_id, v_building_id
        FROM public.units u WHERE u.number = '1A-115' LIMIT 1;
      SELECT b.administration_id INTO v_admin_id
        FROM public.buildings b WHERE b.id = v_building_id;

      INSERT INTO public.rfid_keys (rfid_code, unit_id)
        VALUES ('TEST-115-S9', v_unit_id) RETURNING id INTO v_key_id;

      INSERT INTO public.key_orders (status, administration_id, client_type)
        VALUES ('completed', v_admin_id, 'administration') RETURNING id INTO v_order_id;
      INSERT INTO public.key_order_items (order_id, building_id, unit_price, produced_key_id)
        VALUES (v_order_id, v_building_id, 100, v_key_id);

      SELECT active_order_id INTO v_view_order_id
        FROM public.keys_inventory WHERE id = v_key_id;

      ASSERT FOUND, 'FAIL 115-S9: key TEST-115-S9 not found in VIEW';
      ASSERT v_view_order_id IS NULL,
        'FAIL 115-S9: active_order_id should be NULL for completed order, got ' ||
        coalesce(v_view_order_id::text, 'NULL');
    END $$;
  $q$,
  'PASS 115-S9: key with completed order returns active_order_id IS NULL'
);

-- ============================================================
-- Scenario 10 (PASS 115-S10): Key with confirmed order → correct active_order_id
-- ============================================================
SELECT lives_ok(
  $q$
    DO $$
    DECLARE
      v_unit_id         uuid;
      v_building_id     uuid;
      v_admin_id        uuid;
      v_key_id          uuid;
      v_order_id        uuid;
      v_view_order_id   uuid;
      v_view_status     text;
    BEGIN
      SELECT u.id, u.building_id INTO v_unit_id, v_building_id
        FROM public.units u WHERE u.number = '1A-115' LIMIT 1;
      SELECT b.administration_id INTO v_admin_id
        FROM public.buildings b WHERE b.id = v_building_id;

      INSERT INTO public.rfid_keys (rfid_code, unit_id)
        VALUES ('TEST-115-S10', v_unit_id) RETURNING id INTO v_key_id;

      INSERT INTO public.key_orders (status, administration_id, client_type)
        VALUES ('confirmed', v_admin_id, 'administration') RETURNING id INTO v_order_id;
      INSERT INTO public.key_order_items (order_id, building_id, unit_price, produced_key_id)
        VALUES (v_order_id, v_building_id, 100, v_key_id);

      SELECT active_order_id, active_order_status
        INTO v_view_order_id, v_view_status
        FROM public.keys_inventory WHERE id = v_key_id;

      ASSERT FOUND, 'FAIL 115-S10: key TEST-115-S10 not found in VIEW';
      ASSERT v_view_order_id = v_order_id,
        'FAIL 115-S10: active_order_id wrong. Expected ' || v_order_id::text ||
        ', got ' || coalesce(v_view_order_id::text, 'NULL');
      ASSERT v_view_status = 'confirmed',
        'FAIL 115-S10: active_order_status wrong, got ' ||
        coalesce(v_view_status, 'NULL');
    END $$;
  $q$,
  'PASS 115-S10: key with confirmed order projects correct active_order_id and status'
);

-- ============================================================
-- Scenario 11 (PASS 115-S11): Key with two active orders → most-recent created_at wins
-- ============================================================
SELECT lives_ok(
  $q$
    DO $$
    DECLARE
      v_unit_id        uuid;
      v_building_id    uuid;
      v_admin_id       uuid;
      v_key_id         uuid;
      v_order_old_id   uuid;
      v_order_new_id   uuid;
      v_view_order_id  uuid;
      v_view_status    text;
    BEGIN
      SELECT u.id, u.building_id INTO v_unit_id, v_building_id
        FROM public.units u WHERE u.number = '1A-115' LIMIT 1;
      SELECT b.administration_id INTO v_admin_id
        FROM public.buildings b WHERE b.id = v_building_id;

      INSERT INTO public.rfid_keys (rfid_code, unit_id)
        VALUES ('TEST-115-S11', v_unit_id) RETURNING id INTO v_key_id;

      -- Older active order
      INSERT INTO public.key_orders (status, administration_id, client_type, created_at)
        VALUES ('confirmed', v_admin_id, 'administration', now() - interval '1 hour')
        RETURNING id INTO v_order_old_id;
      INSERT INTO public.key_order_items (order_id, building_id, unit_price, produced_key_id)
        VALUES (v_order_old_id, v_building_id, 100, v_key_id);

      -- Newer active order (same key can appear in multiple non-terminal orders;
      -- produced_key_id has no uniqueness constraint on key_order_items)
      INSERT INTO public.key_orders (status, administration_id, client_type, created_at)
        VALUES ('in_progress', v_admin_id, 'administration', now())
        RETURNING id INTO v_order_new_id;
      INSERT INTO public.key_order_items (order_id, building_id, unit_price, produced_key_id)
        VALUES (v_order_new_id, v_building_id, 100, v_key_id);

      SELECT active_order_id, active_order_status
        INTO v_view_order_id, v_view_status
        FROM public.keys_inventory WHERE id = v_key_id;

      ASSERT FOUND, 'FAIL 115-S11: key TEST-115-S11 not found in VIEW';
      ASSERT v_view_order_id = v_order_new_id,
        'FAIL 115-S11: most-recent order should win. Expected ' || v_order_new_id::text ||
        ', got ' || coalesce(v_view_order_id::text, 'NULL');
      ASSERT v_view_status = 'in_progress',
        'FAIL 115-S11: active_order_status should be in_progress, got ' ||
        coalesce(v_view_status, 'NULL');
    END $$;
  $q$,
  'PASS 115-S11: key with two active orders returns the most-recent one by created_at DESC'
);

SELECT * FROM finish();
ROLLBACK;
