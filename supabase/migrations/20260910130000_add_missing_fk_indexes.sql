-- ============================================================
-- Covering indexes for the 8 foreign keys that had none (P2-4)
-- ============================================================
-- Reported by Supabase's performance advisor (`unindexed_foreign_keys`) and
-- confirmed against pg_constraint/pg_index locally. Without these, a DELETE or
-- UPDATE of the referenced row (a staff member, a particular, a key, a unit)
-- forces a sequential scan of the referencing table to check the FK, and the
-- common "everything this actor did" / "everything for this particular"
-- lookups scan too.
--
-- All are actor/audit or lookup columns on tables that will grow linearly with
-- operations (audit_log, key_events, equipment_updates, order items), so the
-- cost of maintaining the index is small next to the scan it removes.
--
-- Deliberately NOT done here: consolidating the 14 "multiple permissive
-- policies" pairs (admin_all_X + installer_read_X). They are correct, readable,
-- referenced by name in the pgTAP suite and FLOWS.md, and both predicates are
-- cheap STABLE lookups — the per-row cost is not measurable at current volume.
-- ============================================================

create index if not exists audit_log_actor_id_idx
  on identity.audit_log (actor_id);

create index if not exists key_events_actor_staff_id_idx
  on public.key_events (actor_staff_id);

create index if not exists key_order_items_pickup_particular_id_idx
  on public.key_order_items (pickup_particular_id);

create index if not exists key_order_items_produced_key_id_idx
  on public.key_order_items (produced_key_id);

create index if not exists key_order_items_unit_id_idx
  on public.key_order_items (unit_id);

create index if not exists key_orders_pickup_particular_id_idx
  on public.key_orders (pickup_particular_id);

create index if not exists equipment_updates_created_by_staff_id_idx
  on support.equipment_updates (created_by_staff_id);

create index if not exists equipment_updates_resolved_by_staff_id_idx
  on support.equipment_updates (resolved_by_staff_id);
