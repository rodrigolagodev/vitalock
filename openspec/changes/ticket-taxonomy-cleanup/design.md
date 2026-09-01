# Design: ticket-taxonomy-cleanup

## Context

`support.tickets.category` carries seven values that grew ad-hoc over multiple features: bare verbs (`maintenance`, `installation`), object-first phrases (`equipment_installation`, `equipment_replacement`, `equipment_update`), and dead placeholders (`key_configuration`, `key_installation`). This design documents the technical approach for collapsing them to four uniform `verb_object` names, collapsing `technical_order_items.item_type` from four to three values, and removing the standalone-install create path from `TareaFormSheet`.

The live DB has 2 rows in `support.tickets` (both `category='installation'`, `status='resolved'`) and zero rows for any dead category. `technical_order_items` has no rows to rename.

## Goals

- Rename live data: `installation`/`equipment_installation` → `install_equipment`, `equipment_replacement` → `replace_equipment`, `equipment_update` → `update_equipment`, `maintenance` → `maintain_equipment`.
- Drop `key_configuration` and `key_installation` from the CHECK constraint and remove the defensive trigger that blocked inserts.
- Collapse `technical_order_items.item_type` from 4 values to 3 (`install_equipment`, `replace_equipment`, `maintain_equipment`).
- Restrict `TareaFormSheet` standalone create to `maintain_equipment` only.
- Propagate new names through 8 admin files, 4 installer files, 15 test files.
- Full Vitest suite green after apply. Post-apply grep gate: zero hits for any old category literal in value contexts.

## Non-Goals

- Terminal-state immutability (exploration bug #2) — separate SDD.
- New features or behavioral changes beyond the rename.
- External API clients: none documented; all callers are in-repo.

## Decisions

### Decision 1 — Migration file structure

Single atomic SQL delta at `supabase/migrations/YYYYMMDDHHMMSS_rename_ticket_categories_taxonomy.sql`, executed inside one transaction. No split into separate files.

**Rationale**: Splitting risks partial application on reset. Atomic transaction guarantees all-or-nothing.

**Step order** (all in one transaction):

1. `RAISE NOTICE` pre-counts per old category value on `support.tickets`.
2. `ALTER TABLE support.tickets DISABLE TRIGGER ALL` — bypasses `tickets_validate` immutability guard.
3. `UPDATE support.tickets SET category = CASE ... END` — renames all 5 live values.
4. `ALTER TABLE support.tickets ENABLE TRIGGER ALL`.
5. Guard assertion: no row with unexpected value remains.
6. DROP old CHECK on `support.tickets.category`.
7. ADD new 4-value CHECK.
8. ADD `tickets_equipment_required` CHECK (Decision 5).
9. DROP old CHECK on `technical_order_items.item_type`; ADD new 3-value CHECK.
10. DROP `tickets_reject_key_installation_inserts` trigger + its function.
11. CREATE OR REPLACE trigger functions with new category names (`tickets_require_equipment_on_resolve`, `tickets_block_equipment_update_cancel_in_progress`).
12. CREATE OR REPLACE RPC functions with new category names (`configure_technical_ticket_equipment`, `resolve_ticket`, `resolve_equipment_installation`, `resolve_equipment_replacement`, `resolve_equipment_update`, `confirm_technical_order`, `add_technical_order_item`, `create_equipment_update`).
13. Update column COMMENTs.
14. Post-migration assertion.

### Decision 2 — Immutability discipline

`DISABLE TRIGGER ALL` / `ENABLE TRIGGER ALL` symmetric within the transaction. No SECURITY DEFINER bypass function.

**Rationale**: If the transaction aborts, PostgreSQL rolls back the trigger state change. The explicit `ENABLE` before subsequent steps is required so the post-ENABLE assertion runs with triggers active.

Guard after `ENABLE`:

```sql
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM support.tickets
    WHERE category NOT IN ('install_equipment','replace_equipment','update_equipment','maintain_equipment')
      -- key_configuration/key_installation allowed here temporarily; CHECK swap below rejects them
  ) THEN
    RAISE EXCEPTION 'ticket-taxonomy-cleanup: rows with old category values remain after data rename — aborting';
  END IF;
END $$;
```

### Decision 3 — Function replacement strategy

`CREATE OR REPLACE FUNCTION` for every affected function. The new delta MUST reproduce the **latest** versions — specifically the 2026-09-01 lifecycle delta bodies for `configure_technical_ticket_equipment` and `resolve_ticket`, not the baseline bodies.

**Rationale**: On fresh reset, migrations replay in filename order. The taxonomy-cleanup delta runs after both baseline and 2026-09-01 lifecycle delta. Its `CREATE OR REPLACE` must start from the 2026-09-01 bodies or it silently regresses lifecycle logic.

**Implementation rule**: Before writing bodies, read the 2026-09-01 delta's versions verbatim. Only swap category literal strings; do not alter lifecycle logic, error messages, or side-effect ordering.

### Decision 4 — `item_type` collapse and identity CASE

- `equipment` + `installation` → `install_equipment` (fused; both produced install tickets)
- `equipment_replacement` → `replace_equipment`
- `maintenance` → `maintain_equipment`

`confirm_technical_order` CASE becomes identity:

```sql
v_category := v_item.item_type;  -- direct assignment, no CASE needed
```

**Rationale**: No business logic distinguishes `equipment` from `installation` item types. Both map to the same ticket category and trigger the same stock-movement path.

`add_technical_order_item` validation MUST accept exactly `{'install_equipment','replace_equipment','maintain_equipment'}`. New CHECK is a second defense.

### Decision 5 — Standalone-install removal and DB defense-in-depth

- `TareaFormSheet` `CREATE_CATEGORY_LABELS` becomes `{ maintain_equipment: 'Mantenimiento' }` only.
- Default `category` in Zod schema and form defaults changes from `'maintenance'` to `'maintain_equipment'`.
- Zod create schema narrows to `z.literal('maintain_equipment')`.
- Add CHECK constraint on `support.tickets`:

```sql
CONSTRAINT tickets_equipment_required
CHECK (technical_order_item_id IS NOT NULL OR category = 'maintain_equipment')
```

**Rationale**: UI-only enforcement is insufficient. DB constraint is cheap and permanent. Any future path attempting standalone `install_equipment` gets a descriptive constraint violation, not a silent stock-skip.

**Pre-flight validation**: Before adding the constraint, verify no existing `install_equipment` / `replace_equipment` / `update_equipment` ticket has `technical_order_item_id IS NULL`. Live DB check confirms: 2 rows total, both `installation` (fused to `install_equipment`), both come from a technical order → constraint installs cleanly.

### Decision 6 — UI rename discipline

**Admin files (8)**:

| File | Symbols | Change |
|---|---|---|
| `hooks/useTareas.ts` | `TareaRow.category` union | Update to 4 new values |
| `components/tareas/TareaFormSheet.tsx` | `CATEGORY_LABELS`, `CREATE_CATEGORY_LABELS`, zod, defaults | Rename keys; narrow create to `maintain_equipment` |
| `components/tareas/TareasTable.tsx` | `CATEGORY_LABELS` | Rename keys |
| `routes/tareas/TareaDetailPage.tsx` | 4 sets/maps | Rename all entries |
| `components/tareas/AssignEquipmentDialog.tsx` | `modeForCategory()`, `onCreateSubmit` conditional | Collapse `installation`+`equipment_installation` → `install_equipment` |
| `components/tareas/ConfigureEquipmentPanel.tsx` | `CATEGORY_HEADINGS`, `EMPTY_HELP`, category type | Rename keys |
| `components/servicio-tecnico/TechnicalOrderForm.tsx` | `ITEM_TYPES`, labels, zod enum | Update to 3 values |
| `components/servicio-tecnico/TechnicalOrderItemsTable.tsx` | `ITEM_TYPE_LABELS` | Rename keys |

**Installer files (4)**:

| File | Symbols | Change |
|---|---|---|
| `routes/TaskDetailPage.tsx` | `categorySubtitle`, constants, `GENERIC_RESOLVE_CATEGORIES` | Rename all literals |
| `components/work/TicketCard.tsx` | `TWO_STEP_CATEGORIES` | Collapse to 2 values |
| `components/work/TicketsSection.tsx` | `EXCLUDED_FOR_BATCH` | `equipment_update` → `update_equipment` |
| `components/work/ConfigureEquipmentInline.tsx` | `HEADINGS` keys, category type | Update union |

**Post-apply grep gate** (mandatory):

```
rg -w '(equipment_installation|equipment_replacement|equipment_update|key_configuration|key_installation)' apps packages
```

Expected: zero matches. English words `maintenance`/`installation` in prose comments are acceptable.

### Decision 7 — Test rename discipline

15 test files — mechanical string-literal rename only. No new test cases. Semantics preserved.

Rename mapping for fixtures:
- `'equipment_installation'` → `'install_equipment'`
- `'installation'` (as category value) → `'install_equipment'`
- `'equipment_replacement'` → `'replace_equipment'`
- `'equipment_update'` → `'update_equipment'`
- `'maintenance'` (as category value) → `'maintain_equipment'`
- `item_type: 'equipment'` → `item_type: 'install_equipment'`
- `item_type: 'maintenance'` → `item_type: 'maintain_equipment'`
- `item_type: 'equipment_replacement'` → `item_type: 'replace_equipment'`

### Decision 8 — Backward compatibility

None required. Intentional breaking rename. All callers in-repo. No documented external API consumers. The 2 production rows migrate in the same transaction.

### Decision 9 — Ordering vs existing lifecycle delta

Migration filename must be greater than `20260901120000`. Suggested: use actual wall-clock timestamp at authoring.

The new delta reproduces:
- `configure_technical_ticket_equipment` and `resolve_ticket` from the **2026-09-01 delta** (superseded there).
- All other RPC bodies (`resolve_equipment_installation`, `resolve_equipment_replacement`, `resolve_equipment_update`, `confirm_technical_order`, `add_technical_order_item`, `create_equipment_update`) from **baseline** with category literal swaps.

## Testing Plan

1. **Vitest**: `pnpm test` — all 15 renamed files pass with no logic changes.
2. **Post-apply grep gate**: as above.
3. **Manual verification checklist** (committed as `manual-verification.md`):
   - Install via order → assert `category='install_equipment'`, stock movements emitted.
   - Replace via order → assert `category='replace_equipment'`.
   - Maintain via order → assert `category='maintain_equipment'`.
   - Standalone maintenance → only "Mantenimiento" offered; category is `'maintain_equipment'`.
   - Standalone install must fail: direct RPC call rejects with CHECK violation.
   - Installer resolve of install_equipment → equipment created, stock movements correct.
   - Equipment update resolve → dedicated flow works.
4. **DB state check**: `SELECT category, count(*) FROM support.tickets GROUP BY category;` → 2 rows, both `install_equipment`.

## Rollback

Migration runs atomically. Rollback on failure is automatic. Post-successful apply, manual rollback requires a new forward migration (Supabase migrations are forward-only).

## Open Questions

1. `EquipoDetailPage.tsx` line 21 `ITEM_TYPE_LABEL` — verify whether it's a display map keyed from `item_type`; if so, include in rename sweep (9th admin file).
2. Snapshot fixtures: if any test uses `toMatchSnapshot`, regenerate after rename.
3. MSW handler bodies: if any handler inspects category string values, include in rename list.
