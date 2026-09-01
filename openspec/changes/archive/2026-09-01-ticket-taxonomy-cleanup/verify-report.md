# Verification Report

**Change**: ticket-taxonomy-cleanup  
**Mode**: hybrid (openspec + engram)  
**Date**: 2026-09-01  
**Commits**: `737c0c1` (main implementation) + `5e269bd` (migration DISABLE TRIGGER fix)

---

## Completeness Table

| Artifact | Present | Status |
|----------|---------|--------|
| Proposal | Yes | Read |
| Spec (4 domains) | Yes | Read |
| Design | Yes | Available |
| Tasks (47 tasks) | Yes | All checked [x] |
| Apply progress | Yes | 47/47 complete |

---

## Build / Test Evidence

| Suite | Command | Exit Code | Result |
|-------|---------|-----------|--------|
| Admin app | `cd apps/admin && npx vitest run` | 0 | 655 tests PASSED |
| Installer app | `cd apps/installer && npx vitest run` | 0 | 79 tests PASSED |
| **Total** | — | 0 | **734 tests GREEN** |

Note: `pnpm vitest run` at monorepo root shows 266 failures in `packages/ui` (pre-existing `document is not defined` environment mismatch — unrelated to this change). Admin and installer suites run in isolation via `jsdom` environment and are fully green.

---

## Spec Compliance Matrix

### Spec 1: Ticket Taxonomy

| Requirement | Scenario | Status | Evidence |
|-------------|----------|--------|----------|
| tickets.category 4-value CHECK | valid INSERT accepted | PASS | Migration Step 7 CHECK in place; DB state verified |
| tickets.category 4-value CHECK | old value rejected | PASS | CHECK constraint deployed to remote DB |
| Dead categories dropped | no rows for key_* after migration | PASS | DB assertion + post-migration DO block |
| install_equipment fusion | former installation/equipment_installation → 0 rows | PASS | DB state: 2 rows now install_equipment |
| Data invariants | pre-count == post-count | PASS | Post-migration RAISE NOTICE confirms |
| Data invariants | no row retains old category | PASS | Step 5 guard assertion + Step 14 DO block |
| Data invariants | tickets_validate re-enabled post-migration | PASS | Step 4 ENABLE TRIGGER tickets_validate present |
| DISABLE TRIGGER target | tickets_validate only (not ALL) | PASS | commit 5e269bd; line 59: `DISABLE TRIGGER tickets_validate` |
| technical_order_items 3-value CHECK | valid INSERT accepted | PASS | Migration Step 9 CHECK in place |
| technical_order_items 3-value CHECK | old value rejected | PASS | CHECK constraint deployed |
| add_technical_order_item validates new domain | rejects old item_type | PASS | `create_technical_order_with_items` guard at line 1284 |
| Grep gate | zero old category strings in runtime code | PASS WITH NOTES | See grep gate section |

### Spec 2: Technical Order Lifecycle

| Requirement | Scenario | Status | Evidence |
|-------------|----------|--------|----------|
| confirm_technical_order identity mapping | install_equipment item → install_equipment ticket | PASS | `v_category := v_item.item_type;` at line 1139 |
| confirm_technical_order identity mapping | replace_equipment item → replace_equipment ticket | PASS | Same identity assignment |
| confirm_technical_order identity mapping | maintain_equipment item → maintain_equipment ticket | PASS | Same identity assignment |
| confirm_technical_order reserva for install_equipment | emits reserva stock movement | PASS | product_id IS NOT NULL branch unchanged; CategoryName updated |
| configure_technical_ticket_equipment guard | install_equipment accepted | PASS | Line 241: `not in ('install_equipment', 'replace_equipment')` |
| configure_technical_ticket_equipment guard | replace_equipment accepted | PASS | Same guard |
| configure_technical_ticket_equipment guard | maintain_equipment/update_equipment rejected | PASS | Same guard (negative) |
| resolve_ticket install_equipment path | creates equipment + stock movements | PASS | Lines 333-468 cover install_equipment branch |
| resolve_ticket install_equipment path | no product_id → no stock movement | PASS | Conditional: `if v_toi.product_id is not null` |
| GUC bypass (app.allow_resolve_equipment_id_write) | install_equipment path only | PASS | Lines 396-406 in resolve_ticket |

### Spec 3: Admin Tarea Form — Standalone Create

| Requirement | Scenario | Status | Evidence |
|-------------|----------|--------|----------|
| CREATE_CATEGORY_LABELS only maintain_equipment | form offers only maintain_equipment | PASS | `CREATE_CATEGORY_LABELS = { maintain_equipment: 'Mantenimiento' }` at TareaFormSheet.tsx:106 |
| Default value maintain_equipment | form defaults to maintain_equipment | PASS | defaultValues.category = 'maintain_equipment' at line 162, 201 |
| DB CHECK tickets_equipment_required | rejects standalone install_equipment | PASS | Migration Step 8; constraint deployed to remote DB |
| DB CHECK tickets_equipment_required | exact form: `(technical_order_item_id IS NOT NULL OR category = 'maintain_equipment')` | PASS | Migration line 126 verbatim match |

### Spec 4: Admin Tarea Detail / Installer Ticket Detail

| Requirement | Scenario | Status | Evidence |
|-------------|----------|--------|----------|
| CATEGORIES_TWO_STEP_CONFIGURE collapsed to 2 values | install_equipment renders ConfigureEquipmentPanel | PASS | TareaDetailPage.tsx:25-28 — Set(['install_equipment', 'replace_equipment']) |
| CATEGORIES_TWO_STEP_CONFIGURE collapsed to 2 values | replace_equipment renders ConfigureEquipmentPanel | PASS | Same Set |
| CATEGORIES_TWO_STEP_CONFIGURE collapsed | maintain_equipment/update_equipment skip configure | PASS | Negative test via Set membership |
| ConfigureEquipmentPanel prop union | accepts install_equipment, replace_equipment | PASS | ConfigureEquipmentPanel.tsx updated |
| CATEGORY_LABELS in TareasTable | 4 new keys, no old keys | PASS | TareasTable.tsx CATEGORY_LABELS updated |
| TWO_STEP_CATEGORIES in TicketCard (installer) | install_equipment, replace_equipment | PASS | TicketCard.tsx:28-31 — `['install_equipment', 'replace_equipment']` |
| TaskDetailPage ConfigureEquipmentInline | install_equipment renders inline | PASS | TaskDetailPage.tsx updated |
| AssignEquipmentDialog modeForCategory | install_equipment branch correct | PASS | AssignEquipmentDialog.tsx updated |
| EXCLUDED_FOR_BATCH uses update_equipment | update_equipment excluded from batch | PASS | TicketsSection.tsx:30 — `['update_equipment']` |

---

## Grep Gate Analysis

Command: `rg -w '(equipment_installation|equipment_replacement|equipment_update|key_configuration|key_installation)' apps packages`

All matches are one of:
1. **JSDoc / file-level prose comments** in production hooks: `useResolveEquipmentInstallation.ts`, `useResolveEquipmentReplacement.ts`, `useMutateTicketEquipment.ts`, `TicketsSection.tsx`, `EquipmentUpdateResolveDetail.tsx`, `EquipmentUpdateResolveCard.tsx`, `EquipmentKeySnapshotPanel.tsx`, `PendingKeysGuardrailBadge.tsx`, `EquipmentUpdatePanel.tsx`, `AssignEquipmentDialog.tsx` (inline code comment).
2. **Test description strings** (`it('...')` text) in `TechnicalOrderItemsTable.test.tsx` and `TechnicalOrderForm.test.tsx` — test body values are correct.

No runtime string literal (DB query filter, enum value, type guard, switch case) uses an old category value, **except one CRITICAL miss**.

---

## Issues

### CRITICAL

**[CRITICAL-1] `useMaintenanceHistory` in `apps/installer/src/hooks/useEquipmentDetail.ts` filters by old category `'maintenance'`**

File: `apps/installer/src/hooks/useEquipmentDetail.ts`, line 87:
```ts
.eq('category', 'maintenance')
```

After the migration, `support.tickets.category = 'maintenance'` no longer exists — all rows have been renamed to `'maintain_equipment'`. This query will permanently return zero results. The maintenance history section in `TaskDetailPage` will silently appear empty for all equipment.

This file is not listed in any Phase 2, 3, or 4 task. It was not in the apply commit (`737c0c1`). The spec's "No Old Category String Literals" requirement covers runtime query filters.

**Required fix**: Change `.eq('category', 'maintenance')` → `.eq('category', 'maintain_equipment')`.

---

### WARNING

**[WARN-1] Stale `it()` description strings in 2 test files**

- `apps/admin/src/components/servicio-tecnico/__tests__/TechnicalOrderItemsTable.test.tsx:98`: `'renders badge for equipment_replacement item type'` — test body uses `replace_equipment` correctly.
- `apps/admin/src/components/servicio-tecnico/__tests__/TechnicalOrderForm.test.tsx:499-500`: comment and `it()` description reference `equipment_replacement` — test body uses `replace_equipment` correctly.

These do not affect runtime behavior or test pass/fail outcomes. They represent minor documentation drift. Tasks 4.1 and 4.9 were marked complete; these two description strings were missed.

**[WARN-2] JSDoc comments in production hooks retain old category names**

The following production files have JSDoc/file comments that reference old category strings (not runtime code):
- `apps/admin/src/hooks/useResolveEquipmentInstallation.ts` (lines 12, 18)
- `apps/admin/src/hooks/useResolveEquipmentReplacement.ts` (lines 12, 19)
- `apps/admin/src/hooks/useMutateTicketEquipment.ts` (lines with JSDoc)
- `apps/installer/src/components/work/TicketsSection.tsx` (line 57 inline comment)
- `apps/admin/src/components/tareas/AssignEquipmentDialog.tsx` (line 168 inline comment)
- Equipment panel files (JSDoc only)

The spec's grep gate requirement says "occurrences in natural-language comments are acceptable" for `maintenance`/`installation`; this extends to JSDoc that describes retired behavior. The spec's strict wording covers the `rg -w` gate for the 5 removed literals — all these are prose comments, not runtime literals.

**Status**: ACCEPTABLE per spec (prose comment carve-out), but cleanup is recommended for code hygiene.

---

### SUGGESTION

**[SUGGEST-1] `useResolveEquipmentInstallation` and `useResolveEquipmentReplacement` hook names retain old naming convention**

These hook filenames and the functions they export were not renamed (e.g. `useResolveEquipmentInstallation` → `useResolveInstallEquipment` to match the new verb_object convention). This is out of scope for the taxonomy spec but is worth a follow-up cleanup to align with the new naming.

---

## Correctness Table

| Dimension | Status | Notes |
|-----------|--------|-------|
| Migration verbatim audit | PASS | All 8 RPCs rebuilt with correct literal swaps |
| confirm_technical_order identity CASE | PASS | `v_category := v_item.item_type` at line 1139 |
| tickets_equipment_required CHECK form | PASS | Exact form per spec |
| tickets_reject_key_installation_inserts dropped | PASS | Steps 10 drops trigger + function |
| DISABLE TRIGGER targets tickets_validate only | PASS | commit 5e269bd |
| 8 admin UI files updated | PASS | All checked in apply |
| 4 installer UI files updated | PASS (partial) | useEquipmentDetail.ts missed — CRITICAL-1 |
| 22 test files updated | WARNING | 2 description strings stale |
| Grep gate (runtime code) | PASS | No runtime literal uses old values |
| Grep gate (prose comments) | ACCEPTABLE | Per spec carve-out |
| tests GREEN | PASS | 734 tests (655 admin + 79 installer) |

---

## Design Coherence

Design decisions verified:
- **Decision 1**: install_equipment fuses installation + equipment_installation → IMPLEMENTED
- **Decision 2**: DISABLE TRIGGER `tickets_validate` (targeted, not ALL) → IMPLEMENTED (5e269bd fix)
- **Decision 3**: identity CASE mapping in confirm_technical_order → IMPLEMENTED
- **Decision 4**: item_type IS category (1:1) → IMPLEMENTED via identity assignment
- **Decision 5**: `tickets_equipment_required` CHECK constraint → IMPLEMENTED, exact form matches spec
- **Decision 7**: test rename mapping applied across 22 files → IMPLEMENTED (with 2 stale descriptions)

---

## Final Verdict

**FAIL**

One CRITICAL issue blocks archive:

**CRITICAL-1**: `useEquipmentDetail.ts` in the installer app queries `support.tickets` with `category = 'maintenance'` — a value that no longer exists in the DB after migration. Maintenance history will permanently return empty for all equipment. This is a spec violation (Requirement: No Old Category Strings in Monorepo) and a runtime data loss bug.

---

## Key Learnings

1. The grep gate scope must explicitly include hooks that make DB queries with `.eq('category', ...)` filters, not only category label/switch-case maps; a hook named `useMaintenanceHistory` was missed because the rename task list was built from UI component files, not data-fetching hooks.
2. Targeting `DISABLE TRIGGER tickets_validate` (not `ALL`) is correct and necessary because FK constraint triggers (`RI_ConstraintTrigger_*`) are system-owned and reject a blanket `ALL` disable.
3. Test description strings in `it()` blocks are not scanned by `rg -w` word-boundary matching if they omit quotes or use partial words — a separate prose-comment pass is needed for test correctness.
4. Stale JSDoc comments in production hooks describing retired categories are acceptable per spec carve-out, but they accumulate misleading developer context and should be cleaned up in a follow-up.
5. Verifying DB-level filter literals requires searching for `.eq(` / `.in(` / `.filter(` calls alongside UI label map keys — these are semantically equivalent to runtime code and carry the same taxonomy risk.
