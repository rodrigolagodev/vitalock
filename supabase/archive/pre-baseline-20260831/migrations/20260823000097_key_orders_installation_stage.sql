-- ============================================================
-- Migration: key_orders installation stage
-- ============================================================
-- Adds an explicit installation step to the key_orders lifecycle so that
-- "configure the key" (write RFID + register unit) no longer jumps straight
-- to "ready_for_pickup". The installer must first mark the key as installed
-- at the building reader.
--
-- Changes:
--   1. key_orders.status CHECK           += 'pending_installation'
--   2. key_order_items.status CHECK      += 'installed'
--   3. key_events.event_type CHECK       += 'installed'
--   4. recompute_key_order_status        — 4-lane state machine (see design)
--   5. NEW RPC mark_key_order_item_installed(uuid)
--
-- New state machine:
--   confirmed              → in_progress          : some pending, some configured/installed
--   confirmed/in_progress  → pending_installation : all items configured, none installed
--   pending_installation                          : mixed configured/installed
--   pending_installation   → ready_for_pickup     : all items installed
--   ready_for_pickup       → completed            : via record_order_key_pickup
--   completed              → invoiced             : via mark_key_order_invoiced
--   * (non-terminal)       → cancelled            : via cancel_key_order
--
-- Depends on: 20260818000087 (recompute_key_order_status, cancel trigger)
-- ============================================================

-- ============================================================
-- (1) Expand key_orders.status CHECK
-- ============================================================
alter table public.key_orders drop constraint key_orders_status_check;
alter table public.key_orders add constraint key_orders_status_check
  check (status in (
    'draft',
    'confirmed',
    'in_progress',
    'pending_installation',
    'ready_for_pickup',
    'completed',
    'invoiced',
    'cancelled'
  ));

-- ============================================================
-- (2) Expand key_order_items.status CHECK
-- ============================================================
alter table public.key_order_items drop constraint key_order_items_status_check;
alter table public.key_order_items add constraint key_order_items_status_check
  check (status in ('pending', 'configured', 'installed', 'cancelled'));

-- ============================================================
-- (3) Expand key_events.event_type CHECK
-- ============================================================
alter table public.key_events drop constraint key_events_event_type_check;
alter table public.key_events add constraint key_events_event_type_check
  check (event_type in (
    'activated',
    'deactivated',
    'creation_requested',
    'configured',
    'installed',
    'disable_requested',
    'disable_cancelled',
    'disabled',
    'snapshot_skipped'
  ));

-- ============================================================
-- (4) Rewrite recompute_key_order_status — 4-lane machine
-- ============================================================
create or replace function public.recompute_key_order_status(
  p_order_id uuid
) returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_status      text;
  v_pending     int;
  v_configured  int;
  v_installed   int;
begin
  select status
    into v_status
    from public.key_orders
   where id = p_order_id;

  if not found then
    return;
  end if;

  -- Only drive the active lanes; terminal/draft never auto-transition.
  if v_status not in ('confirmed', 'in_progress', 'pending_installation', 'ready_for_pickup') then
    return;
  end if;

  select
    count(*) filter (where status = 'pending'),
    count(*) filter (where status = 'configured'),
    count(*) filter (where status = 'installed')
    into v_pending, v_configured, v_installed
    from public.key_order_items
   where order_id = p_order_id;

  -- No non-cancelled items → nothing to drive.
  if (v_pending + v_configured + v_installed) = 0 then
    return;
  end if;

  if v_pending > 0 and (v_configured > 0 or v_installed > 0) then
    -- Mixed: at least one advanced, some still pending.
    update public.key_orders
       set status = 'in_progress'
     where id = p_order_id
       and status in ('confirmed', 'pending_installation', 'ready_for_pickup');

  elsif v_pending > 0 then
    -- Nothing advanced yet.
    update public.key_orders
       set status = 'confirmed'
     where id = p_order_id
       and status in ('in_progress', 'pending_installation', 'ready_for_pickup');

  elsif v_configured > 0 then
    -- All non-cancelled items configured (some possibly also installed).
    update public.key_orders
       set status = 'pending_installation'
     where id = p_order_id
       and status in ('confirmed', 'in_progress', 'ready_for_pickup');

  else
    -- v_configured = 0 and v_installed > 0 → all installed.
    update public.key_orders
       set status = 'ready_for_pickup'
     where id = p_order_id
       and status in ('confirmed', 'in_progress', 'pending_installation');
  end if;
end;
$$;

-- ============================================================
-- (5) mark_key_order_item_installed
-- ============================================================
-- Advances a configured key_order_item to 'installed' and activates its
-- produced RFID key (pending_installation → active). The order status
-- follows via the existing key_order_items_recompute_order_status trigger.
--
-- Preconditions:
--   * item.status = 'configured'
--   * item.produced_key_id is not null
--   * rfid_keys.status is 'pending_installation' (or already 'active' — idempotent)
create or replace function public.mark_key_order_item_installed(
  p_order_item_id uuid
) returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_status     text;
  v_key_id     uuid;
  v_key_status text;
begin
  -- Lock the item row.
  select status, produced_key_id
    into v_status, v_key_id
    from public.key_order_items
   where id = p_order_item_id
   for update;

  if not found then
    raise exception 'mark_key_order_item_installed: item % not found', p_order_item_id
      using errcode = 'P0001';
  end if;

  -- Idempotent no-op when already installed.
  if v_status = 'installed' then
    return;
  end if;

  if v_status <> 'configured' then
    raise exception 'mark_key_order_item_installed: item % is not configured (current: %)',
      p_order_item_id, v_status
      using errcode = 'P0001';
  end if;

  if v_key_id is null then
    raise exception 'mark_key_order_item_installed: item % has no produced key',
      p_order_item_id
      using errcode = 'P0001';
  end if;

  -- Advance the RFID key: pending_installation → active. If it was already
  -- active (e.g. via the resolve_equipment_* path), leave it alone.
  select status into v_key_status from public.rfid_keys where id = v_key_id for update;
  if v_key_status = 'pending_installation' then
    update public.rfid_keys set status = 'active' where id = v_key_id;
  end if;

  -- Audit event.
  insert into public.key_events (key_id, event_type, note)
    values (v_key_id, 'installed', 'Llave instalada en lector del edificio (key_order_item ' || p_order_item_id || ')');

  -- Advance the item; the AFTER UPDATE OF status trigger recomputes the order.
  update public.key_order_items
     set status = 'installed'
   where id = p_order_item_id;
end;
$$;

-- ============================================================
-- (6) Grants
-- ============================================================
grant execute on function public.mark_key_order_item_installed(uuid) to authenticated, service_role;
