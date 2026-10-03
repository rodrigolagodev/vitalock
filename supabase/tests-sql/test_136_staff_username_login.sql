-- ============================================================
-- pgTAP: identity.staff.username format/uniqueness; no username login lookup
-- ============================================================
-- Covers migration 20260912120000_add_staff_username.
--   - CHECK rejects malformed usernames (case, whitespace, `@`, length)
--   - UNIQUE rejects a duplicate username
--   - NOT NULL rejects a missing username
--   - every existing row satisfies the format check (backfill/default safety)
--   - public.resolve_login_email was dropped (20260913110000) and anon has
--     no way to resolve a username to an email
-- ============================================================

BEGIN;
SELECT plan(10);

DO $$
DECLARE
  v_active_auth   uuid := '13611361-1361-1361-1361-136113611361';
  v_inactive_auth uuid := '13621362-1362-1362-1362-136213621362';
  v_norm_auth     uuid := '13631363-1363-1363-1363-136313631363';
BEGIN
  INSERT INTO auth.users (id, email) VALUES
    (v_active_auth,   'ana136@vitalock.example'),
    (v_inactive_auth, 'bruno136@vitalock.example'),
    (v_norm_auth,     'juan136@vitalock.example');

  INSERT INTO identity.staff (auth_user_id, full_name, role, status, username)
    VALUES (v_active_auth, 'Test 136 Ana Alvarez', 'admin', 'active', 'ana.alvarez136');

  INSERT INTO identity.staff (auth_user_id, full_name, role, status, username)
    VALUES (v_inactive_auth, 'Test 136 Bruno Benitez', 'installer', 'inactive', 'bruno.benitez136');

  -- Unlinked: matches a username but has no auth.users row.
  INSERT INTO identity.staff (full_name, role, status, username)
    VALUES ('Test 136 Carla Diaz', 'installer', 'active', 'carla.diaz136');

  INSERT INTO identity.staff (auth_user_id, full_name, role, status, username)
    VALUES (v_norm_auth, 'Test 136 Juan Perez', 'admin', 'active', 'juan.perez136');
END $$;

-- ============================================================
-- CHECK constraint: malformed usernames rejected (23514)
-- ============================================================

SELECT throws_ok(
  $q$ INSERT INTO identity.staff (full_name, role, status, username)
      VALUES ('Test 136 Fmt', 'admin', 'active', 'Ab') $q$,
  '23514',
  NULL,
  'PASS 136-01: uppercase username rejected by CHECK'
);

SELECT throws_ok(
  $q$ INSERT INTO identity.staff (full_name, role, status, username)
      VALUES ('Test 136 Fmt', 'admin', 'active', 'a b') $q$,
  '23514',
  NULL,
  'PASS 136-02: username with a space rejected by CHECK'
);

SELECT throws_ok(
  $q$ INSERT INTO identity.staff (full_name, role, status, username)
      VALUES ('Test 136 Fmt', 'admin', 'active', 'a@b') $q$,
  '23514',
  NULL,
  'PASS 136-03: username with @ rejected by CHECK'
);

SELECT throws_ok(
  $q$ INSERT INTO identity.staff (full_name, role, status, username)
      VALUES ('Test 136 Fmt', 'admin', 'active', 'ab') $q$,
  '23514',
  NULL,
  'PASS 136-04: 2-character username rejected by CHECK'
);

SELECT throws_ok(
  format(
    $q$ INSERT INTO identity.staff (full_name, role, status, username)
        VALUES ('Test 136 Fmt', 'admin', 'active', %L) $q$,
    repeat('a', 33)
  ),
  '23514',
  NULL,
  'PASS 136-05: 33-character username rejected by CHECK'
);

-- ============================================================
-- UNIQUE + NOT NULL
-- ============================================================

SELECT throws_ok(
  $q$ INSERT INTO identity.staff (full_name, role, status, username)
      VALUES ('Test 136 Dup', 'admin', 'active', 'ana.alvarez136') $q$,
  '23505',
  NULL,
  'PASS 136-06: duplicate username rejected by UNIQUE constraint'
);

SELECT throws_ok(
  $q$ INSERT INTO identity.staff (full_name, role, status, username)
      VALUES ('Test 136 Null', 'admin', 'active', NULL) $q$,
  '23502',
  NULL,
  'PASS 136-07: NULL username rejected by NOT NULL constraint'
);

-- ============================================================
-- Every row in the table satisfies the format check
-- (backfill and the default fallback both produce valid values)
-- ============================================================

SELECT is(
  (SELECT count(*)::int FROM identity.staff WHERE username !~ '^[a-z0-9._-]{3,32}$'),
  0,
  'PASS 136-08: every identity.staff.username value satisfies the format check'
);

-- ============================================================
-- resolve_login_email is gone (migration 20260913110000): login is email +
-- password only, so nothing pre-auth can map a username to an email.
-- ============================================================

SELECT hasnt_function(
  'public', 'resolve_login_email', ARRAY['text'],
  'PASS 136-09: public.resolve_login_email(text) no longer exists'
);

SELECT lives_ok(
  $q$
    DO $$
    DECLARE v_state text := 'none';
    BEGIN
      SET LOCAL role anon;
      BEGIN
        PERFORM public.resolve_login_email('admin');
      EXCEPTION WHEN OTHERS THEN v_state := SQLSTATE;
      END;
      RESET role;
      ASSERT v_state = '42883', 'FAIL 136-10: anon username lookup should be undefined_function, got ' || v_state;
    END $$;
  $q$,
  'PASS 136-10: anon cannot resolve a username to an email'
);

SELECT * FROM finish();
ROLLBACK;
