-- ============================================================
-- technical_order_items: let maintenance items carry unit_price = 0
-- ============================================================
-- Migration 20260901150000 (allow_zero_price_for_maintenance) implemented the
-- business rule "maintenance visits on the monthly plan are free" inside
-- create_technical_order_with_items, and stated that no CHECK constraint
-- change was needed. That was wrong: the baseline row-level constraint
-- `technical_order_items_unit_price_check CHECK (unit_price > 0)` was left in
-- place, so the RPC's `coalesce(..., 0)` for maintenance items hits a 23514
-- check violation. The feature never worked end to end.
--
-- Surfaced by wiring the pgTAP suite into CI: the first run against the
-- current schema failed on exactly this path.
--
-- Fix: encode the documented rule at the row level, so it holds regardless of
-- which code path inserts the row (defence in depth, consistent with the
-- repo's DB-enforced-invariants convention):
--   - maintain_equipment: unit_price >= 0
--   - install_equipment / replace_equipment: unit_price > 0
-- ============================================================

alter table public.technical_order_items
  drop constraint if exists technical_order_items_unit_price_check;

alter table public.technical_order_items
  add constraint technical_order_items_unit_price_check check (
    (item_type = 'maintain_equipment' and unit_price >= 0)
    or (item_type <> 'maintain_equipment' and unit_price > 0)
  );

comment on constraint technical_order_items_unit_price_check on public.technical_order_items is
  'Maintenance items may be free (>= 0, monthly plan); install/replace items are billable (> 0).';
