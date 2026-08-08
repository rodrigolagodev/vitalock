-- ============================================================
-- PLACEHOLDER RLS POLICIES — identity + operations schemas
-- ============================================================
-- Same story as the placeholders on public.*: RLS enabled from day one,
-- permissive policies for the authenticated role, tightened later.
--
-- TODO(final policies): once identity.staff has real rows tied to
-- auth.users, the intended shape is roughly:
--
--   * admin      -> full access to everything
--   * installer  -> SELECT on public.rfid_keys, buildings, units;
--                   SELECT + UPDATE(sync_state, installed_by_staff_id,
--                   removed_by_staff_id, remove_reason, notes) on
--                   operations.key_authorizations;
--                   SELECT on operations.equipment.
--   * viewer     -> SELECT-only on everything.
--
-- A helper SQL function `identity.current_staff_role()` will make the
-- policies readable.
-- ============================================================

alter table identity.staff                enable row level security;
alter table operations.equipment          enable row level security;
alter table operations.key_authorizations enable row level security;

create policy "authenticated_all_staff"
  on identity.staff
  for all
  to authenticated
  using (true)
  with check (true);

create policy "authenticated_all_equipment"
  on operations.equipment
  for all
  to authenticated
  using (true)
  with check (true);

create policy "authenticated_all_key_authorizations"
  on operations.key_authorizations
  for all
  to authenticated
  using (true)
  with check (true);

-- PostgREST needs to see the new schemas to expose them via the API.
-- (Adjust config.toml if you don't want operations exposed publicly.)
grant usage on schema identity   to anon, authenticated, service_role;
grant usage on schema operations to anon, authenticated, service_role;

grant all on all tables    in schema identity   to anon, authenticated, service_role;
grant all on all sequences in schema identity   to anon, authenticated, service_role;
grant all on all routines  in schema identity   to anon, authenticated, service_role;

grant all on all tables    in schema operations to anon, authenticated, service_role;
grant all on all sequences in schema operations to anon, authenticated, service_role;
grant all on all routines  in schema operations to anon, authenticated, service_role;

alter default privileges in schema identity
  grant all on tables    to anon, authenticated, service_role;
alter default privileges in schema identity
  grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema identity
  grant all on routines  to anon, authenticated, service_role;

alter default privileges in schema operations
  grant all on tables    to anon, authenticated, service_role;
alter default privileges in schema operations
  grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema operations
  grant all on routines  to anon, authenticated, service_role;
