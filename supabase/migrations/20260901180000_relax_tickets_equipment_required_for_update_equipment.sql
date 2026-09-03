-- ============================================================================
-- Relax tickets_equipment_required CHECK to allow standalone update_equipment
-- ============================================================================
--
-- Context
-- -------
-- Migration 20260901140000_rename_ticket_categories_taxonomy.sql added the
-- CHECK constraint `tickets_equipment_required` to force install/replace/
-- update_equipment tickets to originate from a confirmed technical order:
--
--   CHECK (technical_order_item_id IS NOT NULL OR category = 'maintain_equipment')
--
-- That rule ignored a second legitimate origin for `update_equipment`:
-- key-order-driven updates. The `public.create_equipment_update` RPC (same
-- migration, line 996) inserts an `update_equipment` ticket WITHOUT a
-- `technical_order_item_id` because it is triggered from the equipment panel
-- when a key order leaves pending activations/disables on an equipment.
--
-- Result: the RPC failed with SQLSTATE 23514 the moment the operator pressed
-- "Crear tarea" in EquipmentUpdateFormSheet, surfacing as
-- "Validación fallida. Revisá los datos." in the admin UI.
--
-- Fix
-- ---
-- Allow both `maintain_equipment` and `update_equipment` as categories that
-- may exist without a technical_order_item_id. `install_equipment` and
-- `replace_equipment` remain FK-required — they have no other legitimate
-- origin.

ALTER TABLE support.tickets
  DROP CONSTRAINT IF EXISTS tickets_equipment_required;

ALTER TABLE support.tickets
  ADD CONSTRAINT tickets_equipment_required
  CHECK (
    technical_order_item_id IS NOT NULL
    OR category IN ('maintain_equipment', 'update_equipment')
  );
