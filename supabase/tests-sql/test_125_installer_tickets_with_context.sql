-- ============================================================
-- pgTAP: support.installer_tickets_with_context
-- ============================================================
-- Covers migration 20260830000110_installer_tickets_with_context.sql
-- (REQ-DB-TICKETS-VIEW-1.1..1.3 plus one INVOKER evidence scenario per
-- ADR-2).
--
--   S1  Installer I1 sees only tickets assigned to them.
--   S2  Installer I2 sees zero rows when I1 owns the ticket.
--   S3  Cross-schema JOIN populates building + admin columns in one shot.
--   S4  INVOKER evidence: joined building/admin columns are visible
--       through the view under an installer's own JWT (no DEFINER
--       escalation needed).
-- ============================================================

BEGIN;
SELECT plan(4);

-- ============================================================
-- Fixtures
-- ============================================================
DO $$
DECLARE
  v_i1_auth uuid := '88888888-8888-8888-8888-888888888881';
  v_i2_auth uuid := '88888888-8888-8888-8888-888888888882';
  v_i1_id   uuid;
  v_i2_id   uuid;
  v_admin   uuid;
  v_bld     uuid;
  v_tk_1    uuid;
  v_tk_2    uuid;
  v_tk_3    uuid;  -- assigned to I2
BEGIN
  INSERT INTO auth.users (id) VALUES (v_i1_auth), (v_i2_auth);

  INSERT INTO identity.staff (auth_user_id, full_name, role, status)
    VALUES (v_i1_auth, 'Test 125 I1', 'installer', 'active') RETURNING id INTO v_i1_id;
  INSERT INTO identity.staff (auth_user_id, full_name, role, status)
    VALUES (v_i2_auth, 'Test 125 I2', 'installer', 'active') RETURNING id INTO v_i2_id;

  INSERT INTO public.administrations (company_name, address)
    VALUES ('Test 125 Admin', 'Av. Test 100') RETURNING id INTO v_admin;
  INSERT INTO public.buildings (name, address, city, administration_id)
    VALUES ('Test 125 Building', 'Calle 1', 'CABA', v_admin) RETURNING id INTO v_bld;

  INSERT INTO support.tickets (administration_id, building_id, category, description, status, assigned_to_staff_id)
    VALUES (v_admin, v_bld, 'maintenance', 'Test 125 tk1 for I1', 'open', v_i1_id)
    RETURNING id INTO v_tk_1;
  INSERT INTO support.tickets (administration_id, building_id, category, description, status, assigned_to_staff_id)
    VALUES (v_admin, v_bld, 'maintenance', 'Test 125 tk2 for I1', 'open', v_i1_id)
    RETURNING id INTO v_tk_2;
  INSERT INTO support.tickets (administration_id, building_id, category, description, status, assigned_to_staff_id)
    VALUES (v_admin, v_bld, 'maintenance', 'Test 125 tk3 for I2', 'open', v_i2_id)
    RETURNING id INTO v_tk_3;

  CREATE TEMP TABLE _t125 (k text primary key, v uuid) ON COMMIT DROP;
  INSERT INTO _t125 VALUES
    ('i1_auth', v_i1_auth), ('i2_auth', v_i2_auth),
    ('i1', v_i1_id),        ('i2', v_i2_id),
    ('admin', v_admin),     ('bld', v_bld),
    ('tk1', v_tk_1),        ('tk2', v_tk_2),  ('tk3', v_tk_3);

  -- Snapshot the target ids into a temp table `authenticated` can read.
  CREATE TEMP TABLE _t125_ids (k text primary key, v uuid) ON COMMIT DROP;
  INSERT INTO _t125_ids VALUES
    ('i1_auth', v_i1_auth), ('i2_auth', v_i2_auth),
    ('tk1', v_tk_1),        ('tk2', v_tk_2),  ('tk3', v_tk_3);
  GRANT SELECT ON _t125_ids TO authenticated;
END $$;

-- ============================================================
-- S1: I1 sees only their own two tickets
-- ============================================================
SELECT lives_ok(
  $q$
    DO $$
    DECLARE
      v_i1_auth uuid := (SELECT v FROM _t125_ids WHERE k = 'i1_auth');
      v_count int;
    BEGIN
      SET LOCAL role authenticated;
      PERFORM set_config('request.jwt.claims',
        json_build_object('sub', v_i1_auth::text)::text, true);
      SELECT count(*) INTO v_count
        FROM support.installer_tickets_with_context
       WHERE id IN (SELECT v FROM _t125_ids WHERE k IN ('tk1','tk2','tk3'));
      ASSERT v_count = 2, 'FAIL 125-S1: expected 2 rows for I1, got ' || v_count;
    END $$;
  $q$,
  'PASS 125-S1: installer I1 sees only their assigned tickets via view'
);

-- ============================================================
-- S2: I2 sees only the one ticket assigned to them (0 of I1's tickets)
-- ============================================================
SELECT lives_ok(
  $q$
    DO $$
    DECLARE
      v_i2_auth uuid := (SELECT v FROM _t125_ids WHERE k = 'i2_auth');
      v_count int;
    BEGIN
      SET LOCAL role authenticated;
      PERFORM set_config('request.jwt.claims',
        json_build_object('sub', v_i2_auth::text)::text, true);
      SELECT count(*) INTO v_count
        FROM support.installer_tickets_with_context
       WHERE id IN ((SELECT v FROM _t125_ids WHERE k = 'tk1'),
                    (SELECT v FROM _t125_ids WHERE k = 'tk2'));
      ASSERT v_count = 0, 'FAIL 125-S2: I2 should see 0 of I1''s tickets, got ' || v_count;
    END $$;
  $q$,
  'PASS 125-S2: non-assigned installer sees zero rows'
);

-- ============================================================
-- S3: Cross-schema JOIN populates building/admin columns in one row
-- ============================================================
SELECT lives_ok(
  $q$
    DO $$
    DECLARE
      v_i1_auth uuid := (SELECT v FROM _t125_ids WHERE k = 'i1_auth');
      v_tk      uuid := (SELECT v FROM _t125_ids WHERE k = 'tk1');
      v_bname text; v_bcity text; v_bid uuid;
      v_aname text; v_aaddr text;
    BEGIN
      SET LOCAL role authenticated;
      PERFORM set_config('request.jwt.claims',
        json_build_object('sub', v_i1_auth::text)::text, true);
      SELECT building_name, building_city, building_administration_id,
             administration_company_name, administration_address
        INTO v_bname, v_bcity, v_bid, v_aname, v_aaddr
        FROM support.installer_tickets_with_context
       WHERE id = v_tk;
      ASSERT v_bname = 'Test 125 Building',   'FAIL 125-S3: building_name = ' || COALESCE(v_bname, 'NULL');
      ASSERT v_bcity = 'CABA',                'FAIL 125-S3: building_city = ' || COALESCE(v_bcity, 'NULL');
      ASSERT v_bid IS NOT NULL,               'FAIL 125-S3: building_administration_id NULL';
      ASSERT v_aname = 'Test 125 Admin',      'FAIL 125-S3: administration_company_name = ' || COALESCE(v_aname, 'NULL');
      ASSERT v_aaddr = 'Av. Test 100',        'FAIL 125-S3: administration_address = ' || COALESCE(v_aaddr, 'NULL');
    END $$;
  $q$,
  'PASS 125-S3: view exposes building + admin columns in a single row (no extra query)'
);

-- ============================================================
-- S4: INVOKER evidence — installer sees joined columns under their own
-- JWT even though public.buildings and public.administrations are in a
-- separate schema. If this fails, ADR-2 forces DEFINER escalation +
-- SELECT list restriction.
-- ============================================================
SELECT lives_ok(
  $q$
    DO $$
    DECLARE
      v_i1_auth uuid := (SELECT v FROM _t125_ids WHERE k = 'i1_auth');
      v_bld_name_visible int;
    BEGIN
      SET LOCAL role authenticated;
      PERFORM set_config('request.jwt.claims',
        json_build_object('sub', v_i1_auth::text)::text, true);
      SELECT count(*) INTO v_bld_name_visible
        FROM support.installer_tickets_with_context
       WHERE id = (SELECT v FROM _t125_ids WHERE k = 'tk1')
         AND building_name IS NOT NULL
         AND administration_company_name IS NOT NULL;
      ASSERT v_bld_name_visible = 1,
        'FAIL 125-S4: INVOKER view did not expose joined columns — ADR-2 DEFINER escalation needed';
    END $$;
  $q$,
  'PASS 125-S4: INVOKER view exposes joined building/admin columns to installer (no DEFINER needed)'
);

SELECT * FROM finish();
ROLLBACK;
