-- ============================================================
-- IDENTITY schema — internal users of the system
-- ============================================================
-- Represents Vitalock employees (admins, installers, viewers) as a first-class
-- entity, decoupled from the raw auth.users row. This lets us:
--   * Attach roles and business metadata (full name, phone, employee status)
--     without polluting auth.users.raw_user_meta_data.
--   * Reference the actor of an operation via FK (e.g. who installed which
--     key on which equipment) with referential integrity that survives even
--     if the auth row is later removed.
--
-- The link to auth.users is nullable on purpose: we can pre-provision a staff
-- record before the person logs in for the first time (or for legacy users
-- migrated from other systems). Once linked, it's enforced unique.

create schema if not exists identity;

create table identity.staff (
  id            uuid        primary key default gen_random_uuid(),
  -- Nullable: staff may exist in the system before their auth account is
  -- created (or without one, for external installers on a service contract).
  auth_user_id  uuid        unique references auth.users(id) on delete set null,
  full_name     text        not null,
  email         text        unique,
  phone         text,
  -- Roles map to what the app exposes:
  --   admin     -> full CRUD on customers + operations
  --   installer -> read-only on keys, can update sync_state on authorizations
  --                (i.e. mark "cargada" / "borrada" after visiting the site)
  --   viewer    -> read-only on everything (accountants, owners, auditors)
  role          text        not null
                            check (role in ('admin', 'installer', 'viewer')),
  status        text        not null default 'active'
                            check (status in ('active', 'inactive')),
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index staff_role_idx on identity.staff (role);

create trigger staff_set_updated_at
before update on identity.staff
for each row execute function public.set_updated_at();
