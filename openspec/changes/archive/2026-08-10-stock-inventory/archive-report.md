# Archive Report: stock-inventory

**Change**: stock-inventory
**Archive Date**: 2026-08-10
**Status**: CLOSED — Verified, Synced, Archived
**Store Mode**: openspec (filesystem)

---

## Executive Summary

The `stock-inventory` change introduced a first-class inventory domain: a `public.products` catalog with derived counters, an append-only `public.stock_movements` ledger, reservation lifecycle on order events, ticket-category expansion with a resolution chain, stock decrements inside `configure_key_order_item` and a new `resolve_equipment_installation` RPC, plus a full admin `/stock` UI. All 38 tasks (T-01..T-38) are complete. Verification passed in two rounds with all findings resolved (288/288 tests, tsc clean, build clean, lint clean, migration `20260811000045` applied). Delta specs were merged into the source-of-truth main specs, and the change folder was moved to the archive.

---

## Final State Authority

Per the SDD Archive skill Final-State Authority hierarchy, the following ranked sources govern final-state claims:

1. **Explicit launch prompt final-state facts (orchestrator, most authoritative)**: all 38 tasks `[x]` complete; verify PASS (round 1: 2 CRITICAL + 4 WARNING, round 2: 2 WARNING — ALL resolved; 288/288 tests, tsc clean, build clean, lint clean, migration `20260811000045` applied); key decisions recorded (negative-disponible adjustments blocked by `products_reservado_le_total` CHECK with friendly error; `unit_cost` required positive in both product-form modes; cancel-order releases only pending reservations); runtime ledger attempt 8 failed → objective reset → attempt 9 passed with remediated-evidence binding.
2. **Persisted tasks artifact** (`tasks.md`): 38/38 tasks marked `[x]`, zero unchecked — passes the Task Completion Gate with no reconciliation needed.
3. **verify-report.md**: verdict PASS, 0 CRITICAL | 0 WARNING | 0 INFO at close, branch `feat/particulares/integration`. Its two-round narrative corroborates the launch-prompt final state; the intermediate round-1 CRITICALs were resolved before close and are NOT carried forward as open issues.

No contradictory claims were found between sources; no silent resolutions required.

---

## Key Decisions (recorded at verification)

1. **Negative-disponible adjustments are BLOCKED**: a manual adjustment that would drive `disponible` (= `stock_total - stock_reservado`) negative is rejected by the `products_reservado_le_total` CHECK and surfaced to the admin as a friendly error (oversell is blocked by design). Spec was aligned to design.
2. **`unit_cost` required positive** in BOTH the new-product and existing-product modes of `CargarProductoSheet` (`z.number().positive()`); `compra` movements require a non-null `unit_cost` (DB constraint).
3. **Cancel-order releases pending reservations only**: on transition into `cancelled`, `liberacion_reserva` is emitted only for `reserva` movements with no paired definitive egreso — already-consumed reservations are NEVER re-released.

---

## Task Completion

| Metric | Value |
|--------|-------|
| Total tasks | 38 (T-01..T-38) |
| Marked `[x]` | 38 |
| Unchecked | 0 |
| Reconciliation needed | None — persisted artifact reflects final state |

Task groups: DB migrations (T-01..T-13, T-38), TS type coordination (T-14..T-17), query keys (T-18), hooks (T-19..T-23), components (T-24..T-27), routes (T-28..T-29), wiring (T-30..T-31), integration smoke tests (T-32..T-34), unit tests (T-35..T-37). Smoke evidence executed against local DB via `/tmp/opencode/stock-flow-test.sql` and `/tmp/opencode/stock-cancel-test.sql`.

---

## Verification Results

**Verdict**: PASS
**Issues at close**: 0 CRITICAL | 0 WARNING | 0 INFO

### Pipeline at close (per verify-report.md)

| Step | Exit | Result |
|---|---|---|
| Tests | 0 | 41 files, 288 tests, 0 failures |
| Typecheck | 0 | Clean — 0 errors |
| Lint | 0 | 0 errors, 8 pre-existing warnings (none in touched files) |
| Build | 0 | Clean — chunk size advisory only (pre-existing) |
| Migration | 0 | `20260811000045` applied |
| DB constraint | 0 | `products_reservado_le_total` present on `public.products` |

### Verification rounds

Two rounds ran. Round 1 found 2 CRITICALs + 4 WARNINGs; all resolved. Round 2 found 2 WARNINGs (design drift); both fixed and re-verified.

- **Round 1 CRITICAL 1**: existing mode never sent `unit_cost`; `create_stock_movement` rejects `compra` without it → fixed by requiring positive `unit_cost` in existing mode, wired to `createMovement.unitCost`.
- **Round 1 CRITICAL 2**: spec said warn-not-block for negative disponible; design/implementation block via CHECK → spec reconciled to design (operation REJECTED with friendly error).
- **Round 1 WARNINGs 3–6**: missing columns (`stock_total`/`stock_reservado`/`updated_at`, `unit_cost`), single-select type filter vs spec multi-select, `created_by` NULL on trigger-created `reserva` rows → all fixed (columns added, multi-select Popover, migration `20260811000045_reserva_created_by.sql`).
- **Round 2 WARNING 1**: new-mode form allowed `unit_cost = 0` → `z.number().positive(...)` and `costPrice: values.unit_cost`.
- **Round 2 WARNING 2**: oversell CHECK (23514) surfaced generic "Validación fallida" → `mapMutationError.ts` added friendly branch "Operación rechazada: dejaría el stock disponible en negativo."

### Requirement / scenario coverage

- **18/18 requirements** satisfied, **47/47 scenarios** pass (per verify-report.md).

### Runtime ledger note

Verify attempt 8 closed `failed` (objective reset by maintainer decision); attempt 9 closed `passed` with `remediates-evidence-revision` binding the failed round-1 revision.

---

## Specs Synced (Delta → Source of Truth)

| Domain | Main Spec | Action | Merge |
|--------|-----------|--------|-------|
| key-configuration | `openspec/specs/ordenes-admin/spec.md` | MODIFIED | `Configure Key Item (ConfigureKeyItemSheet)` requirement replaced with stock-aware version: 4 original scenarios preserved, 3 added (`Stock decremented atomically on configure`, `No stock movement emitted when product_id is null`, `key_configuration ticket auto-resolved on configure success`); steps 1–6 for atomic stock decrement + ticket auto-resolve |
| sales-orders | `openspec/specs/ordenes-admin/spec.md` | ADDED | 2 requirements appended: `order_items.product_id Nullable FK` (2 scenarios), `Reservation Lifecycle on Order Events` (4 scenarios: reserva on key insert, particular not exempt, cancel releases pending, consumed not re-released) |
| stock-inventory | `openspec/specs/stock-inventory/spec.md` | CREATED | New main spec (no prior spec) — full spec copied byte-identical from delta: 10 requirements, 21 scenarios |
| support-tickets | `openspec/specs/tickets/spec.md` | ADDED | 5 requirements appended: `Extended Ticket Categories`, `Key Configuration Task Auto-Creation`, `Equipment Installation Task Auto-Creation`, `Resolution Chain — key_configuration to key_installation`, `Equipment Installation Resolution Side-Effect` (11 scenarios) |

All other pre-existing requirements in each target main spec were preserved unchanged.

**Mechanical Copy Verification**: `stock-inventory` main spec copied from change → `openspec/specs/stock-inventory/spec.md` via shell `cp` + `mktemp` + `mv`, verified with `diff -r` (empty — byte-identical). MODIFIED/ADDED merges for `ordenes-admin` and `tickets` applied via targeted edits that preserve all non-delta content.

---

## Archive Contents Verified

- ✅ proposal.md
- ✅ spec.md (change spec)
- ✅ specs/key-configuration/spec.md
- ✅ specs/sales-orders/spec.md
- ✅ specs/stock-inventory/spec.md
- ✅ specs/support-tickets/spec.md
- ✅ design.md
- ✅ tasks.md (38/38 tasks complete)
- ✅ verify-report.md (preserved unchanged)
- ✅ archive-report.md (this file — additive)

**Move verification**: pre-move recursive snapshot of `openspec/changes/stock-inventory/` compared with archived folder via `diff -r` — empty output (byte-identical). Source directory no longer exists in active changes. `git mv` failed (change folder untracked); fallback `mv` used, which is correct per Mechanical Copy Contract.

**Archive Location**: `openspec/changes/archive/2026-08-10-stock-inventory/`

---

## Notes

- `verify-report.md` and `tasks.md` were moved byte-identical (no edits to archived artifacts).
- No implementation files (code, migrations, seeds) were touched during archive.
- No commits, pushes, or PRs were created.
- `openspec/config.yaml` does not exist in this repo; no `rules.archive` constraints applied beyond the OpenSpec convention defaults.

---

## Source of Truth Updated

The following specs now reflect the stock-inventory behavior:

- `openspec/specs/ordenes-admin/spec.md` — Configure Key Item stock semantics (MODIFIED) + product_id FK / reservation lifecycle (ADDED)
- `openspec/specs/stock-inventory/spec.md` — full inventory domain spec (NEW)
- `openspec/specs/tickets/spec.md` — extended categories + auto-creation + resolution chain + equipment side-effect (ADDED)

---

## SDD Cycle Complete

**stock-inventory** has been fully planned, implemented, verified, and archived. The change is closed. No open tasks or blockers remain.

**Next Action**: Deploy to production or begin the next SDD change cycle.
