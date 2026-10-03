-- ============================================================
-- Scope the staff-level ticket RPCs to the ticket's assignee.
-- ============================================================
-- PROBLEM — 20260910110000 wrapped the three ticket RPCs that installers may
--   call with `identity.require_staff`, which checks the ROLE only:
--     configure_technical_ticket_equipment(uuid, text, text)
--     resolve_equipment_update(uuid, uuid)
--     resolve_ticket(uuid, text, uuid)
--   The unguarded bodies are SECURITY DEFINER and look tickets up by id with no
--   ownership check (resolve_ticket's "or not assigned" error message is never
--   reached by an assignment test). RLS does not help: SECURITY DEFINER bypasses
--   it. So any active installer could configure or resolve a ticket assigned to
--   another installer just by knowing its id.
--
-- FIX — a second guard, identity.require_assigned_ticket(rpc, ticket_id),
--   runs right after require_staff in each wrapper. Through a client API role,
--   an installer must be the ticket's `assigned_to_staff_id`; otherwise it
--   raises P0001 with the same "cannot be ... by this user (not found, ... or
--   not assigned)" wording resolve_ticket already uses, so a caller cannot tell
--   "exists but not yours" from "does not exist". Admins keep full access.
--   Non-API contexts (migrations, seeds, pg_cron, pgTAP fixtures as postgres)
--   are trusted and bypass it, exactly like require_staff.
--
-- Signatures, return types, grants/revokes and search_path are unchanged:
--   wrappers are replaced in place (CREATE OR REPLACE keeps the ACL); the
--   revoke/grant statements are repeated for clarity and idempotence.
--
-- ROLLBACK — re-run the three wrapper definitions from 20260910110000 and
--   drop identity.require_assigned_ticket(text, uuid).
-- ============================================================

create or replace function identity.require_assigned_ticket(p_rpc text, p_ticket_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  if not identity.is_api_client_role() then
    return;
  end if;
  if identity.is_admin() then
    return;
  end if;
  if identity.is_installer() and exists (
    select 1
      from support.tickets t
     where t.id = p_ticket_id
       and t.assigned_to_staff_id = identity.current_staff_id()
  ) then
    return;
  end if;
  raise exception
    '%: ticket % cannot be handled by this user (not found or not assigned)',
    p_rpc, p_ticket_id
    using errcode = 'P0001';
end;
$$;

revoke all on function identity.require_assigned_ticket(text, uuid) from public, anon;
grant execute on function identity.require_assigned_ticket(text, uuid) to authenticated, service_role;
comment on function identity.require_assigned_ticket(text, uuid) is
  'Raises P0001 unless an API caller is an admin or the installer assigned to the ticket. Used by staff-level ticket RPC wrappers.';

-- ---------------------------------------------------------------
-- configure_technical_ticket_equipment  (admin, or the assigned installer)
-- ---------------------------------------------------------------
create or replace function public.configure_technical_ticket_equipment(p_ticket_id uuid, p_new_serial text, p_new_model text default NULL::text)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  perform identity.require_staff('configure_technical_ticket_equipment');
  perform identity.require_assigned_ticket('configure_technical_ticket_equipment', p_ticket_id);
  perform public.configure_technical_ticket_equipment_unguarded(
      p_ticket_id => p_ticket_id,
      p_new_serial => p_new_serial,
      p_new_model => p_new_model
    );
end;
$$;

revoke execute on function public.configure_technical_ticket_equipment(uuid, text, text) from public, anon;
grant execute on function public.configure_technical_ticket_equipment(uuid, text, text) to authenticated, service_role;
comment on function public.configure_technical_ticket_equipment(uuid, text, text) is
  'Authorization wrapper (admin, or the installer assigned to the ticket) around configure_technical_ticket_equipment_unguarded. Added 2026-09-10 (P0-2); assignee scope 2026-09-13.';

-- ---------------------------------------------------------------
-- resolve_equipment_update  (admin, or the assigned installer)
-- ---------------------------------------------------------------
-- The RPC takes the equipment_update task id; ownership is checked on the
-- ticket it belongs to. A missing task resolves to a NULL ticket id, which the
-- assignee guard rejects for installers; admins fall through to the body's own
-- "task not found" error.
create or replace function public.resolve_equipment_update(p_task_id uuid, p_actor_staff_id uuid default NULL::uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  perform identity.require_staff('resolve_equipment_update');
  perform identity.require_assigned_ticket(
      'resolve_equipment_update',
      (select eu.ticket_id from support.equipment_updates eu where eu.id = p_task_id)
    );
  -- p_actor_staff_id is deprecated for API clients: the actor is derived from
  -- the caller's session so the audit trail cannot be forged (P0-4). It is
  -- still honoured in trusted non-API contexts (see identity.effective_actor).
  return public.resolve_equipment_update_unguarded(
      p_task_id => p_task_id,
      p_actor_staff_id => identity.effective_actor(p_actor_staff_id)
    );
end;
$$;

revoke execute on function public.resolve_equipment_update(uuid, uuid) from public, anon;
grant execute on function public.resolve_equipment_update(uuid, uuid) to authenticated, service_role;
comment on function public.resolve_equipment_update(uuid, uuid) is
  'Authorization wrapper (admin, or the installer assigned to the ticket) around resolve_equipment_update_unguarded. Added 2026-09-10 (P0-2); assignee scope 2026-09-13.';

-- ---------------------------------------------------------------
-- resolve_ticket  (admin, or the assigned installer)
-- ---------------------------------------------------------------
create or replace function public.resolve_ticket(p_ticket_id uuid, p_note text default NULL::text, p_actor_staff_id uuid default NULL::uuid)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  perform identity.require_staff('resolve_ticket');
  perform identity.require_assigned_ticket('resolve_ticket', p_ticket_id);
  -- p_actor_staff_id is deprecated for API clients: the actor is derived from
  -- the caller's session so the audit trail cannot be forged (P0-4). It is
  -- still honoured in trusted non-API contexts (see identity.effective_actor).
  return public.resolve_ticket_unguarded(
      p_ticket_id => p_ticket_id,
      p_note => p_note,
      p_actor_staff_id => identity.effective_actor(p_actor_staff_id)
    );
end;
$$;

revoke execute on function public.resolve_ticket(uuid, text, uuid) from public, anon;
grant execute on function public.resolve_ticket(uuid, text, uuid) to authenticated, service_role;
comment on function public.resolve_ticket(uuid, text, uuid) is
  'Authorization wrapper (admin, or the installer assigned to the ticket) around resolve_ticket_unguarded. Added 2026-09-10 (P0-2); assignee scope 2026-09-13.';
