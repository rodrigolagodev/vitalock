-- Core hierarchy: administrations -> buildings -> units.
-- administrations is the only billable "customer" entity in the system.
-- Owners/tenants are intentionally NOT modeled: any buyer name is captured as
-- free text in rfid_keys.notes, never as a related entity.

------------------------------------------------------------
-- administrations
------------------------------------------------------------
create table public.administrations (
  id              uuid        primary key default gen_random_uuid(),
  company_name    text        not null,
  -- Argentine tax id (CUIT). Unique but optional; format not enforced here on
  -- purpose so onboarding can be flexible. Add a stricter CHECK later if needed.
  tax_id          text        unique,
  email           text,
  phone           text,
  address         text,
  -- Lifecycle is soft: deletions are forbidden (see FK ON DELETE RESTRICT below).
  status          text        not null default 'active'
                              check (status in ('active', 'inactive')),
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create trigger administrations_set_updated_at
before update on public.administrations
for each row execute function public.set_updated_at();

------------------------------------------------------------
-- buildings
------------------------------------------------------------
create table public.buildings (
  id                    uuid        primary key default gen_random_uuid(),
  -- ON DELETE RESTRICT: an administration with buildings cannot be deleted.
  -- Access control is a legal/traceability system; cascading deletes would
  -- silently destroy audit history. Deactivation is done via `status`.
  administration_id     uuid        not null
                                    references public.administrations(id)
                                    on delete restrict,
  name                  text        not null,
  address               text,
  city                  text,
  status                text        not null default 'active'
                                    check (status in ('active', 'inactive')),
  notes                 text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index buildings_administration_id_idx
  on public.buildings (administration_id);

create trigger buildings_set_updated_at
before update on public.buildings
for each row execute function public.set_updated_at();

------------------------------------------------------------
-- units
------------------------------------------------------------
create table public.units (
  id           uuid        primary key default gen_random_uuid(),
  building_id  uuid        not null
                           references public.buildings(id)
                           on delete restrict,
  -- Free-form so it accepts '101', 'A-201', 'Local 1', 'PB-Depto A', etc.
  number       text        not null,
  -- Free text on purpose (departamento, local, cochera, baulera, ...).
  -- Not constrained by CHECK because the taxonomy is not stable yet.
  unit_type    text,
  status       text        not null default 'active'
                           check (status in ('active', 'inactive')),
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  -- Business rule: unit number is unique WITHIN a building, not globally.
  -- Two different buildings can each have a unit '101'.
  constraint units_building_number_unique unique (building_id, number)
);

create index units_building_id_idx on public.units (building_id);

create trigger units_set_updated_at
before update on public.units
for each row execute function public.set_updated_at();
