-- ============================================================
-- NEW RPC: resolve_ticket — state-machine-safe ticket resolution
-- ============================================================
-- Fixes: the installer app resolved tickets with a direct UPDATE
-- status 'open' -> 'resolved', but support.tickets_validate forbids
-- that hop (open -> in_progress -> resolved is the only legal path),
-- so the update was rejected by the trigger and the ticket stayed
-- 'open' — admins kept seeing open tasks the installer had already
-- completed.
--
-- This RPC runs the legal two-step transition inside one transaction.
-- SECURITY INVOKER: RLS decides who may resolve what:
--   * admin    -> admin_all_tickets policy, may resolve any ticket
--   * installer-> installer_update_own_tickets policy, only tickets
--                assigned to them (assigned_to_staff_id = self)
-- If no row matches (no permission, unknown id, already resolved or
-- cancelled) the function raises P0001 instead of silently doing
-- nothing.
--
-- The technical-category guard (tickets_require_equipment_on_resolve)
-- still applies: resolving maintenance/installation/equipment_* still
-- requires equipment_id, so installers cannot resolve those without an
-- admin-assigned equipment row. key_installation is unaffected.
--
-- ROLLBACK INSTRUCTIONS: drop function public.resolve_ticket(uuid, text);
-- ============================================================

create or replace function public.resolve_ticket(
  p_ticket_id       uuid,
  p_note            text default null,
  p_actor_staff_id  uuid default null
) returns uuid
language plpgsql
as $$
declare
  v_actor   uuid;
  v_updated int := 0;
  v_rows    int;
begin
  v_actor := identity.current_staff_id();
  -- p_actor_staff_id is accepted ONLY when there is no authenticated staff
  -- (local/SQL tests run as a superuser without JWT claims). Real clients
  -- always resolve through their own identity — never trust the parameter
  -- when a JWT staff is present, so an installer cannot impersonate another
  -- staff member in resolved_by_staff_id.
  if v_actor is null then
    v_actor := p_actor_staff_id;
  end if;
  if v_actor is null then
    raise exception 'resolve_ticket: no authenticated staff' using errcode = 'P0001';
  end if;

  -- Step 1: open -> in_progress (legal transition; a direct open -> resolved
  -- hop is rejected by support.tickets_validate).
  update support.tickets
     set status = 'in_progress'
   where id = p_ticket_id
     and status = 'open';

  get diagnostics v_updated = row_count;

  -- Step 2: in_progress -> resolved. tickets_validate requires
  -- resolution_notes when status = 'resolved', so fall back to a default
  -- note naming the resolver when none was provided.
  update support.tickets
     set status               = 'resolved',
         resolved_by_staff_id = v_actor,
         resolved_at          = coalesce(resolved_at, now()),
         resolution_notes     = coalesce(
           nullif(trim(coalesce(p_note, '')), ''),
           'Resuelta por ' || coalesce(
             (select s.full_name from identity.staff s where s.id = v_actor),
             'staff'
           )
         )
   where id = p_ticket_id
     and status = 'in_progress';

  get diagnostics v_rows = row_count;
  v_updated := v_updated + v_rows;

  if v_updated = 0 then
    raise exception
      'resolve_ticket: ticket % cannot be resolved by this user (not found, already resolved/cancelled, or not assigned)',
      p_ticket_id
      using errcode = 'P0001';
  end if;

  return p_ticket_id;
end;
$$;

grant execute on function public.resolve_ticket(uuid, text, uuid) to authenticated;
