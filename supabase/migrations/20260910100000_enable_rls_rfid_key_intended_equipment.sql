-- ============================================================
-- Enable RLS on public.rfid_key_intended_equipment (P0-1)
-- ============================================================
-- The baseline created this table (baseline.sql:5369) and granted ALL to
-- anon/authenticated (baseline.sql:8118-8119) but never enabled row level
-- security. Supabase's security advisor reports it as
-- `rls_disabled_in_public` (level ERROR): anyone holding the public anon key
-- can read and mutate every row unauthenticated.
--
-- Policy shape mirrors public.rfid_keys, which this table extends:
--   - admin: full access (all commands)
--   - installer: read-only
--   - anon: nothing (grant revoked; RLS would filter to zero rows anyway)
--
-- Writes to this table already go through SECURITY DEFINER RPCs
-- (configure_key_order_item), which run as the function owner and are not
-- affected by these policies.
-- ============================================================

alter table public.rfid_key_intended_equipment enable row level security;

-- Defence in depth: the anon role has no business reading key<->equipment
-- intent. RLS alone would already return zero rows, but revoking the table
-- grant fails fast at the privilege check instead of scanning.
revoke all on table public.rfid_key_intended_equipment from anon;

drop policy if exists admin_all_rfid_key_intended_equipment on public.rfid_key_intended_equipment;
create policy admin_all_rfid_key_intended_equipment
  on public.rfid_key_intended_equipment
  to authenticated
  using (identity.is_admin())
  with check (identity.is_admin());

drop policy if exists installer_read_rfid_key_intended_equipment on public.rfid_key_intended_equipment;
create policy installer_read_rfid_key_intended_equipment
  on public.rfid_key_intended_equipment
  for select
  to authenticated
  using (identity.is_installer());

comment on table public.rfid_key_intended_equipment is
  'Which equipment a key is intended to be loaded on, recorded at order-item configuration time. RLS: admin all, installer read-only.';
