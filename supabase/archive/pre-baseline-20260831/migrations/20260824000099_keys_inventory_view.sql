-- ============================================================
-- Migration: public.keys_inventory VIEW
-- ============================================================
-- Creates a read-only inventory surface for rfid_keys that pre-joins
-- the location chain (units → buildings → administrations), the currently
-- active key_authorization (sync_state='installed'), and the latest
-- active key_order (non-terminal status) for each key.
--
-- Design reference: design obs #257 §2.2 (admin-navigation-object-model)
-- Spec reference: spec obs #256 Capability 1 + Capability 6
--
-- Key decisions:
--   - SECURITY INVOKER: VIEW inherits the caller's RLS identity so that
--     base-table policies apply transparently. Admin staff see all rows;
--     anon (empty JWT) sees zero rows.
--   - LATERAL joins for one-to-latest: picks the most-recently installed
--     active key_authorization and the most-recently created active order.
--   - Active key_authorization = sync_state='installed' AND removed_at IS NULL.
--   - Active order = status NOT IN ('completed', 'invoiced', 'cancelled').
--   - The ORDER BY created_at DESC on the active_order LATERAL ensures that
--     when multiple non-terminal orders exist for the same key, the newest wins.
--   - INSERT/UPDATE/DELETE explicitly REVOKEd from public and authenticated.
--
-- Schema notes (vs. design doc):
--   - rfid_keys.unit_id is NOT NULL in the live schema (no key_type/XOR FK).
--     All keys are unit-scoped; the JOIN chain rk → units → buildings →
--     administrations always resolves.
--   - key_order_items.produced_key_id is the FK to rfid_keys (not rfid_key_id).
--   - key_order_items.order_id is the FK to key_orders (not key_order_id).
--
-- Rollback: DROP VIEW public.keys_inventory;
-- ============================================================

CREATE OR REPLACE VIEW public.keys_inventory AS
SELECT
  rk.id,
  rk.rfid_code,
  rk.status                     AS physical_status,
  u.id                          AS unit_id,
  u.number                      AS unit_number,
  b.id                          AS building_id,
  b.name                        AS building_name,
  adm.id                        AS administration_id,
  adm.company_name              AS administration_company_name,
  active_ka.equipment_id,
  active_ka.equipment_serial_number,
  active_ka.equipment_model,
  active_order.active_order_id,
  active_order.active_order_status
FROM public.rfid_keys rk
LEFT JOIN public.units u
  ON u.id = rk.unit_id
LEFT JOIN public.buildings b
  ON b.id = u.building_id
LEFT JOIN public.administrations adm
  ON adm.id = b.administration_id
LEFT JOIN LATERAL (
  SELECT
    ka.equipment_id,
    e.serial_number  AS equipment_serial_number,
    e.model          AS equipment_model
  FROM operations.key_authorizations ka
  JOIN operations.equipment e
    ON e.id = ka.equipment_id
  WHERE ka.rfid_key_id = rk.id
    AND ka.sync_state  = 'installed'
    AND ka.removed_at  IS NULL
  ORDER BY ka.installed_at DESC NULLS LAST
  LIMIT 1
) active_ka ON true
LEFT JOIN LATERAL (
  SELECT
    ko.id     AS active_order_id,
    ko.status AS active_order_status
  FROM public.key_orders ko
  JOIN public.key_order_items koi
    ON koi.order_id = ko.id
  WHERE koi.produced_key_id = rk.id
    AND ko.status NOT IN ('completed', 'invoiced', 'cancelled')
  ORDER BY ko.created_at DESC
  LIMIT 1
) active_order ON true;

-- ============================================================
-- SECURITY INVOKER — caller's RLS identity applies to base tables
-- ============================================================

ALTER VIEW public.keys_inventory SET (security_invoker = on);

-- ============================================================
-- Explicit REVOKE of write permissions (documents read-only intent)
-- ============================================================

REVOKE INSERT, UPDATE, DELETE ON public.keys_inventory FROM public, authenticated;

-- ============================================================
-- Grant SELECT to authenticated
-- ============================================================

GRANT SELECT ON public.keys_inventory TO authenticated;

-- ============================================================
-- Comment documents the invariants enforced above
-- ============================================================

COMMENT ON VIEW public.keys_inventory IS
  'Read-only inventory surface for rfid_keys. '
  'SECURITY INVOKER — base-table RLS applies to caller. '
  'Vitalock admin app is single-tenant: all authenticated users are Vitalock staff '
  'with full-system read access. RLS boundary is authenticated vs anon only. '
  'Projects active key_authorization (sync_state=''installed'') as equipment columns. '
  'Projects the latest non-terminal key_order as active_order_id / active_order_status. '
  'Never used as a FK target.';
