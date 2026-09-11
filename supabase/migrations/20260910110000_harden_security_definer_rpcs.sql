-- ============================================================
-- Harden SECURITY DEFINER RPCs: role guards + server-derived actor (P0-2/3/4/5)
-- ============================================================
-- Before this migration, 22 business RPCs were SECURITY DEFINER, granted to
-- anon (baseline.sql:8289 default privileges, zero REVOKEs) and performed no
-- authorization check. SECURITY DEFINER bypasses RLS by definition, so every
-- table RLS protects with an admin-only policy was freely mutable through the
-- RPC surface by any holder of the public anon key. Supabase advisor:
-- `anon_security_definer_function_executable` count 40.
--
-- STRATEGY — rename + thin wrapper, never copy bodies
--   Each original function is renamed to `<name>_unguarded` and revoked from
--   every client role. A new function with the ORIGINAL name and signature
--   (so PostgREST clients keep working unchanged) performs the role check,
--   overrides the actor, and delegates. Bodies are untouched byte-for-byte.
--   This matters: 9 of these 22 functions were redefined in post-baseline
--   migrations, so copying bodies from baseline.sql would have silently
--   reverted them.
--
-- ROLE MATRIX — derived from actual callers, not assumptions
--   `staff` (admin OR installer):
--     resolve_ticket, resolve_equipment_update,
--     configure_technical_ticket_equipment
--     (apps/installer/src/hooks/useResolveTickets.ts,
--      useResolveEquipmentUpdate.ts, useConfigureTechnicalTicketEquipment.ts)
--   `admin` everything else (only apps/admin calls them).
--
-- ACTOR — p_actor_staff_id was client-supplied and never validated, so the
--   audit trail was forgeable. Wrappers now pass identity.current_staff_id()
--   and ignore the client value. The parameter stays for one release.
--
-- INTERNAL CALLS — create_key_order_with_items → confirm_key_order and
--   create_technical_order_with_items → confirm_technical_order now resolve
--   to the guarded wrappers. Both sides are admin-only, so the chain holds.
--
-- ROLLBACK — drop each wrapper and rename `<name>_unguarded` back.
-- ============================================================

-- ---------------------------------------------------------------
-- Guard helpers. One place for the error contract: errcode 42501
-- (insufficient_privilege), matching the two RPCs that were already
-- guarded (create_stock_movement, create_product_with_initial_stock).
-- ---------------------------------------------------------------
-- Scope: the guard applies to requests that arrive through a client API role.
-- PostgREST issues `SET LOCAL ROLE anon|authenticated|service_role` on every
-- request, so `current_setting('role')` reliably identifies the caller class.
-- Anything else — migrations, seeds, pg_cron jobs, pgTAP fixtures run as
-- postgres, and service_role (the trusted backend key, which already bypasses
-- RLS by design) — is trusted. pgTAP authorization scenarios opt in to the
-- guard with `SET LOCAL role authenticated`, exactly like PostgREST.
create or replace function identity.is_api_client_role()
returns boolean
language sql
stable
set search_path = pg_catalog, pg_temp
as $$
  select coalesce(current_setting('role', true), 'none') in ('anon', 'authenticated');
$$;

create or replace function identity.require_admin(p_rpc text)
returns void
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  if not identity.is_api_client_role() then
    return;
  end if;
  if not identity.is_admin() then
    raise exception '%: admin role required', p_rpc
      using errcode = 'insufficient_privilege';
  end if;
end;
$$;

create or replace function identity.require_staff(p_rpc text)
returns void
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  if not identity.is_api_client_role() then
    return;
  end if;
  if not (identity.is_admin() or identity.is_installer()) then
    raise exception '%: active staff role required', p_rpc
      using errcode = 'insufficient_privilege';
  end if;
end;
$$;

-- Actor resolution. Through a client API role the session identity is the only
-- trustworthy source, so the client-supplied value is ignored outright (P0-4).
-- Outside the API (migrations, seeds, pg_cron, pgTAP fixtures) there is no
-- session to derive from and the caller is trusted, so an explicit actor is
-- honoured — this keeps fixture-seeded audit rows attributable.
create or replace function identity.effective_actor(p_actor_staff_id uuid)
returns uuid
language sql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
  select case
    when identity.is_api_client_role() then identity.current_staff_id()
    else coalesce(p_actor_staff_id, identity.current_staff_id())
  end;
$$;

grant execute on function identity.effective_actor(uuid) to authenticated, service_role;
comment on function identity.effective_actor(uuid) is 'Session staff id for API callers (client value ignored); explicit value for trusted non-API contexts. Used by RPC authorization wrappers.';

grant execute on function identity.is_api_client_role() to authenticated, service_role;
comment on function identity.is_api_client_role() is 'True when the current request runs under a PostgREST client role (anon/authenticated). Used to scope RPC authorization guards.';
grant execute on function identity.require_admin(text) to authenticated, service_role;
grant execute on function identity.require_staff(text) to authenticated, service_role;
comment on function identity.require_admin(text) is 'Raises 42501 unless the caller is an active admin. Used by RPC authorization wrappers.';
comment on function identity.require_staff(text) is 'Raises 42501 unless the caller is an active admin or installer. Used by RPC authorization wrappers.';

-- ---------------------------------------------------------------
-- cancel_key_disable  (admin only)
-- ---------------------------------------------------------------
alter function public.cancel_key_disable(uuid, uuid, text) rename to cancel_key_disable_unguarded;
revoke all on function public.cancel_key_disable_unguarded(uuid, uuid, text) from public, anon, authenticated;

create function public.cancel_key_disable(p_key_id uuid, p_actor_staff_id uuid default NULL::uuid, p_note text default NULL::text)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  perform identity.require_admin('cancel_key_disable');
  -- p_actor_staff_id is deprecated for API clients: the actor is derived from
  -- the caller's session so the audit trail cannot be forged (P0-4). It is
  -- still honoured in trusted non-API contexts (see identity.effective_actor).
  -- The parameter stays in the signature for one release so existing clients
  -- keep compiling; drop it once both apps no longer send it.
  perform public.cancel_key_disable_unguarded(
      p_key_id => p_key_id,
      p_actor_staff_id => identity.effective_actor(p_actor_staff_id),
      p_note => p_note
    );
end;
$$;

revoke execute on function public.cancel_key_disable(uuid, uuid, text) from public, anon;
grant execute on function public.cancel_key_disable(uuid, uuid, text) to authenticated, service_role;
comment on function public.cancel_key_disable(uuid, uuid, text) is
  'Authorization wrapper (admin only) around cancel_key_disable_unguarded. Added 2026-09-10 (P0-2).';

-- ---------------------------------------------------------------
-- cancel_key_order  (admin only)
-- ---------------------------------------------------------------
alter function public.cancel_key_order(uuid) rename to cancel_key_order_unguarded;
revoke all on function public.cancel_key_order_unguarded(uuid) from public, anon, authenticated;

create function public.cancel_key_order(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  perform identity.require_admin('cancel_key_order');
  perform public.cancel_key_order_unguarded(
      p_order_id => p_order_id
    );
end;
$$;

revoke execute on function public.cancel_key_order(uuid) from public, anon;
grant execute on function public.cancel_key_order(uuid) to authenticated, service_role;
comment on function public.cancel_key_order(uuid) is
  'Authorization wrapper (admin only) around cancel_key_order_unguarded. Added 2026-09-10 (P0-2).';

-- ---------------------------------------------------------------
-- cancel_technical_order  (admin only)
-- ---------------------------------------------------------------
alter function public.cancel_technical_order(uuid) rename to cancel_technical_order_unguarded;
revoke all on function public.cancel_technical_order_unguarded(uuid) from public, anon, authenticated;

create function public.cancel_technical_order(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  perform identity.require_admin('cancel_technical_order');
  perform public.cancel_technical_order_unguarded(
      p_order_id => p_order_id
    );
end;
$$;

revoke execute on function public.cancel_technical_order(uuid) from public, anon;
grant execute on function public.cancel_technical_order(uuid) to authenticated, service_role;
comment on function public.cancel_technical_order(uuid) is
  'Authorization wrapper (admin only) around cancel_technical_order_unguarded. Added 2026-09-10 (P0-2).';

-- ---------------------------------------------------------------
-- change_key_status  (admin only)
-- ---------------------------------------------------------------
alter function public.change_key_status(uuid, text, text, uuid) rename to change_key_status_unguarded;
revoke all on function public.change_key_status_unguarded(uuid, text, text, uuid) from public, anon, authenticated;
-- change_key_status was the one SECURITY DEFINER RPC shipped without a pinned
-- search_path (P0-3; baseline.sql:783). Its body is fully schema-qualified, so
-- the repo-standard schema list is safe. Every other inner function already
-- carries its own SET search_path and is deliberately left untouched.
alter function public.change_key_status_unguarded(uuid, text, text, uuid)
  set search_path = pg_catalog, public, identity, operations, sales, support, extensions, pg_temp;

create function public.change_key_status(p_key_id uuid, p_status text, p_note text default NULL::text, p_actor_staff_id uuid default NULL::uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  perform identity.require_admin('change_key_status');
  -- p_actor_staff_id is deprecated for API clients: the actor is derived from
  -- the caller's session so the audit trail cannot be forged (P0-4). It is
  -- still honoured in trusted non-API contexts (see identity.effective_actor).
  -- The parameter stays in the signature for one release so existing clients
  -- keep compiling; drop it once both apps no longer send it.
  perform public.change_key_status_unguarded(
      p_key_id => p_key_id,
      p_status => p_status,
      p_note => p_note,
      p_actor_staff_id => identity.effective_actor(p_actor_staff_id)
    );
end;
$$;

revoke execute on function public.change_key_status(uuid, text, text, uuid) from public, anon;
grant execute on function public.change_key_status(uuid, text, text, uuid) to authenticated, service_role;
comment on function public.change_key_status(uuid, text, text, uuid) is
  'Authorization wrapper (admin only) around change_key_status_unguarded. Added 2026-09-10 (P0-2).';

-- ---------------------------------------------------------------
-- configure_key_order_item  (admin only)
-- ---------------------------------------------------------------
alter function public.configure_key_order_item(uuid, text, uuid, uuid[]) rename to configure_key_order_item_unguarded;
revoke all on function public.configure_key_order_item_unguarded(uuid, text, uuid, uuid[]) from public, anon, authenticated;

create function public.configure_key_order_item(p_order_item_id uuid, p_rfid_code text, p_unit_id uuid, p_equipment_ids uuid[])
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  perform identity.require_admin('configure_key_order_item');
  return public.configure_key_order_item_unguarded(
      p_order_item_id => p_order_item_id,
      p_rfid_code => p_rfid_code,
      p_unit_id => p_unit_id,
      p_equipment_ids => p_equipment_ids
    );
end;
$$;

revoke execute on function public.configure_key_order_item(uuid, text, uuid, uuid[]) from public, anon;
grant execute on function public.configure_key_order_item(uuid, text, uuid, uuid[]) to authenticated, service_role;
comment on function public.configure_key_order_item(uuid, text, uuid, uuid[]) is
  'Authorization wrapper (admin only) around configure_key_order_item_unguarded. Added 2026-09-10 (P0-2).';

-- ---------------------------------------------------------------
-- configure_technical_ticket_equipment  (any active staff (admin or installer))
-- ---------------------------------------------------------------
alter function public.configure_technical_ticket_equipment(uuid, text, text) rename to configure_technical_ticket_equipment_unguarded;
revoke all on function public.configure_technical_ticket_equipment_unguarded(uuid, text, text) from public, anon, authenticated;

create function public.configure_technical_ticket_equipment(p_ticket_id uuid, p_new_serial text, p_new_model text default NULL::text)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  perform identity.require_staff('configure_technical_ticket_equipment');
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
  'Authorization wrapper (any active staff (admin or installer)) around configure_technical_ticket_equipment_unguarded. Added 2026-09-10 (P0-2).';

-- ---------------------------------------------------------------
-- confirm_key_order  (admin only)
-- ---------------------------------------------------------------
alter function public.confirm_key_order(uuid) rename to confirm_key_order_unguarded;
revoke all on function public.confirm_key_order_unguarded(uuid) from public, anon, authenticated;

create function public.confirm_key_order(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  perform identity.require_admin('confirm_key_order');
  perform public.confirm_key_order_unguarded(
      p_order_id => p_order_id
    );
end;
$$;

revoke execute on function public.confirm_key_order(uuid) from public, anon;
grant execute on function public.confirm_key_order(uuid) to authenticated, service_role;
comment on function public.confirm_key_order(uuid) is
  'Authorization wrapper (admin only) around confirm_key_order_unguarded. Added 2026-09-10 (P0-2).';

-- ---------------------------------------------------------------
-- confirm_technical_order  (admin only)
-- ---------------------------------------------------------------
alter function public.confirm_technical_order(uuid) rename to confirm_technical_order_unguarded;
revoke all on function public.confirm_technical_order_unguarded(uuid) from public, anon, authenticated;

create function public.confirm_technical_order(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  perform identity.require_admin('confirm_technical_order');
  perform public.confirm_technical_order_unguarded(
      p_order_id => p_order_id
    );
end;
$$;

revoke execute on function public.confirm_technical_order(uuid) from public, anon;
grant execute on function public.confirm_technical_order(uuid) to authenticated, service_role;
comment on function public.confirm_technical_order(uuid) is
  'Authorization wrapper (admin only) around confirm_technical_order_unguarded. Added 2026-09-10 (P0-2).';

-- ---------------------------------------------------------------
-- create_equipment_update  (admin only)
-- ---------------------------------------------------------------
alter function public.create_equipment_update(uuid, uuid, uuid, text, text, uuid[], uuid[], uuid, uuid) rename to create_equipment_update_unguarded;
revoke all on function public.create_equipment_update_unguarded(uuid, uuid, uuid, text, text, uuid[], uuid[], uuid, uuid) from public, anon, authenticated;

create function public.create_equipment_update(p_equipment_id uuid, p_administration_id uuid, p_building_id uuid, p_description text, p_mdb_storage_path text, p_keys_to_activate uuid[] default '{}'::uuid[], p_keys_to_disable uuid[] default '{}'::uuid[], p_actor_staff_id uuid default NULL::uuid, p_assigned_to_staff_id uuid default NULL::uuid)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  perform identity.require_admin('create_equipment_update');
  -- p_actor_staff_id is deprecated for API clients: the actor is derived from
  -- the caller's session so the audit trail cannot be forged (P0-4). It is
  -- still honoured in trusted non-API contexts (see identity.effective_actor).
  -- The parameter stays in the signature for one release so existing clients
  -- keep compiling; drop it once both apps no longer send it.
  return public.create_equipment_update_unguarded(
      p_equipment_id => p_equipment_id,
      p_administration_id => p_administration_id,
      p_building_id => p_building_id,
      p_description => p_description,
      p_mdb_storage_path => p_mdb_storage_path,
      p_keys_to_activate => p_keys_to_activate,
      p_keys_to_disable => p_keys_to_disable,
      p_actor_staff_id => identity.effective_actor(p_actor_staff_id),
      p_assigned_to_staff_id => p_assigned_to_staff_id
    );
end;
$$;

revoke execute on function public.create_equipment_update(uuid, uuid, uuid, text, text, uuid[], uuid[], uuid, uuid) from public, anon;
grant execute on function public.create_equipment_update(uuid, uuid, uuid, text, text, uuid[], uuid[], uuid, uuid) to authenticated, service_role;
comment on function public.create_equipment_update(uuid, uuid, uuid, text, text, uuid[], uuid[], uuid, uuid) is
  'Authorization wrapper (admin only) around create_equipment_update_unguarded. Added 2026-09-10 (P0-2).';

-- ---------------------------------------------------------------
-- create_key_order_with_items  (admin only)
-- ---------------------------------------------------------------
alter function public.create_key_order_with_items(jsonb, jsonb[], boolean) rename to create_key_order_with_items_unguarded;
revoke all on function public.create_key_order_with_items_unguarded(jsonb, jsonb[], boolean) from public, anon, authenticated;

create function public.create_key_order_with_items(p_order jsonb, p_items jsonb[], p_confirm_immediately boolean default true)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  perform identity.require_admin('create_key_order_with_items');
  return public.create_key_order_with_items_unguarded(
      p_order => p_order,
      p_items => p_items,
      p_confirm_immediately => p_confirm_immediately
    );
end;
$$;

revoke execute on function public.create_key_order_with_items(jsonb, jsonb[], boolean) from public, anon;
grant execute on function public.create_key_order_with_items(jsonb, jsonb[], boolean) to authenticated, service_role;
comment on function public.create_key_order_with_items(jsonb, jsonb[], boolean) is
  'Authorization wrapper (admin only) around create_key_order_with_items_unguarded. Added 2026-09-10 (P0-2).';

-- ---------------------------------------------------------------
-- create_technical_order_with_items  (admin only)
-- ---------------------------------------------------------------
alter function public.create_technical_order_with_items(jsonb, jsonb[], boolean) rename to create_technical_order_with_items_unguarded;
revoke all on function public.create_technical_order_with_items_unguarded(jsonb, jsonb[], boolean) from public, anon, authenticated;

create function public.create_technical_order_with_items(p_order jsonb, p_items jsonb[], p_confirm_immediately boolean default true)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  perform identity.require_admin('create_technical_order_with_items');
  return public.create_technical_order_with_items_unguarded(
      p_order => p_order,
      p_items => p_items,
      p_confirm_immediately => p_confirm_immediately
    );
end;
$$;

revoke execute on function public.create_technical_order_with_items(jsonb, jsonb[], boolean) from public, anon;
grant execute on function public.create_technical_order_with_items(jsonb, jsonb[], boolean) to authenticated, service_role;
comment on function public.create_technical_order_with_items(jsonb, jsonb[], boolean) is
  'Authorization wrapper (admin only) around create_technical_order_with_items_unguarded. Added 2026-09-10 (P0-2).';

-- ---------------------------------------------------------------
-- mark_key_order_invoiced  (admin only)
-- ---------------------------------------------------------------
alter function public.mark_key_order_invoiced(uuid) rename to mark_key_order_invoiced_unguarded;
revoke all on function public.mark_key_order_invoiced_unguarded(uuid) from public, anon, authenticated;

create function public.mark_key_order_invoiced(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  perform identity.require_admin('mark_key_order_invoiced');
  perform public.mark_key_order_invoiced_unguarded(
      p_order_id => p_order_id
    );
end;
$$;

revoke execute on function public.mark_key_order_invoiced(uuid) from public, anon;
grant execute on function public.mark_key_order_invoiced(uuid) to authenticated, service_role;
comment on function public.mark_key_order_invoiced(uuid) is
  'Authorization wrapper (admin only) around mark_key_order_invoiced_unguarded. Added 2026-09-10 (P0-2).';

-- ---------------------------------------------------------------
-- mark_key_order_item_installed  (admin only)
-- ---------------------------------------------------------------
alter function public.mark_key_order_item_installed(uuid) rename to mark_key_order_item_installed_unguarded;
revoke all on function public.mark_key_order_item_installed_unguarded(uuid) from public, anon, authenticated;

create function public.mark_key_order_item_installed(p_order_item_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  perform identity.require_admin('mark_key_order_item_installed');
  perform public.mark_key_order_item_installed_unguarded(
      p_order_item_id => p_order_item_id
    );
end;
$$;

revoke execute on function public.mark_key_order_item_installed(uuid) from public, anon;
grant execute on function public.mark_key_order_item_installed(uuid) to authenticated, service_role;
comment on function public.mark_key_order_item_installed(uuid) is
  'Authorization wrapper (admin only) around mark_key_order_item_installed_unguarded. Added 2026-09-10 (P0-2).';

-- ---------------------------------------------------------------
-- mark_technical_order_invoiced  (admin only)
-- ---------------------------------------------------------------
alter function public.mark_technical_order_invoiced(uuid) rename to mark_technical_order_invoiced_unguarded;
revoke all on function public.mark_technical_order_invoiced_unguarded(uuid) from public, anon, authenticated;

create function public.mark_technical_order_invoiced(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  perform identity.require_admin('mark_technical_order_invoiced');
  perform public.mark_technical_order_invoiced_unguarded(
      p_order_id => p_order_id
    );
end;
$$;

revoke execute on function public.mark_technical_order_invoiced(uuid) from public, anon;
grant execute on function public.mark_technical_order_invoiced(uuid) to authenticated, service_role;
comment on function public.mark_technical_order_invoiced(uuid) is
  'Authorization wrapper (admin only) around mark_technical_order_invoiced_unguarded. Added 2026-09-10 (P0-2).';

-- ---------------------------------------------------------------
-- record_order_key_pickup  (admin only)
-- ---------------------------------------------------------------
alter function public.record_order_key_pickup(uuid, text, text, text, uuid) rename to record_order_key_pickup_unguarded;
revoke all on function public.record_order_key_pickup_unguarded(uuid, text, text, text, uuid) from public, anon, authenticated;

create function public.record_order_key_pickup(p_key_id uuid, p_picked_up_by_name text, p_picked_up_by_surname text, p_picked_up_by_dni text, p_actor_staff_id uuid default NULL::uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  perform identity.require_admin('record_order_key_pickup');
  -- p_actor_staff_id is deprecated for API clients: the actor is derived from
  -- the caller's session so the audit trail cannot be forged (P0-4). It is
  -- still honoured in trusted non-API contexts (see identity.effective_actor).
  -- The parameter stays in the signature for one release so existing clients
  -- keep compiling; drop it once both apps no longer send it.
  perform public.record_order_key_pickup_unguarded(
      p_key_id => p_key_id,
      p_picked_up_by_name => p_picked_up_by_name,
      p_picked_up_by_surname => p_picked_up_by_surname,
      p_picked_up_by_dni => p_picked_up_by_dni,
      p_actor_staff_id => identity.effective_actor(p_actor_staff_id)
    );
end;
$$;

revoke execute on function public.record_order_key_pickup(uuid, text, text, text, uuid) from public, anon;
grant execute on function public.record_order_key_pickup(uuid, text, text, text, uuid) to authenticated, service_role;
comment on function public.record_order_key_pickup(uuid, text, text, text, uuid) is
  'Authorization wrapper (admin only) around record_order_key_pickup_unguarded. Added 2026-09-10 (P0-2).';

-- ---------------------------------------------------------------
-- request_key_disable  (admin only)
-- ---------------------------------------------------------------
alter function public.request_key_disable(uuid, uuid, text) rename to request_key_disable_unguarded;
revoke all on function public.request_key_disable_unguarded(uuid, uuid, text) from public, anon, authenticated;

create function public.request_key_disable(p_key_id uuid, p_actor_staff_id uuid default NULL::uuid, p_note text default NULL::text)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  perform identity.require_admin('request_key_disable');
  -- p_actor_staff_id is deprecated for API clients: the actor is derived from
  -- the caller's session so the audit trail cannot be forged (P0-4). It is
  -- still honoured in trusted non-API contexts (see identity.effective_actor).
  -- The parameter stays in the signature for one release so existing clients
  -- keep compiling; drop it once both apps no longer send it.
  perform public.request_key_disable_unguarded(
      p_key_id => p_key_id,
      p_actor_staff_id => identity.effective_actor(p_actor_staff_id),
      p_note => p_note
    );
end;
$$;

revoke execute on function public.request_key_disable(uuid, uuid, text) from public, anon;
grant execute on function public.request_key_disable(uuid, uuid, text) to authenticated, service_role;
comment on function public.request_key_disable(uuid, uuid, text) is
  'Authorization wrapper (admin only) around request_key_disable_unguarded. Added 2026-09-10 (P0-2).';

-- ---------------------------------------------------------------
-- resolve_equipment_installation  (admin only)
-- ---------------------------------------------------------------
alter function public.resolve_equipment_installation(uuid, text, uuid, text, uuid) rename to resolve_equipment_installation_unguarded;
revoke all on function public.resolve_equipment_installation_unguarded(uuid, text, uuid, text, uuid) from public, anon, authenticated;

create function public.resolve_equipment_installation(p_ticket_id uuid, p_serial text, p_unit_id uuid default NULL::uuid, p_note text default NULL::text, p_actor_staff_id uuid default NULL::uuid)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  perform identity.require_admin('resolve_equipment_installation');
  -- p_actor_staff_id is deprecated for API clients: the actor is derived from
  -- the caller's session so the audit trail cannot be forged (P0-4). It is
  -- still honoured in trusted non-API contexts (see identity.effective_actor).
  -- The parameter stays in the signature for one release so existing clients
  -- keep compiling; drop it once both apps no longer send it.
  return public.resolve_equipment_installation_unguarded(
      p_ticket_id => p_ticket_id,
      p_serial => p_serial,
      p_unit_id => p_unit_id,
      p_note => p_note,
      p_actor_staff_id => identity.effective_actor(p_actor_staff_id)
    );
end;
$$;

revoke execute on function public.resolve_equipment_installation(uuid, text, uuid, text, uuid) from public, anon;
grant execute on function public.resolve_equipment_installation(uuid, text, uuid, text, uuid) to authenticated, service_role;
comment on function public.resolve_equipment_installation(uuid, text, uuid, text, uuid) is
  'Authorization wrapper (admin only) around resolve_equipment_installation_unguarded. Added 2026-09-10 (P0-2).';

-- ---------------------------------------------------------------
-- resolve_equipment_replacement  (admin only)
-- ---------------------------------------------------------------
alter function public.resolve_equipment_replacement(uuid, uuid, text, text, text, text, uuid) rename to resolve_equipment_replacement_unguarded;
revoke all on function public.resolve_equipment_replacement_unguarded(uuid, uuid, text, text, text, text, uuid) from public, anon, authenticated;

create function public.resolve_equipment_replacement(p_ticket_id uuid, p_old_equipment_id uuid, p_new_serial text, p_new_model text default NULL::text, p_new_description text default NULL::text, p_note text default NULL::text, p_actor_staff_id uuid default NULL::uuid)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  perform identity.require_admin('resolve_equipment_replacement');
  -- p_actor_staff_id is deprecated for API clients: the actor is derived from
  -- the caller's session so the audit trail cannot be forged (P0-4). It is
  -- still honoured in trusted non-API contexts (see identity.effective_actor).
  -- The parameter stays in the signature for one release so existing clients
  -- keep compiling; drop it once both apps no longer send it.
  return public.resolve_equipment_replacement_unguarded(
      p_ticket_id => p_ticket_id,
      p_old_equipment_id => p_old_equipment_id,
      p_new_serial => p_new_serial,
      p_new_model => p_new_model,
      p_new_description => p_new_description,
      p_note => p_note,
      p_actor_staff_id => identity.effective_actor(p_actor_staff_id)
    );
end;
$$;

revoke execute on function public.resolve_equipment_replacement(uuid, uuid, text, text, text, text, uuid) from public, anon;
grant execute on function public.resolve_equipment_replacement(uuid, uuid, text, text, text, text, uuid) to authenticated, service_role;
comment on function public.resolve_equipment_replacement(uuid, uuid, text, text, text, text, uuid) is
  'Authorization wrapper (admin only) around resolve_equipment_replacement_unguarded. Added 2026-09-10 (P0-2).';

-- ---------------------------------------------------------------
-- resolve_equipment_update  (any active staff (admin or installer))
-- ---------------------------------------------------------------
alter function public.resolve_equipment_update(uuid, uuid) rename to resolve_equipment_update_unguarded;
revoke all on function public.resolve_equipment_update_unguarded(uuid, uuid) from public, anon, authenticated;

create function public.resolve_equipment_update(p_task_id uuid, p_actor_staff_id uuid default NULL::uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  perform identity.require_staff('resolve_equipment_update');
  -- p_actor_staff_id is deprecated for API clients: the actor is derived from
  -- the caller's session so the audit trail cannot be forged (P0-4). It is
  -- still honoured in trusted non-API contexts (see identity.effective_actor).
  -- The parameter stays in the signature for one release so existing clients
  -- keep compiling; drop it once both apps no longer send it.
  return public.resolve_equipment_update_unguarded(
      p_task_id => p_task_id,
      p_actor_staff_id => identity.effective_actor(p_actor_staff_id)
    );
end;
$$;

revoke execute on function public.resolve_equipment_update(uuid, uuid) from public, anon;
grant execute on function public.resolve_equipment_update(uuid, uuid) to authenticated, service_role;
comment on function public.resolve_equipment_update(uuid, uuid) is
  'Authorization wrapper (any active staff (admin or installer)) around resolve_equipment_update_unguarded. Added 2026-09-10 (P0-2).';

-- ---------------------------------------------------------------
-- resolve_ticket  (any active staff (admin or installer))
-- ---------------------------------------------------------------
alter function public.resolve_ticket(uuid, text, uuid) rename to resolve_ticket_unguarded;
revoke all on function public.resolve_ticket_unguarded(uuid, text, uuid) from public, anon, authenticated;

create function public.resolve_ticket(p_ticket_id uuid, p_note text default NULL::text, p_actor_staff_id uuid default NULL::uuid)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  perform identity.require_staff('resolve_ticket');
  -- p_actor_staff_id is deprecated for API clients: the actor is derived from
  -- the caller's session so the audit trail cannot be forged (P0-4). It is
  -- still honoured in trusted non-API contexts (see identity.effective_actor).
  -- The parameter stays in the signature for one release so existing clients
  -- keep compiling; drop it once both apps no longer send it.
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
  'Authorization wrapper (any active staff (admin or installer)) around resolve_ticket_unguarded. Added 2026-09-10 (P0-2).';

-- ---------------------------------------------------------------
-- update_draft_key_order_with_items  (admin only)
-- ---------------------------------------------------------------
alter function public.update_draft_key_order_with_items(uuid, jsonb, jsonb[], timestamptz) rename to update_draft_key_order_with_items_unguarded;
revoke all on function public.update_draft_key_order_with_items_unguarded(uuid, jsonb, jsonb[], timestamptz) from public, anon, authenticated;

create function public.update_draft_key_order_with_items(p_order_id uuid, p_patch jsonb, p_items jsonb[], p_expected_updated_at timestamptz)
returns timestamptz
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  perform identity.require_admin('update_draft_key_order_with_items');
  return public.update_draft_key_order_with_items_unguarded(
      p_order_id => p_order_id,
      p_patch => p_patch,
      p_items => p_items,
      p_expected_updated_at => p_expected_updated_at
    );
end;
$$;

revoke execute on function public.update_draft_key_order_with_items(uuid, jsonb, jsonb[], timestamptz) from public, anon;
grant execute on function public.update_draft_key_order_with_items(uuid, jsonb, jsonb[], timestamptz) to authenticated, service_role;
comment on function public.update_draft_key_order_with_items(uuid, jsonb, jsonb[], timestamptz) is
  'Authorization wrapper (admin only) around update_draft_key_order_with_items_unguarded. Added 2026-09-10 (P0-2).';

-- ---------------------------------------------------------------
-- update_draft_technical_order_with_items  (admin only)
-- ---------------------------------------------------------------
alter function public.update_draft_technical_order_with_items(uuid, jsonb, jsonb[], timestamptz) rename to update_draft_technical_order_with_items_unguarded;
revoke all on function public.update_draft_technical_order_with_items_unguarded(uuid, jsonb, jsonb[], timestamptz) from public, anon, authenticated;

create function public.update_draft_technical_order_with_items(p_order_id uuid, p_patch jsonb, p_items jsonb[], p_expected_updated_at timestamptz)
returns timestamptz
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  perform identity.require_admin('update_draft_technical_order_with_items');
  return public.update_draft_technical_order_with_items_unguarded(
      p_order_id => p_order_id,
      p_patch => p_patch,
      p_items => p_items,
      p_expected_updated_at => p_expected_updated_at
    );
end;
$$;

revoke execute on function public.update_draft_technical_order_with_items(uuid, jsonb, jsonb[], timestamptz) from public, anon;
grant execute on function public.update_draft_technical_order_with_items(uuid, jsonb, jsonb[], timestamptz) to authenticated, service_role;
comment on function public.update_draft_technical_order_with_items(uuid, jsonb, jsonb[], timestamptz) is
  'Authorization wrapper (admin only) around update_draft_technical_order_with_items_unguarded. Added 2026-09-10 (P0-2).';

-- PostgREST caches the schema; make the new wrappers visible immediately.
notify pgrst, 'reload schema';
