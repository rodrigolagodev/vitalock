-- rfid_keys: the RFID credentials sold and installed for access control.
--
-- Two flavors coexist in the same table:
--   * key_type = 'unit'            -> belongs to a specific unit
--   * key_type = 'administrative'  -> belongs to an administration, no unit
--
-- Design choice (see supabase/README.md for full rationale): two mutually
-- exclusive nullable FKs (`unit_id` XOR `administration_id`), enforced by a
-- CHECK constraint. Rejected alternatives:
--   * sentinel unit_id (e.g. -1)  -> breaks referential integrity
--   * only unit_id nullable       -> loses the administration link for admin
--                                    keys, violating the business rule that
--                                    every administrative key must be
--                                    traceable back to its owner.

create table public.rfid_keys (
  id                 uuid        primary key default gen_random_uuid(),
  -- RFID codes are globally unique in the whole system.
  rfid_code          text        not null unique,
  key_type           text        not null
                                 check (key_type in ('unit', 'administrative')),
  -- Exactly one of these two is set (enforced by CHECK below).
  -- ON DELETE RESTRICT on both: never lose the trace of who a key belonged to.
  unit_id            uuid        references public.units(id) on delete restrict,
  administration_id  uuid        references public.administrations(id) on delete restrict,
  status             text        not null default 'active'
                                 check (status in ('active', 'disabled', 'lost')),
  -- Free text for buyer name or any other annotation. Buyers are NOT modeled
  -- as entities; if a name is worth keeping it lives here.
  notes              text,
  activated_at       timestamptz not null default now(),
  -- Auto-populated by trigger when status transitions out of 'active'.
  deactivated_at     timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  -- Enforces the XOR between the two ownership FKs and keeps key_type in sync
  -- with which FK is populated. The application cannot bypass this.
  constraint rfid_keys_ownership_xor check (
    (key_type = 'unit'
      and unit_id is not null
      and administration_id is null)
    or
    (key_type = 'administrative'
      and administration_id is not null
      and unit_id is null)
  )
);

create index rfid_keys_unit_id_idx            on public.rfid_keys (unit_id);
create index rfid_keys_administration_id_idx  on public.rfid_keys (administration_id);
create index rfid_keys_status_idx             on public.rfid_keys (status);

create trigger rfid_keys_set_updated_at
before update on public.rfid_keys
for each row execute function public.set_updated_at();

------------------------------------------------------------
-- Immutability of assignment (business rule)
------------------------------------------------------------
-- Once a key is created and assigned to a unit or administration, that
-- assignment is permanent. It cannot be reassigned, retyped, or transferred.
-- This is a legal/traceability requirement. Enforced at the DB layer so it
-- holds regardless of which service or ad-hoc query touches the table.
-- Lifecycle changes (active -> disabled/lost) go through `status` instead.
create or replace function public.rfid_keys_prevent_reassignment()
returns trigger
language plpgsql
as $$
begin
  if new.unit_id is distinct from old.unit_id then
    raise exception 'rfid_keys.unit_id is immutable (key %)', old.id
      using errcode = 'check_violation';
  end if;
  if new.administration_id is distinct from old.administration_id then
    raise exception 'rfid_keys.administration_id is immutable (key %)', old.id
      using errcode = 'check_violation';
  end if;
  if new.key_type is distinct from old.key_type then
    raise exception 'rfid_keys.key_type is immutable (key %)', old.id
      using errcode = 'check_violation';
  end if;
  if new.rfid_code is distinct from old.rfid_code then
    raise exception 'rfid_keys.rfid_code is immutable (key %)', old.id
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger rfid_keys_prevent_reassignment
before update on public.rfid_keys
for each row execute function public.rfid_keys_prevent_reassignment();

------------------------------------------------------------
-- Auto-fill / auto-clear of deactivated_at based on status
------------------------------------------------------------
-- Keeps deactivated_at consistent with `status` without relying on callers.
-- The column is still writable directly if a specific timestamp is provided.
create or replace function public.rfid_keys_sync_deactivated_at()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    if new.status in ('disabled', 'lost') and new.deactivated_at is null then
      new.deactivated_at := now();
    end if;
    return new;
  end if;

  if new.status is distinct from old.status then
    if new.status in ('disabled', 'lost') then
      -- Only auto-fill if the caller didn't set it explicitly in this update.
      if new.deactivated_at is null or new.deactivated_at = old.deactivated_at then
        new.deactivated_at := now();
      end if;
    else
      -- Reactivation clears the timestamp.
      new.deactivated_at := null;
    end if;
  end if;
  return new;
end;
$$;

create trigger rfid_keys_sync_deactivated_at
before insert or update on public.rfid_keys
for each row execute function public.rfid_keys_sync_deactivated_at();
