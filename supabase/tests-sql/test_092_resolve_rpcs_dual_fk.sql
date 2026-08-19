-- ============================================================
-- TDD RED → GREEN: resolve_* RPCs dual-FK awareness
-- ============================================================
-- Tests that resolve_equipment_installation, resolve_equipment_replacement,
-- and resolve_equipment_update all correctly follow the technical_order_item_id
-- path when tickets are linked via the dual-FK schema (PR-3, migration 092).
--
-- RED guard: these tests are written BEFORE migration 092 is applied.
--   - resolve_equipment_installation / resolve_equipment_replacement will fail
--     because they JOIN public.order_items which doesn't contain technical_order_items IDs.
--   - resolve_equipment_update will not call recompute_key_order_status for
--     keys minted via key_order_items (rfid_keys.order_item_id = NULL).
--
-- Run via: psql -f supabase/tests-sql/test_092_resolve_rpcs_dual_fk.sql
-- Prerequisite: migrations 001–091 applied (PR-1 + PR-2 stack).
-- Each scenario runs in its own transaction and always rolls back.
-- ============================================================

-- ============================================================
-- Scenario A (RED): resolve_equipment_installation on a ticket linked
-- via technical_order_item_id correctly emits egreso_instalacion and
-- liberacion_reserva stock movements.
-- ============================================================
-- Before fix: the stock lookup JOINs public.order_items, which has no row
-- with id = technical_order_item_id, so product_id is NULL and no stock
-- movements are emitted even when they should be.
-- After fix: the lookup branches to technical_order_items and emits the
-- correct stock movements.
-- ============================================================
begin;
do $$
declare
  v_admin_id              uuid;
  v_building_id           uuid;
  v_staff_id              uuid;
  v_product_id            uuid;
  v_technical_order_id    uuid;
  v_technical_item_id     uuid;
  v_ticket_id             uuid;
  v_equipment_id          uuid;
  v_egreso_count          int;
  v_liberacion_count      int;
begin
  insert into public.administrations (company_name)
    values ('Test 092-A Admin') returning id into v_admin_id;
  insert into public.buildings (name, address, administration_id)
    values ('Test 092-A Building', 'Calle 1', v_admin_id) returning id into v_building_id;
  insert into identity.staff (full_name, role)
    values ('Test 092-A Staff', 'admin') returning id into v_staff_id;
  insert into public.products (name, category, stock_total, stock_reservado)
    values ('Test 092-A Product', 'equipment', 10, 0) returning id into v_product_id;

  -- Create a technical order (confirmed) with an installation item.
  insert into public.technical_orders (
    order_number, status, administration_id, client_type
  ) values (
    'ORD-TEC-092-A', 'confirmed', v_admin_id, 'administration'
  ) returning id into v_technical_order_id;

  insert into public.technical_order_items (
    order_id, item_type, description, unit_price, product_id,
    status, quantity, building_id
  ) values (
    v_technical_order_id, 'installation', 'Instalación test 092-A', 100.00,
    v_product_id, 'pending', 1, v_building_id
  ) returning id into v_technical_item_id;

  -- Simulate the stock reservation that confirm_technical_order would create.
  insert into public.stock_movements (
    product_id, type, quantity, note,
    order_id, order_item_id, order_kind
  ) values (
    v_product_id, 'reserva', -1, 'Reserva test 092-A',
    v_technical_order_id, v_technical_item_id, 'technical'
  );

  -- Create a ticket linked via technical_order_item_id (dual-FK path).
  insert into support.tickets (
    administration_id, building_id, category, description, status,
    assigned_to_staff_id, technical_order_item_id
  ) values (
    v_admin_id, v_building_id, 'equipment_installation', 'Instalar equipo 092-A',
    'open', v_staff_id, v_technical_item_id
  ) returning id into v_ticket_id;

  -- Resolve the ticket.
  perform public.resolve_equipment_installation(
    v_ticket_id, 'SN-092-A', null, 'Instalado OK', v_staff_id
  );

  -- Verify equipment was created and linked.
  select equipment_id into v_equipment_id
    from support.tickets where id = v_ticket_id;
  assert v_equipment_id is not null,
    'FAIL 092-A: equipment_id not set on ticket after resolution';

  -- Verify stock movements were emitted (the key assertion for the dual-FK path).
  select count(*) into v_egreso_count
    from public.stock_movements
   where order_item_id = v_technical_item_id
     and type = 'egreso_instalacion';
  assert v_egreso_count = 1,
    'FAIL 092-A: expected 1 egreso_instalacion, got ' || v_egreso_count::text;

  select count(*) into v_liberacion_count
    from public.stock_movements
   where order_item_id = v_technical_item_id
     and type = 'liberacion_reserva';
  assert v_liberacion_count = 1,
    'FAIL 092-A: expected 1 liberacion_reserva, got ' || v_liberacion_count::text;

  -- Verify ticket is resolved.
  declare
    v_status text;
  begin
    select status into v_status from support.tickets where id = v_ticket_id;
    assert v_status = 'resolved',
      'FAIL 092-A: expected ticket resolved, got ' || coalesce(v_status, 'NULL');
  end;

  raise notice 'PASS 092-A: resolve_equipment_installation correctly uses technical_order_item path';
end $$;
rollback;

-- ============================================================
-- Scenario B (RED): resolve_equipment_replacement on a ticket linked
-- via technical_order_item_id correctly emits egreso_reemplazo and
-- liberacion_reserva stock movements.
-- ============================================================
begin;
do $$
declare
  v_admin_id              uuid;
  v_building_id           uuid;
  v_staff_id              uuid;
  v_product_id            uuid;
  v_technical_order_id    uuid;
  v_technical_item_id     uuid;
  v_old_equipment_id      uuid;
  v_ticket_id             uuid;
  v_new_equipment_id      uuid;
  v_egreso_count          int;
  v_liberacion_count      int;
begin
  insert into public.administrations (company_name)
    values ('Test 092-B Admin') returning id into v_admin_id;
  insert into public.buildings (name, address, administration_id)
    values ('Test 092-B Building', 'Calle 2', v_admin_id) returning id into v_building_id;
  insert into identity.staff (full_name, role)
    values ('Test 092-B Staff', 'admin') returning id into v_staff_id;
  insert into public.products (name, category, stock_total, stock_reservado)
    values ('Test 092-B Product', 'equipment', 10, 0) returning id into v_product_id;

  -- Create an existing equipment to be replaced.
  insert into operations.equipment (
    serial_number, building_id, description, status
  ) values (
    'OLD-SN-092-B', v_building_id, 'Equipo viejo 092-B', 'active'
  ) returning id into v_old_equipment_id;

  -- Create a technical order with a replacement item.
  insert into public.technical_orders (
    order_number, status, administration_id, client_type
  ) values (
    'ORD-TEC-092-B', 'confirmed', v_admin_id, 'administration'
  ) returning id into v_technical_order_id;

  insert into public.technical_order_items (
    order_id, item_type, description, unit_price, product_id,
    intended_equipment_id, status, quantity, building_id
  ) values (
    v_technical_order_id, 'equipment_replacement', 'Reemplazo test 092-B', 200.00,
    v_product_id, v_old_equipment_id, 'pending', 1, v_building_id
  ) returning id into v_technical_item_id;

  -- Simulate stock reservation.
  insert into public.stock_movements (
    product_id, type, quantity, note,
    order_id, order_item_id, order_kind
  ) values (
    v_product_id, 'reserva', -1, 'Reserva test 092-B',
    v_technical_order_id, v_technical_item_id, 'technical'
  );

  -- Create ticket linked via technical_order_item_id.
  insert into support.tickets (
    administration_id, building_id, category, description, status,
    assigned_to_staff_id, technical_order_item_id,
    equipment_id
  ) values (
    v_admin_id, v_building_id, 'equipment_replacement', 'Reemplazar equipo 092-B',
    'open', v_staff_id, v_technical_item_id,
    v_old_equipment_id
  ) returning id into v_ticket_id;

  -- Resolve the replacement.
  select public.resolve_equipment_replacement(
    v_ticket_id, v_old_equipment_id, 'NEW-SN-092-B', 'Modelo 092-B',
    'Reemplazo de prueba', 'Reemplazado OK', v_staff_id
  ) into v_new_equipment_id;

  assert v_new_equipment_id is not null,
    'FAIL 092-B: expected new equipment_id from resolve_equipment_replacement';

  -- Verify stock movements were emitted.
  select count(*) into v_egreso_count
    from public.stock_movements
   where order_item_id = v_technical_item_id
     and type = 'egreso_reemplazo';
  assert v_egreso_count = 1,
    'FAIL 092-B: expected 1 egreso_reemplazo, got ' || v_egreso_count::text;

  select count(*) into v_liberacion_count
    from public.stock_movements
   where order_item_id = v_technical_item_id
     and type = 'liberacion_reserva';
  assert v_liberacion_count = 1,
    'FAIL 092-B: expected 1 liberacion_reserva, got ' || v_liberacion_count::text;

  -- Ticket must be resolved.
  declare
    v_status text;
  begin
    select status into v_status from support.tickets where id = v_ticket_id;
    assert v_status = 'resolved',
      'FAIL 092-B: expected ticket resolved, got ' || coalesce(v_status, 'NULL');
  end;

  raise notice 'PASS 092-B: resolve_equipment_replacement correctly uses technical_order_item path';
end $$;
rollback;

-- ============================================================
-- Scenario C: resolve_equipment_update with new-path key (rfid_keys.order_item_id = NULL)
-- completes without error and correctly activates the key.
-- ============================================================
-- The legacy path uses rfid_keys.order_item_id → order_items → recompute_order_status.
-- New-path keys have rfid_keys.order_item_id = NULL. After migration 092, the
-- resolve_equipment_update code skips the legacy recompute path (order_item_id is NULL)
-- and the key activation still succeeds. The key_order status was already advanced
-- by the configure_key_order_item trigger (key_order_items_recompute_order_status_trigger),
-- so no additional recompute by resolve_equipment_update is needed.
-- ============================================================
begin;
do $$
declare
  v_admin_id           uuid;
  v_building_id        uuid;
  v_unit_id            uuid;
  v_staff_id           uuid;
  v_product_id         uuid;
  v_equipment_id       uuid;
  v_key_order_id       uuid;
  v_key_order_item_id  uuid;
  v_key_id             uuid;
  v_task_id            uuid;
  v_result             jsonb;
  v_key_status         text;
  v_order_status       text;
begin
  insert into public.administrations (company_name)
    values ('Test 092-C Admin') returning id into v_admin_id;
  insert into public.buildings (name, address, administration_id)
    values ('Test 092-C Building', 'Calle 3', v_admin_id) returning id into v_building_id;
  insert into public.units (number, building_id)
    values ('3A', v_building_id) returning id into v_unit_id;
  insert into identity.staff (full_name, role)
    values ('Test 092-C Staff', 'admin') returning id into v_staff_id;
  insert into public.products (name, category, stock_total, stock_reservado)
    values ('Test 092-C Product', 'rfid_key', 10, 0) returning id into v_product_id;
  insert into operations.equipment (serial_number, building_id, description, status)
    values ('SN-092-C', v_building_id, 'Equip 092-C', 'active') returning id into v_equipment_id;

  -- Create a key order with one item (confirmed, awaiting key configuration).
  insert into public.key_orders (
    order_number, status, administration_id, client_type
  ) values (
    'ORD-LLV-092-C', 'confirmed', v_admin_id, 'administration'
  ) returning id into v_key_order_id;

  insert into public.key_order_items (
    order_id, item_type, description, unit_price, product_id,
    status, quantity, building_id
  ) values (
    v_key_order_id, 'key', 'Llave test 092-C', 50.00, v_product_id,
    'pending', 1, v_building_id
  ) returning id into v_key_order_item_id;

  -- Reserve stock for the key item.
  insert into public.stock_movements (
    product_id, type, quantity, note,
    order_id, order_item_id, order_kind
  ) values (
    v_product_id, 'reserva', -1, 'Reserva test 092-C',
    v_key_order_id, v_key_order_item_id, 'key'
  );

  -- Configure the key via the new path (rfid_keys.order_item_id stays NULL).
  v_key_id := public.configure_key_order_item(
    v_key_order_item_id, 'T092-C-KEY1', v_unit_id, array[v_equipment_id]
  );

  -- Verify the key is pending_installation and rfid_keys.order_item_id IS NULL
  -- (confirming this is the new path, not the legacy path).
  declare
    v_key_oi uuid;
  begin
    select order_item_id, status into v_key_oi, v_key_status
      from public.rfid_keys where id = v_key_id;
    assert v_key_oi is null,
      'FAIL 092-C precondition: expected rfid_keys.order_item_id = NULL for new-path key';
    assert v_key_status = 'pending_installation',
      'FAIL 092-C precondition: expected pending_installation, got ' || coalesce(v_key_status, 'NULL');
  end;

  -- At this point, the key_order should already have advanced (configure_key_order_item
  -- updates key_order_items.status = 'configured', which triggers recompute_key_order_status).
  select status into v_order_status from public.key_orders where id = v_key_order_id;
  assert v_order_status = 'ready_for_pickup',
    'FAIL 092-C precondition: expected key_order in ready_for_pickup after configure, got ' || coalesce(v_order_status, 'NULL');

  -- Create an equipment_update task including this key.
  select public.create_equipment_update(
    v_equipment_id, v_admin_id, v_building_id,
    'Update 092-C', 'path/092c.mdb',
    array[v_key_id],
    '{}',
    v_staff_id
  ) into v_task_id;

  -- Resolve the equipment update. Must succeed even though rfid_keys.order_item_id is NULL.
  select public.resolve_equipment_update(v_task_id, v_staff_id) into v_result;

  assert v_result is not null,
    'FAIL 092-C: resolve_equipment_update returned NULL for new-path key';
  assert jsonb_typeof(v_result) = 'object',
    'FAIL 092-C: expected jsonb result, got ' || jsonb_typeof(v_result);

  -- Key must now be active.
  select status into v_key_status from public.rfid_keys where id = v_key_id;
  assert v_key_status = 'active',
    'FAIL 092-C: expected key active after resolve, got ' || coalesce(v_key_status, 'NULL');

  -- skipped_key_ids must be empty (the key processed normally).
  assert jsonb_array_length(v_result->'skipped_key_ids') = 0,
    'FAIL 092-C: expected 0 skipped keys for new-path activation';

  raise notice 'PASS 092-C: resolve_equipment_update works correctly for new-path keys (rfid_keys.order_item_id = NULL)';
end $$;
rollback;

-- ============================================================
-- Scenario D: resolve_ticket with technical_order_item_id — no change needed
-- (regression guard: resolve_ticket does not reference order_items)
-- ============================================================
begin;
do $$
declare
  v_admin_id              uuid;
  v_building_id           uuid;
  v_staff_id              uuid;
  v_technical_order_id    uuid;
  v_technical_item_id     uuid;
  v_ticket_id             uuid;
  v_status                text;
begin
  insert into public.administrations (company_name)
    values ('Test 092-D Admin') returning id into v_admin_id;
  insert into public.buildings (name, address, administration_id)
    values ('Test 092-D Building', 'Calle 4', v_admin_id) returning id into v_building_id;
  insert into identity.staff (full_name, role)
    values ('Test 092-D Staff', 'admin') returning id into v_staff_id;

  insert into public.technical_orders (
    order_number, status, administration_id, client_type
  ) values (
    'ORD-TEC-092-D', 'confirmed', v_admin_id, 'administration'
  ) returning id into v_technical_order_id;

  insert into public.technical_order_items (
    order_id, item_type, description, unit_price,
    status, quantity, building_id
  ) values (
    v_technical_order_id, 'maintenance', 'Mant 092-D', 80.00,
    'pending', 1, v_building_id
  ) returning id into v_technical_item_id;

  -- key_configuration does not require equipment on resolve; use it for this test.
  insert into support.tickets (
    administration_id, building_id, category, description, status,
    assigned_to_staff_id, technical_order_item_id
  ) values (
    v_admin_id, v_building_id, 'key_configuration', 'Ticket 092-D',
    'open', v_staff_id, v_technical_item_id
  ) returning id into v_ticket_id;

  perform public.resolve_ticket(v_ticket_id, 'Resuelto 092-D', v_staff_id);

  select status into v_status from support.tickets where id = v_ticket_id;
  assert v_status = 'resolved',
    'FAIL 092-D: expected resolved, got ' || coalesce(v_status, 'NULL');

  raise notice 'PASS 092-D: resolve_ticket works unchanged for technical_order_item_id tickets';
end $$;
rollback;

-- ============================================================
-- Scenario E: resolve_equipment_installation with NO order link
-- (ticket has no technical_order_item_id and no reserva) — backward compat
-- ============================================================
begin;
do $$
declare
  v_admin_id     uuid;
  v_building_id  uuid;
  v_staff_id     uuid;
  v_ticket_id    uuid;
  v_equipment_id uuid;
  v_status       text;
begin
  insert into public.administrations (company_name)
    values ('Test 092-E Admin') returning id into v_admin_id;
  insert into public.buildings (name, address, administration_id)
    values ('Test 092-E Building', 'Calle 5', v_admin_id) returning id into v_building_id;
  insert into identity.staff (full_name, role)
    values ('Test 092-E Staff', 'admin') returning id into v_staff_id;

  -- Ticket with NO order link at all (freestanding installation ticket).
  insert into support.tickets (
    administration_id, building_id, category, description, status,
    assigned_to_staff_id
  ) values (
    v_admin_id, v_building_id, 'equipment_installation', 'Install freestanding 092-E',
    'open', v_staff_id
  ) returning id into v_ticket_id;

  -- Should succeed without emitting stock movements.
  select public.resolve_equipment_installation(
    v_ticket_id, 'SN-FREE-092-E', null, 'Sin orden', v_staff_id
  ) into v_equipment_id;

  assert v_equipment_id is not null,
    'FAIL 092-E: expected equipment_id, got NULL';

  select status into v_status from support.tickets where id = v_ticket_id;
  assert v_status = 'resolved',
    'FAIL 092-E: expected resolved, got ' || coalesce(v_status, 'NULL');

  raise notice 'PASS 092-E: resolve_equipment_installation with no order link still works';
end $$;
rollback;
