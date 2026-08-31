-- ============================================================
-- Migration: fix installer RLS on support.equipment_updates + add
--            p_assigned_to_staff_id to create_equipment_update
-- ============================================================
-- Two related fixes:
--
-- (1) The RLS policy `installer_read_assigned_equipment_updates`
--     (migration 20260818000066) used `t.assigned_to_staff_id = auth.uid()`.
--     That comparison is always false because `assigned_to_staff_id` refs
--     `identity.staff.id`, whereas `auth.uid()` returns `auth.users.id`.
--     Installers therefore silently could NOT read their own equipment_update
--     tasks — the assigned ticket appears in their board (tickets policy is
--     correct), but the batch fetch on support.equipment_updates returns
--     empty, so the resolve dialog shows "no se encontró la tarea de
--     actualización".
--     Fix: use `identity.current_staff_id()` which resolves via the
--     auth.users → identity.staff mapping — matches the pattern of every
--     other installer_* policy in the codebase.
--
-- (2) `create_equipment_update` did not accept an assignee, so the ticket
--     was inserted with `assigned_to_staff_id=NULL` and the operator had
--     to navigate to the ticket detail and assign manually. Add
--     `p_assigned_to_staff_id` (optional to preserve the existing signature
--     as a fallback path, but the UI form requires it).
-- ============================================================

-- -------------------------------------------------------
-- (1) Fix RLS policy
-- -------------------------------------------------------
drop policy if exists "installer_read_assigned_equipment_updates"
  on support.equipment_updates;

create policy "installer_read_assigned_equipment_updates"
  on support.equipment_updates
  for select to authenticated
  using (
    identity.is_installer()
    and exists (
      select 1
        from support.tickets t
       where t.id = equipment_updates.ticket_id
         and t.assigned_to_staff_id = identity.current_staff_id()
    )
  );

-- -------------------------------------------------------
-- (2) Extend create_equipment_update with p_assigned_to_staff_id
-- -------------------------------------------------------
-- Cannot CREATE OR REPLACE with a changed signature; drop and recreate.
drop function if exists public.create_equipment_update(
  uuid, uuid, uuid, text, text, uuid[], uuid[], uuid
);

create or replace function public.create_equipment_update(
  p_equipment_id           uuid,
  p_administration_id      uuid,
  p_building_id            uuid,
  p_description            text,
  p_mdb_storage_path       text,
  p_keys_to_activate       uuid[]  default '{}',
  p_keys_to_disable        uuid[]  default '{}',
  p_actor_staff_id         uuid    default null,
  p_assigned_to_staff_id   uuid    default null
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
    status,
    assigned_to_staff_id
  ) values (
    p_administration_id,
    p_building_id,
    p_equipment_id,
    'equipment_update',
    p_description,
    'open',
    p_assigned_to_staff_id
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

grant execute on function public.create_equipment_update(
  uuid, uuid, uuid, text, text, uuid[], uuid[], uuid, uuid
) to authenticated;
