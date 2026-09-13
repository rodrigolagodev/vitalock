-- ============================================================
-- pgTAP: identity.staff.username format/uniqueness + resolve_login_email
-- ============================================================
-- Covers migration 20260912120000_add_staff_username.
--   - CHECK rejects malformed usernames (case, whitespace, `@`, length)
--   - UNIQUE rejects a duplicate username
--   - NOT NULL rejects a missing username
--   - every existing row satisfies the format check (backfill/default safety)
--   - resolve_login_email resolves active+linked staff to their auth email,
--     and returns NULL (never an error) for inactive/unlinked/unknown/malformed
--     input, normalizing case and surrounding whitespace server-side
--   - anon/authenticated/service_role can execute; PUBLIC cannot
-- ============================================================

BEGIN;
SELECT plan(22);

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
-- resolve_login_email contract
-- ============================================================

SELECT is(
  public.resolve_login_email('ana.alvarez136'),
  'ana136@vitalock.example',
  'PASS 136-09: active, linked staff resolves to their auth.users email'
);

SELECT is(
  public.resolve_login_email('bruno.benitez136'),
  NULL,
  'PASS 136-10: inactive staff resolves to NULL'
);

SELECT is(
  public.resolve_login_email('carla.diaz136'),
  NULL,
  'PASS 136-11: unlinked staff (no auth_user_id) resolves to NULL'
);

SELECT is(
  public.resolve_login_email('nonexistent-user-136'),
  NULL,
  'PASS 136-12: unknown username resolves to NULL'
);

SELECT is(
  public.resolve_login_email('a@b'),
  NULL,
  'PASS 136-13: malformed username (@) resolves to NULL without error'
);

SELECT is(
  public.resolve_login_email('ab'),
  NULL,
  'PASS 136-14: malformed username (too short) resolves to NULL without error'
);

SELECT is(
  public.resolve_login_email(repeat('a', 33)),
  NULL,
  'PASS 136-15: malformed username (too long) resolves to NULL without error'
);

SELECT is(
  public.resolve_login_email(NULL),
  NULL,
  'PASS 136-16: NULL input resolves to NULL without error'
);

SELECT is(
  public.resolve_login_email('  Juan.Perez136 '),
  'juan136@vitalock.example',
  'PASS 136-17: case and surrounding whitespace are normalized server-side'
);

-- ============================================================
-- Privileges: anon/authenticated/service_role can execute, PUBLIC cannot
-- ============================================================

SELECT lives_ok(
  $q$
    DO $body$
    BEGIN
      SET LOCAL role anon;
      PERFORM public.resolve_login_email('ana.alvarez136');
      RESET role;
    END $body$;
  $q$,
  'PASS 136-18: anon can execute resolve_login_email'
);

SELECT ok(
  has_function_privilege('anon', 'public.resolve_login_email(text)', 'execute'),
  'PASS 136-19: anon has EXECUTE on resolve_login_email'
);

SELECT ok(
  has_function_privilege('authenticated', 'public.resolve_login_email(text)', 'execute'),
  'PASS 136-20: authenticated has EXECUTE on resolve_login_email'
);

SELECT ok(
  has_function_privilege('service_role', 'public.resolve_login_email(text)', 'execute'),
  'PASS 136-21: service_role has EXECUTE on resolve_login_email'
);

SELECT ok(
  NOT has_function_privilege('public', 'public.resolve_login_email(text)', 'execute'),
  'PASS 136-22: PUBLIC has no EXECUTE on resolve_login_email'
);

SELECT * FROM finish();
ROLLBACK;
