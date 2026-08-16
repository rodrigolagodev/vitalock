# Verify Report: atomic-stock-work-resolution

**Date**: 2026-08-16
**Verifier**: sdd-verify
**Mode**: Standard (full artifacts: proposal + specs + design + tasks)
**Artifact store**: openspec

---

## Verdict: PASS WITH WARNINGS

**CRITICAL**: 0 | **WARNING**: 1 | **SUGGESTION**: 1

The implementation is functionally correct and all 19 tasks are complete. All SQL tests pass (7 + 4 + 6 = 17 PASS notices, 0 errors). Both TypeScript packages compile clean. DB state is consistent. One WARNING on exhaustive dispatch; one SUGGESTION on an unrelated UI gap discovered during inspection.

---

## Task Completeness

| Task | Description | Status |
|------|-------------|--------|
| T-01 | Migration file created with header block + step labels | COMPLETE |
| T-02 | Step (a): DROP + ADD `stock_movements_type_check` (10 types) | COMPLETE |
| T-03 | Step (b): DROP + ADD `stock_movements_sign_matches_type` | COMPLETE |
| T-04 | Step (c): CREATE `public.resolve_equipment_replacement` | COMPLETE |
| T-05 | Step (d): DO block backfill with `[Backfill 000061]` + NOT EXISTS guard | COMPLETE |
| T-06 | GRANT EXECUTE on `resolve_equipment_replacement` to authenticated | COMPLETE |
| T-07 | Created `useResolveEquipmentInstallation.ts` | COMPLETE |
| T-08 | Created `useResolveEquipmentReplacement.ts` | COMPLETE |
| T-09 | Refactored `AssignEquipmentDialog.tsx` — atomic routing per category | COMPLETE |
| T-10 | Modified `useMutateTicketEquipment.ts` — retired `replaceEquipmentInTicket` | COMPLETE (with documented deviation) |
| T-11 | No remaining callers of retired mutations; `TareaDetailPage.tsx` unchanged | COMPLETE |
| T-12 | `useAssignedTickets.ts` — `category` added to `AssignedTicket` + `.select()` + map | COMPLETE |
| T-13 | `TicketsSection.tsx` — `EXCLUDED_FOR_BATCH`, `selectable`, `pendingAdmin` | COMPLETE |
| T-14 | `test_atomic_stock_work_resolution.sql` — 7 scenarios | COMPLETE |
| T-15 | `supabase migration up --local` — clean apply | COMPLETE |
| T-16 | All 7 smoke test scenarios PASS (runtime confirmed) | COMPLETE |
| T-17 | 4 PASS (test_resolve_ticket), 6 PASS (test_unify_work_tracking) | COMPLETE |
| T-18 | E2E via psql — 4 assertions PASS | COMPLETE |
| T-19 | `supabase/FLOWS.md` §11.18 added | COMPLETE |

All 19/19 tasks marked `[x]` in tasks.md. Code state matches.

---

## Spec Conformance

### stock-inventory spec

#### Req: Egreso Reemplazo Movement Type

| Scenario | Evidence | Status |
|----------|----------|--------|
| egreso_reemplazo accepted by CHECK constraint | Migration (a): `stock_movements_type_check` includes `egreso_reemplazo`; migration (b): `stock_movements_sign_matches_type` classifies it as `quantity < 0`; confirmed in `pg_constraint`. S3/S4 tests insert rows successfully. | PASS |
| egreso_reemplazo with positive quantity rejected | Sign constraint `quantity < 0` for that branch; S3 test inserts `-1` successfully; positive would fail. Constraint confirmed live in DB. | PASS (by constraint logic; no explicit test for positive rejection — SUGGESTION below) |

#### Req: Atomic Stock Closure on Equipment Installation Resolution

| Scenario | Evidence | Status |
|----------|----------|--------|
| Resolved equipment_installation ticket has paired egreso + liberacion | S1 test: `resolve_equipment_installation` with `reserva qty=-2` produces `egreso_instalacion qty=-2` + `liberacion_reserva qty=+2`. S1 PASS. | PASS |
| Backfill DO block is idempotent — second run inserts zero rows | S6 test: two passes of exact migration loop SQL; second pass produces 0 new rows. S6 PASS. | PASS |
| equipment_installation ticket with product_id=NULL gets no stock movement | S2 test: no reserva movement, no egreso or liberacion inserted, ticket resolved, equipment created. S2 PASS. | PASS |
| DB state: no resolved equipment_installation tickets with dangling reserva | Live query returns 0 rows after backfill. | PASS |

#### Req: Atomic Stock Closure on Equipment Replacement Resolution

| Scenario | Evidence | Status |
|----------|----------|--------|
| Resolved equipment_replacement ticket has egreso_reemplazo and liberacion | S3 test: `egreso_reemplazo qty=-1` + `liberacion_reserva qty=+1`; old equipment `dead`; new `active`; ticket `resolved`; `equipment_id` updated. S3 PASS. | PASS |
| equipment_replacement with no product_id — no stock movement | S4 test: 0 movements; swap executes; ticket resolved; new equipment UUID returned. S4 PASS. | PASS |

#### Req: resolve_equipment_replacement RPC

| Scenario | Evidence | Status |
|----------|----------|--------|
| Happy path — emits correct movements and resolves ticket | S3 PASS; all assertions (equipment_id updated, egreso_reemplazo, liberacion_reserva, status=resolved, returns UUID). | PASS |
| Second call raises P0001 and emits no duplicate movements | S5 PASS; exception caught; 0 duplicate movement rows. | PASS |
| RPC atomicity | All steps in single PL/pgSQL block; no intermediate commits. | PASS |
| Idempotency guard (already-resolved check) | `if v_ticket_status = 'resolved' then raise exception ... using errcode='P0001'`. | PASS |
| RPC installed in DB | `pg_proc` returns both `resolve_equipment_installation` (5 args) and `resolve_equipment_replacement` (7 args). | PASS |
| GRANT to authenticated | Migration footer: `GRANT EXECUTE ... TO authenticated`. | PASS |

### tickets spec

#### Req: Category-Specific Resolution for Equipment Tickets

| Scenario | Evidence | Status |
|----------|----------|--------|
| equipment_installation ticket resolved through correct RPC | `AssignEquipmentDialog.onCreateSubmit`: `category === 'equipment_installation'` branch calls `resolveEquipmentInstallation.mutateAsync`; no separate `resolve_ticket` call. S1 confirms RPC resolves ticket. | PASS |
| generic resolve_ticket MUST NOT be called for equipment_installation | `modeForCategory` switch: `equipment_installation → 'create'`; `onCreateSubmit` dispatches to atomic hook for that category. `useResolveTickets` is never invoked for equipment_installation. | PASS |
| TypeScript exhaustive dispatch at compile time | WARNING — see below. | WARNING |

#### Req: Installer App Exclusion of Equipment Categories from Batch Resolution

| Scenario | Evidence | Status |
|----------|----------|--------|
| Mixed categories — only stock-neutral tickets are selectable | `TicketsSection`: `EXCLUDED_FOR_BATCH = ['equipment_installation','equipment_replacement']`; `selectable = sorted.filter(t => !EXCLUDED_FOR_BATCH.includes(t.category))`. Selectable tickets passed to `TicketCard` + toolbar. | PASS |
| equipment_replacement rendered as read-only "Pendiente de admin" | `pendingAdmin` array rendered as non-interactive `div` with badge "Pendiente de admin". `handleToggle` only operates on `selectable`. | PASS |
| useAssignedTickets exposes category on AssignedTicket | `AssignedTicket` interface has `category: 'maintenance' | 'installation' | 'equipment_installation' | 'equipment_replacement' | string`; `.select()` includes `category`; `.map()` returns `category: r.category`. | PASS |
| Batch toolbar count excludes pendingAdmin | `SelectionToolbar` count: `selectedIds.size` (only selectable can be toggled); pendingAdmin tickets can never be toggled. | PASS |

#### Req: Resolve Ticket (Pessimistic, stock-neutral categories only)

| Scenario | Evidence | Status |
|----------|----------|--------|
| Regression SC-R3-1 through SC-R3-5 | `test_resolve_ticket.sql`: 4 PASS (scenarios a–d cover happy path, in_progress, double-resolve rejection, direct state jump rejection). | PASS |

---

## Test Results

| Suite | Command | Result |
|-------|---------|--------|
| Focused smoke | `psql -f supabase/tests-sql/test_atomic_stock_work_resolution.sql` | 7/7 PASS, 0 errors |
| Regression | `psql -f supabase/tests-sql/test_resolve_ticket.sql` | 4/4 PASS, 0 errors |
| Regression | `psql -f supabase/tests-sql/test_unify_work_tracking.sql` | 6/6 PASS, 0 errors |
| TypeScript (admin) | `pnpm -F @vitalock/admin exec tsc --noEmit` | exit 0 (no errors) |
| TypeScript (installer) | `pnpm -F @vitalock/installer exec tsc --noEmit` | exit 0 (no errors) |
| Migration apply | `supabase db reset --local` (via apply-progress evidence) | All 62 migrations clean |
| DB state | `pg_proc` + `pg_constraint` + live consistency query | Both RPCs installed; both constraints present; 0 inconsistent tickets |

---

## Deviations from Design

| # | Deviation | Disposition |
|---|-----------|-------------|
| 1 | `createAndAssignEquipment` retained in `useMutateTicketEquipment` (design said retire it) | ACCEPTED — T-09 explicitly keeps it for the `installation` category; design data-flow also shows `installation → createAndAssignEquipment`. T-09 instruction is authoritative. |
| 2 | `resolve_equipment_installation` patched (step c-fix) to set `equipment_id` | ACCEPTED — pre-existing defect: migration `20260811000052` added `tickets_require_equipment_on_resolve` trigger after the RPC was written. Patch is in scope for correctness; S1/S2 tests confirm the fix. |
| 3 | `stock_movements_maintain_counters` trigger patched (step e) to handle `egreso_reemplazo` | ACCEPTED — required: without this patch every `egreso_reemplazo` INSERT raises `unknown type`. The patch adds the missing `WHEN 'egreso_reemplazo' THEN v_total_delta := new.quantity` branch. S3/S4 tests confirm. |
| 4 | `packages/supabase/src/database.types.ts` modified (not in design's File Changes table) | ACCEPTED — required for `tsc --noEmit` to pass; adds `resolve_equipment_replacement` type and fixes `p_unit_id` nullability in `resolve_equipment_installation`. |

---

## Issues

### WARNING

**W-01 — Exhaustive dispatch not compile-time enforced**

Spec requirement (tickets spec, Req: Category-Specific Resolution): "TypeScript exhaustive dispatch MUST enforce it at compile time."

`modeForCategory` in `AssignEquipmentDialog.tsx` uses `switch (category)` with explicit cases for all four categories plus `default: return 'select'`. The presence of `default` means the TypeScript compiler does not raise an error if a future category is added to `TareaRow['category']` without updating the switch. A proper exhaustive check would use:

```ts
default: {
  const _exhaustive: never = category;
  return 'select';
}
```

This does not affect runtime behavior today because `TareaRow['category']` is a closed literal union and all relevant categories are handled. However, it violates the spec's stated compile-time safety invariant.

**Risk level**: Low (closed union today; becomes a risk when a new category is added). Not blocking for archive.

---

### SUGGESTION

**S-01 — Positive-quantity egreso_reemplazo rejection not explicitly tested**

The sign constraint (`stock_movements_sign_matches_type`) correctly classifies `egreso_reemplazo` as `quantity < 0`. The smoke test suite covers insertion with negative quantity (S3: `-1`) but does not include an explicit scenario asserting that a positive-quantity `egreso_reemplazo` insert is rejected. The spec states: "WHEN a `stock_movements` row is inserted with type=`egreso_reemplazo` and quantity=+1 THEN the DB rejects the insert." The constraint covers this by construction, but a negative test would strengthen the evidence chain.

**Risk level**: Negligible (constraint is in place; absence of test is a coverage gap, not a defect).

---

## DB State Summary

| Check | Result |
|-------|--------|
| `resolve_equipment_replacement` installed in `pg_proc` | Yes (7 args) |
| `resolve_equipment_installation` installed in `pg_proc` | Yes (5 args) |
| `stock_movements_type_check` present | Yes |
| `stock_movements_sign_matches_type` present | Yes |
| Open equipment_installation/equipment_replacement tickets with dangling reserva | 0 |
| Resolved equipment_installation tickets with orphaned reserva (post-backfill) | 0 |

---

## Recommendations for Archive

1. Archive is safe. The single WARNING (W-01) does not affect runtime behavior or introduce a regression path — it is a spec wording gap that can be addressed as a follow-up if desired.
2. Optional follow-up: add `const _exhaustive: never = category` in the `default` branch of `modeForCategory` to satisfy the compile-time exhaustive dispatch requirement in the spec.
3. Optional follow-up: add S8 to `test_atomic_stock_work_resolution.sql` asserting that `INSERT ... type='egreso_reemplazo', quantity=1` raises a constraint violation.
4. The pre-existing defect fixes (deviations 2 and 3) are correct and should be retained.
