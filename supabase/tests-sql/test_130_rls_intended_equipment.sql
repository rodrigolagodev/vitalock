-- ============================================================
-- pgTAP: RLS on public.rfid_key_intended_equipment (P0-1)
-- ============================================================
-- Migration 20260910100000 enabled RLS on a table the baseline had left
-- fully exposed (GRANT ALL to anon, no policies). Policies mirror rfid_keys:
-- admin all, installer read-only, anon nothing.
--
-- Role impersonation idiom: SET LOCAL role authenticated + request.jwt.claims,
-- same as test_112. Everything runs inside one rolled-back transaction.
-- ============================================================

BEGIN;
SELECT plan(4);

DO $$
DECLARE
  v_admin_auth_id     uuid := '13011301-1301-1301-1301-130113011301';
  v_installer_auth_id uuid := '13021302-1302-1302-1302-130213021302';
  v_org_id       uuid;
  v_building_id  uuid;
  v_unit_id      uuid;
  v_key_id       uuid;
  v_equipment_id uuid;
BEGIN
  INSERT INTO auth.users (id) VALUES (v_admin_auth_id), (v_installer_auth_id);
  INSERT INTO identity.staff (auth_user_id, full_name, role, status)
    VALUES (v_admin_auth_id, 'Test 130 Admin', 'admin', 'active'),
           (v_installer_auth_id, 'Test 130 Installer', 'installer', 'active');

  INSERT INTO public.administrations (company_name) VALUES ('Test 130 Client') RETURNING id INTO v_org_id;
  INSERT INTO public.buildings (name, address, administration_id)
    VALUES ('Test 130 Building', 'Calle 130', v_org_id) RETURNING id INTO v_building_id;
  INSERT INTO public.units (number, building_id) VALUES ('130A', v_building_id) RETURNING id INTO v_unit_id;
  INSERT INTO operations.equipment (serial_number, building_id, description, status)
    VALUES ('SN-130', v_building_id, 'Equip 130', 'active') RETURNING id INTO v_equipment_id;
  INSERT INTO public.rfid_keys (rfid_code, unit_id, status)
    VALUES ('T130-KEY', v_unit_id, 'pending_installation') RETURNING id INTO v_key_id;

  INSERT INTO public.rfid_key_intended_equipment (rfid_key_id, equipment_id)
    VALUES (v_key_id, v_equipment_id);
END $$;

-- S1: RLS is enabled on the table (the structural fix itself).
SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.rfid_key_intended_equipment'::regclass),
  'PASS 130-S1: row level security is enabled on rfid_key_intended_equipment'
);

-- S2: anon (authenticated role, empty JWT) sees zero rows.
SELECT lives_ok(
  $q$
    DO $$
    DECLARE v_count int;
    BEGIN
      SET LOCAL role authenticated;
      SET LOCAL request.jwt.claims TO '{}';
      SELECT count(*) INTO v_count FROM public.rfid_key_intended_equipment;
      RESET role;
      ASSERT v_count = 0, 'FAIL 130-S2: anon should see 0 rows, saw ' || v_count::text;
    END $$;
  $q$,
  'PASS 130-S2: anon sees zero rows'
);

-- S3: installer can read but cannot write.
SELECT lives_ok(
  $q$
    DO $$
    DECLARE
      v_count int;
      v_blocked boolean := false;
    BEGIN
      SET LOCAL role authenticated;
      SET LOCAL request.jwt.claims TO '{"sub": "13021302-1302-1302-1302-130213021302"}';
      SELECT count(*) INTO v_count FROM public.rfid_key_intended_equipment
        WHERE rfid_key_id = (SELECT id FROM public.rfid_keys WHERE rfid_code = 'T130-KEY');
      BEGIN
        DELETE FROM public.rfid_key_intended_equipment
          WHERE rfid_key_id = (SELECT id FROM public.rfid_keys WHERE rfid_code = 'T130-KEY');
        -- Under RLS a DELETE with no visible-for-delete rows is a silent 0-row no-op,
        -- so verify the row survived instead of expecting an exception.
        SELECT count(*) > 0 INTO v_blocked FROM public.rfid_key_intended_equipment
          WHERE rfid_key_id = (SELECT id FROM public.rfid_keys WHERE rfid_code = 'T130-KEY');
      EXCEPTION WHEN insufficient_privilege THEN
        v_blocked := true;
      END;
      RESET role;
      ASSERT v_count = 1, 'FAIL 130-S3: installer should read 1 row, saw ' || v_count::text;
      ASSERT v_blocked, 'FAIL 130-S3: installer DELETE must not remove the row';
    END $$;
  $q$,
  'PASS 130-S3: installer reads the row but cannot delete it'
);

-- S4: admin reads and writes.
SELECT lives_ok(
  $q$
    DO $$
    DECLARE v_count int;
    BEGIN
      SET LOCAL role authenticated;
      SET LOCAL request.jwt.claims TO '{"sub": "13011301-1301-1301-1301-130113011301"}';
      SELECT count(*) INTO v_count FROM public.rfid_key_intended_equipment
        WHERE rfid_key_id = (SELECT id FROM public.rfid_keys WHERE rfid_code = 'T130-KEY');
      DELETE FROM public.rfid_key_intended_equipment
        WHERE rfid_key_id = (SELECT id FROM public.rfid_keys WHERE rfid_code = 'T130-KEY');
      ASSERT v_count = 1, 'FAIL 130-S4: admin should read 1 row, saw ' || v_count::text;
      SELECT count(*) INTO v_count FROM public.rfid_key_intended_equipment
        WHERE rfid_key_id = (SELECT id FROM public.rfid_keys WHERE rfid_code = 'T130-KEY');
      RESET role;
      ASSERT v_count = 0, 'FAIL 130-S4: admin DELETE should remove the row';
    END $$;
  $q$,
  'PASS 130-S4: admin reads and deletes the row'
);

SELECT * FROM finish();
ROLLBACK;
