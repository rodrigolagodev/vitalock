-- ============================================================
-- DB smoke test: unify-work-tracking-model
-- ============================================================
-- Validates the rewritten public.recompute_order_status (keys branch)
-- and the retired key_installation ticket category.
--
-- Implements: ordenes-admin/Order Status State Machine (key_authorizations
-- gated ready_for_pickup, migration 20260812000060).
-- Regression for: tickets/No New key_installation Tickets (b2 trigger).
--
-- Run via:
--   psql postgresql://postgres:postgres@127.0.0.1:54322/postgres \
--     -f supabase/tests-sql/test_unify_work_tracking.sql
--
-- Prerequisite: migration 20260812000060 applied.
-- Each scenario runs in its own transaction and always rolls back.
-- ============================================================


-- ============================================================
-- Scenario 1: All authorizations 'installed', all items configured
--             → recompute_order_status promotes order to ready_for_pickup
-- ============================================================
begin;

do $$
declare
  v_admin_id     uuid;
  v_building_id  uuid;
  v_unit_id      uuid;
  v_product_id   uuid;
  v_order_id     uuid;
  v_item_id      uuid;
  v_key_id       uuid;
  v_equip_id     uuid;
  v_auth_id      uuid;
  v_order_status text;
begin
  insert into public.administrations (company_name)
  values ('Test Unify S1')
  returning id into v_admin_id;

  insert into public.buildings (name, address, administration_id)
  values ('Test Building Unify S1', 'Street S1', v_admin_id)
  returning id into v_building_id;

  insert into public.units (building_id, number)
  values (v_building_id, 'S1-1')
  returning id into v_unit_id;

  insert into public.products (name, category)
  values ('Key Product Unify S1', 'rfid_key')
  returning id into v_product_id;

  insert into public.stock_movements (product_id, type, quantity, note)
  values (v_product_id, 'compra', 10, 'Fixture: unify S1 stock');

  insert into public.orders (order_type, client_type, administration_id, status)
  values ('keys', 'administration', v_admin_id, 'in_progress')
  returning id into v_order_id;

  -- Insert a key item with produced_key_id set (simulating "configured" state)
  insert into public.rfid_keys (rfid_code, unit_id)
  values ('RFID-UNIFY-S1-KEY', v_unit_id)
  returning id into v_key_id;

  insert into public.order_items (
    order_id, item_type, quantity, description, building_id,
    product_id, unit_price, unit_id, produced_key_id, status
  ) values (
    v_order_id, 'key', 1, 'Key S1', v_building_id,
    v_product_id, 50.00, v_unit_id, v_key_id, 'configured'
  )
  returning id into v_item_id;

  -- Create equipment in the same building
  insert into operations.equipment (serial_number, description, building_id)
  values ('EQ-UNIFY-S1', 'Reader S1', v_building_id)
  returning id into v_equip_id;

  -- Create authorization (starts pending_install), then mark installed
  insert into operations.key_authorizations (rfid_key_id, equipment_id)
  values (v_key_id, v_equip_id)
  returning id into v_auth_id;

  update operations.key_authorizations
     set sync_state = 'installed'
   where id = v_auth_id;

  -- Recompute: all keys configured, all authorizations installed → ready_for_pickup
  perform public.recompute_order_status(v_order_id);

  select status into v_order_status
    from public.orders where id = v_order_id;

  assert v_order_status = 'ready_for_pickup',
    'FAIL scenario-1: expected ready_for_pickup, got ' || v_order_status;

  raise notice 'PASS scenario-1: all authorizations installed, all configured → ready_for_pickup';
end $$;

rollback;


-- ============================================================
-- Scenario 2: One authorization 'pending_install'
--             → order stays in_progress
-- ============================================================
begin;

do $$
declare
  v_admin_id     uuid;
  v_building_id  uuid;
  v_unit_id      uuid;
  v_product_id   uuid;
  v_order_id     uuid;
  v_item_id      uuid;
  v_key_id       uuid;
  v_equip_id     uuid;
  v_order_status text;
begin
  insert into public.administrations (company_name)
  values ('Test Unify S2')
  returning id into v_admin_id;

  insert into public.buildings (name, address, administration_id)
  values ('Test Building Unify S2', 'Street S2', v_admin_id)
  returning id into v_building_id;

  insert into public.units (building_id, number)
  values (v_building_id, 'S2-1')
  returning id into v_unit_id;

  insert into public.products (name, category)
  values ('Key Product Unify S2', 'rfid_key')
  returning id into v_product_id;

  insert into public.stock_movements (product_id, type, quantity, note)
  values (v_product_id, 'compra', 10, 'Fixture: unify S2 stock');

  insert into public.orders (order_type, client_type, administration_id, status)
  values ('keys', 'administration', v_admin_id, 'in_progress')
  returning id into v_order_id;

  insert into public.rfid_keys (rfid_code, unit_id)
  values ('RFID-UNIFY-S2-KEY', v_unit_id)
  returning id into v_key_id;

  insert into public.order_items (
    order_id, item_type, quantity, description, building_id,
    product_id, unit_price, unit_id, produced_key_id, status
  ) values (
    v_order_id, 'key', 1, 'Key S2', v_building_id,
    v_product_id, 50.00, v_unit_id, v_key_id, 'configured'
  )
  returning id into v_item_id;

  insert into operations.equipment (serial_number, description, building_id)
  values ('EQ-UNIFY-S2', 'Reader S2', v_building_id)
  returning id into v_equip_id;

  -- Authorization stays in pending_install (the default after INSERT)
  insert into operations.key_authorizations (rfid_key_id, equipment_id)
  values (v_key_id, v_equip_id);

  -- Recompute: one pending_install → must stay in_progress
  perform public.recompute_order_status(v_order_id);

  select status into v_order_status
    from public.orders where id = v_order_id;

  assert v_order_status = 'in_progress',
    'FAIL scenario-2: expected in_progress (pending_install blocks), got ' || v_order_status;

  raise notice 'PASS scenario-2: pending_install authorization blocks ready_for_pickup';
end $$;

rollback;


-- ============================================================
-- Scenario 3: One authorization 'pending_removal' on an otherwise-
--             ready order → order promotes to ready_for_pickup
--             (pending_removal is NOT a blocker)
-- ============================================================
begin;

do $$
declare
  v_admin_id     uuid;
  v_building_id  uuid;
  v_unit_id      uuid;
  v_product_id   uuid;
  v_order_id     uuid;
  v_item_id      uuid;
  v_key_id       uuid;
  v_equip_id     uuid;
  v_auth_id      uuid;
  v_order_status text;
begin
  insert into public.administrations (company_name)
  values ('Test Unify S3')
  returning id into v_admin_id;

  insert into public.buildings (name, address, administration_id)
  values ('Test Building Unify S3', 'Street S3', v_admin_id)
  returning id into v_building_id;

  insert into public.units (building_id, number)
  values (v_building_id, 'S3-1')
  returning id into v_unit_id;

  insert into public.products (name, category)
  values ('Key Product Unify S3', 'rfid_key')
  returning id into v_product_id;

  insert into public.stock_movements (product_id, type, quantity, note)
  values (v_product_id, 'compra', 10, 'Fixture: unify S3 stock');

  insert into public.orders (order_type, client_type, administration_id, status)
  values ('keys', 'administration', v_admin_id, 'in_progress')
  returning id into v_order_id;

  insert into public.rfid_keys (rfid_code, unit_id)
  values ('RFID-UNIFY-S3-KEY', v_unit_id)
  returning id into v_key_id;

  insert into public.order_items (
    order_id, item_type, quantity, description, building_id,
    product_id, unit_price, unit_id, produced_key_id, status
  ) values (
    v_order_id, 'key', 1, 'Key S3', v_building_id,
    v_product_id, 50.00, v_unit_id, v_key_id, 'configured'
  )
  returning id into v_item_id;

  insert into operations.equipment (serial_number, description, building_id)
  values ('EQ-UNIFY-S3', 'Reader S3', v_building_id)
  returning id into v_equip_id;

  -- Authorization: pending_install → installed → pending_removal
  insert into operations.key_authorizations (rfid_key_id, equipment_id)
  values (v_key_id, v_equip_id)
  returning id into v_auth_id;

  update operations.key_authorizations
     set sync_state = 'installed'
   where id = v_auth_id;

  update operations.key_authorizations
     set sync_state = 'pending_removal'
   where id = v_auth_id;

  -- Recompute: pending_removal does NOT block → should promote to ready_for_pickup
  perform public.recompute_order_status(v_order_id);

  select status into v_order_status
    from public.orders where id = v_order_id;

  assert v_order_status = 'ready_for_pickup',
    'FAIL scenario-3: expected ready_for_pickup (pending_removal not a blocker), got ' || v_order_status;

  raise notice 'PASS scenario-3: pending_removal authorization does not block ready_for_pickup';
end $$;

rollback;


-- ============================================================
-- Scenario 4: One item with produced_key_id IS NULL
--             → order stays in_progress (unconfigured item blocks)
-- ============================================================
begin;

do $$
declare
  v_admin_id     uuid;
  v_building_id  uuid;
  v_unit_id      uuid;
  v_product_id   uuid;
  v_order_id     uuid;
  v_item_id      uuid;
  v_order_status text;
begin
  insert into public.administrations (company_name)
  values ('Test Unify S4')
  returning id into v_admin_id;

  insert into public.buildings (name, address, administration_id)
  values ('Test Building Unify S4', 'Street S4', v_admin_id)
  returning id into v_building_id;

  insert into public.units (building_id, number)
  values (v_building_id, 'S4-1')
  returning id into v_unit_id;

  insert into public.products (name, category)
  values ('Key Product Unify S4', 'rfid_key')
  returning id into v_product_id;

  insert into public.stock_movements (product_id, type, quantity, note)
  values (v_product_id, 'compra', 10, 'Fixture: unify S4 stock');

  insert into public.orders (order_type, client_type, administration_id, status)
  values ('keys', 'administration', v_admin_id, 'in_progress')
  returning id into v_order_id;

  -- Item has produced_key_id IS NULL (no key assigned yet)
  insert into public.order_items (
    order_id, item_type, quantity, description, building_id,
    product_id, unit_price, unit_id
  ) values (
    v_order_id, 'key', 1, 'Key S4 (unconfigured)', v_building_id,
    v_product_id, 50.00, v_unit_id
  )
  returning id into v_item_id;

  -- Recompute: produced_key_id IS NULL → v_configured < v_total_key_items → stays in_progress
  perform public.recompute_order_status(v_order_id);

  select status into v_order_status
    from public.orders where id = v_order_id;

  assert v_order_status = 'in_progress',
    'FAIL scenario-4: expected in_progress (NULL produced_key_id blocks), got ' || v_order_status;

  raise notice 'PASS scenario-4: item with produced_key_id IS NULL blocks ready_for_pickup';
end $$;

rollback;


-- ============================================================
-- Scenario 5: Resolve a 'key_configuration' ticket
--             → no new support.tickets row created (chain trigger no-op)
-- ============================================================
begin;

do $$
declare
  v_admin_id      uuid;
  v_building_id   uuid;
  v_staff_id      uuid;
  v_ticket_id     uuid;
  v_ticket_count  int;
  v_ticket_status text;
begin
  insert into public.administrations (company_name)
  values ('Test Unify S5')
  returning id into v_admin_id;

  insert into public.buildings (name, address, administration_id)
  values ('Test Building Unify S5', 'Street S5', v_admin_id)
  returning id into v_building_id;

  insert into identity.staff (full_name, role)
  values ('Test Staff Unify S5', 'admin')
  returning id into v_staff_id;

  -- Create a key_configuration ticket
  insert into support.tickets (
    administration_id, building_id, category, description, status,
    assigned_to_staff_id
  ) values (
    v_admin_id, v_building_id, 'key_configuration',
    'Configurar llave S5', 'open', v_staff_id
  )
  returning id into v_ticket_id;

  -- Resolve via the state machine (open → in_progress → resolved)
  update support.tickets
     set status = 'in_progress'
   where id = v_ticket_id;

  update support.tickets
     set status           = 'resolved',
         resolution_notes = 'Configurada para test S5'
   where id = v_ticket_id;

  select status into v_ticket_status
    from support.tickets where id = v_ticket_id;

  assert v_ticket_status = 'resolved',
    'FAIL scenario-5: ticket should be resolved, got ' || v_ticket_status;

  -- Chain trigger must NOT have spawned a follow-up ticket
  select count(*) into v_ticket_count
    from support.tickets
   where administration_id = v_admin_id
     and category = 'key_installation';

  assert v_ticket_count = 0,
    'FAIL scenario-5: expected 0 key_installation tickets after resolve, got ' || v_ticket_count;

  raise notice 'PASS scenario-5: resolving key_configuration spawns no follow-up ticket';
end $$;

rollback;


-- ============================================================
-- Scenario 6: Order at ready_for_pickup; authorization flips to
--             pending_install (new auth on second equipment)
--             → recompute_order_status demotes order to in_progress
-- ============================================================
begin;

do $$
declare
  v_admin_id     uuid;
  v_building_id  uuid;
  v_unit_id      uuid;
  v_product_id   uuid;
  v_order_id     uuid;
  v_item_id      uuid;
  v_key_id       uuid;
  v_equip_1_id   uuid;
  v_equip_2_id   uuid;
  v_auth_id      uuid;
  v_order_status text;
begin
  insert into public.administrations (company_name)
  values ('Test Unify S6')
  returning id into v_admin_id;

  insert into public.buildings (name, address, administration_id)
  values ('Test Building Unify S6', 'Street S6', v_admin_id)
  returning id into v_building_id;

  insert into public.units (building_id, number)
  values (v_building_id, 'S6-1')
  returning id into v_unit_id;

  insert into public.products (name, category)
  values ('Key Product Unify S6', 'rfid_key')
  returning id into v_product_id;

  insert into public.stock_movements (product_id, type, quantity, note)
  values (v_product_id, 'compra', 10, 'Fixture: unify S6 stock');

  insert into public.orders (order_type, client_type, administration_id, status)
  values ('keys', 'administration', v_admin_id, 'in_progress')
  returning id into v_order_id;

  insert into public.rfid_keys (rfid_code, unit_id)
  values ('RFID-UNIFY-S6-KEY', v_unit_id)
  returning id into v_key_id;

  insert into public.order_items (
    order_id, item_type, quantity, description, building_id,
    product_id, unit_price, unit_id, produced_key_id, status
  ) values (
    v_order_id, 'key', 1, 'Key S6', v_building_id,
    v_product_id, 50.00, v_unit_id, v_key_id, 'configured'
  )
  returning id into v_item_id;

  insert into operations.equipment (serial_number, description, building_id)
  values ('EQ-UNIFY-S6-A', 'Reader S6 A', v_building_id)
  returning id into v_equip_1_id;

  insert into operations.equipment (serial_number, description, building_id)
  values ('EQ-UNIFY-S6-B', 'Reader S6 B', v_building_id)
  returning id into v_equip_2_id;

  -- Authorization on equip 1: pending_install → installed
  insert into operations.key_authorizations (rfid_key_id, equipment_id)
  values (v_key_id, v_equip_1_id)
  returning id into v_auth_id;

  update operations.key_authorizations
     set sync_state = 'installed'
   where id = v_auth_id;

  -- Recompute: all installed → should promote to ready_for_pickup
  perform public.recompute_order_status(v_order_id);

  select status into v_order_status
    from public.orders where id = v_order_id;

  assert v_order_status = 'ready_for_pickup',
    'FAIL scenario-6 (setup): expected ready_for_pickup before new auth, got ' || v_order_status;

  -- Now add a second authorization (new equipment) → starts pending_install
  insert into operations.key_authorizations (rfid_key_id, equipment_id)
  values (v_key_id, v_equip_2_id);

  -- Recompute: one pending_install now exists → must demote to in_progress
  perform public.recompute_order_status(v_order_id);

  select status into v_order_status
    from public.orders where id = v_order_id;

  assert v_order_status = 'in_progress',
    'FAIL scenario-6: expected demotion to in_progress after new pending_install, got ' || v_order_status;

  raise notice 'PASS scenario-6: new pending_install authorization demotes ready_for_pickup to in_progress';
end $$;

rollback;
