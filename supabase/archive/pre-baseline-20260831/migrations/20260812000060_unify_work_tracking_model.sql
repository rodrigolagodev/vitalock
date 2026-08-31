-- ============================================================
-- Change: unify-work-tracking-model
-- Rationale: Retire key_installation as a valid ticket category.
--   Order readiness for keys orders now derives from
--   operations.key_authorizations.sync_state instead of open
--   key_installation tickets. This simplifies the work-tracking
--   model: one data source (key_authorizations) drives both the
--   installer worklist and order status.
--
-- Rollback pointer: design §Rollback
--   1. Restore public.recompute_order_status from migration 000057.
--   2. Restore support.tickets_resolution_chain from migration 000057
--      (Step 2) — re-add the key_configuration → key_installation branch.
--   3. Drop trigger tickets_reject_key_installation_inserts.
--   4. Un-cancel migration-cancelled tickets:
--        UPDATE support.tickets
--           SET status = 'open',
--               cancellation_reason = NULL,
--               resolved_at = NULL
--         WHERE cancellation_reason
--               LIKE 'Auto-cancelled by unify-work-tracking-model%';
--   5. Re-run recompute_order_status for keys orders.
--
-- Internal step labels (migration ordering matters — see design §Migration
-- Ordering Rationale):
--   a → rewrite public.recompute_order_status (keys branch)
--   b → prune support.tickets_resolution_chain (empty body, trigger kept)
--   b2 → BEFORE INSERT guard: tickets_reject_key_installation_inserts
--   c → soft-cancel existing open key_installation tickets
--   d → grandfather comment (no CHECK change — historical rows preserved)
--   e → backfill: recompute_order_status for actionable keys orders
-- ============================================================


-- ============================================================
-- Step (a) — Rewrite public.recompute_order_status (keys branch)
-- ============================================================
-- Keys branch now derives readiness from key_authorizations.sync_state
-- traversed via order_items.produced_key_id → rfid_keys → key_authorizations.
-- A pending_install authorization blocks promotion to ready_for_pickup.
-- pending_removal does NOT block (different lifecycle).
-- An unconfigured key item (produced_key_id IS NULL) blocks promotion.
-- Technical flow: unchanged from migration 000057.
-- ============================================================

create or replace function public.recompute_order_status(p_order_id uuid)
returns void language plpgsql as $$
declare
  v_current_status     text;
  v_order_type         text;
  v_total_key_items    int;
  v_configured         int;
  v_unresolved_install int;
  v_total_tickets      int;
  v_open               int;
  v_in_progress_t      int;
  v_resolved           int;
begin
  select status, order_type
    into v_current_status, v_order_type
    from public.orders where id = p_order_id for update;

  -- Terminal states never auto-transition again.
  if v_current_status in ('completed', 'invoiced', 'cancelled') then return; end if;

  if v_order_type = 'keys' then
    -- Keys flow: transitions from 'confirmed', 'in_progress', or
    -- 'ready_for_pickup' (the latter only for demotion).
    if v_current_status not in ('confirmed', 'in_progress', 'ready_for_pickup') then
      return;
    end if;

    -- v_configured = items that have a produced_key_id (i.e. a key has been
    -- assigned). This replaces the old status='configured' check.
    -- An item with produced_key_id IS NULL is unresolved and blocks promotion.
    select
      count(*) filter (where item_type = 'key' and status <> 'cancelled'),
      count(*) filter (where item_type = 'key' and status <> 'cancelled'
                              and produced_key_id is not null)
      into v_total_key_items, v_configured
    from public.order_items where order_id = p_order_id;

    if v_total_key_items = 0 then
      return;  -- all key items cancelled → no transition
    end if;

    -- Blocking installations: key_authorizations with sync_state='pending_install'
    -- for the order's produced keys. pending_removal belongs to other lifecycles
    -- and does NOT block readiness.
    select count(*)
      into v_unresolved_install
      from operations.key_authorizations ka
     where ka.sync_state = 'pending_install'
       and ka.rfid_key_id in (
         select oi.produced_key_id
           from public.order_items oi
          where oi.order_id = p_order_id
            and oi.item_type = 'key'
            and oi.status <> 'cancelled'
            and oi.produced_key_id is not null
       );

    if v_configured > 0 and v_current_status = 'confirmed' then
      -- At least one key assigned: advance to in_progress.
      update public.orders set status = 'in_progress' where id = p_order_id;
      v_current_status := 'in_progress';
    end if;

    if v_configured = v_total_key_items and v_unresolved_install = 0 then
      -- All keys assigned AND all installations done: ready for pickup.
      if v_current_status <> 'ready_for_pickup' then
        update public.orders set status = 'ready_for_pickup' where id = p_order_id;
      end if;
    elsif v_current_status = 'ready_for_pickup'
          and (v_configured < v_total_key_items or v_unresolved_install > 0) then
      -- Keys no longer fully ready: demote back to in_progress.
      update public.orders set status = 'in_progress' where id = p_order_id;
    end if;

    return;
  end if;

  -- Technical flow: derive from generated tickets.
  -- Source states: 'confirmed' or 'in_progress'.
  -- Unchanged from migration 000057.
  if v_current_status not in ('confirmed', 'in_progress') then return; end if;

  select
    count(*) filter (where status <> 'cancelled'),
    count(*) filter (where status = 'open'),
    count(*) filter (where status = 'in_progress'),
    count(*) filter (where status = 'resolved')
    into v_total_tickets, v_open, v_in_progress_t, v_resolved
    from support.tickets
   where order_item_id in (
     select id from public.order_items where order_id = p_order_id
   );

  if v_total_tickets = 0 then return; end if;

  if v_resolved = v_total_tickets then
    update public.orders set status = 'completed' where id = p_order_id;
  elsif v_in_progress_t > 0 or v_resolved > 0 then
    if v_current_status = 'confirmed' then
      update public.orders set status = 'in_progress' where id = p_order_id;
    end if;
  end if;
end;
$$;


-- ============================================================
-- Step (b) — Prune support.tickets_resolution_chain (empty body)
-- ============================================================
-- key_configuration → key_installation spawn branch removed per
-- unify-work-tracking-model. Trigger stays installed so future
-- categories that need a chain can add branches without recreating
-- the trigger infrastructure. The guard remains so non-resolving
-- updates are cheap (return null immediately).
-- DO NOT DROP the trigger — it is retained for future use.
-- ============================================================

create or replace function support.tickets_resolution_chain()
returns trigger language plpgsql security definer
set search_path = support, public as $$
begin
  -- Chain trigger kept for future categories; no active branches today.
  -- key_configuration → key_installation branch removed per
  -- unify-work-tracking-model change. Guard remains so future INSERTs
  -- are cheap (return null immediately for non-resolve transitions).
  if new.status <> 'resolved' or old.status = 'resolved' then
    return null;
  end if;
  return null;
end;
$$;


-- ============================================================
-- Step (b2) — BEFORE INSERT guard: reject key_installation inserts
-- ============================================================
-- Closes every direct write path (SQL, admin UI form, future code)
-- from inserting key_installation tickets now that the category is
-- retired. Returns SQLSTATE 22023 (invalid_parameter_value) with a
-- message referencing this change and the correct replacement.
--
-- Historical soft-cancelled key_installation rows remain readable
-- (the CHECK constraint is NOT changed; see Step d).
-- ============================================================

create or replace function support.tickets_reject_key_installation_inserts()
returns trigger language plpgsql as $$
begin
  if new.category = 'key_installation' then
    raise exception
      'key_installation is no longer a supported ticket category; see unify-work-tracking-model change (use operations.key_authorizations for install tracking).'
      using errcode = '22023';
  end if;
  return new;
end;
$$;

drop trigger if exists tickets_reject_key_installation_inserts on support.tickets;
create trigger tickets_reject_key_installation_inserts
  before insert on support.tickets
  for each row execute function support.tickets_reject_key_installation_inserts();


-- ============================================================
-- Step (c) — Soft-cancel existing open key_installation tickets
-- ============================================================
-- Cancel all open or in_progress key_installation tickets.
-- cancellation_reason is set in the same statement because
-- support.tickets_validate requires it non-null/non-empty when
-- status='cancelled' (fires on every UPDATE).
-- resolved_at uses COALESCE(resolved_at, now()) so existing
-- non-null resolved_at values are preserved (no separate
-- cancelled_at column exists; resolved_at is the terminal
-- timestamp for all terminal transitions).
-- State machine allows: open → cancelled, in_progress → cancelled.
-- Only rows in those states are matched by the WHERE clause.
-- ============================================================

update support.tickets
   set status             = 'cancelled',
       cancellation_reason = 'Auto-cancelled by unify-work-tracking-model migration; readiness now derived from key_authorizations',
       resolved_at        = coalesce(resolved_at, now())
 where category = 'key_installation'
   and status in ('open', 'in_progress');


-- ============================================================
-- Step (d) — Grandfather comment (no CHECK constraint change)
-- ============================================================
-- Decision: do NOT drop 'key_installation' from the CHECK domain.
--
-- Postgres re-validates ALL rows when ALTER TABLE ADD CONSTRAINT runs.
-- The soft-cancelled rows from step (c) still have category =
-- 'key_installation' (category is immutable after insert). Dropping
-- 'key_installation' from the CHECK would reject those historical rows
-- and force a hard delete — violating the audit-preservation requirement.
--
-- Enforcement of "no new key_installation tickets" is layered:
--   (b)  Chain trigger no longer spawns them (no auto-create path).
--   (b2) BEFORE INSERT trigger raises SQLSTATE 22023 on any direct insert.
--   TS   TareaRow.category union updated in the same change batch.
--
-- A future purge migration may delete historical rows and then tighten
-- the CHECK domain to remove 'key_installation' entirely.
-- ============================================================


-- ============================================================
-- Step (e) — Backfill: recompute status for actionable keys orders
-- ============================================================
-- Re-evaluate every keys order in a non-terminal actionable state.
-- This promotes orders that were parked behind ghost key_installation
-- tickets (now cancelled in step c) if all their key_authorizations
-- are 'installed'. It also demotes any wrongly-ready orders.
-- Mirrors the healing pattern from migration 000057 (STEP 4).
-- ============================================================

do $$
declare
  v_order_id uuid;
begin
  for v_order_id in
    select distinct oi.order_id
      from public.order_items oi
      join public.orders o on o.id = oi.order_id
     where oi.item_type = 'key'
       and o.status in ('confirmed', 'in_progress', 'ready_for_pickup')
  loop
    perform public.recompute_order_status(v_order_id);
  end loop;
end $$;
