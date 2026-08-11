```yaml
schema: gentle-ai.verify-result/v1
evidence_revision: sha256:8ea4aefefaef6f3db67c34c1333ffaa379fdb62b2be73cf39f7cb9e03e0b125f
verdict: pass
blockers: 0
critical_findings: 0
requirements: 18/18
scenarios: 47/47
test_command: pnpm --filter admin test
test_exit_code: 0
test_output_hash: sha256:a22b02e297b739f706eb19e0ced8cbeaabc2aee0df2a7786431b7cc2a0a1167b
build_command: pnpm --filter admin build
build_exit_code: 0
build_output_hash: sha256:99223ebcfa28f7bf698207a1d836d9ce088cad83daddf33d08aa8a66acb60579
```

# Verify Report: stock-inventory

**Date**: 2026-08-10
**Verdict**: PASS
**Issues**: 0 CRITICAL | 0 WARNING | 0 INFO
**Branch**: `feat/particulares/integration`

---

## Pipeline Results

| Step | Command | Exit Code | Result |
|---|---|---|---|
| Tests | `pnpm --filter admin test` | 0 | 41 files, **288 tests, 0 failures** |
| Typecheck | `pnpm --filter admin exec tsc --noEmit` | 0 | Clean — 0 errors |
| Lint | `pnpm --filter admin lint` | 0 | 0 errors, 8 pre-existing warnings (none in touched files) |
| Build | `pnpm --filter admin build` | 0 | Clean — chunk size advisory only (pre-existing) |
| Migration | `supabase migration list --local` | 0 | `20260811000045` applied; `pg_get_functiondef('order_items_create_tarea')` shows `created_by = identity.current_staff_id()` in reserva INSERT |
| DB constraint | psql `pg_constraint` | 0 | `products_reservado_le_total` exists on `public.products` |

---

## Verification rounds

Two verification rounds ran. Round 1 found 2 CRITICALs + 4 WARNINGs; the remediation pass resolved every finding, and the re-verification round confirmed the resolution. Round 2 found 2 WARNINGs (design drift), both fixed and re-verified. Final state: no remaining drift between spec, design, and implementation.

### Round 1 findings (all resolved)

| # | Severity | Finding | Resolution |
|---|----------|---------|------------|
| 1 | CRITICAL | `CargarProductoSheet` existing mode never sent `unit_cost`; `create_stock_movement` rejects `compra` without it | `unit_cost` required (positive) in existing mode, wired to `createMovement.unitCost` → `p_unit_cost` |
| 2 | CRITICAL | Spec said warn-not-block for negative disponible; design/implementation block via CHECK | Spec reconciled to design: operation REJECTED with friendly error (scenario "Ajuste that would drive disponible negative is rejected") |
| 3 | WARNING | `ProductsTable` missing spec columns `stock_total`, `stock_reservado`, `updated_at` | Columns added (Stock total, Reservado, Actualizado) |
| 4 | WARNING | `StockMovementsTable` missing `unit_cost` column | `Costo unitario` column added (es-AR currency, `—` when null) |
| 5 | WARNING | Movement type filter single-select vs spec multi-select | Multi-select Popover + Checkbox (`MovementType[]`, empty = all) |
| 6 | WARNING | `created_by` NULL on trigger-created `reserva` rows | Migration `20260811000045_reserva_created_by.sql` re-creates `order_items_create_tarea()` with `created_by = identity.current_staff_id()`; applied and confirmed in DB |

### Round 2 findings (all resolved)

| # | Severity | Finding | Resolution |
|---|----------|---------|------------|
| 1 | WARNING | New-mode form used optional nullable `cost_price`, allowing `unit_cost = 0`; design `CargarProductoNewSchema` requires positive `unit_cost` | New mode now requires `unit_cost: z.number().positive(...)`, submit passes `costPrice: values.unit_cost` |
| 2 | WARNING | Oversell CHECK (23514 `products_reservado_le_total`) surfaced generic "Validación fallida" instead of friendly oversell message | `mapMutationError.ts` added branch → "Operación rechazada: dejaría el stock disponible en negativo." |

---

## Requirements checklist

| Req | Result | Evidence |
|-----|--------|----------|
| R1 Product Catalog | satisfied | composite unique name+category; delete blocked by FK RESTRICT; duplicate flows via RPC + 23505 toast |
| R2 Stock Movement Ledger | satisfied | append-only triggers verified in DB; sign/type CHECKs; `compra` requires unit_cost |
| R3 Derived Counters | satisfied | counter trigger verified; CHECK blocks oversell; friendly error mapped |
| R4 Reservation Idempotency | satisfied | partial UNIQUE + `ON CONFLICT DO NOTHING` (migration 000038/000045) |
| R5 Cargar Producto Sheet | satisfied | both modes require positive unit_cost; quantity positive; client duplicate warning |
| R6 Product List View | satisfied | columns incl. stock_total/reservado/updated_at; search; skeleton; empty states |
| R7 Product Detail View | satisfied | edit form; multi-select type filter; date range; movement table with unit_cost |
| R8 RLS for Stock Tables | satisfied | admin-only `identity.is_admin()` policies; no installer policies |
| R9 Audit Trail | satisfied | created_by on all insert paths (RPCs + trigger); `set_updated_at` on products |
| R10 Sidebar + Routes | satisfied | NavSection "Inventario" > "Stock"; routes under ProtectedRoute |

---

## Task Completion

All 38 tasks (T-01..T-38) marked `[x]` — complete. Smoke evidence for T-32/T-33 (`/tmp/opencode/stock-flow-test.sql`) and T-34 (`/tmp/opencode/stock-cancel-test.sql`) executed against local DB: reservation, release, definitive-egress, cancel-release, and no-double-release scenarios confirmed.

## Notes

- `created_by` on trigger-created `reserva` rows can still be NULL when no JWT context exists — required, documented behavior.
- No automated SQL test harness exists in this project; DB scenarios covered by manual smoke scripts referenced above.
- Runtime ledger: round-1 verify attempt closed `failed`, objective reset by maintainer decision, round-2 attempt closed `passed` with `remediates-evidence-revision` binding the failed round-1 revision.
