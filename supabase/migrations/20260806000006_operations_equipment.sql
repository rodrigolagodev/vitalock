-- ============================================================
-- OPERATIONS schema — physical equipment installed at buildings
-- ============================================================
-- An equipment row represents ONE physical controller (one door). It lives
-- and dies inside a single building; it is never transferred to another
-- building. If a controller goes to another site, that is modeled as a new
-- equipment row (out of scope: current business rule says equipment stays
-- where it was installed, and is either repaired in place or discarded).

create schema if not exists operations;

create table operations.equipment (
  id                        uuid        primary key default gen_random_uuid(),
  -- Globally unique physical serial. Immutable — a serial identifies a
  -- specific device; if a replacement comes in, it comes as a new row.
  serial_number             text        not null unique,
  model                     text,
  -- Immutable FK: an equipment belongs to one building for its whole life.
  building_id               uuid        not null
                                        references public.buildings(id)
                                        on delete restrict,
  -- Human label for the door / access this controller manages.
  -- Kept free text because the taxonomy is not stable across administrations
  -- (some sites split "cochera vehicular" vs "cochera moto", etc.).
  description               text        not null,
  -- Coarse categorization for reporting; also free-ish (CHECK is a hint).
  access_type               text        check (access_type in (
                                          'peatonal',
                                          'cochera',
                                          'service',
                                          'terraza',
                                          'amenities',
                                          'other'
                                        )),
  status                    text        not null default 'active'
                                        check (status in ('active', 'maintenance', 'dead')),
  -- If this equipment came in to replace a previous one at the same building.
  -- ON DELETE RESTRICT: never lose the chain of replacements.
  replaces_equipment_id     uuid        references operations.equipment(id)
                                        on delete restrict,
  installed_at              timestamptz not null default now(),
  -- Set automatically by trigger when status becomes 'dead'.
  decommissioned_at         timestamptz,
  decommission_reason       text,
  notes                     text,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

create index equipment_building_id_idx           on operations.equipment (building_id);
create index equipment_status_idx                on operations.equipment (status);
create index equipment_replaces_equipment_id_idx on operations.equipment (replaces_equipment_id);

create trigger equipment_set_updated_at
before update on operations.equipment
for each row execute function public.set_updated_at();

------------------------------------------------------------
-- Immutability: serial_number and building_id are permanent.
------------------------------------------------------------
-- An equipment row must not silently change identity or location. Repairs
-- keep the same row; replacements create a new one. This mirrors the same
-- rule we enforce on rfid_keys and reflects the traceability requirement.
create or replace function operations.equipment_prevent_reassignment()
returns trigger
language plpgsql
as $$
begin
  if new.serial_number is distinct from old.serial_number then
    raise exception 'operations.equipment.serial_number is immutable (id %)', old.id
      using errcode = 'check_violation';
  end if;
  if new.building_id is distinct from old.building_id then
    raise exception 'operations.equipment.building_id is immutable (id %)', old.id
      using errcode = 'check_violation';
  end if;
  if new.replaces_equipment_id is distinct from old.replaces_equipment_id then
    raise exception 'operations.equipment.replaces_equipment_id is immutable (id %)', old.id
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger equipment_prevent_reassignment
before update on operations.equipment
for each row execute function operations.equipment_prevent_reassignment();

------------------------------------------------------------
-- Sync decommissioned_at with the 'dead' status.
------------------------------------------------------------
create or replace function operations.equipment_sync_decommissioned_at()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    if new.status = 'dead' and new.decommissioned_at is null then
      new.decommissioned_at := now();
    end if;
    return new;
  end if;

  if new.status is distinct from old.status then
    if new.status = 'dead' then
      if new.decommissioned_at is null or new.decommissioned_at = old.decommissioned_at then
        new.decommissioned_at := now();
      end if;
    else
      -- Any transition away from dead clears the timestamp. In practice this
      -- only happens if a status was set to 'dead' by mistake and corrected
      -- before it settled; a truly dead equipment does not come back.
      new.decommissioned_at := null;
    end if;
  end if;
  return new;
end;
$$;

create trigger equipment_sync_decommissioned_at
before insert or update on operations.equipment
for each row execute function operations.equipment_sync_decommissioned_at();

------------------------------------------------------------
-- Enforce that a replacement targets a dead equipment at the SAME building.
------------------------------------------------------------
-- The business rule "equipment stays at the building where it was installed"
-- extends to replacements: you can't have equipment B at building X pretend
-- to replace equipment A at building Y.
create or replace function operations.equipment_validate_replacement()
returns trigger
language plpgsql
as $$
declare
  predecessor operations.equipment%rowtype;
begin
  if new.replaces_equipment_id is null then
    return new;
  end if;

  select * into predecessor
  from operations.equipment
  where id = new.replaces_equipment_id;

  if predecessor.building_id <> new.building_id then
    raise exception
      'replacement must be at the same building (predecessor % is at %, new is at %)',
      predecessor.id, predecessor.building_id, new.building_id
      using errcode = 'check_violation';
  end if;

  if predecessor.status <> 'dead' then
    raise exception
      'predecessor equipment % must be status=dead to be replaced (current: %)',
      predecessor.id, predecessor.status
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger equipment_validate_replacement
before insert on operations.equipment
for each row execute function operations.equipment_validate_replacement();
