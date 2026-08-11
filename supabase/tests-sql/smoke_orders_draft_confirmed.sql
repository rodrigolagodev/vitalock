-- ============================================================
-- Smoke assertions: orders-draft-and-confirmed migration
-- ============================================================
-- Run via:  psql -f supabase/tests-sql/smoke_orders_draft_confirmed.sql
--
-- This file has TWO sections:
--   A) Pre-migration assertions  — run BEFORE applying migration 000055
--   B) Post-migration assertions — run AFTER applying migration 000055
--
-- Each assertion uses a DO $$ BEGIN ASSERT ... END $$ block.
-- A failure raises an exception and exits psql with a non-zero code.
-- ============================================================

-- ============================================================
-- SECTION A: Pre-migration invariants
-- ============================================================
-- Run these before `supabase db push` or `supabase migration up`.
-- They verify the state that the migration assumes going in.

-- A-1: 'confirmed' must NOT be a valid status value before migration.
--      Attempting to INSERT an order with status='confirmed' must fail
--      the CHECK constraint.
do $$
begin
  assert (
    not exists (
      select 1
        from information_schema.check_constraints
       where constraint_schema = 'public'
         and constraint_name = 'orders_status_check'
         and check_clause ilike '%confirmed%'
    )
  ), 'PRE-A-1 FAIL: orders_status_check already includes "confirmed" — migration may have been applied already';
end $$;

-- A-2: Trigger order_items_create_tarea_trigger must still exist.
do $$
begin
  assert exists (
    select 1
      from information_schema.triggers
     where trigger_schema = 'public'
       and event_object_table = 'order_items'
       and trigger_name = 'order_items_create_tarea_trigger'
  ), 'PRE-A-2 FAIL: trigger order_items_create_tarea_trigger does not exist — check migration history';
end $$;

-- A-3: Function order_items_create_tarea must still exist.
do $$
begin
  assert exists (
    select 1
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = 'order_items_create_tarea'
  ), 'PRE-A-3 FAIL: function public.order_items_create_tarea does not exist';
end $$;

-- A-4: confirm_order RPC must NOT exist yet.
do $$
begin
  assert not exists (
    select 1
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = 'confirm_order'
  ), 'PRE-A-4 FAIL: function public.confirm_order already exists — migration may have been applied';
end $$;

-- ============================================================
-- SECTION B: Post-migration assertions
-- ============================================================
-- Run these after applying migration 000055.
-- Uncomment the section below and run it against the migrated DB.

/*

-- B-1: 'in_preparation' must no longer be a valid status value.
--      Verify that inserting an order with status='in_preparation' fails.
do $$
begin
  assert (
    not exists (
      select 1
        from information_schema.check_constraints
       where constraint_schema = 'public'
         and constraint_name = 'orders_status_check'
         and check_clause ilike '%in_preparation%'
    )
  ), 'POST-B-1 FAIL: orders_status_check still includes "in_preparation"';
end $$;

-- B-2: 'confirmed' must be a valid status value.
do $$
begin
  assert exists (
    select 1
      from information_schema.check_constraints
     where constraint_schema = 'public'
       and constraint_name = 'orders_status_check'
       and check_clause ilike '%confirmed%'
  ), 'POST-B-2 FAIL: orders_status_check does not include "confirmed"';
end $$;

-- B-3: Trigger order_items_create_tarea_trigger must NOT exist.
do $$
begin
  assert not exists (
    select 1
      from information_schema.triggers
     where trigger_schema = 'public'
       and event_object_table = 'order_items'
       and trigger_name = 'order_items_create_tarea_trigger'
  ), 'POST-B-3 FAIL: trigger order_items_create_tarea_trigger still exists';
end $$;

-- B-4: confirm_order function must exist.
do $$
begin
  assert exists (
    select 1
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = 'confirm_order'
  ), 'POST-B-4 FAIL: function public.confirm_order does not exist';
end $$;

-- B-5: update_draft_order_with_items function must exist.
do $$
begin
  assert exists (
    select 1
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = 'update_draft_order_with_items'
  ), 'POST-B-5 FAIL: function public.update_draft_order_with_items does not exist';
end $$;

-- B-6: No 'in_preparation' rows must remain in orders.
do $$
begin
  assert (select count(*) from public.orders where status = 'in_preparation') = 0,
    'POST-B-6 FAIL: in_preparation rows still exist after backfill migration';
end $$;

-- B-7: No 'draft' rows must remain in orders (all deleted by backfill).
do $$
begin
  assert (select count(*) from public.orders where status = 'draft') = 0,
    'POST-B-7 FAIL: draft rows still exist after backfill migration';
end $$;

*/
