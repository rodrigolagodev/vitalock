-- Extend key_authorizations with a 'cancelled' sync_state so installers can
-- reject a pending task with a mandatory reason.
--
-- Allowed transitions after this migration:
--   pending_install  -> installed | removed | cancelled
--   installed        -> pending_removal
--   pending_removal  -> removed | cancelled
--   (installed | removed | cancelled are terminal from the installer's view)

alter table operations.key_authorizations
  drop constraint key_authorizations_sync_state_check;

alter table operations.key_authorizations
  add constraint key_authorizations_sync_state_check
  check (sync_state = any (array[
    'pending_install'::text,
    'installed'::text,
    'pending_removal'::text,
    'removed'::text,
    'cancelled'::text
  ]));

alter table operations.key_authorizations
  add column reject_reason text;

alter table operations.key_authorizations
  add constraint key_authorizations_reject_reason_check
  check (
    (sync_state = 'cancelled' and reject_reason is not null and length(trim(reject_reason)) > 0)
    or (sync_state <> 'cancelled' and reject_reason is null)
  );

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
      or (old.sync_state = 'pending_install' and new.sync_state = 'cancelled')
      or (old.sync_state = 'installed'       and new.sync_state = 'pending_removal')
      or (old.sync_state = 'pending_removal' and new.sync_state = 'removed')
      or (old.sync_state = 'pending_removal' and new.sync_state = 'cancelled')
    ) then
      raise exception
        'invalid sync_state transition: % -> %', old.sync_state, new.sync_state
        using errcode = 'check_violation';
    end if;
  end if;

  return new;
end;
$$;
