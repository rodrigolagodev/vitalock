-- ============================================================
-- public.change_key_status — atomic key activation/deactivation
-- ============================================================
-- Single RPC used by the admin "Dar de baja" / "Activar" flow.
-- Atomically:
--   1. updates public.rfid_keys.status (deactivated_at handled by the
--      existing rfid_keys_sync_deactivated_at trigger)
--   2. records the event in public.key_events (note is now OPTIONAL)
--   3. on disable: calls operations.revoke_key_from_all_equipment, so every
--      installed authorization becomes pending_removal (technician work
--      queue) and never-installed authorizations are cancelled
--   4. on activate: reverses pending_removal -> installed for any removal
--      that never happened (the key is still physically loaded), using a
--      transaction-local session flag so the generic validate trigger still
--      rejects that transition for ordinary callers

------------------------------------------------------------
-- key_events.note becomes optional
------------------------------------------------------------
alter table public.key_events
  alter column note drop not null;

alter table public.key_events
  drop constraint if exists key_events_note_check;

------------------------------------------------------------
-- Allow pending_removal -> installed ONLY under the admin RPC flag
------------------------------------------------------------
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
      -- Admin-only reversal: key reactivated before the removal visit.
      or (old.sync_state = 'pending_removal' and new.sync_state = 'installed'
          and coalesce(current_setting('app.allow_removal_reversal', true), 'false') = 'true')
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
-- The RPC
------------------------------------------------------------
create or replace function public.change_key_status(
  p_key_id           uuid,
  p_status           text,
  p_note             text default null,
  p_actor_staff_id   uuid default null
)
returns void
language plpgsql
security definer
as $$
declare
  v_current_status text;
  v_trimmed_note   text;
begin
  select status into v_current_status
    from public.rfid_keys
   where id = p_key_id;

  if not found then
    raise exception 'change_key_status: key % not found', p_key_id
      using errcode = 'P0001';
  end if;

  if p_status not in ('active', 'disabled') then
    raise exception 'change_key_status: invalid status %', p_status
      using errcode = 'P0001';
  end if;

  -- Idempotent no-op.
  if p_status = v_current_status then
    return;
  end if;

  v_trimmed_note := nullif(trim(coalesce(p_note, '')), '');

  if p_status = 'disabled' then
    -- Queue physical removal on every equipment still holding the key and
    -- cancel installs that never made it to the device.
    perform operations.revoke_key_from_all_equipment(
      p_key_id,
      coalesce(v_trimmed_note, 'Key disabled')
    );
  else
    -- Reactivation: the key is still physically loaded; cancel pending
    -- removals. Transaction-local flag scopes the reversal to this RPC.
    perform set_config('app.allow_removal_reversal', 'true', true);
    update operations.key_authorizations
       set sync_state    = 'installed',
           remove_reason = null
     where rfid_key_id = p_key_id
       and sync_state  = 'pending_removal';
  end if;

  update public.rfid_keys
     set status = p_status
   where id = p_key_id;

  insert into public.key_events (key_id, event_type, note, actor_staff_id)
  values (
    p_key_id,
    case when p_status = 'active' then 'activated' else 'deactivated' end,
    v_trimmed_note,
    p_actor_staff_id
  );
end;
$$;
