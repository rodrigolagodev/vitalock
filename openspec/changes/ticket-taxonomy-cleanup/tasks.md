# Tasks: ticket-taxonomy-cleanup

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 700–900 (as stated in proposal) |
| 800-line budget risk | High |
| Chained PRs recommended | No — single-pr strategy; size:exception required |
| Suggested split | Single PR (size:exception acknowledged in proposal) |
| Delivery strategy | single-pr |
| Chain strategy | size-exception |

Decision needed before apply: Yes
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: High

> **Note**: `single-pr` + High risk = `Decision needed before apply: Yes`. The proposal already acknowledges ~700–900 lines and `size:exception`. Confirm the exception is on record before `sdd-apply` starts.

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | SQL delta + DB constraints | PR 1 (single) | `supabase db reset && supabase db push` | `psql` assertion queries per spec scenarios | Drop migration file; re-run reset |
| 2 | Admin + installer UI renames | PR 1 (single) | `pnpm --filter admin test` + `pnpm --filter installer test` | Manual: open TareaFormSheet, TicketCard, TareasTable | Revert 8+4 files independently |
| 3 | Test file renames | PR 1 (single) | `pnpm test` (full suite) | N/A — unit tests only | Revert test files; production code unaffected |

---

## Phase 1: SQL Delta Migration

- [x] 1.1 Create `supabase/migrations/<wall-clock-timestamp>_rename_ticket_categories_taxonomy.sql` with timestamp > `20260901120000` (e.g. `20260831150000` is invalid; use actual authoring timestamp).
- [x] 1.2 **Step 1** — Add `RAISE NOTICE` pre-counts per old category value on `support.tickets` (5 values).
- [x] 1.3 **Step 2** — `ALTER TABLE support.tickets DISABLE TRIGGER ALL` (bypasses `tickets_validate` immutability guard).
- [x] 1.4 **Step 3** — `UPDATE support.tickets SET category = CASE … END` mapping: `installation`→`install_equipment`, `equipment_installation`→`install_equipment`, `equipment_replacement`→`replace_equipment`, `equipment_update`→`update_equipment`, `maintenance`→`maintain_equipment`.
- [x] 1.5 **Step 4** — `ALTER TABLE support.tickets ENABLE TRIGGER ALL`.
- [x] 1.6 **Step 5** — Guard assertion `DO $$ … RAISE EXCEPTION IF old values remain $$` (ref Decision 2 guard SQL).
- [x] 1.7 **Step 6** — `ALTER TABLE support.tickets DROP CONSTRAINT <old-check>`.
- [x] 1.8 **Step 7** — `ALTER TABLE support.tickets ADD CONSTRAINT … CHECK (category IN ('install_equipment','replace_equipment','update_equipment','maintain_equipment'))`.
- [x] 1.9 **Step 8** — `ALTER TABLE support.tickets ADD CONSTRAINT tickets_equipment_required CHECK (technical_order_item_id IS NOT NULL OR category = 'maintain_equipment')`.
- [x] 1.10 **Step 9** — `ALTER TABLE technical_order_items DROP CONSTRAINT <old-item_type-check>; ADD CONSTRAINT … CHECK (item_type IN ('install_equipment','replace_equipment','maintain_equipment'))`.
- [x] 1.11 **Step 10** — `DROP TRIGGER tickets_reject_key_installation_inserts ON support.tickets; DROP FUNCTION` its backing function.
- [x] 1.12 **Step 11** — `CREATE OR REPLACE` trigger functions `tickets_require_equipment_on_resolve` and `tickets_block_equipment_update_cancel_in_progress` with new category names.
- [x] 1.13 **Step 12a** — Read `20260901120000_extend_installation_category_lifecycle.sql` verbatim and copy `configure_technical_ticket_equipment` body; swap old category literals to new; `CREATE OR REPLACE FUNCTION`. Guard: category IN `('install_equipment','replace_equipment')`.
- [x] 1.14 **Step 12b** — Read `20260901120000_extend_installation_category_lifecycle.sql` verbatim and copy `resolve_ticket` body; swap `'installation'`/`'equipment_installation'` → `'install_equipment'`; `CREATE OR REPLACE FUNCTION`.
- [x] 1.15 **Step 12c** — `CREATE OR REPLACE` remaining RPCs from baseline with literal swaps: `resolve_equipment_installation`, `resolve_equipment_replacement`, `resolve_equipment_update`, `add_technical_order_item` (validate against new 3-value set), `create_equipment_update`.
- [x] 1.16 **Step 12d** — `CREATE OR REPLACE confirm_technical_order` with `v_category := v_item.item_type` (identity assignment, no CASE).
- [x] 1.17 **Step 13** — Update `COMMENT ON COLUMN` for `support.tickets.category` and `technical_order_items.item_type`.
- [x] 1.18 **Step 14** — Post-migration assertion: `DO $$ … ASSERT total_rows_before = total_rows_after AND zero_old_value_rows $$`.
- [x] 1.19 Verify migration runs cleanly via `supabase db reset` on a fresh local stack. Confirm: 2 rows become `install_equipment`; `SELECT category, count(*) FROM support.tickets GROUP BY category` returns exactly `install_equipment | 2`.

---

## Phase 2: Admin UI Renames (8 files — parallelizable within phase)

- [x] 2.1 `apps/admin/src/hooks/useTareas.ts` — Update `TareaRow.category` TypeScript union to 4 new values: `'install_equipment' | 'replace_equipment' | 'update_equipment' | 'maintain_equipment'`. Remove old values.
- [x] 2.2 `apps/admin/src/components/tareas/TareaFormSheet.tsx` — (a) Rename `CATEGORY_LABELS` keys to 4 new values. (b) Replace `CREATE_CATEGORY_LABELS` with `{ maintain_equipment: 'Mantenimiento' }` only. (c) Zod create schema: `z.literal('maintain_equipment')`. (d) Default `category` → `'maintain_equipment'`.
- [x] 2.3 `apps/admin/src/components/tareas/TareasTable.tsx` — Rename `CATEGORY_LABELS` keys to 4 new values; remove old keys.
- [x] 2.4 `apps/admin/src/routes/tareas/TareaDetailPage.tsx` — Update `CATEGORIES_TWO_STEP_CONFIGURE` to `new Set(['install_equipment', 'replace_equipment'])` (collapse from 3 values); rename any other category maps/sets in the file.
- [x] 2.5 `apps/admin/src/components/tareas/AssignEquipmentDialog.tsx` — Collapse `modeForCategory()` branches for `'installation'` and `'equipment_installation'` into single `'install_equipment'` branch; update `onCreateSubmit` conditional.
- [x] 2.6 `apps/admin/src/components/tareas/ConfigureEquipmentPanel.tsx` — Rename `CATEGORY_HEADINGS` and `EMPTY_HELP` keys; update category TypeScript prop union to `'install_equipment' | 'replace_equipment'`.
- [x] 2.7 `apps/admin/src/components/servicio-tecnico/TechnicalOrderForm.tsx` — Update `ITEM_TYPES` array and labels to 3 new values (`install_equipment`, `replace_equipment`, `maintain_equipment`); update Zod enum.
- [x] 2.8 `apps/admin/src/components/servicio-tecnico/TechnicalOrderItemsTable.tsx` — Rename `ITEM_TYPE_LABELS` keys to 3 new values.
- [x] 2.9 `apps/admin/src/routes/equipos/EquipoDetailPage.tsx` — Verify `ITEM_TYPE_LABEL` (line 21) is keyed from `item_type`; if so rename keys to new 3-value set (potential 9th admin file per design open question).

---

## Phase 3: Installer UI Renames (4 files — parallelizable within phase)

- [x] 3.1 `apps/installer/src/routes/TaskDetailPage.tsx` — Rename `categorySubtitle`, inline constants, and `GENERIC_RESOLVE_CATEGORIES` to new category literals.
- [x] 3.2 `apps/installer/src/components/work/TicketCard.tsx` — Update `TWO_STEP_CATEGORIES` to `['install_equipment', 'replace_equipment']` (collapse from 3 values).
- [x] 3.3 `apps/installer/src/components/work/TicketsSection.tsx` — `EXCLUDED_FOR_BATCH`: `'equipment_update'` → `'update_equipment'`.
- [x] 3.4 `apps/installer/src/components/work/ConfigureEquipmentInline.tsx` — Rename `HEADINGS` keys; update category TypeScript prop union to `'install_equipment' | 'replace_equipment'`.

---

## Phase 4: Test File Renames (grouped by app — parallelizable within phase)

Apply rename mapping (Decision 7) to all string literals: `equipment_installation`→`install_equipment`, `installation`→`install_equipment`, `equipment_replacement`→`replace_equipment`, `equipment_update`→`update_equipment`, `maintenance`→`maintain_equipment`, `item_type:'equipment'`→`install_equipment`, `item_type:'maintenance'`→`maintain_equipment`, `item_type:'equipment_replacement'`→`replace_equipment`.

**Admin tests (12 files):**

- [x] 4.1 `apps/admin/src/components/servicio-tecnico/__tests__/TechnicalOrderForm.test.tsx`
- [x] 4.2 `apps/admin/src/components/tareas/__tests__/ConfigureEquipmentPanel.test.tsx`
- [x] 4.3 `apps/admin/src/hooks/__tests__/useConfigureTechnicalTicketEquipment.test.ts`
- [x] 4.4 `apps/admin/src/hooks/__tests__/useTechnicalOrderTickets.test.ts`
- [x] 4.5 `apps/admin/src/hooks/__tests__/useMutateTechnicalOrder.test.ts`
- [x] 4.6 `apps/admin/src/components/servicio-tecnico/__tests__/LinkedTicketsTable.test.tsx`
- [x] 4.7 `apps/admin/src/routes/servicio-tecnico/__tests__/TechnicalOrderDetailPage.test.tsx`
- [x] 4.8 `apps/admin/src/components/tareas/__tests__/TareasTable.test.tsx`
- [x] 4.9 `apps/admin/src/components/servicio-tecnico/__tests__/TechnicalOrderItemsTable.test.tsx`
- [x] 4.10 `apps/admin/src/routes/servicio-tecnico/__tests__/TechnicalOrderEditarPage.test.tsx`
- [x] 4.11 `apps/admin/src/routes/servicio-tecnico/__tests__/TechnicalOrderNuevaPage.test.tsx`
- [x] 4.12 Inspect `apps/admin/src/components/equipos/__tests__/EquipmentInventoryTable.test.tsx` and `apps/admin/src/components/equipment/__tests__/EquipmentTable.test.tsx` — apply rename if old literals present (grep confirmed hits).

**Installer tests (10 files):**

- [x] 4.13 `apps/installer/src/components/work/__tests__/ConfigureEquipmentInline.test.tsx`
- [x] 4.14 `apps/installer/src/routes/__tests__/TaskDetailPage.test.tsx`
- [x] 4.15 `apps/installer/src/hooks/__tests__/useAssignedTickets.test.ts`
- [x] 4.16 `apps/installer/src/hooks/__tests__/useTicketHistory.test.ts`
- [x] 4.17 `apps/installer/src/routes/__tests__/TareasPage.test.tsx`
- [x] 4.18 `apps/installer/src/components/work/__tests__/EquipmentUpdateResolveDetail.test.tsx`
- [x] 4.19 `apps/installer/src/hooks/__tests__/useConfigureTechnicalTicketEquipment.test.ts`
- [x] 4.20 `apps/installer/src/routes/__tests__/DashboardPage.test.tsx`
- [x] 4.21 `apps/installer/src/routes/__tests__/HistorialPage.test.tsx`
- [x] 4.22 Check for snapshot fixture files (`*.snap`) — if any exist, regenerate after rename via `pnpm test -- --update-snapshots`. Check MSW handler bodies for old category strings and rename.

---

## Phase 5: Verification Checklist and Post-Apply Gate

- [x] 5.1 Create `openspec/changes/ticket-taxonomy-cleanup/manual-verification.md` with the following checklist:
  - Install via order → assert `category='install_equipment'`, stock `reserva` + `egreso_instalacion` + `liberacion_reserva` movements emitted.
  - Replace via order → assert `category='replace_equipment'`.
  - Maintain via order → assert `category='maintain_equipment'`.
  - Standalone maintenance (TareaFormSheet) → only "Mantenimiento" offered; `category='maintain_equipment'`.
  - Standalone install attempt (direct RPC) → rejected with `tickets_equipment_required` CHECK violation.
  - Installer resolve of `install_equipment` → equipment row created, stock movements correct.
  - Equipment update resolve → dedicated flow works end-to-end.
  - DB state: `SELECT category, count(*) FROM support.tickets GROUP BY category;` → all rows `install_equipment`.
- [x] 5.2 Run post-apply grep gate (mandatory merge prerequisite):
  ```
  rg -w '(equipment_installation|equipment_replacement|equipment_update|key_configuration|key_installation)' apps packages
  ```
  Expected: zero matches. English words `maintenance`/`installation` in prose comments are acceptable.
- [x] 5.3 Run full Vitest suite: `pnpm test` — all tests pass with no logic changes.

---

## Parallelism Map

```
Phase 1 (sequential — all 19 steps ordered in one transaction)
  └─ Phase 2 (parallelizable — tasks 2.1–2.9 independent of each other)
  └─ Phase 3 (parallelizable — tasks 3.1–3.4 independent of each other; can run alongside Phase 2)
      └─ Phase 4 (parallelizable — admin and installer test groups independent; after Phases 2+3)
          └─ Phase 5 (sequential — after Phases 1–4 complete)
```

## Key Learnings

1. Migration step order is safety-critical: `DISABLE TRIGGER ALL` must precede the `UPDATE`, and `ENABLE TRIGGER ALL` must precede all post-ENABLE assertions so runtime immutability is verified before new CHECKs are added.
2. Function replacement must source from the latest superseding delta (`20260901120000`), not the baseline, or lifecycle logic silently regresses on fresh `db reset`.
3. The DB `tickets_equipment_required` CHECK closes a latent bug permanently — UI-only enforcement was insufficient because standalone `installation` tickets could silently skip stock movements.
4. Actual test file count exceeded the design estimate of 15 — grep found 22 files with old literals; inspect all before marking the phase done.
5. With `single-pr` delivery strategy and High budget risk, `size:exception` must be confirmed before `sdd-apply` starts; the proposal already acknowledges this so the exception is on record.
