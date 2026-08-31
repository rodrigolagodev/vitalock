-- ============================================================
-- public.particulares — unit-owner entity (Vitalock direct buyers)
-- ============================================================
-- Promotes the ad-hoc "particular" from flat order fields to a
-- first-class entity bound 1:1 to a unit.
--   1:1 unit binding: unit_id NOT NULL UNIQUE (at most one per unit)
--   identity:        dni NOT NULL UNIQUE (DNI is the identity)
-- Building/administration are DERIVED via unit → building → administration
-- joins — no denormalized columns.
-- Snapshot rule: orders keep the flat particular_* fields as an audit
-- snapshot even after linking to this entity.

create table public.particulares (
  id         uuid        primary key default gen_random_uuid(),
  unit_id    uuid        not null unique references public.units(id) on delete restrict,
  dni        text        not null unique,
  full_name  text        not null,
  phone      text,
  email      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger particulares_set_updated_at
before update on public.particulares
for each row execute function public.set_updated_at();

------------------------------------------------------------
-- RLS (public-schema convention: policy only, no explicit grants)
------------------------------------------------------------
alter table public.particulares enable row level security;

create policy "admin_all_particulares" on public.particulares
  for all to authenticated
  using (identity.is_admin())
  with check (identity.is_admin());
