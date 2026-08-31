-- ============================================================
-- particulares.status — soft-delete column
-- ============================================================
-- Follows the staff/units/administrations convention: soft-delete is a
-- `status` column ('active'/'inactive'), NOT a deleted_at timestamp.
--   * Deactivated particulares disappear from every consumer via an
--     `.eq('status', 'active')` filter (list page + selector).
--   * The row is preserved for audit/history (orders keep the flat
--     particular_* snapshot regardless).
--   * Existing rows default to 'active' so nothing breaks on deploy.

alter table public.particulares
  add column status text not null default 'active'
  check (status in ('active', 'inactive'));
