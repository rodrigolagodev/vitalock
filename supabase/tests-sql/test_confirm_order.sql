-- ============================================================
-- DB smoke test: confirm_order RPC scenarios
-- ============================================================
-- Implements: ordenes-admin/Confirm Order RPC — Atomic Commitment
-- Implements: stock-inventory/Reservation Lifecycle on Order Events
--
-- Run via: psql -f supabase/tests-sql/test_confirm_order.sql
--
-- Prerequisite: migration 000055 must be applied (confirm_order RPC exists,
-- old trigger dropped).
-- Each scenario runs in its own transaction and always rolls back to avoid
-- polluting the database. Run against a local Supabase instance:
--   supabase db reset && psql postgresql://postgres:postgres@127.0.0.1:54322/postgres \
--     -f supabase/tests-sql/test_confirm_order.sql
-- ============================================================

-- ===========================================================
-- Scenario (a): Happy path — creates ticket + reserva + status=confirmed
-- ===========================================================
begin;

do $$
declare
  v_admin_id      uuid;
  v_building_id   uuid;
  v_order_id      uuid;
  v_item_id       uuid;
  v_product_id    uuid;
  v_order_status  text;
  v_ticket_count  int;
  v_reserva_count int;
begin
  -- Fixtures
  insert into public.administrations (company_name)
  values ('Test Admin Confirm')
  returning id into v_admin_id;

  insert into public.buildings (name, address, administration_id)
  values ('Test Building Confirm', 'Street 2', v_admin_id)
  returning id into v_building_id;

  insert into public.products (name, category)
  values ('Key Product Confirm', 'rfid_key')
  returning id into v_product_id;

  -- Seed stock so the reserva emitted by confirm_order does not violate
  -- the stock_reservado <= stock_total counter check.
  insert into public.stock_movements (product_id, type, quantity, note)
  values (v_product_id, 'compra', 10, 'Fixture: seed stock for confirm test');

  -- Draft order with one key item (product_id set → should get ticket + reserva).
  insert into public.orders (
    order_type, client_type, administration_id, status
  ) values (
    'keys', 'administration', v_admin_id, 'draft'
  )
  returning id into v_order_id;

  insert into public.order_items (
    order_id, item_type, quantity, description, building_id,
    product_id, unit_price
  ) values (
    v_order_id, 'key', 2, 'Key item confirm test', v_building_id,
    v_product_id, 50.00
  )
  returning id into v_item_id;

  -- Call confirm_order.
  perform public.confirm_order(v_order_id);

  -- Assert: order status = 'confirmed'.
  select status into v_order_status
    from public.orders where id = v_order_id;

  assert v_order_status = 'confirmed',
    'FAIL scenario-a: expected status=confirmed, got ' || v_order_status;

  -- Assert: 1 ticket created for the key item.
  select count(*) into v_ticket_count
    from support.tickets
   where order_item_id = v_item_id;

  assert v_ticket_count = 1,
    'FAIL scenario-a: expected 1 ticket, got ' || v_ticket_count;

  -- Assert: 1 reserva movement created for the key item.
  select count(*) into v_reserva_count
    from public.stock_movements
   where order_item_id = v_item_id
     and type = 'reserva';

  assert v_reserva_count = 1,
    'FAIL scenario-a: expected 1 reserva movement, got ' || v_reserva_count;

  -- Assert: reserva quantity is negative (matches trigger convention).
  assert (
    select quantity < 0
      from public.stock_movements
     where order_item_id = v_item_id
       and type = 'reserva'
  ), 'FAIL scenario-a: reserva quantity must be negative';

  raise notice 'PASS scenario-a: happy path confirm_order creates ticket + reserva + status=confirmed';
end $$;

rollback;

-- ===========================================================
-- Scenario (b): Second call on confirmed order → error (no duplicates)
-- ===========================================================
begin;

do $$
declare
  v_admin_id      uuid;
  v_building_id   uuid;
  v_order_id      uuid;
  v_product_id    uuid;
  v_caught        boolean := false;
  v_ticket_count  int;
  v_reserva_count int;
begin
  -- Fixtures
  insert into public.administrations (company_name)
  values ('Test Admin Idempotent')
  returning id into v_admin_id;

  insert into public.buildings (name, address, administration_id)
  values ('Test Building Idempotent', 'Street 3', v_admin_id)
  returning id into v_building_id;

  insert into public.products (name, category)
  values ('Key Product Idempotent', 'rfid_key')
  returning id into v_product_id;

  -- Seed stock so the reserva emitted by confirm_order does not violate
  -- the stock_reservado <= stock_total counter check.
  insert into public.stock_movements (product_id, type, quantity, note)
  values (v_product_id, 'compra', 5, 'Fixture: seed stock for idempotent test');

  insert into public.orders (
    order_type, client_type, administration_id, status
  ) values (
    'keys', 'administration', v_admin_id, 'draft'
  )
  returning id into v_order_id;

  insert into public.order_items (
    order_id, item_type, quantity, description, building_id,
    product_id, unit_price
  ) values (
    v_order_id, 'key', 1, 'Key item idempotent test', v_building_id,
    v_product_id, 75.00
  );

  -- First call: should succeed.
  perform public.confirm_order(v_order_id);

  -- Second call: should raise ORDERS_CONFIRM_NOT_DRAFT.
  begin
    perform public.confirm_order(v_order_id);
  exception
    when others then
      if sqlerrm ilike '%ORDERS_CONFIRM_NOT_DRAFT%' then
        v_caught := true;
      else
        raise exception 'FAIL scenario-b: unexpected error on second confirm_order call: %', sqlerrm;
      end if;
  end;

  assert v_caught,
    'FAIL scenario-b: expected ORDERS_CONFIRM_NOT_DRAFT on second call, but no error was raised';

  -- Assert: no duplicate tickets or reservations.
  select count(*) into v_ticket_count
    from support.tickets
     join public.order_items oi on oi.id = support.tickets.order_item_id
    where oi.order_id = v_order_id;

  assert v_ticket_count = 1,
    'FAIL scenario-b: expected 1 ticket (no duplicates), got ' || v_ticket_count;

  select count(*) into v_reserva_count
    from public.stock_movements sm
    join public.order_items oi on oi.id = sm.order_item_id
   where oi.order_id = v_order_id
     and sm.type = 'reserva';

  assert v_reserva_count = 1,
    'FAIL scenario-b: expected 1 reserva (no duplicates), got ' || v_reserva_count;

  raise notice 'PASS scenario-b: second confirm_order call returns error, no duplicates created';
end $$;

rollback;

-- ===========================================================
-- Scenario (c): Call on a non-draft order → error
-- ===========================================================
begin;

do $$
declare
  v_admin_id   uuid;
  v_order_id   uuid;
  v_caught     boolean := false;
begin
  -- Fixtures: an order already in in_progress (post-migration valid status).
  insert into public.administrations (company_name)
  values ('Test Admin NonDraft')
  returning id into v_admin_id;

  insert into public.orders (
    order_type, client_type, administration_id, status
  ) values (
    'keys', 'administration', v_admin_id, 'in_progress'
  )
  returning id into v_order_id;

  -- Calling confirm_order on a non-draft order must raise an error.
  begin
    perform public.confirm_order(v_order_id);
  exception
    when others then
      if sqlerrm ilike '%ORDERS_CONFIRM_NOT_DRAFT%' then
        v_caught := true;
      else
        raise exception 'FAIL scenario-c: unexpected error: %', sqlerrm;
      end if;
  end;

  assert v_caught,
    'FAIL scenario-c: expected ORDERS_CONFIRM_NOT_DRAFT on non-draft order, but no error raised';

  raise notice 'PASS scenario-c: confirm_order on non-draft order returns ORDERS_CONFIRM_NOT_DRAFT error';
end $$;

rollback;

-- ===========================================================
-- Scenario (d): Technical order — maintenance item creates ticket only
-- (no reservation — maintenance items are not stock-backed)
-- ===========================================================
begin;

do $$
declare
  v_admin_id      uuid;
  v_building_id   uuid;
  v_order_id      uuid;
  v_item_id       uuid;
  v_order_status  text;
  v_ticket_count  int;
  v_reserva_count int;
begin
  insert into public.administrations (company_name)
  values ('Test Admin Technical')
  returning id into v_admin_id;

  insert into public.buildings (name, address, administration_id)
  values ('Test Building Technical', 'Street 5', v_admin_id)
  returning id into v_building_id;

  insert into public.orders (
    order_type, client_type, administration_id, status
  ) values (
    'technical', 'administration', v_admin_id, 'draft'
  )
  returning id into v_order_id;

  insert into public.order_items (
    order_id, item_type, quantity, description, building_id, unit_price
  ) values (
    v_order_id, 'maintenance', 1, 'Maintenance task', v_building_id, 200.00
  )
  returning id into v_item_id;

  perform public.confirm_order(v_order_id);

  select status into v_order_status
    from public.orders where id = v_order_id;

  assert v_order_status = 'confirmed',
    'FAIL scenario-d: expected status=confirmed, got ' || v_order_status;

  -- Maintenance items: 1 ticket expected.
  select count(*) into v_ticket_count
    from support.tickets
   where order_item_id = v_item_id;

  assert v_ticket_count = 1,
    'FAIL scenario-d: expected 1 ticket for maintenance item, got ' || v_ticket_count;

  -- Maintenance items: 0 reserva movements (not stock-backed).
  select count(*) into v_reserva_count
    from public.stock_movements
   where order_item_id = v_item_id
     and type = 'reserva';

  assert v_reserva_count = 0,
    'FAIL scenario-d: expected 0 reserva movements for maintenance item, got ' || v_reserva_count;

  raise notice 'PASS scenario-d: technical/maintenance item creates ticket, no reserva';
end $$;

rollback;

-- ===========================================================
-- Manual verification checklist (cannot be automated without
-- full FK fixtures for units/buildings)
-- ===========================================================
--
-- After running the automated scenarios above, verify manually:
--
-- M-1: confirm_order on an order with zero items raises ORDERS_CONFIRM_NO_ITEMS.
-- M-2: confirm_order on a particular order (administration_id null) with a key
--      item that has a building_id creates a ticket (administration derived
--      from the building) + reserva.
-- M-3: confirm_order on a key item with product_id IS NULL creates no ticket
--      and no reserva (matches trigger behavior for legacy rows).
-- M-4: After confirm_order, calling update_draft_order_with_items raises
--      ORDERS_UPDATE_NOT_DRAFT.
-- ============================================================
