-- ============================================================
-- Migration: request_key_disable + cancel_key_disable RPCs
-- ============================================================
-- Reversible disable flow for the new pending_disable state.
-- These RPCs handle the active ↔ pending_disable transitions.
-- Terminal 'disabled' is reached only via resolve_equipment_update.
-- ============================================================

-- -------------------------------------------------------
-- request_key_disable
-- -------------------------------------------------------
-- Transitions an active key to pending_disable and emits disable_requested event.
-- Idempotent no-op when already pending_disable (returns without error).
-- Raises P0001 for any other status.
create or replace function public.request_key_disable(
  p_key_id          uuid,
  p_actor_staff_id  uuid default null,
  p_note            text default null
) returns void
language plpgsql
security definer
set search_path = public, identity
as $$
declare
  v_status text;
  v_actor  uuid;
begin
  v_actor := coalesce(p_actor_staff_id, identity.current_staff_id());

  select status into v_status
    from public.rfid_keys
   where id = p_key_id
   for update;

  if v_status is null then
    raise exception 'request_key_disable: key % not found', p_key_id
      using errcode = 'P0001';
  end if;

  -- Idempotent no-op
  if v_status = 'pending_disable' then
    return;
  end if;

  if v_status <> 'active' then
    raise exception 'request_key_disable: key % must be active to request disable (current status: %)',
      p_key_id, v_status
      using errcode = 'P0001';
  end if;

  update public.rfid_keys set status = 'pending_disable' where id = p_key_id;

  insert into public.key_events (key_id, event_type, note, actor_staff_id)
    values (
      p_key_id,
      'disable_requested',
      coalesce(p_note, 'Baja solicitada'),
      v_actor
    );
end;
$$;

grant execute on function public.request_key_disable(uuid, uuid, text) to authenticated;

-- -------------------------------------------------------
-- cancel_key_disable
-- -------------------------------------------------------
-- Transitions a pending_disable key back to active and emits disable_cancelled event.
-- Idempotent no-op when already active.
-- Raises P0001 for any other status.
create or replace function public.cancel_key_disable(
  p_key_id          uuid,
  p_actor_staff_id  uuid default null,
  p_note            text default null
) returns void
language plpgsql
security definer
set search_path = public, identity
as $$
declare
  v_status text;
  v_actor  uuid;
begin
  v_actor := coalesce(p_actor_staff_id, identity.current_staff_id());

  select status into v_status
    from public.rfid_keys
   where id = p_key_id
   for update;

  if v_status is null then
    raise exception 'cancel_key_disable: key % not found', p_key_id
      using errcode = 'P0001';
  end if;

  -- Idempotent no-op
  if v_status = 'active' then
    return;
  end if;

  if v_status <> 'pending_disable' then
    raise exception 'cancel_key_disable: key % must be pending_disable to cancel (current status: %)',
      p_key_id, v_status
      using errcode = 'P0001';
  end if;

  update public.rfid_keys set status = 'active' where id = p_key_id;

  insert into public.key_events (key_id, event_type, note, actor_staff_id)
    values (
      p_key_id,
      'disable_cancelled',
      coalesce(p_note, 'Solicitud de baja cancelada'),
      v_actor
    );
end;
$$;

grant execute on function public.cancel_key_disable(uuid, uuid, text) to authenticated;
