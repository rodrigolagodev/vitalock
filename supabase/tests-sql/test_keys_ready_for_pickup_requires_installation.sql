-- ============================================================
-- DB smoke test: keys order lifecycle — ready_for_pickup requires
-- installation done
-- ============================================================
--
-- SUPERSEDED by migration 20260812000060 (unify-work-tracking-model):
-- scenarios (a) and (e) below assert the OLD ticket-gated readiness
-- model and will FAIL against any DB that has 000060 applied — they
-- resolve the `key_installation` ticket and expect promotion, but that
-- ticket category no longer participates in readiness (readiness now
-- derives from `operations.key_authorizations`). Kept as historical
-- documentation of the pre-refactor model. Live coverage of the new
-- model lives in `supabase/tests-sql/test_unify_work_tracking.sql`.
-- ============================================================
--
-- Implements: ordenes-admin/Order Status State Machine (installation
-- gated ready_for_pickup, migration 20260811000057)
--
-- Run via: psql -f supabase/tests-sql/test_keys_ready_for_pickup_requires_installation.sql
--
-- Prerequisite: migration 20260811000057 applied.
-- Each scenario runs in its own transaction and always rolls back to avoid
-- polluting the database. Run against a local Supabase instance:
--   supabase db reset && psql postgresql://postgres:postgres@127.0.0.1:54322/postgres \
--     -f supabase/tests-sql/test_keys_ready_for_pickup_requires_installation.sql
-- ============================================================

-- ===========================================================
-- Scenario (a): happy path — all configured + install pending keeps
-- in_progress; resolving the install task promotes to ready_for_pickup
-- ===========================================================
begin;

do $$
declare
  v_admin_id       uuid;
  v_building_id    uuid;
  v_unit_id        uuid;
  v_product_id     uuid;
  v_order_id       uuid;
  v_item_id        uuid;
  v_order_status   text;
  v_install_ticket uuid;
  v_install_count  int;
begin
  -- Fixtures
  insert into public.administrations (company_name)
  values ('Test Admin InstallGate')
  returning id into v_admin_id;

  insert into public.buildings (name, address, administration_id)
  values ('Test Building InstallGate', 'Street 7', v_admin_id)
  returning id into v_building_id;

  insert into public.units (building_id, number)
  values (v_building_id, 'A-1')
  returning id into v_unit_id;

  insert into public.products (name, category)
  values ('Key Product InstallGate', 'rfid_key')
  returning id into v_product_id;

  insert into public.stock_movements (product_id, type, quantity, note)
  values (v_product_id, 'compra', 10, 'Fixture: seed stock for install-gate test');

  insert into public.orders (
    order_type, client_type, administration_id, status
  ) values (
    'keys', 'administration', v_admin_id, 'draft'
  )
  returning id into v_order_id;

  insert into public.order_items (
    order_id, item_type, quantity, description, building_id,
    product_id, unit_price, unit_id
  ) values (
    v_order_id, 'key', 1, 'Key item install-gate', v_building_id,
    v_product_id, 50.00, v_unit_id
  )
  returning id into v_item_id;

  -- Confirm: order -> confirmed, key_configuration ticket + reserva created.
  perform public.confirm_order(v_order_id);

  -- Configure the key: item -> configured, key_configuration resolved,
  -- key_installation ticket spawned.
  perform public.configure_key_order_item(
    v_item_id, 'RFID-INSTALLGATE-01', v_unit_id, '{}'::uuid[]
  );

  -- Assert: order is NOT ready_for_pickup while installation is pending.
  select status into v_order_status
    from public.orders where id = v_order_id;

  assert v_order_status = 'in_progress',
    'FAIL scenario-a: expected in_progress after all keys configured with install pending, got ' || v_order_status;

  -- Assert: the key_installation ticket exists and is linked to the item.
  select count(*) into v_install_count
    from support.tickets
   where order_item_id = v_item_id
     and category = 'key_installation';

  assert v_install_count = 1,
    'FAIL scenario-a: expected 1 key_installation ticket linked to the item, got ' || v_install_count;

  select id into v_install_ticket
    from support.tickets
   where order_item_id = v_item_id
     and category = 'key_installation'
   limit 1;

  -- Installer resolves the install task (open -> in_progress -> resolved).
  update support.tickets
     set status = 'in_progress'
   where id = v_install_ticket
     and status = 'open';

  update support.tickets
     set status = 'resolved',
         resolution_notes = 'Instalada en el lector'
   where id = v_install_ticket
     and status = 'in_progress';

  -- Assert: order promoted to ready_for_pickup after install resolved.
  select status into v_order_status
    from public.orders where id = v_order_id;

  assert v_order_status = 'ready_for_pickup',
    'FAIL scenario-a: expected ready_for_pickup after install resolved, got ' || v_order_status;

  raise notice 'PASS scenario-a: configured keys stay in_progress until install task resolved, then ready_for_pickup';
end $$;

rollback;

-- ===========================================================
-- Scenario (b): partial configure — first configured promotes to
-- in_progress only (never ready_for_pickup)
-- ===========================================================
begin;

do $$
declare
  v_admin_id      uuid;
  v_building_id   uuid;
  v_unit_id       uuid;
  v_product_id    uuid;
  v_order_id      uuid;
  v_item_1        uuid;
  v_item_2        uuid;
  v_order_status  text;
begin
  insert into public.administrations (company_name)
  values ('Test Admin PartialConfig')
  returning id into v_admin_id;

  insert into public.buildings (name, address, administration_id)
  values ('Test Building PartialConfig', 'Street 8', v_admin_id)
  returning id into v_building_id;

  insert into public.units (building_id, number)
  values (v_building_id, 'B-1')
  returning id into v_unit_id;

  insert into public.products (name, category)
  values ('Key Product PartialConfig', 'rfid_key')
  returning id into v_product_id;

  insert into public.stock_movements (product_id, type, quantity, note)
  values (v_product_id, 'compra', 10, 'Fixture: seed stock for partial-config test');

  insert into public.orders (
    order_type, client_type, administration_id, status
  ) values (
    'keys', 'administration', v_admin_id, 'draft'
  )
  returning id into v_order_id;

  insert into public.order_items (
    order_id, item_type, quantity, description, building_id,
    product_id, unit_price, unit_id
  ) values (
    v_order_id, 'key', 1, 'Key 1 partial', v_building_id, v_product_id, 50.00, v_unit_id
  )
  returning id into v_item_1;

  insert into public.order_items (
    order_id, item_type, quantity, description, building_id,
    product_id, unit_price, unit_id
  ) values (
    v_order_id, 'key', 1, 'Key 2 partial', v_building_id, v_product_id, 50.00, v_unit_id
  );

  select id into v_item_2
    from public.order_items
   where order_id = v_order_id
     and id <> v_item_1
   limit 1;

  perform public.confirm_order(v_order_id);

  -- Configure only the first key.
  perform public.configure_key_order_item(
    v_item_1, 'RFID-PARTIAL-01', v_unit_id, '{}'::uuid[]
  );

  select status into v_order_status
    from public.orders where id = v_order_id;

  assert v_order_status = 'in_progress',
    'FAIL scenario-b: expected in_progress with partial config, got ' || v_order_status;

  raise notice 'PASS scenario-b: partial configure promotes confirmed -> in_progress only';
end $$;

rollback;

-- ===========================================================
-- Scenario (c): key item without product_id (no tickets at all) —
-- all configured promotes to ready_for_pickup (nothing to install)
-- ===========================================================
begin;

do $$
declare
  v_admin_id      uuid;
  v_building_id   uuid;
  v_unit_id       uuid;
  v_order_id      uuid;
  v_item_id       uuid;
  v_order_status  text;
begin
  insert into public.administrations (company_name)
  values ('Test Admin NoSku')
  returning id into v_admin_id;

  insert into public.buildings (name, address, administration_id)
  values ('Test Building NoSku', 'Street 9', v_admin_id)
  returning id into v_building_id;

  insert into public.units (building_id, number)
  values (v_building_id, 'C-1')
  returning id into v_unit_id;

  insert into public.orders (
    order_type, client_type, administration_id, status
  ) values (
    'keys', 'administration', v_admin_id, 'draft'
  )
  returning id into v_order_id;

  insert into public.order_items (
    order_id, item_type, quantity, description, building_id, unit_price, unit_id
  ) values (
    v_order_id, 'key', 1, 'Key item no sku', v_building_id, 50.00, v_unit_id
  )
  returning id into v_item_id;

  perform public.confirm_order(v_order_id);

  perform public.configure_key_order_item(
    v_item_id, 'RFID-NOSKU-01', v_unit_id, '{}'::uuid[]
  );

  select status into v_order_status
    from public.orders where id = v_order_id;

  assert v_order_status = 'ready_for_pickup',
    'FAIL scenario-c: expected ready_for_pickup when there is no install task, got ' || v_order_status;

  raise notice 'PASS scenario-c: key with no install task reaches ready_for_pickup on config';
end $$;

rollback;

-- ===========================================================
-- Scenario (d): cancelled item with an open install ticket does not
-- block ready_for_pickup
-- ===========================================================
begin;

do $$
declare
  v_admin_id       uuid;
  v_building_id    uuid;
  v_unit_id        uuid;
  v_product_id     uuid;
  v_order_id       uuid;
  v_item_a         uuid;
  v_item_b         uuid;
  v_install_b      uuid;
  v_order_status   text;
begin
  insert into public.administrations (company_name)
  values ('Test Admin CancelledItem')
  returning id into v_admin_id;

  insert into public.buildings (name, address, administration_id)
  values ('Test Building CancelledItem', 'Street 10', v_admin_id)
  returning id into v_building_id;

  insert into public.units (building_id, number)
  values (v_building_id, 'D-1')
  returning id into v_unit_id;

  insert into public.products (name, category)
  values ('Key Product CancelledItem', 'rfid_key')
  returning id into v_product_id;

  insert into public.stock_movements (product_id, type, quantity, note)
  values (v_product_id, 'compra', 10, 'Fixture: seed stock for cancelled-item test');

  insert into public.orders (
    order_type, client_type, administration_id, status
  ) values (
    'keys', 'administration', v_admin_id, 'draft'
  )
  returning id into v_order_id;

  insert into public.order_items (
    order_id, item_type, quantity, description, building_id,
    product_id, unit_price, unit_id
  ) values (
    v_order_id, 'key', 1, 'Key A cancelled later', v_building_id, v_product_id, 50.00, v_unit_id
  )
  returning id into v_item_a;

  insert into public.order_items (
    order_id, item_type, quantity, description, building_id,
    product_id, unit_price, unit_id
  ) values (
    v_order_id, 'key', 1, 'Key B delivered', v_building_id, v_product_id, 50.00, v_unit_id
  );

  select id into v_item_b
    from public.order_items
   where order_id = v_order_id
     and id <> v_item_a
   limit 1;

  perform public.confirm_order(v_order_id);

  -- Configure both; item A is then cancelled while its install task is open.
  perform public.configure_key_order_item(
    v_item_a, 'RFID-CANC-A-01', v_unit_id, '{}'::uuid[]
  );
  perform public.configure_key_order_item(
    v_item_b, 'RFID-CANC-B-01', v_unit_id, '{}'::uuid[]
  );

  update public.order_items
     set status = 'cancelled'
   where id = v_item_a;

  -- Resolve item B's install task.
  select id into v_install_b
    from support.tickets
   where order_item_id = v_item_b
     and category = 'key_installation'
   limit 1;

  update support.tickets
     set status = 'in_progress'
   where id = v_install_b
     and status = 'open';

  update support.tickets
     set status = 'resolved',
         resolution_notes = 'Instalada en el lector'
   where id = v_install_b
     and status = 'in_progress';

  -- Assert: item A's stale open install ticket does not block.
  select status into v_order_status
    from public.orders where id = v_order_id;

  assert v_order_status = 'ready_for_pickup',
    'FAIL scenario-d: expected ready_for_pickup (cancelled item excluded), got ' || v_order_status;

  raise notice 'PASS scenario-d: cancelled item does not block ready_for_pickup';
end $$;

rollback;

-- ===========================================================
-- Scenario (e): recompute demotes a wrongly-ready order when an
-- install task is still open (healing path)
-- ===========================================================
begin;

do $$
declare
  v_admin_id       uuid;
  v_building_id    uuid;
  v_unit_id        uuid;
  v_product_id     uuid;
  v_order_id       uuid;
  v_item_id        uuid;
  v_install_ticket uuid;
  v_order_status   text;
begin
  insert into public.administrations (company_name)
  values ('Test Admin Demote')
  returning id into v_admin_id;

  insert into public.buildings (name, address, administration_id)
  values ('Test Building Demote', 'Street 11', v_admin_id)
  returning id into v_building_id;

  insert into public.units (building_id, number)
  values (v_building_id, 'E-1')
  returning id into v_unit_id;

  insert into public.products (name, category)
  values ('Key Product Demote', 'rfid_key')
  returning id into v_product_id;

  insert into public.stock_movements (product_id, type, quantity, note)
  values (v_product_id, 'compra', 10, 'Fixture: seed stock for demote test');

  insert into public.orders (
    order_type, client_type, administration_id, status
  ) values (
    'keys', 'administration', v_admin_id, 'draft'
  )
  returning id into v_order_id;

  insert into public.order_items (
    order_id, item_type, quantity, description, building_id,
    product_id, unit_price, unit_id
  ) values (
    v_order_id, 'key', 1, 'Key item demote', v_building_id,
    v_product_id, 50.00, v_unit_id
  )
  returning id into v_item_id;

  perform public.confirm_order(v_order_id);

  -- Configure the key: transient promote is corrected inside the RPC
  -- transaction and the order ends in_progress with an open install task.
  perform public.configure_key_order_item(
    v_item_id, 'RFID-DEMOTE-01', v_unit_id, '{}'::uuid[]
  );

  -- Simulate a wrongly-ready order: park it in ready_for_pickup while the
  -- install task is open, then let recompute heal it.
  update public.orders
     set status = 'ready_for_pickup'
   where id = v_order_id;

  perform public.recompute_order_status(v_order_id);

  select status into v_order_status
    from public.orders where id = v_order_id;

  assert v_order_status = 'in_progress',
    'FAIL scenario-e: expected demote to in_progress with install pending, got ' || v_order_status;

  raise notice 'PASS scenario-e: recompute demotes wrongly-ready order with install pending';
end $$;

rollback;
