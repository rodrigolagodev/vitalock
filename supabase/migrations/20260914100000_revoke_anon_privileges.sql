-- ============================================================
-- Close every remaining anon privilege in the application schemas
-- ============================================================
-- After phase 1 there is no pre-auth RPC: the login screen talks to GoTrue
-- (`/auth/v1`), never to PostgREST. Yet the baseline still carried
--   - `ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL
--     ON TABLES/SEQUENCES/FUNCTIONS TO anon` (so every new public object was
--     born anon-readable/writable — RLS was the only line of defense), and
--   - explicit anon grants on the 19 legacy public tables, views and
--     sequences (administrations, buildings, units, rfid_keys, ...).
-- Postgres also grants EXECUTE on every new function to PUBLIC, which made
-- the invoker trigger/helper functions in identity/operations/sales/support
-- callable by anon.
--
-- This migration removes all of that. `authenticated` and `service_role`
-- keep their explicit grants (every client-callable function already has an
-- explicit `authenticated` grant — verified before writing this migration —
-- so dropping PUBLIC does not reach them). Trigger functions need no
-- EXECUTE grant at fire time.
--
-- Out of reach from a migration: default privileges FOR ROLE supabase_admin
-- (the migration role, `postgres`, is not a member of it). supabase_admin
-- does not create objects in the app schemas; test_138 asserts the end state
-- on the objects themselves, so a stray grant is still caught.
--
-- `storage`, `realtime`, `graphql*` and the other Supabase-managed schemas
-- are intentionally untouched.
-- ============================================================

-- 1. Future objects: stop granting to anon (and to PUBLIC for functions).
alter default privileges for role postgres in schema public
  revoke all on tables from anon;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon;
alter default privileges for role postgres in schema public
  revoke all on functions from anon;

-- The PUBLIC EXECUTE default for functions is global (not per schema), so it
-- is revoked globally for objects created by postgres. Every app schema has
-- its own default grant to authenticated/service_role, so new functions stay
-- reachable by the client roles that should reach them.
alter default privileges for role postgres
  revoke execute on functions from public;

-- Belt and braces for the non-public app schemas (they never granted anon,
-- this keeps it that way if someone adds such a default later by mistake).
alter default privileges for role postgres in schema identity, operations, sales, support
  revoke all on tables from anon;
alter default privileges for role postgres in schema identity, operations, sales, support
  revoke all on sequences from anon;
alter default privileges for role postgres in schema identity, operations, sales, support
  revoke all on functions from anon;

-- 2. Existing objects.
revoke all on all tables in schema public, identity, operations, sales, support from anon;
revoke all on all sequences in schema public, identity, operations, sales, support from anon;
revoke all on all functions in schema public, identity, operations, sales, support from anon, public;
