# Proposal: technical-installation-stock-lifecycle

## Why

Manual E2E testing of the technical-order lifecycle uncovered four concrete bugs, all rooted in a single mapping gap: `item_type='installation'` items map to `category='installation'`, which is excluded from every stock and equipment side-effect that the sibling `equipment_installation` category already implements. The operational consequences are:

1. **Silent stock drift.** After the admin confirms a technical order containing an `installation` item, `products.stock_reservado` stays at `0` and no `reserva` row is written to `stock_movements`. The admin's inventory dashboard shows stock as available while it is committed to a scheduled installation.
2. **Silent ledger drift.** After the installer resolves the ticket, no `egreso_instalacion` and no `liberacion_reserva` movement is emitted. Physical stock leaves the warehouse but the ledger never records the outbound event, so `stock_total` and `stock_reservado` no longer reflect reality.
3. **Broken equipment configuration UX.** The admin cannot enter serial/model for `installation` tickets from `TareaDetailPage` (the two-step configure panel is gated to `equipment_installation`/`equipment_replacement`), and the installer cannot self-serve the same config from `TaskDetailPage`. The admin's fallback path (`createAndAssignEquipment`) links `tickets.equipment_id` but never writes back `technical_order_items.intended_equipment_id`, so the order item stays orphaned from the equipment it produced.
4. **Cross-app visibility gap.** Because the config never lands on `technical_order_items`, admin-side config does not reach the installer view, and installer-side config does not reach the admin dashboard.

The `equipment_installation` category already has the correct end-to-end behavior. Extending the same guards to `installation` closes all four gaps with a minimal, symmetric delta — no new subsystem, no data model migration.

## What Changes

**SQL (single delta migration)**

- Extend `configure_technical_ticket_equipment` guard from `category IN ('equipment_installation','equipment_replacement')` to also accept `'installation'`.
- Extend `resolve_ticket` side-effect block to run the same equipment-creation + stock-movement path for `category='installation'` as for `equipment_installation` (emit `egreso_instalacion` + `liberacion_reserva`, insert into `operations.equipment`).
- After the equipment INSERT, `resolve_ticket` writes `technical_order_items.intended_equipment_id`. Because `technical_order_items_intent_immutable` blocks writes to intent columns once the order leaves `draft`, add a new `set_config` bypass variable `app.allow_resolve_equipment_id_write` — recognized by the trigger and set by `resolve_ticket` only for its own scoped write.
- `confirm_technical_order` requires no RPC change: it already emits `reserva` when `product_id IS NOT NULL`. The form must supply `product_id`.

**Admin app (`apps/admin`)**

- `TechnicalOrderForm` / `TechnicalItemEquipmentField`: render a `product_id` selector for `itemType === 'installation'` (filtered to equipment-category products); zod schema requires it on submit.
- `TareaDetailPage`: add `'installation'` to `CATEGORIES_TWO_STEP_CONFIGURE`.
- `ConfigureEquipmentPanel`: extend its category union and heading/help copy maps to include `'installation'`.

**Installer app (`apps/installer`)**

- `TicketCard`: add `'installation'` to `TWO_STEP_CATEGORIES` so the ticket surfaces the configure/resolve two-step affordance instead of the batch-pool affordance.
- `TaskDetailPage`: extend the `ConfigureEquipmentInline` category gate to include `'installation'`.

## Impact

**Files / systems**

- 1 new SQL migration under `supabase/migrations/` (extends 2 functions + 1 trigger; no schema DDL, no data backfill).
- `apps/admin`: 3 files (`TechnicalOrderForm.tsx`, `TareaDetailPage.tsx`, `ConfigureEquipmentPanel.tsx`).
- `apps/installer`: 2 files (`TicketCard.tsx`, `TaskDetailPage.tsx`).
- Tests: extend existing Vitest coverage for `ConfigureEquipmentPanel`, `ConfigureEquipmentInline`, and `useConfigureTechnicalTicketEquipment` to include the `installation` category. No pgTAP infra exists today; SQL verification will be a documented manual repro checklist (create order → confirm → assert `stock_movements` reserva → resolve → assert `egreso_instalacion` + `liberacion_reserva` + `technical_order_items.intended_equipment_id`).

**PR shape**

- Estimated ~500–700 changed lines. Fits the 800-line review budget. Single PR, single delta migration.

**Runtime / data**

- No downtime, no data migration, no backfill. New logic is idempotent on new inserts; already-resolved legacy `installation` tickets keep their historical state (documented in Non-goals).

## Success Criteria

Verifiable end-to-end against the production DB shape:

1. Admin confirms a technical order that contains an `installation` item with `product_id` set → `stock_movements` contains one `reserva` row for that item and `products.stock_reservado` increases by the reserved quantity.
2. Admin or installer opens the ticket and configures serial/model → `configure_technical_ticket_equipment` succeeds without raising the category guard; `support.tickets.pending_new_serial` / `pending_new_model` populate.
3. Installer resolves the ticket → `resolve_ticket` inserts into `operations.equipment`, emits one `egreso_instalacion` and one `liberacion_reserva` in `stock_movements`, updates `products.stock_total` and `products.stock_reservado` accordingly, and writes `technical_order_items.intended_equipment_id` with the new equipment's id.
4. Existing Vitest suites remain green. New Vitest cases assert that admin + installer components render the configure-panel path when `category === 'installation'`.
5. Manual verification checklist (committed with the change) passes on a local Supabase stack.

## Non-goals

- **Key orders lifecycle** (`key_installation`, `key_configuration`) — separate flow, not touched here.
- **Migration to a pool-based equipment model** (Flujo B in exploration) — explicitly deferred.
- **Backfill of legacy `installation` tickets** — historical rows remain as-is; the new logic applies only to tickets that transition through configure/resolve after the migration.
- **Per-serial traceability of equipment SKUs from purchase** — would require `product_id` on `operations.equipment`; explicitly rejected in Flujo A.
- **Adding a `pending_access_type` column** — installer types `access_type` directly in the resolve panel, matching the existing `equipment_installation` flow.
- **Standing up pgTAP infrastructure as a general test framework** — out of scope; the manual verification checklist is the immediate substitute.

## Risks

1. **[TOP RISK] Intent-immutable trigger bypass.** `technical_order_items_intent_immutable` currently blocks writes to `intended_equipment_id` outside `draft`. Adding `app.allow_resolve_equipment_id_write` as a bypass is the correct pattern (mirrors `app.allow_installer_equipment_swap`), but any code path that sets that GUC outside `resolve_ticket` would silently subvert intent-immutability guarantees. Mitigation: the bypass is only set inside `resolve_ticket`, scoped to the single UPDATE, and reset immediately after; document the pattern in the migration comment; assert in code review that no client-side code touches the GUC.
2. **No DB-level automated regression coverage.** Without pgTAP, a future refactor could re-break the category guard without any test tripping. Mitigation: commit a manual verification checklist and cover the RPC surface via extended Vitest integration tests where feasible.
3. **`product_id` requirement is a form contract change.** Admins creating an `installation` item in existing draft orders will now see a required field that previously did not exist. Mitigation: since draft orders are user-owned and short-lived, and the field is inline in the same form, no data migration is needed; the new field simply must be filled before confirm.
4. **Symmetric extension assumption.** Flujo A assumes `installation` and `equipment_installation` should behave identically end-to-end. If future product requirements diverge (e.g. `installation` needs a separate movement type), the guards will need to fork. Mitigation: keep the guard as an explicit `IN` list, not a fall-through default, so a future divergence is a visible, single-point edit.

## Ready for Spec/Design

Yes. Scope is decided (Flujo A, user-confirmed), integration points are mapped in `exploration.md`, and the delta is bounded to a single migration + 5 UI files. `sdd-spec` and `sdd-design` can proceed in parallel.

## Key Learnings

1. All four production bugs collapse to a single root cause: the `item_type='installation'` → `category='installation'` mapping in `confirm_technical_order` places the item outside every downstream category guard, so extending guards (not adding logic) is the correct minimum-delta shape.
2. Stock reservation at confirm is already conditional on `product_id IS NOT NULL`; the admin form — not the RPC — is what withholds `product_id` for installation items today.
3. `technical_order_items_intent_immutable` has no bypass path for `intended_equipment_id`; adding a scoped `set_config` bypass in `resolve_ticket` is required and must be treated as the highest-risk change in the migration.
4. The admin fallback (`createAndAssignEquipment`) links `tickets.equipment_id` but not `technical_order_items.intended_equipment_id`, which is why admin-configured serials never surfaced in the order item — the missing back-write is a distinct bug from the missing stock movements.
5. Extending guards symmetrically with `equipment_installation` keeps future divergence explicit: an `IN` list is the honest signal that these two categories currently share behavior by choice, not by accident.
