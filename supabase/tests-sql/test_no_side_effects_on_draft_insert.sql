-- ============================================================
-- DB smoke test: no side effects on order_item insert into draft order
-- ============================================================
-- Implements: ordenes-admin/No Side Effects in Draft
-- Implements: stock-inventory scenario "No reservation emitted on
--             order_item insert into draft order"
--
-- Run via: psql -f supabase/tests-sql/test_no_side_effects_on_draft_insert.sql
--
-- Prerequisite: migration 000055 must be applied (trigger dropped).
-- The test is self-contained: it creates its own fixtures in a transaction
-- and always rolls back, leaving no persistent test data.
-- ============================================================

begin;

do $$
declare
  v_admin_id    uuid;
  v_building_id uuid;
  v_order_id    uuid;
  v_item_id     uuid;
  v_product_id  uuid;
  v_ticket_count int;
  v_reserva_count int;
begin
  -- ---- Set up minimal fixtures ----

  -- Administration (unit owner for building FK).
  insert into public.administrations (company_name)
  values ('Test Admin Draft')
  returning id into v_admin_id;

  -- Building linked to the administration.
  insert into public.buildings (name, address, administration_id)
  values ('Test Building Draft', 'Street 1', v_admin_id)
  returning id into v_building_id;

  -- Product for stock reservation tests.
  insert into public.products (name, category)
  values ('Test Key Product Draft', 'rfid_key')
  returning id into v_product_id;

  -- Draft order.
  insert into public.orders (
    order_type, client_type, administration_id, status
  ) values (
    'keys', 'administration', v_admin_id, 'draft'
  )
  returning id into v_order_id;

  -- Insert a key order_item with product_id (would previously trigger
  -- ticket + reservation creation via order_items_create_tarea_trigger).
  insert into public.order_items (
    order_id, item_type, quantity, description, building_id,
    product_id, unit_price
  ) values (
    v_order_id, 'key', 1, 'Draft key item', v_building_id,
    v_product_id, 100.00
  )
  returning id into v_item_id;

  -- ---- Assertions ----

  -- Assert: zero support.tickets rows for this item.
  select count(*) into v_ticket_count
    from support.tickets
   where order_item_id = v_item_id;

  assert v_ticket_count = 0,
    'FAIL test_no_side_effects: expected 0 tickets on draft item insert, got ' || v_ticket_count;

  -- Assert: zero reserva stock_movements for this item.
  select count(*) into v_reserva_count
    from public.stock_movements
   where order_item_id = v_item_id
     and type = 'reserva';

  assert v_reserva_count = 0,
    'FAIL test_no_side_effects: expected 0 reserva movements on draft item insert, got ' || v_reserva_count;

  raise notice 'PASS test_no_side_effects_on_draft_insert: 0 tickets, 0 reserva movements on draft order_item insert';
end $$;

rollback;
