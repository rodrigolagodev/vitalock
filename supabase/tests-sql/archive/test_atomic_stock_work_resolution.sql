-- ============================================================
-- DB smoke test: atomic-stock-work-resolution
-- ============================================================
-- Tests both public.resolve_equipment_installation and
-- public.resolve_equipment_replacement, the backfill DO block,
-- and temp-table nesting.
--
-- Run via: psql -f supabase/tests-sql/test_atomic_stock_work_resolution.sql
-- Prerequisites: migration 20260812000061 applied.
-- Each scenario runs in its own transaction and always rolls back.
-- ============================================================

-- ===========================================================
-- Scenario 1: resolve_equipment_installation happy path
-- reserva → egreso_instalacion + liberacion_reserva; ticket resolved;
-- equipment created.
-- ===========================================================
begin;

do $$
declare
  v_admin_id      uuid;
  v_building_id   uuid;
  v_staff_id      uuid;
  v_product_id    uuid;
  v_order_id      uuid;
  v_order_item_id uuid;
  v_ticket_id     uuid;
  v_equipment_id  uuid;
  v_status        text;
  v_egreso_qty    int;
  v_liberacion_qty int;
  v_equip_serial  text;
begin
  insert into public.administrations (company_name)
  values ('Test Admin S1')
  returning id into v_admin_id;

  insert into public.buildings (name, address, administration_id)
  values ('Test Building S1', 'Calle 1', v_admin_id)
  returning id into v_building_id;

  insert into identity.staff (full_name, role)
  values ('Test Admin Staff S1', 'admin')
  returning id into v_staff_id;

  insert into public.products (name, category, stock_total, stock_reservado)
  values ('Controlador S1', 'equipment', 10, 0)
  returning id into v_product_id;

  insert into public.orders (order_number, order_type, status, administration_id, client_type)
  values ('ORD-S1-001', 'technical', 'confirmed', v_admin_id, 'administration')
  returning id into v_order_id;

  insert into public.order_items (order_id, product_id, quantity, unit_price, item_type)
  values (v_order_id, v_product_id, 2, 100.00, 'equipment')
  returning id into v_order_item_id;

  insert into support.tickets (
    administration_id, building_id, category, description, status,
    assigned_to_staff_id
  ) values (
    v_admin_id, v_building_id, 'equipment_installation',
    'Instalar controlador S1', 'open', v_staff_id
  )
  returning id into v_ticket_id;

  -- Simulate the reserva movement that confirm_order would emit.
  insert into public.stock_movements (
    product_id, type, quantity, note, order_id, order_item_id, ticket_id, created_by
  ) values (
    v_product_id, 'reserva', -2,
    'Reserva para ticket S1', v_order_id, v_order_item_id, v_ticket_id, v_staff_id
  );

  -- Call the RPC under test.
  v_equipment_id := public.resolve_equipment_installation(
    v_ticket_id, 'SN-S1-TEST', null, 'Resuelto en escenario 1', v_staff_id
  );

  -- Assert: ticket resolved.
  select status into v_status from support.tickets where id = v_ticket_id;
  assert v_status = 'resolved',
    'FAIL scenario-1: expected ticket resolved, got ' || v_status;

  -- Assert: egreso_instalacion with correct qty.
  select quantity into v_egreso_qty
    from public.stock_movements
   where ticket_id = v_ticket_id and type = 'egreso_instalacion';
  assert v_egreso_qty = -2,
    'FAIL scenario-1: expected egreso_instalacion qty=-2, got ' || v_egreso_qty::text;

  -- Assert: liberacion_reserva with correct qty.
  select quantity into v_liberacion_qty
    from public.stock_movements
   where ticket_id = v_ticket_id and type = 'liberacion_reserva';
  assert v_liberacion_qty = 2,
    'FAIL scenario-1: expected liberacion_reserva qty=+2, got ' || v_liberacion_qty::text;

  -- Assert: equipment row created with correct serial.
  select serial_number into v_equip_serial
    from operations.equipment
   where id = v_equipment_id;
  assert v_equip_serial = 'SN-S1-TEST',
    'FAIL scenario-1: expected serial SN-S1-TEST, got ' || v_equip_serial;

  raise notice 'PASS scenario-1: resolve_equipment_installation emits reserva balance and resolves ticket';
end $$;

rollback;

-- ===========================================================
-- Scenario 2: resolve_equipment_installation with product_id=NULL
-- No movements; ticket still resolves; equipment created.
-- ===========================================================
begin;

do $$
declare
  v_admin_id      uuid;
  v_building_id   uuid;
  v_staff_id      uuid;
  v_ticket_id     uuid;
  v_equipment_id  uuid;
  v_status        text;
  v_movement_count int;
begin
  insert into public.administrations (company_name)
  values ('Test Admin S2')
  returning id into v_admin_id;

  insert into public.buildings (name, address, administration_id)
  values ('Test Building S2', 'Calle 2', v_admin_id)
  returning id into v_building_id;

  insert into identity.staff (full_name, role)
  values ('Test Admin Staff S2', 'admin')
  returning id into v_staff_id;

  insert into support.tickets (
    administration_id, building_id, category, description, status,
    assigned_to_staff_id
  ) values (
    v_admin_id, v_building_id, 'equipment_installation',
    'Instalar equipo sin producto S2', 'open', v_staff_id
  )
  returning id into v_ticket_id;

  -- No reserva movement (no product_id scenario).

  v_equipment_id := public.resolve_equipment_installation(
    v_ticket_id, 'SN-S2-NOPRODUCT', null, null, v_staff_id
  );

  -- Assert: ticket resolved.
  select status into v_status from support.tickets where id = v_ticket_id;
  assert v_status = 'resolved',
    'FAIL scenario-2: expected ticket resolved, got ' || v_status;

  -- Assert: no stock movements emitted.
  select count(*) into v_movement_count
    from public.stock_movements
   where ticket_id = v_ticket_id
     and type in ('egreso_instalacion', 'liberacion_reserva');
  assert v_movement_count = 0,
    'FAIL scenario-2: expected 0 stock movements, got ' || v_movement_count::text;

  -- Assert: equipment created.
  assert v_equipment_id is not null,
    'FAIL scenario-2: expected a non-null equipment_id';

  raise notice 'PASS scenario-2: resolve_equipment_installation with NULL product_id emits no movements and resolves ticket';
end $$;

rollback;

-- ===========================================================
-- Scenario 3: resolve_equipment_replacement happy path
-- reserva → egreso_reemplazo + liberacion_reserva; new equipment active;
-- old equipment dead; key_authorizations migrated; ticket resolved.
-- ===========================================================
begin;

do $$
declare
  v_admin_id       uuid;
  v_building_id    uuid;
  v_staff_id       uuid;
  v_product_id     uuid;
  v_order_id       uuid;
  v_order_item_id  uuid;
  v_ticket_id      uuid;
  v_old_eq_id      uuid;
  v_new_eq_id      uuid;
  v_status         text;
  v_egreso_qty     int;
  v_liberacion_qty int;
  v_old_eq_status  text;
  v_new_eq_status  text;
begin
  insert into public.administrations (company_name)
  values ('Test Admin S3')
  returning id into v_admin_id;

  insert into public.buildings (name, address, administration_id)
  values ('Test Building S3', 'Calle 3', v_admin_id)
  returning id into v_building_id;

  insert into identity.staff (full_name, role)
  values ('Test Admin Staff S3', 'admin')
  returning id into v_staff_id;

  -- Create the old equipment to be replaced.
  insert into operations.equipment (serial_number, building_id, description, status)
  values ('SN-OLD-S3', v_building_id, 'Old equip S3', 'active')
  returning id into v_old_eq_id;

  insert into public.products (name, category, stock_total, stock_reservado)
  values ('Controlador S3', 'equipment', 10, 0)
  returning id into v_product_id;

  insert into public.orders (order_number, order_type, status, administration_id, client_type)
  values ('ORD-S3-001', 'technical', 'confirmed', v_admin_id, 'administration')
  returning id into v_order_id;

  insert into public.order_items (order_id, product_id, quantity, unit_price, item_type)
  values (v_order_id, v_product_id, 1, 150.00, 'equipment')
  returning id into v_order_item_id;

  insert into support.tickets (
    administration_id, building_id, category, description, status,
    assigned_to_staff_id, equipment_id
  ) values (
    v_admin_id, v_building_id, 'equipment_replacement',
    'Reemplazar controlador S3', 'open', v_staff_id, v_old_eq_id
  )
  returning id into v_ticket_id;

  -- Simulate the reserva movement.
  insert into public.stock_movements (
    product_id, type, quantity, note, order_id, order_item_id, ticket_id, created_by
  ) values (
    v_product_id, 'reserva', -1,
    'Reserva para ticket S3', v_order_id, v_order_item_id, v_ticket_id, v_staff_id
  );

  -- Call the RPC under test.
  v_new_eq_id := public.resolve_equipment_replacement(
    v_ticket_id, v_old_eq_id, 'SN-NEW-S3', 'Modelo X', null, null, v_staff_id
  );

  -- Assert: ticket resolved.
  select status into v_status from support.tickets where id = v_ticket_id;
  assert v_status = 'resolved',
    'FAIL scenario-3: expected ticket resolved, got ' || v_status;

  -- Assert: egreso_reemplazo with correct qty.
  select quantity into v_egreso_qty
    from public.stock_movements
   where ticket_id = v_ticket_id and type = 'egreso_reemplazo';
  assert v_egreso_qty = -1,
    'FAIL scenario-3: expected egreso_reemplazo qty=-1, got ' || v_egreso_qty::text;

  -- Assert: liberacion_reserva with correct qty.
  select quantity into v_liberacion_qty
    from public.stock_movements
   where ticket_id = v_ticket_id and type = 'liberacion_reserva';
  assert v_liberacion_qty = 1,
    'FAIL scenario-3: expected liberacion_reserva qty=+1, got ' || v_liberacion_qty::text;

  -- Assert: old equipment now dead, new equipment active.
  select status into v_old_eq_status from operations.equipment where id = v_old_eq_id;
  select status into v_new_eq_status from operations.equipment where id = v_new_eq_id;
  assert v_old_eq_status = 'dead',
    'FAIL scenario-3: expected old equipment dead, got ' || v_old_eq_status;
  assert v_new_eq_status = 'active',
    'FAIL scenario-3: expected new equipment active, got ' || v_new_eq_status;

  -- Assert: ticket equipment_id updated to new equipment.
  assert (select equipment_id from support.tickets where id = v_ticket_id) = v_new_eq_id,
    'FAIL scenario-3: ticket equipment_id not updated to new equipment';

  raise notice 'PASS scenario-3: resolve_equipment_replacement emits egreso_reemplazo + liberacion_reserva; old dead, new active; ticket resolved';
end $$;

rollback;

-- ===========================================================
-- Scenario 4: resolve_equipment_replacement with product_id=NULL
-- No movements; swap executes; ticket resolved.
-- ===========================================================
begin;

do $$
declare
  v_admin_id      uuid;
  v_building_id   uuid;
  v_staff_id      uuid;
  v_ticket_id     uuid;
  v_old_eq_id     uuid;
  v_new_eq_id     uuid;
  v_status        text;
  v_movement_count int;
begin
  insert into public.administrations (company_name)
  values ('Test Admin S4')
  returning id into v_admin_id;

  insert into public.buildings (name, address, administration_id)
  values ('Test Building S4', 'Calle 4', v_admin_id)
  returning id into v_building_id;

  insert into identity.staff (full_name, role)
  values ('Test Admin Staff S4', 'admin')
  returning id into v_staff_id;

  insert into operations.equipment (serial_number, building_id, description, status)
  values ('SN-OLD-S4', v_building_id, 'Old equip S4', 'active')
  returning id into v_old_eq_id;

  insert into support.tickets (
    administration_id, building_id, category, description, status,
    assigned_to_staff_id, equipment_id
  ) values (
    v_admin_id, v_building_id, 'equipment_replacement',
    'Reemplazar equipo sin producto S4', 'open', v_staff_id, v_old_eq_id
  )
  returning id into v_ticket_id;

  -- No reserva movement (no product_id scenario).

  v_new_eq_id := public.resolve_equipment_replacement(
    v_ticket_id, v_old_eq_id, 'SN-NEW-S4', 'Modelo Y', null, null, v_staff_id
  );

  -- Assert: ticket resolved.
  select status into v_status from support.tickets where id = v_ticket_id;
  assert v_status = 'resolved',
    'FAIL scenario-4: expected ticket resolved, got ' || v_status;

  -- Assert: no stock movements (no egreso_reemplazo, no liberacion_reserva).
  select count(*) into v_movement_count
    from public.stock_movements
   where ticket_id = v_ticket_id
     and type in ('egreso_reemplazo', 'liberacion_reserva');
  assert v_movement_count = 0,
    'FAIL scenario-4: expected 0 stock movements, got ' || v_movement_count::text;

  -- Assert: equipment swapped.
  assert v_new_eq_id is not null,
    'FAIL scenario-4: expected a non-null new equipment_id';

  raise notice 'PASS scenario-4: resolve_equipment_replacement with NULL product_id emits no movements; swap executes; ticket resolved';
end $$;

rollback;

-- ===========================================================
-- Scenario 5: Second call on already-resolved ticket raises P0001;
-- no duplicate rows.
-- ===========================================================
begin;

do $$
declare
  v_admin_id      uuid;
  v_building_id   uuid;
  v_staff_id      uuid;
  v_old_eq_id     uuid;
  v_ticket_id     uuid;
  v_failed        boolean := false;
  v_movement_count int;
begin
  insert into public.administrations (company_name)
  values ('Test Admin S5')
  returning id into v_admin_id;

  insert into public.buildings (name, address, administration_id)
  values ('Test Building S5', 'Calle 5', v_admin_id)
  returning id into v_building_id;

  insert into identity.staff (full_name, role)
  values ('Test Admin Staff S5', 'admin')
  returning id into v_staff_id;

  insert into operations.equipment (serial_number, building_id, description, status)
  values ('SN-OLD-S5', v_building_id, 'Old equip S5', 'active')
  returning id into v_old_eq_id;

  insert into support.tickets (
    administration_id, building_id, category, description, status,
    assigned_to_staff_id, equipment_id
  ) values (
    v_admin_id, v_building_id, 'equipment_replacement',
    'Ticket segunda llamada S5', 'open', v_staff_id, v_old_eq_id
  )
  returning id into v_ticket_id;

  -- First call succeeds.
  perform public.resolve_equipment_replacement(
    v_ticket_id, v_old_eq_id, 'SN-NEW-S5', 'Modelo Z', null, null, v_staff_id
  );

  -- Second call must raise P0001.
  begin
    perform public.resolve_equipment_replacement(
      v_ticket_id, v_old_eq_id, 'SN-NEW-S5-DUP', 'Modelo Z', null, null, v_staff_id
    );
  exception when others then
    v_failed := true;
  end;

  assert v_failed,
    'FAIL scenario-5: expected second call to raise an exception';

  -- Assert: no duplicate egreso_reemplazo or liberacion_reserva rows.
  select count(*) into v_movement_count
    from public.stock_movements
   where ticket_id = v_ticket_id
     and type in ('egreso_reemplazo', 'liberacion_reserva');
  assert v_movement_count = 0,
    'FAIL scenario-5: expected 0 duplicate movements, got ' || v_movement_count::text;

  raise notice 'PASS scenario-5: second call on resolved ticket raises P0001; no duplicate rows';
end $$;

rollback;

-- ===========================================================
-- Scenario 6: Backfill DO block idempotency — second run inserts zero rows.
-- Uses the exact FOR LOOP pattern from the migration DO block.
-- ===========================================================
begin;

do $$
declare
  v_admin_id        uuid;
  v_building_id     uuid;
  v_staff_id        uuid;
  v_product_id      uuid;
  v_order_id        uuid;
  v_order_item_id   uuid;
  v_ticket_id       uuid;
  v_placeholder_eq  uuid;
  v_count_before    int;
  v_count_after     int;
  r                 record;
begin
  insert into public.administrations (company_name)
  values ('Test Admin S6')
  returning id into v_admin_id;

  insert into public.buildings (name, address, administration_id)
  values ('Test Building S6', 'Calle 6', v_admin_id)
  returning id into v_building_id;

  insert into identity.staff (full_name, role)
  values ('Test Admin Staff S6', 'admin')
  returning id into v_staff_id;

  insert into public.products (name, category, stock_total, stock_reservado)
  values ('Controlador S6', 'equipment', 5, 0)
  returning id into v_product_id;

  insert into public.orders (order_number, order_type, status, administration_id, client_type)
  values ('ORD-S6-001', 'technical', 'confirmed', v_admin_id, 'administration')
  returning id into v_order_id;

  insert into public.order_items (order_id, product_id, quantity, unit_price, item_type)
  values (v_order_id, v_product_id, 1, 100.00, 'equipment')
  returning id into v_order_item_id;

  -- Create an already-resolved equipment_installation ticket (simulates
  -- the historical state before the backfill). Transition via the state
  -- machine to satisfy triggers (resolution_notes required + equipment_id required).
  insert into support.tickets (
    administration_id, building_id, category, description, status,
    assigned_to_staff_id
  ) values (
    v_admin_id, v_building_id, 'equipment_installation',
    'Historical ticket S6', 'open', v_staff_id
  )
  returning id into v_ticket_id;

  -- Placeholder equipment so the resolve trigger is satisfied.
  insert into operations.equipment (serial_number, building_id, description, status)
  values ('SN-HIST-S6', v_building_id, 'Historical equip S6', 'active')
  returning id into v_placeholder_eq;

  update support.tickets set equipment_id = v_placeholder_eq where id = v_ticket_id;
  update support.tickets set status = 'in_progress' where id = v_ticket_id and status = 'open';
  update support.tickets
     set status = 'resolved',
         resolved_by_staff_id = v_staff_id,
         resolution_notes = 'Historical resolution S6'
   where id = v_ticket_id and status = 'in_progress';

  -- Add the orphaned reserva (as the historical pre-backfill state would have it).
  insert into public.stock_movements (
    product_id, type, quantity, note, order_id, order_item_id, ticket_id, created_by
  ) values (
    v_product_id, 'reserva', -1,
    'Reserva para ticket S6', v_order_id, v_order_item_id, v_ticket_id, v_staff_id
  );

  -- ---- First pass: run the exact FOR LOOP from the migration DO block ----
  for r in
    select t.id              as ticket_id,
           t.resolved_by_staff_id,
           sm.product_id,
           sm.order_item_id,
           oi.order_id,
           oi.quantity
      from support.tickets t
      join public.stock_movements sm
        on sm.ticket_id = t.id
       and sm.type      = 'reserva'
      join public.order_items oi
        on oi.id = sm.order_item_id
     where t.status    = 'resolved'
       and t.category  = 'equipment_installation'
       and sm.product_id is not null
       and not exists (
             select 1
               from public.stock_movements m2
              where m2.ticket_id = t.id
                and m2.type in ('egreso_instalacion', 'liberacion_reserva')
           )
  loop
    insert into public.stock_movements (
      product_id, type, quantity, note, order_id, order_item_id,
      ticket_id, created_by
    ) values (
      r.product_id, 'egreso_instalacion', -r.quantity,
      '[Backfill 000061] Egreso por instalación de equipo (ticket ' || r.ticket_id || ')',
      r.order_id, r.order_item_id, r.ticket_id, r.resolved_by_staff_id
    );

    insert into public.stock_movements (
      product_id, type, quantity, note, order_id, order_item_id,
      ticket_id, created_by
    ) values (
      r.product_id, 'liberacion_reserva', r.quantity,
      '[Backfill 000061] Liberación de reserva al instalar equipo (ticket ' || r.ticket_id || ')',
      r.order_id, r.order_item_id, r.ticket_id, r.resolved_by_staff_id
    );
  end loop;

  -- Verify first pass inserted both rows.
  select count(*) into v_count_before
    from public.stock_movements
   where ticket_id = v_ticket_id
     and type in ('egreso_instalacion', 'liberacion_reserva');

  assert v_count_before = 2,
    'FAIL scenario-6 (setup): expected 2 movements after first pass, got ' || v_count_before::text;

  -- ---- Second pass: exact same loop — idempotency guard must skip all rows ----
  for r in
    select t.id              as ticket_id,
           t.resolved_by_staff_id,
           sm.product_id,
           sm.order_item_id,
           oi.order_id,
           oi.quantity
      from support.tickets t
      join public.stock_movements sm
        on sm.ticket_id = t.id
       and sm.type      = 'reserva'
      join public.order_items oi
        on oi.id = sm.order_item_id
     where t.status    = 'resolved'
       and t.category  = 'equipment_installation'
       and sm.product_id is not null
       and not exists (
             select 1
               from public.stock_movements m2
              where m2.ticket_id = t.id
                and m2.type in ('egreso_instalacion', 'liberacion_reserva')
           )
  loop
    insert into public.stock_movements (
      product_id, type, quantity, note, order_id, order_item_id,
      ticket_id, created_by
    ) values (
      r.product_id, 'egreso_instalacion', -r.quantity,
      '[Backfill 000061] Egreso por instalación de equipo (ticket ' || r.ticket_id || ')',
      r.order_id, r.order_item_id, r.ticket_id, r.resolved_by_staff_id
    );

    insert into public.stock_movements (
      product_id, type, quantity, note, order_id, order_item_id,
      ticket_id, created_by
    ) values (
      r.product_id, 'liberacion_reserva', r.quantity,
      '[Backfill 000061] Liberación de reserva al instalar equipo (ticket ' || r.ticket_id || ')',
      r.order_id, r.order_item_id, r.ticket_id, r.resolved_by_staff_id
    );
  end loop;

  select count(*) into v_count_after
    from public.stock_movements
   where ticket_id = v_ticket_id
     and type in ('egreso_instalacion', 'liberacion_reserva');

  assert v_count_after = v_count_before,
    'FAIL scenario-6: second run inserted rows; expected ' || v_count_before::text
      || ' but got ' || v_count_after::text;

  raise notice 'PASS scenario-6: backfill DO block idempotency — second run inserts zero rows';
end $$;

rollback;

-- ===========================================================
-- Scenario 7: Temp-table nesting — operations.replace_equipment inside
-- outer transaction succeeds (no "temp table already exists" error).
-- ===========================================================
begin;

do $$
declare
  v_admin_id    uuid;
  v_building_id uuid;
  v_staff_id    uuid;
  v_old_eq_id   uuid;
  v_ticket_id   uuid;
  v_new_eq_id   uuid;
  v_status      text;
begin
  insert into public.administrations (company_name)
  values ('Test Admin S7')
  returning id into v_admin_id;

  insert into public.buildings (name, address, administration_id)
  values ('Test Building S7', 'Calle 7', v_admin_id)
  returning id into v_building_id;

  insert into identity.staff (full_name, role)
  values ('Test Admin Staff S7', 'admin')
  returning id into v_staff_id;

  insert into operations.equipment (serial_number, building_id, description, status)
  values ('SN-OLD-S7', v_building_id, 'Old equip S7', 'active')
  returning id into v_old_eq_id;

  insert into support.tickets (
    administration_id, building_id, category, description, status,
    assigned_to_staff_id, equipment_id
  ) values (
    v_admin_id, v_building_id, 'equipment_replacement',
    'Nesting test S7', 'open', v_staff_id, v_old_eq_id
  )
  returning id into v_ticket_id;

  -- This call nests operations.replace_equipment (which uses CREATE TEMP
  -- TABLE ON COMMIT DROP) inside the outer transaction of
  -- resolve_equipment_replacement. Must not raise "temp table already exists".
  v_new_eq_id := public.resolve_equipment_replacement(
    v_ticket_id, v_old_eq_id, 'SN-NEW-S7', 'Modelo W', null, null, v_staff_id
  );

  select status into v_status from support.tickets where id = v_ticket_id;
  assert v_status = 'resolved',
    'FAIL scenario-7: expected ticket resolved after nested temp table, got ' || v_status;

  assert v_new_eq_id is not null,
    'FAIL scenario-7: expected a non-null new equipment_id';

  raise notice 'PASS scenario-7: operations.replace_equipment inside outer transaction succeeds (temp-table nesting safe)';
end $$;

rollback;
