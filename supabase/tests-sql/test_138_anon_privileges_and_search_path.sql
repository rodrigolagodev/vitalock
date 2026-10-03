-- ============================================================
-- pgTAP: anon has no privileges in the app schemas; app functions pin
-- their search_path
-- ============================================================
-- Covers migrations 20260914100000_revoke_anon_privileges.sql and
-- 20260914110000_pin_function_search_path.sql.
--
-- App schemas: public, identity, operations, sales, support. Supabase-managed
-- schemas (storage, realtime, graphql*, extensions, ...) are out of scope.
--
-- Allowlist: none. Nothing in the app schemas is meant to be reachable
-- before login (the login screen only talks to GoTrue). If an anon-callable
-- object is ever needed, add it to the `allowlist` CTEs below with a comment
-- explaining why, and keep it SECURITY INVOKER behind RLS where possible.
-- ============================================================

BEGIN;
SELECT plan(8);

-- 1. No table / view / matview / foreign table / sequence grants to anon.
SELECT is_empty(
  $$
    with allowlist(oid) as (select null::oid where false)
    select n.nspname || '.' || c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname in ('public', 'identity', 'operations', 'sales', 'support')
       and c.relkind in ('r', 'p', 'v', 'm', 'f', 'S')
       and c.oid not in (select oid from allowlist)
       and (
         has_table_privilege('anon', c.oid,
           'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
         or (c.relkind = 'S' and has_sequence_privilege('anon', c.oid, 'USAGE, SELECT, UPDATE'))
       )
  $$,
  'anon has no privilege on any table, view or sequence in the app schemas'
);

-- 2. No column-level grants to anon either.
SELECT is_empty(
  $$
    select table_schema || '.' || table_name || '.' || column_name
      from information_schema.column_privileges
     where grantee = 'anon'
       and table_schema in ('public', 'identity', 'operations', 'sales', 'support')
  $$,
  'anon has no column-level privilege in the app schemas'
);

-- 3. No SECURITY DEFINER function executable by anon (directly or via PUBLIC).
SELECT is_empty(
  $$
    with allowlist(oid) as (select null::oid where false)
    select p.oid::regprocedure::text
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname in ('public', 'identity', 'operations', 'sales', 'support')
       and p.prosecdef
       and p.oid not in (select oid from allowlist)
       and has_function_privilege('anon', p.oid, 'EXECUTE')
  $$,
  'no SECURITY DEFINER function in the app schemas is executable by anon'
);

-- 4. No SECURITY DEFINER function grants EXECUTE to PUBLIC (a NULL proacl
--    means the built-in default, which includes PUBLIC).
SELECT is_empty(
  $$
    select p.oid::regprocedure::text
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname in ('public', 'identity', 'operations', 'sales', 'support')
       and p.prosecdef
       and (
         p.proacl is null
         or exists (
           select 1 from aclexplode(p.proacl) a
            where a.grantee = 0 and a.privilege_type = 'EXECUTE'
         )
       )
  $$,
  'no SECURITY DEFINER function in the app schemas is executable by PUBLIC'
);

-- 5. No function at all in the app schemas is executable by anon.
SELECT is_empty(
  $$
    select p.oid::regprocedure::text
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname in ('public', 'identity', 'operations', 'sales', 'support')
       and has_function_privilege('anon', p.oid, 'EXECUTE')
  $$,
  'no function in the app schemas is executable by anon'
);

-- 6. Default privileges of the migration role never grant to anon, so the
--    next migration cannot silently re-open the hole.
SELECT is_empty(
  $$
    select coalesce(d.defaclnamespace::regnamespace::text, '(global)') || ' ' || d.defaclobjtype::text
      from pg_default_acl d
      cross join lateral aclexplode(d.defaclacl) a
     where d.defaclrole = 'postgres'::regrole
       and (d.defaclnamespace = 0
            or d.defaclnamespace::regnamespace::text
               in ('public', 'identity', 'operations', 'sales', 'support'))
       and a.grantee = 'anon'::regrole
  $$,
  'postgres default privileges grant nothing to anon in the app schemas'
);

-- 7. Every function in the app schemas pins its search_path.
SELECT is_empty(
  $$
    select p.oid::regprocedure::text
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname in ('public', 'identity', 'operations', 'sales', 'support')
       and p.prokind in ('f', 'p')
       and not exists (
         select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%'
       )
  $$,
  'every function in the app schemas has a pinned search_path'
);

-- 8. Behavioral check through the anon role, like PostgREST does pre-login.
SET LOCAL role anon;
SELECT throws_ok(
  'select 1 from public.buildings limit 1',
  '42501',
  NULL,
  'anon cannot read public.buildings'
);
RESET role;

SELECT * FROM finish();
ROLLBACK;
