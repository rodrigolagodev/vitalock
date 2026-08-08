-- ============================================================
-- REFACTOR: administrative keys move onto an "admin unit" per building
-- + fixes surfaced by the schema audit
-- ============================================================
-- Business change: every rfid_key now belongs to a unit — no dual nature.
-- Each building has AT MOST ONE unit flagged as is_administrative=true; that
-- unit is the slot where administrative keys (portería, mantenimiento, etc.)
-- are issued. "For whom" info lives in rfid_keys.notes.
--
-- Also folded in (same surface area, one migration):
--   * key_authorizations must be at the same building as the key.
--   * equipment status machine enforcement (dead is terminal).
--   * marking an equipment as dead auto-closes its authorizations.
--   * marking a key as lost/disabled auto-revokes its authorizations.
--   * equipment.installed_at joins the immutable set.
--   * anon role no longer sees identity/operations by grant (defense in depth).
--   * replace_equipment simplified: trigger handles closing authorizations.

------------------------------------------------------------
-- 1) is_administrative flag on units + one-per-building unique
------------------------------------------------------------
alter table public.units
  add column is_administrative boolean not null default false;

-- Partial unique index: at most one admin slot per building.
-- Buildings without any admin key don't need one.
create unique index units_one_admin_per_building_idx
  on public.units (building_id)
  where is_administrative = true;

comment on column public.units.is_administrative is
  'Marks the building''s admin-key slot. At most one per building. '
  'Administrative keys (portería, mantenimiento, ...) are assigned to '
  'this unit; the specific role is noted in rfid_keys.notes.';

------------------------------------------------------------
-- 2) Data migration for existing administrative rfid_keys
------------------------------------------------------------
-- Existing admin keys point to administration_id and have unit_id NULL.
-- For each administration that has admin keys, create an admin unit in the
-- FIRST building of that administration (by created_at) and move the keys
-- to it. This is a deliberate default; the user can move them manually
-- afterwards if a specific admin key belongs to another building.
--
-- Empty tables? The DO $$ block below is a no-op — safe on fresh reset.

-- Temporarily disable the rfid_keys immutability trigger so we can rewrite
-- unit_id / administration_id / key_type on the historical rows.
alter table public.rfid_keys disable trigger rfid_keys_prevent_reassignment;

-- Create the admin unit in the first building of each administration that
-- currently has admin keys. Number defaults to '00'; the admin can rename.
with first_building_per_admin as (
  select distinct on (administration_id) id, administration_id
  from public.buildings
  order by administration_id, created_at
)
insert into public.units (building_id, number, unit_type, is_administrative, notes)
select fb.id,
       '00',
       'administrativa',
       true,
       'Unidad slot para llaves administrativas del edificio.'
from first_building_per_admin fb
where exists (
  select 1 from public.rfid_keys k
  where k.administration_id = fb.administration_id
    and k.key_type = 'administrative'
);

-- Reassign every administrative key to its admin unit.
with admin_unit_by_admin as (
  select u.id as admin_unit_id, b.administration_id
  from public.units u
  join public.buildings b on b.id = u.building_id
  where u.is_administrative = true
)
update public.rfid_keys k
set unit_id           = aua.admin_unit_id,
    administration_id = null,
    key_type          = 'unit'
from admin_unit_by_admin aua
where k.key_type = 'administrative'
  and k.administration_id = aua.administration_id;

alter table public.rfid_keys enable trigger rfid_keys_prevent_reassignment;

------------------------------------------------------------
-- 3) Simplify rfid_keys: drop admin_id, drop key_type, unit_id NOT NULL
------------------------------------------------------------
alter table public.rfid_keys drop constraint rfid_keys_ownership_xor;
alter table public.rfid_keys drop column administration_id;
alter table public.rfid_keys drop column key_type;
alter table public.rfid_keys alter column unit_id set not null;

-- Redefine the immutability trigger without the dropped columns.
create or replace function public.rfid_keys_prevent_reassignment()
returns trigger
language plpgsql
as $$
begin
  if new.unit_id is distinct from old.unit_id then
    raise exception 'rfid_keys.unit_id is immutable (key %)', old.id
      using errcode = 'check_violation';
  end if;
  if new.rfid_code is distinct from old.rfid_code then
    raise exception 'rfid_keys.rfid_code is immutable (key %)', old.id
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

------------------------------------------------------------
-- 4) key_authorizations: same-building constraint
------------------------------------------------------------
-- Folded into the existing validate function so we don't multiply triggers.
create or replace function operations.key_authorizations_validate()
returns trigger
language plpgsql
as $$
declare
  key_status         text;
  key_building_id    uuid;
  equip_status       text;
  equip_building_id  uuid;
begin
  if tg_op = 'INSERT' then
    select k.status, u.building_id
      into key_status, key_building_id
      from public.rfid_keys k
      join public.units u on u.id = k.unit_id
     where k.id = new.rfid_key_id;

    select status, building_id
      into equip_status, equip_building_id
      from operations.equipment
     where id = new.equipment_id;

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
    if key_building_id <> equip_building_id then
      raise exception
        'key and equipment must belong to the same building (key: %, equipment: %)',
        key_building_id, equip_building_id
        using errcode = 'check_violation';
    end if;

    new.sync_state := 'pending_install';
    return new;
  end if;

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

------------------------------------------------------------
-- 5) equipment status machine
------------------------------------------------------------
-- Legal transitions:
--   active      ↔ maintenance
--   active      → dead
--   maintenance → dead
--   dead        → (nothing)   ← blocked here
create or replace function operations.equipment_validate_status_transition()
returns trigger
language plpgsql
as $$
begin
  if new.status is distinct from old.status then
    if old.status = 'dead' then
      raise exception 'equipment.status transitions out of dead are forbidden (id %)', old.id
        using errcode = 'check_violation';
    end if;
    if not (
      (old.status = 'active'      and new.status in ('maintenance','dead'))
      or (old.status = 'maintenance' and new.status in ('active','dead'))
    ) then
      raise exception 'invalid equipment.status transition: % -> % (id %)',
        old.status, new.status, old.id
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

create trigger equipment_validate_status_transition
before update of status on operations.equipment
for each row execute function operations.equipment_validate_status_transition();

------------------------------------------------------------
-- 6) equipment.installed_at joins the immutable set
------------------------------------------------------------
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
  if new.installed_at is distinct from old.installed_at then
    raise exception 'operations.equipment.installed_at is immutable (id %)', old.id
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

------------------------------------------------------------
-- 7) equipment.status = 'dead' auto-closes authorizations
------------------------------------------------------------
create or replace function operations.equipment_close_authorizations_on_dead()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'dead' and old.status <> 'dead' then
    -- installed -> pending_removal -> removed
    update operations.key_authorizations
       set sync_state = 'pending_removal'
     where equipment_id = new.id
       and sync_state   = 'installed';

    update operations.key_authorizations
       set sync_state    = 'removed',
           remove_reason = coalesce(remove_reason, 'Equipment marked as dead')
     where equipment_id = new.id
       and sync_state   = 'pending_removal'
       and removed_at is null;

    -- pending_install -> removed (never made it to the device)
    update operations.key_authorizations
       set sync_state    = 'removed',
           remove_reason = 'Equipment marked as dead before install'
     where equipment_id = new.id
       and sync_state   = 'pending_install';
  end if;
  return null;
end;
$$;

create trigger equipment_close_authorizations_on_dead
after update of status on operations.equipment
for each row execute function operations.equipment_close_authorizations_on_dead();

------------------------------------------------------------
-- 8) rfid_keys marked lost/disabled auto-revokes authorizations
------------------------------------------------------------
create or replace function public.rfid_keys_auto_revoke_on_status_change()
returns trigger
language plpgsql
as $$
begin
  if new.status in ('lost','disabled') and old.status = 'active' then
    perform operations.revoke_key_from_all_equipment(
      new.id,
      'Key marked as ' || new.status
    );
  end if;
  return null;
end;
$$;

create trigger rfid_keys_auto_revoke_on_status_change
after update of status on public.rfid_keys
for each row execute function public.rfid_keys_auto_revoke_on_status_change();

------------------------------------------------------------
-- 9) Simplify replace_equipment (the trigger from step 7 does the closing)
------------------------------------------------------------
create or replace function operations.replace_equipment(
  p_old_equipment_id     uuid,
  p_new_serial_number    text,
  p_new_model            text,
  p_new_description      text,
  p_new_access_type      text default null,
  p_decommission_reason  text default 'Replaced by new equipment',
  p_replacement_staff_id uuid default null
)
returns uuid
language plpgsql
as $$
declare
  v_building_id uuid;
  v_old_status  text;
  v_new_id      uuid;
begin
  select building_id, status
    into v_building_id, v_old_status
    from operations.equipment
   where id = p_old_equipment_id
   for update;

  if not found then
    raise exception 'equipment % not found', p_old_equipment_id;
  end if;
  if v_old_status = 'dead' then
    raise exception 'equipment % is already dead', p_old_equipment_id;
  end if;

  -- Snapshot the keys we need to carry over BEFORE we kill the old device.
  -- (Once status flips to dead, the close-on-dead trigger will transition
  -- them out of 'installed' before we get a chance to read them.)
  create temp table _keys_to_migrate on commit drop as
  select rfid_key_id
    from operations.key_authorizations
   where equipment_id = p_old_equipment_id
     and sync_state   = 'installed';

  -- 1) Kill the old device. Trigger sets decommissioned_at AND closes
  --    every authorization on this equipment.
  update operations.equipment
     set status              = 'dead',
         decommission_reason = p_decommission_reason
   where id = p_old_equipment_id;

  -- 2) Create the replacement. Validation trigger checks same-building.
  insert into operations.equipment (
    serial_number, model, building_id, description, access_type,
    status, replaces_equipment_id
  ) values (
    p_new_serial_number, p_new_model, v_building_id, p_new_description,
    p_new_access_type, 'active', p_old_equipment_id
  )
  returning id into v_new_id;

  -- 3) Recreate the same authorizations on the new device as pending_install.
  insert into operations.key_authorizations (rfid_key_id, equipment_id, notes)
  select rfid_key_id,
         v_new_id,
         'Auto-created by replace_equipment(' || p_old_equipment_id || ')'
    from _keys_to_migrate;

  return v_new_id;
end;
$$;

------------------------------------------------------------
-- 10) Defense in depth: anon no longer sees identity / operations
------------------------------------------------------------
revoke all on all tables    in schema identity   from anon;
revoke all on all sequences in schema identity   from anon;
revoke all on all routines  in schema identity   from anon;
revoke usage on schema identity                  from anon;

revoke all on all tables    in schema operations from anon;
revoke all on all sequences in schema operations from anon;
revoke all on all routines  in schema operations from anon;
revoke usage on schema operations                from anon;

alter default privileges in schema identity   revoke all on tables    from anon;
alter default privileges in schema identity   revoke all on sequences from anon;
alter default privileges in schema identity   revoke all on routines  from anon;
alter default privileges in schema operations revoke all on tables    from anon;
alter default privileges in schema operations revoke all on sequences from anon;
alter default privileges in schema operations revoke all on routines  from anon;
