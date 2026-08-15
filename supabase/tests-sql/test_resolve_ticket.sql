-- ============================================================
-- DB smoke test: public.resolve_ticket — state-machine-safe resolution
-- ============================================================
-- Implements: tickets / Resolution and state machine (migration
-- 20260811000058). Regression for: installer resolving an 'open' ticket
-- with a direct open -> resolved UPDATE used to be rejected by
-- support.tickets_validate, leaving the ticket stuck open.
--
-- Run via: psql -f supabase/tests-sql/test_resolve_ticket.sql
-- Prerequisite: migration 20260811000058 applied.
-- Each scenario runs in its own transaction and always rolls back.
-- ============================================================

-- ===========================================================
-- Scenario (a): resolve_ticket moves an 'open' ticket straight to
-- 'resolved' with actor + notes set (the installer one-click flow)
-- ===========================================================
begin;

do $$
declare
  v_admin_id    uuid;
  v_building_id uuid;
  v_staff_id    uuid;
  v_ticket_id   uuid;
  v_status      text;
  v_by_staff    uuid;
  v_notes       text;
begin
  insert into public.administrations (company_name)
  values ('Test Admin ResolveTicket')
  returning id into v_admin_id;

  insert into public.buildings (name, address, administration_id)
  values ('Test Building ResolveTicket', 'Street 1', v_admin_id)
  returning id into v_building_id;

  insert into identity.staff (full_name, role)
  values ('Test Installer ResolveTicket', 'installer')
  returning id into v_staff_id;

  -- key_configuration requires no equipment on resolve and is used here because
  -- key_installation is no longer a supported category (retired by
  -- unify-work-tracking-model migration 20260812000060).
  insert into support.tickets (
    administration_id, building_id, category, description, status,
    assigned_to_staff_id
  ) values (
    v_admin_id, v_building_id, 'key_configuration',
    'Configurar llave en lector', 'open', v_staff_id
  )
  returning id into v_ticket_id;

  perform public.resolve_ticket(v_ticket_id, 'Instalada en el lector', v_staff_id);

  select status, resolved_by_staff_id, resolution_notes
    into v_status, v_by_staff, v_notes
    from support.tickets where id = v_ticket_id;

  assert v_status = 'resolved',
    'FAIL scenario-a: expected resolved, got ' || v_status;
  assert v_by_staff = v_staff_id,
    'FAIL scenario-a: expected actor as resolved_by_staff_id';
  assert v_notes = 'Instalada en el lector',
    'FAIL scenario-a: resolution notes missing';

  raise notice 'PASS scenario-a: resolve_ticket resolves an open ticket in one call';
end $$;

rollback;

-- ===========================================================
-- Scenario (b): resolve_ticket on an 'in_progress' ticket
-- ===========================================================
begin;

do $$
declare
  v_admin_id    uuid;
  v_building_id uuid;
  v_staff_id    uuid;
  v_ticket_id   uuid;
  v_status      text;
begin
  insert into public.administrations (company_name)
  values ('Test Admin ResolveInProgress')
  returning id into v_admin_id;

  insert into public.buildings (name, address, administration_id)
  values ('Test Building ResolveInProgress', 'Street 2', v_admin_id)
  returning id into v_building_id;

  insert into identity.staff (full_name, role)
  values ('Test Installer ResolveInProgress', 'installer')
  returning id into v_staff_id;

  insert into support.tickets (
    administration_id, building_id, category, description, status,
    assigned_to_staff_id
  ) values (
    v_admin_id, v_building_id, 'key_configuration',
    'Configurar llave (ya en progreso)', 'in_progress', v_staff_id
  )
  returning id into v_ticket_id;

  perform public.resolve_ticket(v_ticket_id, null, v_staff_id);

  select status into v_status
    from support.tickets where id = v_ticket_id;

  assert v_status = 'resolved',
    'FAIL scenario-b: expected resolved from in_progress, got ' || v_status;

  raise notice 'PASS scenario-b: resolve_ticket resolves an in_progress ticket';
end $$;

rollback;

-- ===========================================================
-- Scenario (c): resolve_ticket on an already-resolved ticket fails
-- ===========================================================
begin;

do $$
declare
  v_admin_id    uuid;
  v_building_id uuid;
  v_staff_id    uuid;
  v_ticket_id   uuid;
  v_failed      boolean := false;
begin
  insert into public.administrations (company_name)
  values ('Test Admin ResolveTwice')
  returning id into v_admin_id;

  insert into public.buildings (name, address, administration_id)
  values ('Test Building ResolveTwice', 'Street 3', v_admin_id)
  returning id into v_building_id;

  insert into identity.staff (full_name, role)
  values ('Test Installer ResolveTwice', 'installer')
  returning id into v_staff_id;

  insert into support.tickets (
    administration_id, building_id, category, description, status,
    assigned_to_staff_id
  ) values (
    v_admin_id, v_building_id, 'key_configuration',
    'Configurar llave (ya resuelta)', 'open', v_staff_id
  )
  returning id into v_ticket_id;

  perform public.resolve_ticket(v_ticket_id, 'Primera vez', v_staff_id);

  begin
    perform public.resolve_ticket(v_ticket_id, 'Segunda vez', v_staff_id);
  exception when others then
    v_failed := true;
  end;

  assert v_failed,
    'FAIL scenario-c: expected an error resolving an already-resolved ticket';

  raise notice 'PASS scenario-c: resolve_ticket rejects a second resolution';
end $$;

rollback;

-- ===========================================================
-- Scenario (d): direct open -> resolved UPDATE is still rejected by the
-- state machine (regression guard — the original bug)
-- ===========================================================
begin;

do $$
declare
  v_admin_id    uuid;
  v_building_id uuid;
  v_staff_id    uuid;
  v_ticket_id   uuid;
  v_failed      boolean := false;
begin
  insert into public.administrations (company_name)
  values ('Test Admin DirectHop')
  returning id into v_admin_id;

  insert into public.buildings (name, address, administration_id)
  values ('Test Building DirectHop', 'Street 4', v_admin_id)
  returning id into v_building_id;

  insert into identity.staff (full_name, role)
  values ('Test Installer DirectHop', 'installer')
  returning id into v_staff_id;

  insert into support.tickets (
    administration_id, building_id, category, description, status,
    assigned_to_staff_id
  ) values (
    v_admin_id, v_building_id, 'key_configuration',
    'Configurar llave (hop directo)', 'open', v_staff_id
  )
  returning id into v_ticket_id;

  begin
    update support.tickets
       set status = 'resolved'
     where id = v_ticket_id;
  exception when others then
    v_failed := true;
  end;

  assert v_failed,
    'FAIL scenario-d: direct open -> resolved hop must be rejected';

  raise notice 'PASS scenario-d: state machine still rejects direct open -> resolved';
end $$;

rollback;
