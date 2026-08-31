-- ============================================================
-- Migration: resolve_equipment_update + create_equipment_update RPCs
-- ============================================================
-- resolve_equipment_update: atomic RPC that processes a frozen
-- equipment_update snapshot, flips key states, mints key_authorizations
-- at sync_state='installed', emits key_events, resolves the ticket,
-- and triggers recompute_order_status.
--
-- create_equipment_update: helper that atomically inserts the ticket
-- and the equipment_updates snapshot row in the same statement.
--
-- Mirrors the resolve-RPC pattern from resolve_equipment_installation
-- (migration 000041) and resolve_equipment_replacement (migration 000061).
-- ============================================================

-- -------------------------------------------------------
-- create_equipment_update
-- -------------------------------------------------------
-- Atomically inserts a support.tickets row (category='equipment_update')
-- and the matching support.equipment_updates row.
-- Returns the equipment_updates.id (the task id used by resolve).
create or replace function public.create_equipment_update(
  p_equipment_id        uuid,
  p_administration_id   uuid,
  p_building_id         uuid,
  p_description         text,
  p_mdb_storage_path    text,
  p_keys_to_activate    uuid[]  default '{}',
  p_keys_to_disable     uuid[]  default '{}',
  p_actor_staff_id      uuid    default null
) returns uuid
language plpgsql
security definer
set search_path = public, support, identity
as $$
declare
  v_ticket_id  uuid;
  v_task_id    uuid;
  v_actor      uuid;
begin
  v_actor := coalesce(p_actor_staff_id, identity.current_staff_id());

  if cardinality(p_keys_to_activate) + cardinality(p_keys_to_disable) = 0 then
    raise exception 'create_equipment_update: snapshot must include at least one key'
      using errcode = 'P0001';
  end if;

  insert into support.tickets (
    administration_id,
    building_id,
    equipment_id,
    category,
    description,
    status
  ) values (
    p_administration_id,
    p_building_id,
    p_equipment_id,
    'equipment_update',
    p_description,
    'open'
  ) returning id into v_ticket_id;

  insert into support.equipment_updates (
    ticket_id,
    equipment_id,
    mdb_storage_path,
    keys_to_activate,
    keys_to_disable,
    created_by_staff_id
  ) values (
    v_ticket_id,
    p_equipment_id,
    p_mdb_storage_path,
    p_keys_to_activate,
    p_keys_to_disable,
    v_actor
  ) returning id into v_task_id;

  return v_task_id;
end;
$$;

grant execute on function public.create_equipment_update(uuid, uuid, uuid, text, text, uuid[], uuid[], uuid)
  to authenticated;

-- -------------------------------------------------------
-- resolve_equipment_update
-- -------------------------------------------------------
create or replace function public.resolve_equipment_update(
  p_task_id         uuid,
  p_actor_staff_id  uuid default null
) returns uuid
language plpgsql
security definer
set search_path = public, support, operations, identity
as $$
declare
  v_ticket_id       uuid;
  v_ticket_category text;
  v_ticket_status   text;
  v_equipment_id    uuid;
  v_actor           uuid;
  v_key_id          uuid;
  v_key_status      text;
  v_auth_id         uuid;
  v_order_item_id   uuid;
  v_order_id        uuid;
  v_keys_to_activate uuid[];
  v_keys_to_disable  uuid[];
begin
  v_actor := coalesce(p_actor_staff_id, identity.current_staff_id());

  -- Lock the task row and retrieve snapshot.
  select ticket_id, equipment_id, keys_to_activate, keys_to_disable
    into v_ticket_id, v_equipment_id, v_keys_to_activate, v_keys_to_disable
    from support.equipment_updates
   where id = p_task_id
   for update;

  if v_ticket_id is null then
    raise exception 'resolve_equipment_update: task % not found', p_task_id
      using errcode = 'P0001';
  end if;

  -- Lock and validate the ticket.
  select category, status
    into v_ticket_category, v_ticket_status
    from support.tickets
   where id = v_ticket_id
   for update;

  if v_ticket_category <> 'equipment_update' then
    raise exception 'resolve_equipment_update: ticket % is not equipment_update (category: %)',
      v_ticket_id, v_ticket_category
      using errcode = 'P0001';
  end if;

  if v_ticket_status = 'resolved' then
    raise exception 'resolve_equipment_update: task % is already resolved', p_task_id
      using errcode = 'P0001';
  end if;

  if v_ticket_status not in ('open', 'in_progress') then
    raise exception 'resolve_equipment_update: ticket % has unexpected status %',
      v_ticket_id, v_ticket_status
      using errcode = 'P0001';
  end if;

  -- Transition ticket: open → in_progress (no-op if already in_progress).
  update support.tickets set status = 'in_progress'
   where id = v_ticket_id and status = 'open';

  -- -------------------------------------------------------
  -- Process keys_to_activate: pending_installation → active
  -- -------------------------------------------------------
  foreach v_key_id in array v_keys_to_activate loop
    -- Lock the key row.
    select status, order_item_id
      into v_key_status, v_order_item_id
      from public.rfid_keys
     where id = v_key_id
     for update;

    if v_key_status = 'pending_installation' then
      -- 1. Advance key to active.
      update public.rfid_keys set status = 'active' where id = v_key_id;

      -- 2. Mint key_authorization. The key_authorizations_validate trigger
      --    forces sync_state='pending_install' on INSERT and checks key is active.
      --    We INSERT now that the key IS active, then immediately UPDATE to installed.
      insert into operations.key_authorizations (rfid_key_id, equipment_id)
        values (v_key_id, v_equipment_id)
        returning id into v_auth_id;

      -- 3. Advance authorization to installed in the same transaction.
      --    The equipment update IS the install act; no separate installer trip needed.
      --    We do not set installed_by_staff_id here because the column-restriction trigger
      --    (`enforce_installer_key_auth_column_restrictions`) runs before update and checks
      --    current_staff_role() — which is NULL in SECURITY DEFINER context without an
      --    active auth session. The actor is recorded on the key_events row instead.
      update operations.key_authorizations
         set sync_state = 'installed'
       where id = v_auth_id;

      -- 4. Emit activated key_event.
      insert into public.key_events (key_id, event_type, note, actor_staff_id)
        values (v_key_id, 'activated', 'Activada por actualización de equipo ' || p_task_id, v_actor);

      -- 5. Recompute order status for the key's order (if any).
      if v_order_item_id is not null then
        select order_id into v_order_id from public.order_items where id = v_order_item_id;
        if v_order_id is not null then
          perform public.recompute_order_status(v_order_id);
        end if;
      end if;
    else
      -- Stale key: emit snapshot_skipped event, do not abort.
      insert into public.key_events (key_id, event_type, note, actor_staff_id)
        values (v_key_id, 'snapshot_skipped',
                'Estado inesperado al resolver (esperado: pending_installation, actual: ' || coalesce(v_key_status, 'NULL') || ')',
                v_actor);
    end if;
  end loop;

  -- -------------------------------------------------------
  -- Process keys_to_disable: pending_disable → disabled
  -- -------------------------------------------------------
  foreach v_key_id in array v_keys_to_disable loop
    select status
      into v_key_status
      from public.rfid_keys
     where id = v_key_id
     for update;

    if v_key_status = 'pending_disable' then
      update public.rfid_keys set status = 'disabled' where id = v_key_id;

      -- Update existing key_authorizations to removed
      update operations.key_authorizations
         set sync_state          = 'pending_removal',
             removed_by_staff_id = v_actor
       where rfid_key_id = v_key_id
         and equipment_id = v_equipment_id
         and sync_state   = 'installed';

      update operations.key_authorizations
         set sync_state          = 'removed',
             removed_by_staff_id = v_actor
       where rfid_key_id = v_key_id
         and equipment_id = v_equipment_id
         and sync_state   = 'pending_removal';

      insert into public.key_events (key_id, event_type, note, actor_staff_id)
        values (v_key_id, 'disabled', 'Desactivada por actualización de equipo ' || p_task_id, v_actor);
    else
      insert into public.key_events (key_id, event_type, note, actor_staff_id)
        values (v_key_id, 'snapshot_skipped',
                'Estado inesperado al resolver (esperado: pending_disable, actual: ' || coalesce(v_key_status, 'NULL') || ')',
                v_actor);
    end if;
  end loop;

  -- -------------------------------------------------------
  -- Resolve ticket: in_progress → resolved
  -- -------------------------------------------------------
  update support.tickets
     set status               = 'resolved',
         resolved_by_staff_id = v_actor,
         resolution_notes     = 'Actualización de equipo resuelta (tarea ' || p_task_id || ')'
   where id = v_ticket_id
     and status = 'in_progress';

  -- Mark the task as resolved.
  update support.equipment_updates
     set resolved_at           = now(),
         resolved_by_staff_id  = v_actor
   where id = p_task_id;

  return p_task_id;
end;
$$;

grant execute on function public.resolve_equipment_update(uuid, uuid) to authenticated;
