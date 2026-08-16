-- ============================================================
-- Regression: orders-draft-and-confirmed schema shape
-- ============================================================
-- Verifies that the state introduced by migration 20260811000055
-- (`orders_draft_and_confirmed`) remains consistent: the status
-- domain includes `confirmed` and excludes `in_preparation`, the
-- old auto-tarea trigger is gone, and the RPCs the app depends
-- on (`confirm_order`, `update_draft_order_with_items`) exist.
--
-- Historical note: an earlier PRE section asserted the inverse
-- state (before the migration ran). It was removed once the
-- migration became permanent; the post-migration assertions
-- below are the durable regression surface.
-- ============================================================

-- B-1: `in_preparation` must not appear in the orders status domain.
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
  ), 'B-1 FAIL: orders_status_check still includes "in_preparation"';
  raise notice 'PASS B-1: in_preparation is not in orders_status_check';
end $$;

-- B-2: `confirmed` must be a valid orders status.
do $$
begin
  assert exists (
    select 1
      from information_schema.check_constraints
     where constraint_schema = 'public'
       and constraint_name = 'orders_status_check'
       and check_clause ilike '%confirmed%'
  ), 'B-2 FAIL: orders_status_check does not include "confirmed"';
  raise notice 'PASS B-2: confirmed is in orders_status_check';
end $$;

-- B-3: The legacy auto-tarea trigger must not exist. Ticket creation
-- is now the responsibility of confirm_order (draft inserts are
-- side-effect free).
do $$
begin
  assert not exists (
    select 1
      from information_schema.triggers
     where trigger_schema = 'public'
       and event_object_table = 'order_items'
       and trigger_name = 'order_items_create_tarea_trigger'
  ), 'B-3 FAIL: legacy trigger order_items_create_tarea_trigger still exists';
  raise notice 'PASS B-3: legacy auto-tarea trigger is absent';
end $$;

-- B-4: confirm_order RPC must exist.
do $$
begin
  assert exists (
    select 1
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = 'confirm_order'
  ), 'B-4 FAIL: function public.confirm_order does not exist';
  raise notice 'PASS B-4: confirm_order RPC exists';
end $$;

-- B-5: update_draft_order_with_items RPC must exist.
do $$
begin
  assert exists (
    select 1
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = 'update_draft_order_with_items'
  ), 'B-5 FAIL: function public.update_draft_order_with_items does not exist';
  raise notice 'PASS B-5: update_draft_order_with_items RPC exists';
end $$;

-- B-6: No rows in orders may remain with the retired `in_preparation` status.
-- (The backfill inside migration 000055 rewrote historical rows.)
do $$
begin
  assert (select count(*) from public.orders where status = 'in_preparation') = 0,
    'B-6 FAIL: in_preparation rows still exist after backfill migration';
  raise notice 'PASS B-6: no in_preparation rows remain';
end $$;
