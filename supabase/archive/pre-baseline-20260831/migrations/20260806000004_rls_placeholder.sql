-- ============================================================
-- PLACEHOLDER RLS POLICIES
-- ============================================================
-- RLS is enabled from day one on every table (Supabase best practice).
-- The policies below are intentionally permissive for any signed-in user.
--
-- TODO(multi-tenancy): when the auth model is finalized, replace the
-- permissive policies with tenant-scoped ones. A likely shape:
--
--   * `administration_members(user_id, administration_id, role)` join table
--     linking auth.users to administrations they can access.
--   * SELECT/UPDATE/INSERT/DELETE policies that require the row's owning
--     administration to appear in that join for auth.uid().
--   * For `buildings`, `units`, `rfid_keys`: derive the administration via FK
--     joins (e.g. units -> buildings.administration_id).
--
-- Do NOT ship these policies to production as-is.
-- ============================================================

alter table public.administrations enable row level security;
alter table public.buildings       enable row level security;
alter table public.units           enable row level security;
alter table public.rfid_keys       enable row level security;

-- Permissive placeholder: any authenticated user can do anything.
-- Replace before going to production. See TODO above.
create policy "authenticated_all_administrations"
  on public.administrations
  for all
  to authenticated
  using (true)
  with check (true);

create policy "authenticated_all_buildings"
  on public.buildings
  for all
  to authenticated
  using (true)
  with check (true);

create policy "authenticated_all_units"
  on public.units
  for all
  to authenticated
  using (true)
  with check (true);

create policy "authenticated_all_rfid_keys"
  on public.rfid_keys
  for all
  to authenticated
  using (true)
  with check (true);
