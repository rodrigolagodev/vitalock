-- ============================================================
-- NEW RPC: create_and_assign_equipment
-- ============================================================
-- Atomically creates a new operations.equipment row and links it to a
-- support.tickets row in a single transaction.
--
-- Replaces the two-step INSERT + UPDATE pattern in
-- apps/admin/src/hooks/useMutateTicketEquipment.ts (createAndAssignEquipment
-- mutation), which could leave orphan equipment rows if the client crashed
-- between the INSERT and the UPDATE.
--
-- SECURITY INVOKER: relies on the caller's RLS. Admin policies on
--   operations.equipment (admin_all_equipment) and support.tickets
--   grant INSERT/UPDATE to identity.is_admin(). Non-admin callers hit
--   PostgreSQL SQLSTATE 42501 (insufficient privilege).
--
-- Duplicate serial surfaces as the underlying 23505 unique_violation on
-- operations.equipment.serial_number (globally unique).
--
-- Ticket not found is reported as P0001 with substring
-- 'create_and_assign_equipment' so the client toast mapper can key on it.

create or replace function public.create_and_assign_equipment(
  p_ticket_id    uuid,
  p_building_id  uuid,
  p_serial       text,
  p_model        text,
  p_description  text,
  p_access_type  text
) returns uuid
language plpgsql
security invoker
as $$
declare
  v_equipment_id uuid;
  v_updated int;
begin
  insert into operations.equipment (
    building_id,
    serial_number,
    model,
    description,
    access_type
  ) values (
    p_building_id,
    p_serial,
    p_model,
    coalesce(p_description, ''),
    p_access_type
  )
  returning id into v_equipment_id;

  update support.tickets
     set equipment_id = v_equipment_id
   where id = p_ticket_id;

  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    raise exception 'create_and_assign_equipment: ticket % not found', p_ticket_id
      using errcode = 'P0001';
  end if;

  return v_equipment_id;
end;
$$;

grant execute on function public.create_and_assign_equipment(uuid, uuid, text, text, text, text)
  to authenticated;
