-- ============================================================
-- Migration: resolve_equipment_update — advance key_order_items on activation
-- ============================================================
-- Extends resolve_equipment_update so that when a new-path key
-- (rfid_keys.order_item_id = NULL) is activated, the corresponding
-- key_order_items row (located via key_order_items.produced_key_id)
-- is advanced from 'configured' to 'installed'.
--
-- The key_order_items_recompute_order_status_trigger then drives
-- the parent key_orders to 'ready_for_pickup' once all items are installed.
--
-- Lock order per key: rfid_keys → key_order_items → key_orders (via trigger)
--
-- The legacy order_items branch is preserved verbatim.
-- The new branch runs in parallel after the key activation.
-- ============================================================

create or replace function public.resolve_equipment_update(
  p_task_id         uuid,
  p_actor_staff_id  uuid default null
) returns jsonb
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
  v_skipped          uuid[] := '{}';
  -- New-path key_order_items advancement
  v_koi_id          uuid;
  v_koi_status      text;
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
      update operations.key_authorizations
         set sync_state = 'installed'
       where id = v_auth_id;

      -- 4. Emit activated key_event.
      insert into public.key_events (key_id, event_type, note, actor_staff_id)
        values (v_key_id, 'activated', 'Activada por actualización de equipo ' || p_task_id, v_actor);

      -- 5. Legacy order_items branch: recompute order status if key linked via old path.
      if v_order_item_id is not null then
        select order_id into v_order_id from public.order_items where id = v_order_item_id;
        if v_order_id is not null then
          perform public.recompute_order_status(v_order_id);
        end if;
      end if;

      -- 6. New-path key_order_items branch: advance the item that produced this key.
      --    Applies only when key_order_items.produced_key_id = v_key_id and status = 'configured'.
      --    The key_order_items_recompute_order_status_trigger drives key_orders automatically.
      select id, status
        into v_koi_id, v_koi_status
        from public.key_order_items
       where produced_key_id = v_key_id;

      if found and v_koi_status = 'configured' then
        update public.key_order_items
           set status = 'installed'
         where id = v_koi_id;
      end if;

    else
      -- Stale key: collect id, emit snapshot_skipped event, do not abort.
      v_skipped := array_append(v_skipped, v_key_id);
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
      -- Stale key: collect id, emit snapshot_skipped event, do not abort.
      v_skipped := array_append(v_skipped, v_key_id);
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

  return jsonb_build_object(
    'ticket_id', v_ticket_id,
    'skipped_key_ids', to_jsonb(v_skipped)
  );
end;
$$;

grant execute on function public.resolve_equipment_update(uuid, uuid) to authenticated;
