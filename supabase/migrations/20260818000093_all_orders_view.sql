-- ============================================================
-- Migration: public.all_orders VIEW — cross-context reporting (PR-3 / W7)
-- ============================================================
-- Creates a unified read-only reporting surface that UNION ALLs
-- public.key_orders and public.technical_orders.
--
-- Design reference: design.md §6 (Reporting VIEW definition)
-- Spec reference: spec #225 (all-orders-view)
--
-- Key decisions:
--   - SECURITY INVOKER: the VIEW inherits the caller's identity so
--     base-table RLS policies apply transparently. Caller sees only
--     what they are permitted to see on key_orders / technical_orders.
--   - PII excluded: particular_dni, particular_phone, particular_email
--     are NOT projected by the VIEW (spec #225 requirement).
--   - particular_full_name is projected: it is a display name (non-PII)
--     used by the /historial list surface to show the order owner.
--   - INSERT/UPDATE/DELETE are explicitly REVOKEd from authenticated
--     and public. PostgreSQL prevents direct writes to a UNION ALL VIEW
--     anyway, but explicit REVOKE documents the intent.
--   - No RLS policy on the VIEW itself — base-table policies govern access.
--   - Indexes: created_at DESC indexes on both base tables provide
--     cheap ordering for the reporting surface. Check if they already
--     exist before creating.
--
-- Rollback: DROP VIEW public.all_orders;
-- ============================================================

-- ============================================================
-- Ensure created_at indexes exist on both base tables for cheap ordering.
-- CREATE INDEX IF NOT EXISTS is idempotent.
-- ============================================================

create index if not exists key_orders_created_at_idx
  on public.key_orders (created_at desc);

create index if not exists technical_orders_created_at_idx
  on public.technical_orders (created_at desc);

-- ============================================================
-- CREATE OR REPLACE the VIEW
-- ============================================================

create or replace view public.all_orders as
  select
    ko.id,
    ko.order_number,
    'key'::text                   as order_kind,
    ko.client_type,
    ko.administration_id,
    ko.particular_id,
    ko.particular_full_name,
    ko.status,
    ko.notes,
    ko.created_at,
    ko.updated_at
  from public.key_orders ko
  union all
  select
    tor.id,
    tor.order_number,
    'technical'::text             as order_kind,
    tor.client_type,
    tor.administration_id,
    tor.particular_id,
    tor.particular_full_name,
    tor.status,
    tor.notes,
    tor.created_at,
    tor.updated_at
  from public.technical_orders tor;

-- ============================================================
-- SECURITY INVOKER — caller's RLS identity applies to base tables
-- ============================================================

alter view public.all_orders set (security_invoker = on);

-- ============================================================
-- Explicit REVOKE of write permissions (documents read-only intent)
-- ============================================================

revoke insert, update, delete on public.all_orders from public, authenticated;

-- ============================================================
-- Grant SELECT to authenticated
-- ============================================================

grant select on public.all_orders to authenticated;

-- ============================================================
-- Comment documents the invariants enforced above
-- ============================================================

comment on view public.all_orders is
  'Read-only unified reporting surface across key_orders and technical_orders. '
  'SECURITY INVOKER: base-table RLS applies to the caller. '
  'PII columns (particular_dni, particular_phone, particular_email) are excluded — '
  'see spec #225. Never used as a FK target. '
  'Used by /historial and future facturación aggregates.';
