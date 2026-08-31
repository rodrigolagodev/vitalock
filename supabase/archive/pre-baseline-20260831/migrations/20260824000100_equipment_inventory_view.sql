-- ============================================================
-- Migration: public.equipment_inventory SECURITY INVOKER VIEW
-- Slice 2 / admin-navigation-object-model
-- ============================================================
-- One row per operations.equipment. Aggregates active key_authorizations
-- (sync_state = 'installed' AND removed_at IS NULL) into key_count, key_ids,
-- and key_labels. Mirrors the pattern of public.keys_inventory (migration 099).
-- ============================================================

CREATE OR REPLACE VIEW public.equipment_inventory AS
SELECT
  e.id,
  e.serial_number,
  e.model,
  e.status,
  e.access_type,
  b.id   AS building_id,
  b.name AS building_name,
  b.administration_id,
  adm.company_name AS administration_company_name,
  COALESCE(ka_agg.key_count, 0)             AS key_count,
  COALESCE(ka_agg.key_ids,   '{}'::uuid[])  AS key_ids,
  COALESCE(ka_agg.key_labels, '{}'::text[]) AS key_labels
FROM operations.equipment e
LEFT JOIN public.buildings b
  ON b.id = e.building_id
LEFT JOIN public.administrations adm
  ON adm.id = b.administration_id
LEFT JOIN LATERAL (
  SELECT
    COUNT(*)                                        AS key_count,
    array_agg(DISTINCT ka.rfid_key_id)              AS key_ids,
    array_agg(rk.rfid_code ORDER BY rk.rfid_code)  AS key_labels
  FROM operations.key_authorizations ka
  JOIN public.rfid_keys rk ON rk.id = ka.rfid_key_id
  WHERE ka.equipment_id = e.id
    AND ka.sync_state   = 'installed'
    AND ka.removed_at   IS NULL
) ka_agg ON true;

ALTER VIEW public.equipment_inventory SET (security_invoker = on);

REVOKE INSERT, UPDATE, DELETE ON public.equipment_inventory FROM public, authenticated;
GRANT SELECT ON public.equipment_inventory TO authenticated;

COMMENT ON VIEW public.equipment_inventory IS
  'Read-only inventory surface for operations.equipment. SECURITY INVOKER — base-table RLS applies to caller. Aggregates active key_authorizations into key_count/key_ids/key_labels. Never used as FK target.';
