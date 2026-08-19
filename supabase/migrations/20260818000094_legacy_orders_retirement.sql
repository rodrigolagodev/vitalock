-- ============================================================
-- Migration: Legacy orders retirement (PR-6 / W8)
-- ============================================================
-- Drops all legacy public.orders and public.order_items schema objects.
-- This is the one-way door: no tombstones, no data migration,
-- no compatibility VIEWs over the retired names.
--
-- APPLY ONLY AFTER: apps/admin PR-5 (W10–W12) is merged.
-- The hooks retarget was verified in PR-5c. The compat shim
-- in packages/supabase/src/rpc/orders.ts is deleted in this same PR.
--
-- Spec reference: sdd/orders-bounded-context-split/spec/orders-legacy-retirement
--   Requirements: Drop Legacy Order Tables, Drop Trigger, Drop Sequences,
--                 Drop RLS Policies, Drop Legacy RPCs, No Compat VIEWs
--
-- Design reference: design.md §8 Retirement plan / migration 12
--
-- Rollback: NONE. This migration is irreversible.
-- ============================================================

-- ============================================================
-- Step 1: Drop legacy RPCs and functions (before table drops,
-- so CASCADE from DROP TABLE does not silently hide missing-function errors).
-- Using IF EXISTS + CASCADE throughout to remain idempotent.
-- ============================================================

-- Core RPC wrappers
drop function if exists public.create_order_with_items(jsonb, jsonb[]) cascade;
drop function if exists public.confirm_order(uuid) cascade;
drop function if exists public.update_draft_order_with_items(uuid, jsonb, jsonb[], timestamptz) cascade;
drop function if exists public.recompute_order_status(uuid) cascade;

-- Trigger functions (will also drop associated triggers via CASCADE)
drop function if exists public.orders_cancel_release_reservations() cascade;
drop function if exists public.order_items_validate_type() cascade;
drop function if exists public.order_items_trigger_recompute() cascade;

-- Legacy sequence generator (replaced by gen_key_order_number / gen_technical_order_number)
drop function if exists public.gen_order_number() cascade;

-- ============================================================
-- Step 2: Explicit trigger drop guards (defensive — CASCADE in step 1
-- already handles these, but explicit drops document intent).
-- ============================================================
drop trigger if exists order_items_validate_type_trigger on public.order_items;
drop trigger if exists order_items_recompute_order_status on public.order_items;

-- ============================================================
-- Step 3: Drop legacy sequence
-- ============================================================
drop sequence if exists public.order_number_seq cascade;

-- ============================================================
-- Step 4: Drop legacy tables (child first to avoid FK dependency issues).
-- CASCADE removes all dependent objects: triggers, indexes, RLS policies,
-- the admin_all_orders and admin_all_order_items policies included.
-- ============================================================
drop table if exists public.order_items cascade;
drop table if exists public.orders cascade;

-- ============================================================
-- Step 5: Verification guards (fail-fast post-drop assertions).
-- These will raise if the drops silently failed.
-- ============================================================

do $$
declare
  v_count int;
begin
  -- Guard 1: orders table must be gone
  select count(*) into v_count
    from information_schema.tables
   where table_name = 'orders' and table_schema = 'public';
  if v_count > 0 then
    raise exception 'RETIREMENT GUARD: public.orders still exists after DROP';
  end if;

  -- Guard 2: order_items table must be gone
  select count(*) into v_count
    from information_schema.tables
   where table_name = 'order_items' and table_schema = 'public';
  if v_count > 0 then
    raise exception 'RETIREMENT GUARD: public.order_items still exists after DROP';
  end if;

  -- Guard 3: legacy sequence must be gone
  select count(*) into v_count
    from pg_sequences
   where sequencename = 'order_number_seq' and schemaname = 'public';
  if v_count > 0 then
    raise exception 'RETIREMENT GUARD: public.order_number_seq still exists after DROP';
  end if;

  -- Guard 4: legacy RPCs must be gone
  select count(*) into v_count
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in (
       'create_order_with_items',
       'confirm_order',
       'update_draft_order_with_items',
       'recompute_order_status',
       'orders_cancel_release_reservations',
       'order_items_validate_type',
       'order_items_trigger_recompute',
       'gen_order_number'
     );
  if v_count > 0 then
    raise exception 'RETIREMENT GUARD: % legacy function(s) still exist after DROP', v_count;
  end if;

  -- Guard 5: no compat VIEWs named orders or order_items
  select count(*) into v_count
    from information_schema.views
   where table_schema = 'public'
     and table_name in ('orders', 'order_items');
  if v_count > 0 then
    raise exception 'RETIREMENT GUARD: a compat VIEW named orders or order_items exists in public — must not exist';
  end if;

  raise notice 'RETIREMENT GUARDS: all 5 post-drop checks PASS';
end $$;
