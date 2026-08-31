-- ============================================================
-- OPERATIONS — helper functions
-- ============================================================

------------------------------------------------------------
-- replace_equipment
------------------------------------------------------------
-- Atomic replacement of a live equipment with a fresh one at the same
-- building. Handles:
--   1) marking the old equipment as dead (sync trigger fills decommissioned_at)
--   2) inserting the new equipment row with replaces_equipment_id
--   3) copying every currently-installed authorization from old to new as
--      pending_install (technician still has to physically load them, but
--      the intent is recorded so no key gets forgotten)
--   4) closing the old equipment's authorizations:
--        installed        -> pending_removal (device gone; noted for records)
--        pending_install  -> removed         (never made it to the device)
--
-- Only sensible to call for an equipment that is not already dead.
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

  -- 1) Kill the old equipment. Sync trigger fills decommissioned_at.
  update operations.equipment
     set status              = 'dead',
         decommission_reason = p_decommission_reason
   where id = p_old_equipment_id;

  -- 2) Create the replacement. Validation trigger checks same-building +
  --    predecessor.status='dead' (satisfied by step 1).
  insert into operations.equipment (
    serial_number, model, building_id, description, access_type,
    status, replaces_equipment_id
  ) values (
    p_new_serial_number, p_new_model, v_building_id, p_new_description,
    p_new_access_type, 'active', p_old_equipment_id
  )
  returning id into v_new_id;

  -- 3) Copy the installed authorizations from old to new as pending_install.
  insert into operations.key_authorizations (rfid_key_id, equipment_id, notes)
  select ka.rfid_key_id,
         v_new_id,
         'Auto-created by replace_equipment(' || p_old_equipment_id || ')'
    from operations.key_authorizations ka
   where ka.equipment_id = p_old_equipment_id
     and ka.sync_state   = 'installed';

  -- 4a) Close installed ones on the dead device.
  --     installed -> pending_removal -> removed (state machine forces the
  --     two-step; both steps are done here atomically).
  update operations.key_authorizations
     set sync_state = 'pending_removal'
   where equipment_id = p_old_equipment_id
     and sync_state   = 'installed';

  update operations.key_authorizations
     set sync_state          = 'removed',
         removed_by_staff_id = p_replacement_staff_id,
         remove_reason       = 'Equipment replaced (dead)'
   where equipment_id = p_old_equipment_id
     and sync_state   = 'pending_removal';

  -- 4b) Cancel any pending_installs that never happened. This uses the
  --     'pending_install -> removed' shortcut in the state machine.
  update operations.key_authorizations
     set sync_state          = 'removed',
         removed_by_staff_id = p_replacement_staff_id,
         remove_reason       = 'Equipment replaced (dead) before install'
   where equipment_id = p_old_equipment_id
     and sync_state   = 'pending_install';

  return v_new_id;
end;
$$;

comment on function operations.replace_equipment is
  'Atomically decommissions an equipment and creates its replacement at the '
  'same building, copying installed authorizations as pending_install on the '
  'new device. Returns the new equipment id.';

------------------------------------------------------------
-- revoke_key_from_all_equipment
------------------------------------------------------------
-- When a key is marked lost/disabled, mark every installed authorization as
-- pending_removal so the installer's worklist picks them up. Cancel any
-- pending_installs that never made it to the device.
-- Returns the count of installed authorizations that transitioned to
-- pending_removal.
create or replace function operations.revoke_key_from_all_equipment(
  p_rfid_key_id uuid,
  p_reason      text default 'Key revoked'
)
returns integer
language plpgsql
as $$
declare
  v_count integer;
begin
  update operations.key_authorizations
     set sync_state = 'pending_removal'
   where rfid_key_id = p_rfid_key_id
     and sync_state  = 'installed';
  get diagnostics v_count = row_count;

  -- Cancel any authorizations that never got installed.
  update operations.key_authorizations
     set sync_state    = 'removed',
         remove_reason = p_reason
   where rfid_key_id = p_rfid_key_id
     and sync_state  = 'pending_install';

  return v_count;
end;
$$;

comment on function operations.revoke_key_from_all_equipment is
  'Marks all installed authorizations of a key as pending_removal and cancels '
  'any pending_installs. Returns the count of installed rows transitioned.';
