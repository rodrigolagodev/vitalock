-- ============================================================
-- Cross-schema view: support.technical_order_tickets
-- ============================================================
-- Collapses the two-step read in
--   apps/admin/src/hooks/useTechnicalOrderTickets.ts
--   (public.technical_order_items → support.tickets)
-- into one round-trip keyed on technical_order_id.
--
-- SECURITY INVOKER: admin already has SELECT on both
-- public.technical_order_items and support.tickets (proven by
-- the current two-step read). Installer has no legitimate use
-- case for this admin surface; INVOKER naturally scopes them
-- to whatever support.tickets RLS already allows them to see.
--
-- LEFT JOIN: preserves tickets whose linked item was soft-deleted
-- or is otherwise absent; those rows surface with
-- technical_order_id = NULL. The caller's .eq filter excludes them.
--
-- No wildcard SELECT: every column is enumerated so future
-- additions to support.tickets do not silently widen the surface.

CREATE OR REPLACE VIEW support.technical_order_tickets
WITH (security_invoker = true) AS
SELECT
  t.id,
  t.ticket_number,
  t.category,
  t.status,
  t.description,
  t.technical_order_item_id,
  t.assigned_to_staff_id,
  t.created_at,
  t.resolved_at,
  toi.order_id AS technical_order_id
FROM support.tickets t
LEFT JOIN public.technical_order_items toi
  ON toi.id = t.technical_order_item_id;

GRANT SELECT ON support.technical_order_tickets TO authenticated;
