-- ============================================================
-- Migration: key_events event_type CHECK expansion
-- ============================================================
-- Expands the event_type CHECK to include new lifecycle events.
-- Historical 'activated' and 'deactivated' events are preserved.
-- No trigger dependency — CHECK expansion only.
-- ============================================================

alter table public.key_events drop constraint key_events_event_type_check;
alter table public.key_events add constraint key_events_event_type_check
  check (event_type in (
    'activated',          -- historical: key went active
    'deactivated',        -- historical: key went non-active
    'creation_requested', -- configure_key_order_item: key minted as pending_creation
    'configured',         -- configure_key_order_item: key advanced to pending_installation
    'disable_requested',  -- request_key_disable: key moved to pending_disable
    'disable_cancelled',  -- cancel_key_disable: key moved back to active
    'disabled',           -- resolve_equipment_update: key moved to disabled
    'snapshot_skipped'    -- resolve_equipment_update: stale key skipped atomically
  ));
