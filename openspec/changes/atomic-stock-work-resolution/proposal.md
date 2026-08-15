# Proposal: Atomic Stock Work Resolution

## Intent

Every ticket that reserves stock must produce a symmetric definitive egress plus a `liberacion_reserva` when the work completes, in a single atomic transaction. Today, `equipment_installation` and `equipment_replacement` tickets leave `reserva` movements dangling forever because completion runs through the generic `resolve_ticket` path with no stock side-effects. The stock ledger drifts, and the installer app offers batch-resolution for tickets that only the admin can atomically complete. This change closes the gap by aligning equipment flows with the existing atomic pattern of `configure_key_order_item`.

## Scope

### In Scope

- Single DB migration `supabase/migrations/20260812000061_atomic_stock_work_resolution.sql`:
  - Extend `public.stock_movements.type` CHECK constraint to include `egreso_reemplazo`.
  - Create `public.resolve_equipment_replacement(...) returns uuid`, mirroring `resolve_equipment_installation` and delegating the swap to `operations.replace_equipment`.
  - Backfill DO block for historical resolved `equipment_installation` tickets whose `reserva` never got a matching `egreso_instalacion` + `liberacion_reserva`.
- Admin client (`apps/admin`):
  - Add `useResolveEquipmentInstallation` (wraps `resolve_equipment_installation` RPC).
  - Add `useResolveEquipmentReplacement` (wraps new `resolve_equipment_replacement` RPC).
  - Retire `useMutateTicketEquipment.createAndAssignEquipment` and `.replaceEquipmentInTicket`; keep `assignExistingEquipment` for maintenance.
  - `AssignEquipmentDialog` calls the new atomic hooks and becomes the completion step (no separate ticket-resolve call afterwards).
- Installer client (`apps/installer`):
  - Extend `AssignedTicket` type to expose `category`.
  - `TicketsSection` filters `equipment_installation` and `equipment_replacement` out of the batch-resolve toolbar and renders them as read-only "Pendiente de admin" cards.
  - `useResolveTickets` keeps its signature; new invariant is that callers must only invoke it for stock-neutral categories (`maintenance`, `installation`).
- New SQL smoke test `supabase/tests-sql/test_atomic_stock_work_resolution.sql` covering both new admin flows and backfill idempotency.

### Out of Scope

- Any new tables or schema changes beyond the `stock_movements.type` CHECK extension.
- Changes to `configure_key_order_item` or the keys flow (already correct).
- DB-level rejection of `resolve_ticket` for stock categories (Option 5, deferred as defense-in-depth follow-up).
- Consolidating `installation` and `equipment_installation` into a single category (Option 3, rejected).
- Changes to `key_authorizations` state machine or the just-archived `unify-work-tracking-model` outcomes.
- Adding a proper `operations.equipment.unit_id` column; `p_unit_id` continues to be stored in `equipment.notes` as today.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `stock-inventory`: introduce `egreso_reemplazo` movement type and require atomic emission of `egreso_instalacion|egreso_reemplazo` + `liberacion_reserva` on equipment ticket resolution.
- `tickets`: `equipment_installation` and `equipment_replacement` tickets are resolved by the admin through category-specific atomic RPCs; generic `resolve_ticket` is reserved for stock-neutral categories.
- `ordenes-admin`: admin completion of equipment orders goes through the new atomic RPCs from `AssignEquipmentDialog`.
- `worklist` (installer): batch-resolve toolbar excludes stock-backed equipment categories; those tickets appear as read-only "Pendiente de admin".
- `equipment-admin`: creation and replacement of `operations.equipment` for tickets is delegated to atomic public RPCs instead of two-step client mutations.

## Approach

After the change, admin opens an `equipment_installation` or `equipment_replacement` ticket, `AssignEquipmentDialog` collects the serial (plus new-equipment data for replacement), and one RPC call materializes the equipment row, emits the exact stock movements (`egreso_instalacion|egreso_reemplazo` + `liberacion_reserva` when `product_id IS NOT NULL`), migrates key authorizations if applicable, and resolves the ticket via the two-step state machine — all in one transaction. The installer app no longer displays these tickets as batch-resolvable, eliminating misroute risk. `maintenance` and `installation` continue through the generic `resolve_ticket` path unchanged. TypeScript exhaustive dispatch enforces one hook per category at compile time.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `supabase/migrations/20260812000061_atomic_stock_work_resolution.sql` | New | CHECK extension + new RPC + backfill |
| `supabase/tests-sql/test_atomic_stock_work_resolution.sql` | New | Smoke test both flows + backfill idempotency |
| `apps/admin/src/hooks/useResolveEquipmentInstallation.ts` | New | Wraps `resolve_equipment_installation` |
| `apps/admin/src/hooks/useResolveEquipmentReplacement.ts` | New | Wraps `resolve_equipment_replacement` |
| `apps/admin/src/hooks/useMutateTicketEquipment.ts` | Modified | Retire `createAndAssignEquipment` and `replaceEquipmentInTicket`; keep `assignExistingEquipment` |
| `apps/admin/src/components/tareas/AssignEquipmentDialog.tsx` | Modified | Route to category-specific atomic RPC; becomes completion step |
| `apps/admin/src/routes/tareas/TareaDetailPage.tsx` | Modified | Minimal wiring change |
| `apps/installer/src/hooks/useAssignedTickets.ts` | Modified | Expose `category` on `AssignedTicket` |
| `apps/installer/src/hooks/useResolveTickets.ts` | Unchanged signature | New invariant: stock-neutral categories only |
| `apps/installer/src/components/work/TicketsSection.tsx` | Modified | Filter equipment categories out of batch toolbar; show as read-only |

## Migration and Data Plan

Order inside `20260812000061_atomic_stock_work_resolution.sql`:

1. Extend CHECK constraint on `public.stock_movements.type` to include `egreso_reemplazo`.
2. `CREATE OR REPLACE FUNCTION public.resolve_equipment_replacement(...)` mirroring `resolve_equipment_installation`.
3. Backfill DO block: for every resolved `equipment_installation` ticket with a `reserva` movement and no existing `egreso_instalacion`/`liberacion_reserva`, insert both entries. Idempotency guard: `WHERE NOT EXISTS (SELECT 1 FROM stock_movements m2 WHERE m2.ticket_id = t.id AND m2.type IN ('egreso_instalacion','liberacion_reserva'))`.

No down migration file (Supabase CLI convention). App is not in production, so backfill risk is manageable.

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| `operations.replace_equipment` uses `CREATE TEMP TABLE ON COMMIT DROP`; nesting inside the new RPC's transaction | Low | Explicit SQL smoke test path for `equipment_replacement`; PostgreSQL supports this composition |
| Backfill idempotency assumes no ad-hoc manual movements | Low | Non-production; guard checks both `egreso_instalacion` and `liberacion_reserva` presence |
| Installer UI still routes an equipment ticket to generic `resolve_ticket` | Low | TS exhaustive switch + `TicketsSection` filter; RPC raises P0001 on wrong category as safety net |
| `p_unit_id` still stored in `equipment.notes` (no dedicated column) | Low | Pre-existing limitation; noted as follow-up |
| CHECK constraint extension collides with a concurrent pending migration | Very Low | Only pending migration in the tree; visual audit before apply |

## Rollback Plan

- DB: write a manual rollback migration that (a) drops `public.resolve_equipment_replacement`, (b) restores the prior `stock_movements.type` CHECK constraint (dropping `egreso_reemplazo`), and (c) deletes backfilled `egreso_instalacion`/`liberacion_reserva` movements identified by the exact backfill window (safe because app is not in production). Historical `reserva` orphans return to their prior state.
- App: revert the admin and installer commits; `useMutateTicketEquipment.createAndAssignEquipment` and `.replaceEquipmentInTicket` return; `useResolveTickets` again handles all categories (regressing the stock gap).

## Dependencies

- Depends on merged `resolve_equipment_installation` RPC from migration `20260811000041`.
- Depends on merged `operations.replace_equipment` RPC from migration `20260807000010`.
- Does not depend on any pending migration.

## Non-Goals / Follow-ups

- DB guard on `resolve_ticket` for stock categories (defense-in-depth, Option 5).
- Add `operations.equipment.unit_id` column to remove the `notes`-only stopgap for `p_unit_id`.
- Extract a shared PL/pgSQL helper for the "resolve ticket + emit egreso + liberacion" pattern once a third RPC would benefit.

## Success Criteria

- [ ] Confirming a technical order with `item_type=equipment` and completing via `AssignEquipmentDialog` produces exactly one `reserva`, one `egreso_instalacion`, and one `liberacion_reserva` per `order_item`.
- [ ] Confirming an order that triggers `equipment_replacement` and completing via `AssignEquipmentDialog` produces exactly one `reserva`, one `egreso_reemplazo`, and one `liberacion_reserva`; old equipment is `dead`; new equipment is `active`; `key_authorizations` are migrated.
- [ ] Installer app does not show `equipment_installation` or `equipment_replacement` tickets in the batch-resolve toolbar; they appear as read-only "Pendiente de admin".
- [ ] Historical resolved `equipment_installation` tickets in the DB have matching `egreso_instalacion` + `liberacion_reserva` movements after backfill.
- [ ] Existing SQL smoke tests still pass; new `test_atomic_stock_work_resolution.sql` covers both new RPCs and backfill idempotency (re-running the backfill is a no-op).
