# Archive Report: atomic-stock-work-resolution

**Date**: 2026-08-16
**Archive executor**: sdd-archive
**Change name**: atomic-stock-work-resolution
**Status**: ARCHIVED
**Verdict**: PASS WITH WARNINGS

---

## Change Summary

This change closes the stock ledger gap for `equipment_installation` and `equipment_replacement` tickets by introducing atomic resolution RPCs that emit definitive stock movements in a single transaction with ticket state changes. Extends `stock_movements.type` domain with `egreso_reemplazo`, adds `public.resolve_equipment_replacement` RPC, backfills historical resolved `equipment_installation` tickets that were missing stock closure movements, refactors admin equipment resolution flow to use category-specific atomic hooks, and filters installer batch-resolution toolbar to exclude equipment categories (admin-only).

---

## Artifacts

All artifacts have been successfully moved to the archive directory:

- **Folder**: `openspec/changes/archive/2026-08-16-atomic-stock-work-resolution/`
- **proposal.md** ✅ — Change intent, scope, approach, affected areas
- **specs/stock-inventory/spec.md** ✅ — Delta spec defining Egreso Reemplazo, atomic closures, `resolve_equipment_replacement` RPC
- **specs/tickets/spec.md** ✅ — Delta spec defining category-specific resolution, installer exclusion, batch-toolbar filtering
- **design.md** ✅ — Technical approach, architecture decisions, data flow, file changes, interfaces, testing strategy
- **tasks.md** ✅ — 19 implementation tasks (all 19/19 marked complete [x])
- **apply-progress.md** ✅ — Task completion evidence, files changed summary, test results
- **verify-report.md** ✅ — Verification verdict and detailed test evidence

---

## Verification Verdict

**PASS WITH WARNINGS**

- **CRITICAL**: 0
- **WARNING**: 1 (non-blocking)
- **SUGGESTION**: 1 (non-blocking)

Per `verify-report.md` (observation archive-verified at 2026-08-16):
- All 19/19 implementation tasks complete
- All 7 SQL smoke test scenarios PASS (0 errors)
- Regression test suites: 4 PASS (test_resolve_ticket) + 6 PASS (test_unify_work_tracking)
- TypeScript compilation: both admin and installer packages clean (exit 0)
- DB state: both new RPCs installed; both constraints present; 0 inconsistent tickets
- E2E via psql: all 4 assertions PASS

### W-01 — Exhaustive dispatch not compile-time enforced (Low risk)

The `modeForCategory` switch in `AssignEquipmentDialog.tsx` includes an explicit `default` clause, which prevents the TypeScript compiler from raising an error if a new ticket category is added without updating the switch. The spec requires compile-time exhaustive dispatch using the `never` pattern (`const _exhaustive: never = category`). This does not affect runtime behavior today (all relevant categories are handled), but violates the spec's compile-time safety invariant. **Deferred as follow-up**: add `const _exhaustive: never = category` in the `default` branch to satisfy strict exhaustive check.

### S-01 — Positive-quantity egreso_reemplazo not explicitly tested (Negligible)

The sign constraint (`stock_movements_sign_matches_type`) correctly classifies `egreso_reemplazo` as requiring `quantity < 0`. The smoke test suite covers insertion with negative quantity (S3: `-1`) but not an explicit negative test asserting positive-quantity rejection. The constraint is in place; this is a coverage gap, not a defect. **Deferred as follow-up**: add S8 scenario explicitly testing and rejecting `INSERT ... type='egreso_reemplazo', quantity=+1`.

---

## Task Completion

All 19 implementation tasks marked complete in `tasks.md`:

| Phase | Tasks | Status |
|-------|-------|--------|
| Phase 1 (DB Migration) | T-01 through T-06 | 6/6 COMPLETE |
| Phase 2 (SQL Smoke Test) | T-14 | 1/1 COMPLETE |
| Phase 3 (Admin Client) | T-07 through T-11 | 5/5 COMPLETE |
| Phase 4 (Installer Client) | T-12 through T-13 | 2/2 COMPLETE |
| Phase 5 (Verification) | T-15 through T-18 | 4/4 COMPLETE |
| Phase 6 (Docs) | T-19 | 1/1 COMPLETE |

No stale or incomplete implementation tasks.

---

## Spec Conformance

### stock-inventory Spec

**ADDED Requirements** (merged into main spec):
1. **Egreso Reemplazo Movement Type** — `egreso_reemplazo` added to CHECK constraint and sign constraint; both negative-quantity scenarios PASS in smoke tests.
2. **Atomic Stock Closure on Equipment Installation Resolution** — All scenarios (paired egreso/liberacion, idempotent backfill, NULL product_id handling) PASS; backfill verified: 0 dangling reservas post-migration.
3. **Atomic Stock Closure on Equipment Replacement Resolution** — Scenarios covering egreso_reemplazo/liberacion pair and NULL product_id handling PASS.
4. **resolve_equipment_replacement RPC** — Happy path, idempotency guard (already-resolved P0001), atomicity, GRANT to authenticated all PASS.

### tickets Spec

**ADDED Requirements** (merged into main spec):
1. **Category-Specific Resolution for Equipment Tickets** — TypeScript routing (`equipment_installation` → `useResolveEquipmentInstallation`, `equipment_replacement` → `useResolveEquipmentReplacement`) PASS. WARNING on exhaustive dispatch (see above).
2. **Installer App Exclusion of Equipment Categories** — `EXCLUDED_FOR_BATCH` filter, `selectable` / `pendingAdmin` arrays, category field on `AssignedTicket` all PASS.

**MODIFIED Requirements**:
1. **R3 — Resolve Ticket (Pessimistic, via RPC)** — Restricted to stock-neutral categories only (`maintenance`, `installation`). Regression scenarios SC-R3-1 through SC-R3-5 all PASS; equipment categories correctly excluded from installer toolbar.

---

## Pre-Existing Defects Fixed During Apply

Two pre-existing defects were discovered and corrected in-flight during the apply phase (not mentioned in original design, but required for correctness):

### Defect 1: `public.resolve_equipment_installation` Missing `equipment_id` Update

**Discovery**: During test authorship (T-14 scenario 1), the RPC call succeeded but the ticket's `equipment_id` field remained NULL, causing the `tickets_require_equipment_on_resolve` trigger (from migration `20260811000052`) to reject the subsequent ticket state transition.

**Root cause**: Migration `20260811000041` (which created `resolve_equipment_installation`) pre-dates migration `20260811000052`, which added the trigger guard requiring `equipment_id IS NOT NULL` on resolved tickets. The original RPC never updated `equipment_id`.

**Fix**: Migration `20260812000061` includes a "step c-fix" that replaces the `resolve_equipment_installation` function to set `equipment_id` before transitioning to resolved. Test S1 and S2 confirm the fix works.

**Evidence**: All 7 smoke test scenarios PASS after the fix; E2E scenario T-18 assertion (c) confirms `operations.equipment` row exists with new serial.

### Defect 2: `stock_movements_maintain_counters` Trigger Missing `egreso_reemplazo` Handler

**Discovery**: When smoke test S3 attempted to insert an `egreso_reemplazo` movement, the trigger (migration `20260811000030`) raised `unknown type` because the CASE statement enumerated all known types but did not include `egreso_reemplazo`.

**Root cause**: The trigger was authored to raise on unrecognized movement types. Adding `egreso_reemplazo` to the CHECK constraint without updating the trigger would cause every such insert to fail.

**Fix**: Migration `20260812000061` includes a "step e" that replaces the trigger to add a WHEN branch for `egreso_reemplazo`, treating it like other egresos (deducting from `stock_total`).

**Evidence**: Smoke test scenarios S3 and S4 (both using `egreso_reemplazo`) now PASS without error.

**Disposition**: Both fixes are in scope for correctness and have been validated by test evidence. They are **retained** in the archived implementation.

---

## Deviations from Original Design

| # | Deviation | Reason | Disposition |
|---|-----------|--------|-------------|
| 1 | `createAndAssignEquipment` retained in `useMutateTicketEquipment` | Design said retire it, but T-09 explicitly keeps it for `installation` category (which has no `product_id` and no stock side-effect). Design data-flow also shows `installation → createAndAssignEquipment`. | ACCEPTED — T-09 instruction is authoritative; `replaceEquipmentInTicket` was retired as planned. |
| 2 | `resolve_equipment_installation` patched to set `equipment_id` | Design did not account for `tickets_require_equipment_on_resolve` trigger added in migration 052. | ACCEPTED — pre-existing defect fix; required for correctness. |
| 3 | `stock_movements_maintain_counters` trigger patched for `egreso_reemplazo` | Design did not account for trigger's exhaustive type check. | ACCEPTED — pre-existing defect fix; required for correctness. |
| 4 | `packages/supabase/src/database.types.ts` modified | Design's File Changes table did not list it. | ACCEPTED — required for `tsc --noEmit` to pass; adds `resolve_equipment_replacement` type and fixes `p_unit_id` nullability. |

---

## Rollback Plan

Per design §9 (Rollback), should the change need to be reverted:

1. Drop `public.resolve_equipment_replacement` function.
2. Revert `resolve_equipment_installation` and `stock_movements_maintain_counters` to their pre-061 definitions.
3. Restore original `stock_movements_type_check` and `stock_movements_sign_matches_type` constraints (drop `egreso_reemplazo` from both).
4. Delete backfilled movements: `DELETE FROM public.stock_movements WHERE note LIKE '[Backfill 000061]%'`.
5. Git revert client commits (admin hooks, dialog, installer, types).

**Note**: App is not in production; rollback risk is manageable.

---

## Follow-Up Actions (Deferred)

The following improvements are deferred as non-blocking follow-ups:

1. **Compile-time exhaustive dispatch (W-01)**: Add `const _exhaustive: never = category` in `modeForCategory` default clause to enforce strict TypeScript exhaustiveness.
   
2. **Explicit negative test for sign constraint (S-01)**: Add S8 scenario to `test_atomic_stock_work_resolution.sql` asserting that `INSERT ... type='egreso_reemplazo', quantity=+1` raises constraint violation.

3. **DB-level rejection of `resolve_ticket` for stock categories (Option 5)**: Add a SQL guard inside `resolve_ticket` to reject categories `equipment_installation` and `equipment_replacement` with a clear error. Currently enforced only at the component layer + TypeScript dispatch. Defer as defense-in-depth follow-up.

4. **Dedicated `operations.equipment.unit_id` column**: Replace the notes-only stopgap (`p_unit_id` stored in `equipment.notes`) with a proper database column. Pre-existing limitation; noted in proposal as follow-up.

---

## Files Modified / Created

### Merged Into Main Specs

- **`openspec/specs/stock-inventory/spec.md`** — Added 4 new requirements (Egreso Reemplazo, Atomic Stock Closure on Equipment Installation, Atomic Stock Closure on Equipment Replacement, resolve_equipment_replacement RPC)
- **`openspec/specs/tickets/spec.md`** — Added 2 new requirements + modified R3 (Category-Specific Resolution, Installer Exclusion, R3 restricted to stock-neutral categories)

### Database

- **`supabase/migrations/20260812000061_atomic_stock_work_resolution.sql`** — NEW
  - Step (a): Extend `stock_movements_type_check` to include `egreso_reemplazo`
  - Step (b): Refresh `stock_movements_sign_matches_type` to classify `egreso_reemplazo` as negative
  - Step (c): Create `public.resolve_equipment_replacement(...)` RPC
  - Step (c-fix): Patch `public.resolve_equipment_installation(...)` to set `equipment_id`
  - Step (d): Backfill DO block for historical resolved `equipment_installation` tickets
  - Step (e): Patch `stock_movements_maintain_counters` trigger to handle `egreso_reemplazo`
  - Step (f): GRANT EXECUTE to authenticated

- **`supabase/tests-sql/test_atomic_stock_work_resolution.sql`** — NEW
  - 7 scenarios covering both new RPCs, backfill idempotency, NULL product_id handling, already-resolved guard, temp-table nesting

### Admin Client

- **`apps/admin/src/hooks/useResolveEquipmentInstallation.ts`** — NEW
- **`apps/admin/src/hooks/useResolveEquipmentReplacement.ts`** — NEW
- **`apps/admin/src/hooks/useMutateTicketEquipment.ts`** — MODIFIED (retired `replaceEquipmentInTicket`; retained `createAndAssignEquipment` for `installation` category)
- **`apps/admin/src/components/tareas/AssignEquipmentDialog.tsx`** — MODIFIED (atomic routing per category)
- **`apps/admin/src/routes/tareas/TareaDetailPage.tsx`** — No changes needed

### Installer Client

- **`apps/installer/src/hooks/useAssignedTickets.ts`** — MODIFIED (added `category` field)
- **`apps/installer/src/components/work/TicketsSection.tsx`** — MODIFIED (batch toolbar filtering, "Pendiente de admin" cards)

### Shared Types

- **`packages/supabase/src/database.types.ts`** — MODIFIED (added `resolve_equipment_replacement` type, fixed `p_unit_id` nullability)

### Documentation

- **`supabase/FLOWS.md`** — MODIFIED (added §11.18 describing atomic equipment flows)

---

## Summary of Test Evidence

| Test | Command | Result |
|------|---------|--------|
| Focused smoke | `test_atomic_stock_work_resolution.sql` | 7/7 PASS |
| Regression (resolve_ticket) | `test_resolve_ticket.sql` | 4/4 PASS |
| Regression (unify_work_tracking) | `test_unify_work_tracking.sql` | 6/6 PASS |
| TypeScript (admin) | `tsc --noEmit` | exit 0 |
| TypeScript (installer) | `tsc --noEmit` | exit 0 |
| Migration apply | `supabase db reset --local` | All 62 migrations clean |
| E2E (T-18) | psql inline assertions | All 4 PASS |

---

## SDD Cycle Completion

The following phase artifacts are now archived:

- ✅ Proposal (intent, scope, approach, affected areas, risks, rollback)
- ✅ Specifications (delta specs for stock-inventory and tickets, now merged into main specs)
- ✅ Design (technical approach, architecture decisions, data flow, file changes, interfaces, testing strategy)
- ✅ Tasks (19 implementation tasks, all marked complete)
- ✅ Apply Progress (task completion evidence, test results)
- ✅ Verification Report (verdict PASS WITH WARNINGS, no blocking issues)
- ✅ Archive Report (this document — final state at close)

The change is **complete, verified, and ready for production deployment** (subject to ordinary deployment gates).

---

## Archive Verification Checklist

- [x] Main specs updated with delta requirements (stock-inventory: +92 lines; tickets: +58 lines)
- [x] Change folder moved to archive (`openspec/changes/archive/2026-08-16-atomic-stock-work-resolution/`)
- [x] Archive contains all artifacts (proposal, specs, design, tasks, apply-progress, verify-report)
- [x] Archived `tasks.md` has no unchecked implementation tasks (all 19/19 marked [x])
- [x] Active changes directory no longer contains this change
- [x] `diff -r` readback: empty diff (byte-identity verified; no truncation)
- [x] No CRITICAL issues in verify-report (0 CRITICAL, 1 WARNING, 1 SUGGESTION)
- [x] All 19 tasks complete with evidence
- [x] Pre-existing defects (2) documented and fixed in-flight
- [x] Deviations (4) documented with rationale and disposition
- [x] Follow-up actions (4) identified and prioritized

---

## Next Steps

1. **Deploy DB migration 000061** (`supabase migration push`) to production DB.
2. **Deploy admin client** (git commit + branch → PR → merge to main).
3. **Deploy installer client** (git commit + branch → PR → merge to main).
4. **Post-deployment validation**: Run `test_atomic_stock_work_resolution.sql` against production DB to confirm stock ledger is consistent.
5. **Schedule follow-ups**: Assign W-01, S-01, Option 5 (DB guard), and unit_id column to future backlog items.

The SDD cycle for `atomic-stock-work-resolution` is **closed**.
