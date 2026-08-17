-- ============================================================
-- DB smoke test: tickets category CHECK + cancel guard + require_equipment
-- ============================================================
-- Prerequisite: migrations 064 + 065 + 066 + 067 applied.
-- ============================================================

-- ============================================================
-- Scenario 1: equipment_update category accepted by tickets.category CHECK
-- ============================================================
begin;
do $$
declare
  v_admin_id     uuid;
  v_building_id  uuid;
  v_equipment_id uuid;
  v_ticket_id    uuid;
begin
  insert into public.administrations (company_name) values ('Test 067-S1') returning id into v_admin_id;
  insert into public.buildings (name, address, administration_id) values ('Building 067-S1', 'Calle 1', v_admin_id) returning id into v_building_id;
  insert into operations.equipment (serial_number, building_id, description, status) values ('SN-067-S1', v_building_id, 'Equip 067-S1', 'active') returning id into v_equipment_id;

  insert into support.tickets (
    administration_id, building_id, category, description, status, equipment_id
  ) values (
    v_admin_id, v_building_id, 'equipment_update', 'Test 067-S1', 'open', v_equipment_id
  ) returning id into v_ticket_id;

  assert v_ticket_id is not null, 'FAIL 067-S1: equipment_update category not accepted';
  raise notice 'PASS scenario-1: equipment_update category accepted';
end $$;
rollback;

-- ============================================================
-- Scenario 2: unknown category is rejected
-- ============================================================
begin;
do $$
declare
  v_admin_id    uuid;
  v_building_id uuid;
  v_failed      boolean := false;
begin
  insert into public.administrations (company_name) values ('Test 067-S2') returning id into v_admin_id;
  insert into public.buildings (name, address, administration_id) values ('Building 067-S2', 'Calle 2', v_admin_id) returning id into v_building_id;

  begin
    insert into support.tickets (administration_id, building_id, category, description, status)
      values (v_admin_id, v_building_id, 'unknown_type', 'Test 067-S2', 'open');
  exception when check_violation or others then
    v_failed := true;
  end;

  assert v_failed, 'FAIL 067-S2: expected unknown_type to be rejected';
  raise notice 'PASS scenario-2: unknown category rejected';
end $$;
rollback;

-- ============================================================
-- Scenario 3: open equipment_update → cancel succeeds (no guard applies)
-- ============================================================
begin;
do $$
declare
  v_admin_id     uuid;
  v_building_id  uuid;
  v_equipment_id uuid;
  v_ticket_id    uuid;
  v_status       text;
begin
  insert into public.administrations (company_name) values ('Test 067-S3') returning id into v_admin_id;
  insert into public.buildings (name, address, administration_id) values ('Building 067-S3', 'Calle 3', v_admin_id) returning id into v_building_id;
  insert into operations.equipment (serial_number, building_id, description, status) values ('SN-067-S3', v_building_id, 'Equip 067-S3', 'active') returning id into v_equipment_id;

  insert into support.tickets (administration_id, building_id, category, description, status, equipment_id)
    values (v_admin_id, v_building_id, 'equipment_update', 'Test 067-S3', 'open', v_equipment_id)
    returning id into v_ticket_id;

  -- open → cancelled: must succeed (guard only blocks in_progress → cancelled)
  update support.tickets
     set status = 'cancelled', cancellation_reason = 'Test cancel S3'
   where id = v_ticket_id;

  select status into v_status from support.tickets where id = v_ticket_id;
  assert v_status = 'cancelled', 'FAIL 067-S3: expected cancelled status, got ' || v_status;
  raise notice 'PASS scenario-3: open equipment_update can be cancelled';
end $$;
rollback;

-- ============================================================
-- Scenario 4: in_progress equipment_update → cancel is blocked by trigger
-- ============================================================
begin;
do $$
declare
  v_admin_id     uuid;
  v_building_id  uuid;
  v_equipment_id uuid;
  v_ticket_id    uuid;
  v_failed       boolean := false;
begin
  insert into public.administrations (company_name) values ('Test 067-S4') returning id into v_admin_id;
  insert into public.buildings (name, address, administration_id) values ('Building 067-S4', 'Calle 4', v_admin_id) returning id into v_building_id;
  insert into operations.equipment (serial_number, building_id, description, status) values ('SN-067-S4', v_building_id, 'Equip 067-S4', 'active') returning id into v_equipment_id;

  insert into support.tickets (administration_id, building_id, category, description, status, equipment_id)
    values (v_admin_id, v_building_id, 'equipment_update', 'Test 067-S4', 'open', v_equipment_id)
    returning id into v_ticket_id;

  -- Advance to in_progress
  update support.tickets set status = 'in_progress' where id = v_ticket_id and status = 'open';

  -- in_progress → cancelled must be blocked by trigger
  begin
    update support.tickets
       set status = 'cancelled', cancellation_reason = 'Test cancel S4'
     where id = v_ticket_id;
  exception when check_violation or others then
    v_failed := true;
  end;

  assert v_failed, 'FAIL 067-S4: expected in_progress → cancelled to be blocked for equipment_update';
  raise notice 'PASS scenario-4: in_progress equipment_update cancel blocked by trigger';
end $$;
rollback;

-- ============================================================
-- Scenario 5: in_progress maintenance → cancel succeeds (other categories unaffected)
-- ============================================================
begin;
do $$
declare
  v_admin_id     uuid;
  v_building_id  uuid;
  v_equipment_id uuid;
  v_ticket_id    uuid;
  v_status       text;
begin
  insert into public.administrations (company_name) values ('Test 067-S5') returning id into v_admin_id;
  insert into public.buildings (name, address, administration_id) values ('Building 067-S5', 'Calle 5', v_admin_id) returning id into v_building_id;
  insert into operations.equipment (serial_number, building_id, description, status) values ('SN-067-S5', v_building_id, 'Equip 067-S5', 'active') returning id into v_equipment_id;

  insert into support.tickets (administration_id, building_id, category, description, status, equipment_id)
    values (v_admin_id, v_building_id, 'maintenance', 'Test 067-S5', 'open', v_equipment_id)
    returning id into v_ticket_id;

  update support.tickets set status = 'in_progress' where id = v_ticket_id and status = 'open';

  -- in_progress maintenance → cancelled must succeed (guard is equipment_update-specific)
  update support.tickets
     set status = 'cancelled', cancellation_reason = 'Test cancel S5'
   where id = v_ticket_id;

  select status into v_status from support.tickets where id = v_ticket_id;
  assert v_status = 'cancelled', 'FAIL 067-S5: expected maintenance cancel to succeed, got ' || v_status;
  raise notice 'PASS scenario-5: in_progress maintenance can be cancelled';
end $$;
rollback;

-- ============================================================
-- Scenario 6: equipment_update ticket requires equipment_id on resolve
-- ============================================================
begin;
do $$
declare
  v_admin_id     uuid;
  v_building_id  uuid;
  v_equipment_id uuid;
  v_ticket_id    uuid;
  v_failed       boolean := false;
begin
  insert into public.administrations (company_name) values ('Test 067-S6') returning id into v_admin_id;
  insert into public.buildings (name, address, administration_id) values ('Building 067-S6', 'Calle 6', v_admin_id) returning id into v_building_id;

  -- Create ticket WITHOUT equipment_id
  insert into support.tickets (administration_id, building_id, category, description, status)
    values (v_admin_id, v_building_id, 'equipment_update', 'Test 067-S6', 'open')
    returning id into v_ticket_id;

  update support.tickets set status = 'in_progress' where id = v_ticket_id and status = 'open';

  begin
    update support.tickets
       set status = 'resolved', resolved_by_staff_id = null, resolution_notes = 'Test resolve'
     where id = v_ticket_id;
  exception when check_violation or others then
    v_failed := true;
  end;

  assert v_failed, 'FAIL 067-S6: expected resolve without equipment_id to be rejected';
  raise notice 'PASS scenario-6: equipment_update requires equipment_id on resolve';
end $$;
rollback;
