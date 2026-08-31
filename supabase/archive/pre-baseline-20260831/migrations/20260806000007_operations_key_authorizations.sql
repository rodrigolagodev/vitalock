-- ============================================================
-- OPERATIONS schema — key ↔ equipment authorizations
-- ============================================================
-- Records that a specific RFID key has been (or should be) loaded into a
-- specific piece of equipment. This is the operational counterpart to the
-- key's "ownership" (which lives in public.rfid_keys and is a legal fact).
--
-- Lifecycle of a row (only `sync_state` is mutable):
--
--   admin creates it            technician goes to site
--   for a new key   ────►  pending_install ──────► installed
--                                                     │
--   admin flags to revoke                             ▼
--   (key lost, tenant left) ─►                  pending_removal
--                                                     │
--                              technician goes to site
--                                                     ▼
--                                                  removed
--
-- Once created, (rfid_key_id, equipment_id) is fixed forever. You cannot
-- reassign an authorization to another key or another equipment; if physical
-- reality changes, you insert new rows. Historical rows are the audit trail.

create table operations.key_authorizations (
  id                     uuid        primary key default gen_random_uuid(),
  -- Cross-schema FK. Same database, so referential integrity is real.
  rfid_key_id            uuid        not null
                                     references public.rfid_keys(id)
                                     on delete restrict,
  equipment_id           uuid        not null
                                     references operations.equipment(id)
                                     on delete restrict,
  sync_state             text        not null default 'pending_install'
                                     check (sync_state in (
                                       'pending_install',
                                       'installed',
                                       'pending_removal',
                                       'removed'
                                     )),
  -- Set by trigger when sync_state moves to 'installed'.
  installed_at           timestamptz,
  installed_by_staff_id  uuid        references identity.staff(id) on delete set null,
  -- Set by trigger when sync_state moves to 'removed'.
  removed_at             timestamptz,
  removed_by_staff_id    uuid        references identity.staff(id) on delete set null,
  remove_reason          text,
  notes                  text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),

  -- Only one authorization per (key, equipment) pair over the row's lifetime.
  -- Re-adding a key that was previously removed from the same equipment is
  -- explicitly NOT supported: it would break the audit trail (which visit
  -- installed it?). If reinstall is ever a real business case, we lift this.
  constraint key_authorizations_key_equipment_unique
    unique (rfid_key_id, equipment_id)
);

create index key_authorizations_rfid_key_id_idx
  on operations.key_authorizations (rfid_key_id);
create index key_authorizations_equipment_id_idx
  on operations.key_authorizations (equipment_id);
create index key_authorizations_sync_state_idx
  on operations.key_authorizations (sync_state);
-- Composite that installers hit constantly: "what's pending for this device?"
create index key_authorizations_equipment_pending_idx
  on operations.key_authorizations (equipment_id, sync_state)
  where sync_state in ('pending_install', 'pending_removal');

create trigger key_authorizations_set_updated_at
before update on operations.key_authorizations
for each row execute function public.set_updated_at();

------------------------------------------------------------
-- Immutability of the pair (rfid_key_id, equipment_id).
------------------------------------------------------------
create or replace function operations.key_authorizations_prevent_reassignment()
returns trigger
language plpgsql
as $$
begin
  if new.rfid_key_id is distinct from old.rfid_key_id then
    raise exception 'key_authorizations.rfid_key_id is immutable (id %)', old.id
      using errcode = 'check_violation';
  end if;
  if new.equipment_id is distinct from old.equipment_id then
    raise exception 'key_authorizations.equipment_id is immutable (id %)', old.id
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger key_authorizations_prevent_reassignment
before update on operations.key_authorizations
for each row execute function operations.key_authorizations_prevent_reassignment();

------------------------------------------------------------
-- Validate sync_state transitions and coherence with related entities.
------------------------------------------------------------
-- Rules:
--   * Legal transitions:
--       (INSERT)         -> pending_install
--       pending_install  -> installed
--       pending_install  -> removed          (install cancelled before happening)
--       installed        -> pending_removal
--       pending_removal  -> removed
--     All other transitions are rejected (including any regression).
--   * Cannot create an authorization for a dead equipment.
--   * Cannot create an authorization for a key that is not 'active'.
--     (A key that is 'disabled' or 'lost' should be having its authorizations
--      removed, not created.)
--
-- These invariants live in the DB because the "installer" role will be
-- flipping sync_state directly through the API and must not be able to
-- shortcut the workflow (e.g. jump straight from pending_install to removed).
create or replace function operations.key_authorizations_validate()
returns trigger
language plpgsql
as $$
declare
  key_status  text;
  equip_status text;
begin
  if tg_op = 'INSERT' then
    select status into key_status  from public.rfid_keys      where id = new.rfid_key_id;
    select status into equip_status from operations.equipment where id = new.equipment_id;

    if key_status <> 'active' then
      raise exception
        'cannot authorize an rfid_key with status=% (only active keys can be authorized)',
        key_status
        using errcode = 'check_violation';
    end if;
    if equip_status = 'dead' then
      raise exception
        'cannot authorize on equipment with status=dead'
        using errcode = 'check_violation';
    end if;
    -- New authorizations always start in pending_install regardless of what
    -- the caller passed. This prevents the app from "backdating" installs.
    new.sync_state := 'pending_install';
    return new;
  end if;

  -- UPDATE path: only sync_state and audit fields can move.
  if new.sync_state is distinct from old.sync_state then
    if not (
      (old.sync_state = 'pending_install' and new.sync_state = 'installed')
      or (old.sync_state = 'pending_install' and new.sync_state = 'removed')
      or (old.sync_state = 'installed'       and new.sync_state = 'pending_removal')
      or (old.sync_state = 'pending_removal' and new.sync_state = 'removed')
    ) then
      raise exception
        'invalid sync_state transition: % -> %', old.sync_state, new.sync_state
        using errcode = 'check_violation';
    end if;
  end if;

  return new;
end;
$$;

create trigger key_authorizations_validate
before insert or update on operations.key_authorizations
for each row execute function operations.key_authorizations_validate();

------------------------------------------------------------
-- Auto-fill installed_at / removed_at when sync_state transitions.
------------------------------------------------------------
create or replace function operations.key_authorizations_sync_timestamps()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' and new.sync_state is distinct from old.sync_state then
    if new.sync_state = 'installed' and new.installed_at is null then
      new.installed_at := now();
    end if;
    if new.sync_state = 'removed' and new.removed_at is null then
      new.removed_at := now();
    end if;
  end if;
  return new;
end;
$$;

create trigger key_authorizations_sync_timestamps
before update on operations.key_authorizations
for each row execute function operations.key_authorizations_sync_timestamps();
