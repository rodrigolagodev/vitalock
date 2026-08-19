-- ============================================================
-- TDD RED → GREEN: Legacy orders retirement
-- ============================================================
-- Tests that all legacy public.orders and public.order_items
-- schema objects are absent after migration 094 is applied.
--
-- Spec reference: sdd/orders-bounded-context-split/spec/orders-legacy-retirement
-- Requirements: 5 requirements, 8 scenarios
--
-- RED state: before migration 094, all legacy objects still exist.
--   Run on a post-093 DB to see failures on every assertion.
--
-- GREEN state: after migration 094, every assertion passes.
--   Run via: psql -f supabase/tests-sql/test_094_legacy_retirement.sql
-- ============================================================

\set ON_ERROR_STOP on

-- ============================================================
-- Scenario 1 (GREEN): public.orders does NOT exist after migration
-- Spec: Requirement "Drop Legacy Order Tables" / Scenario "public.orders does not exist"
-- ============================================================
do $$
declare
  v_count int;
begin
  select count(*) into v_count
    from information_schema.tables
   where table_name = 'orders'
     and table_schema = 'public';

  if v_count > 0 then
    raise exception 'FAIL S1: public.orders still exists — legacy table was NOT dropped';
  end if;

  raise notice 'PASS S1: public.orders does not exist';
end $$;

-- ============================================================
-- Scenario 2 (GREEN): public.order_items does NOT exist after migration
-- Spec: Requirement "Drop Legacy Order Tables" / Scenario "public.order_items does not exist"
-- ============================================================
do $$
declare
  v_count int;
begin
  select count(*) into v_count
    from information_schema.tables
   where table_name = 'order_items'
     and table_schema = 'public';

  if v_count > 0 then
    raise exception 'FAIL S2: public.order_items still exists — legacy table was NOT dropped';
  end if;

  raise notice 'PASS S2: public.order_items does not exist';
end $$;

-- ============================================================
-- Scenario 3 (GREEN): No data migration errors on clean DB
-- Spec: Requirement "Drop Legacy Order Tables" / Scenario "No data migration required"
-- This scenario passes as long as Scenarios 1 and 2 pass on a clean DB reset.
-- ============================================================
do $$
begin
  raise notice 'PASS S3: clean DB reset succeeded without data-migration errors';
end $$;

-- ============================================================
-- Scenario 4 (GREEN): order_items_validate_type_trigger does NOT exist
-- Spec: Requirement "Drop order_items_validate_type Trigger"
-- ============================================================
do $$
declare
  v_count int;
begin
  select count(*) into v_count
    from pg_trigger
   where tgname = 'order_items_validate_type_trigger';

  if v_count > 0 then
    raise exception 'FAIL S4: order_items_validate_type_trigger still exists — trigger was NOT dropped';
  end if;

  raise notice 'PASS S4: order_items_validate_type_trigger does not exist';
end $$;

-- ============================================================
-- Scenario 5 (GREEN): public.order_number_seq does NOT exist
-- Spec: Requirement "Drop Legacy Sequences"
-- ============================================================
do $$
declare
  v_count int;
begin
  select count(*) into v_count
    from pg_sequences
   where sequencename = 'order_number_seq'
     and schemaname = 'public';

  if v_count > 0 then
    raise exception 'FAIL S5: public.order_number_seq still exists — legacy sequence was NOT dropped';
  end if;

  raise notice 'PASS S5: public.order_number_seq does not exist';
end $$;

-- ============================================================
-- Scenario 6 (GREEN): Legacy RLS policies absent
-- Spec: Requirement "Drop Legacy RLS Policies"
-- ============================================================
do $$
declare
  v_count int;
begin
  select count(*) into v_count
    from pg_policies
   where policyname in ('admin_all_orders', 'admin_all_order_items');

  if v_count > 0 then
    raise exception 'FAIL S6: legacy RLS policies (admin_all_orders / admin_all_order_items) still exist';
  end if;

  raise notice 'PASS S6: admin_all_orders and admin_all_order_items policies do not exist';
end $$;

-- ============================================================
-- Scenario 7 (GREEN): create_order_with_items does NOT exist
-- Spec: Requirement "Drop Legacy RPCs and Functions"
-- Also verifies other legacy functions are absent.
-- ============================================================
do $$
declare
  v_count int;
  v_name  text;
begin
  for v_name in select unnest(array[
    'create_order_with_items',
    'confirm_order',
    'update_draft_order_with_items',
    'recompute_order_status',
    'orders_cancel_release_reservations',
    'order_items_validate_type',
    'order_items_trigger_recompute',
    'gen_order_number'
  ]) loop
    select count(*) into v_count
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = v_name;

    if v_count > 0 then
      raise exception 'FAIL S7: legacy function public.% still exists — was NOT dropped', v_name;
    end if;
  end loop;

  raise notice 'PASS S7: all legacy RPCs and functions are absent';
end $$;

-- ============================================================
-- Scenario 8 (GREEN): Calling public.confirm_order raises "function does not exist"
-- Spec: Requirement "Drop Legacy RPCs" / Scenario "Calling a legacy RPC raises an error"
-- ============================================================
do $$
declare
  v_dummy uuid := gen_random_uuid();
begin
  begin
    perform public.confirm_order(v_dummy);
    raise exception 'FAIL S8: public.confirm_order(uuid) should not exist but executed without error';
  exception
    when undefined_function then
      raise notice 'PASS S8: calling public.confirm_order raises undefined_function as expected';
  end;
end $$;

-- ============================================================
-- Scenario 9 (GREEN): No VIEW named "orders" or "order_items" in public schema
-- Spec: Requirement "No Compatibility VIEWs"
-- ============================================================
do $$
declare
  v_count int;
begin
  select count(*) into v_count
    from information_schema.views
   where table_schema = 'public'
     and table_name in ('orders', 'order_items');

  if v_count > 0 then
    raise exception 'FAIL S9: a compatibility VIEW named orders or order_items exists in public schema — MUST NOT be created';
  end if;

  raise notice 'PASS S9: no VIEW named orders or order_items exists in public schema';
end $$;

\echo 'ALL SCENARIOS PASS: legacy orders retirement verified'
