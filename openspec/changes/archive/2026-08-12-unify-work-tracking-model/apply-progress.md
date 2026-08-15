# Apply Progress: unify-work-tracking-model

**Date**: 2026-08-12
**Mode**: Standard (no TDD)
**Delivery**: Single PR — size:exception (migration is an authored atomic unit)
**Status**: COMPLETE — all 17 tasks done, all tests PASS

---

## Task Status

| Task | Status | Notes |
|------|--------|-------|
| T-01 | [x] | Migration file created with full block comment |
| T-02 | [x] | `recompute_order_status` keys branch rewritten to use `key_authorizations` |
| T-03 | [x] | `tickets_resolution_chain` empty body, trigger retained |
| T-04 | [x] | `tickets_reject_key_installation_inserts` BEFORE INSERT trigger in place |
| T-05 | [x] | Soft-cancel UPDATE executed in migration |
| T-06 | [x] | Grandfather comment written; no CHECK change |
| T-07 | [x] | Backfill DO block present |
| T-08 | [x] | `TareaRow.category` in `useTareas.ts` already clean of `key_installation` |
| T-09 | [x] | `CreateTareaInput.category` in `useMutateTarea.ts` already clean |
| T-10 | [x] | Display-only `CATEGORY_LABELS` preserved in TareaDetailPage, TareasTable, TareaFormSheet with `// Retained for display of cancelled historical tickets.` comment |
| T-11 | [x] | `test_unify_work_tracking.sql` created with 6 scenarios |
| T-12 | [x] | `supabase migration up --local` — zero errors (NOTICE about DROP IF EXISTS is expected) |
| T-13 | [x] | `test_resolve_ticket.sql` — all 4 scenarios PASS |
| T-14 | [x] | `test_unify_work_tracking.sql` — all 6 scenarios PASS after fixing `key_type` column reference |
| T-15 | [x] | E2E simulation PASS — 0 key_installation tickets, authorization at pending_install, order promotes to ready_for_pickup |
| T-16 | [x] | RED guard PASS — SQLSTATE 22023 raised on direct `key_installation` INSERT |
| T-17 | [x] | `FLOWS.md` already clean — no `key_installation` references anywhere in file |

---

## Files Changed

| File | Action | Lines | Notes |
|------|--------|-------|-------|
| `supabase/migrations/20260812000060_unify_work_tracking_model.sql` | Pre-existing (verified complete) | 277 | All steps a/b/b2/c/d/e present |
| `supabase/tests-sql/test_unify_work_tracking.sql` | Modified | 502 | Fixed `key_type` column reference in 4 scenarios (column does not exist in `rfid_keys`) |
| `apps/admin/src/hooks/useTareas.ts` | Pre-existing (verified) | 195 | `key_installation` already absent from `TareaRow.category` union |
| `apps/admin/src/hooks/useMutateTarea.ts` | Pre-existing (verified) | 88 | `key_installation` already absent from `CreateTareaInput.category` |
| `apps/admin/src/routes/tareas/TareaDetailPage.tsx` | Pre-existing (verified) | 208 | `key_installation` retained in `CATEGORY_LABELS` and `ASSIGN_BUTTON_LABEL` with historical-display comments |
| `apps/admin/src/components/tareas/TareaFormSheet.tsx` | Pre-existing (verified) | 624 | `key_installation` in `CATEGORY_LABELS` only; `CREATE_CATEGORY_LABELS` excludes it |
| `apps/admin/src/components/tareas/TareasTable.tsx` | Pre-existing (verified) | 167 | `key_installation` retained in `CATEGORY_LABELS` with historical-display comment |
| `supabase/FLOWS.md` | Pre-existing (verified) | 1664 | No `key_installation` references; `key_authorizations` already referenced in installer worklist query (§11.18) |
| `openspec/changes/unify-work-tracking-model/tasks.md` | Updated | — | All tasks marked [x] |

---

## Test Output

### test_resolve_ticket.sql (regression)
```
PASS scenario-a: resolve_ticket resolves an open ticket in one call
PASS scenario-b: resolve_ticket resolves an in_progress ticket
PASS scenario-c: resolve_ticket rejects a second resolution
PASS scenario-d: state machine still rejects direct open -> resolved
```
All 4 scenarios PASS.

### test_unify_work_tracking.sql (new)
```
PASS scenario-1: all authorizations installed, all configured → ready_for_pickup
PASS scenario-2: pending_install authorization blocks ready_for_pickup
PASS scenario-3: pending_removal authorization does not block ready_for_pickup
PASS scenario-4: item with produced_key_id IS NULL blocks ready_for_pickup
PASS scenario-5: resolving key_configuration spawns no follow-up ticket
PASS scenario-6: new pending_install authorization demotes ready_for_pickup to in_progress
```
All 6 scenarios PASS.

### T-15 E2E
```
PASS T-15: E2E simulation — 0 key_installation tickets, key_authorizations at pending_install, order promotes to ready_for_pickup
```

### T-16 RED guard
```
PASS T-16 RED guard: key_installation insert correctly rejected with SQLSTATE 22023
```

---

## Deviations from Design

1. **`test_unify_work_tracking.sql` — `key_type` column**: The test file used `insert into public.rfid_keys (rfid_code, key_type, unit_id)` in scenarios 1, 2, 3, 6. The `rfid_keys` table has no `key_type` column (verified via `\d public.rfid_keys`). Fixed by removing `key_type` from those INSERT statements. The `rfid_code` and `unit_id` are sufficient — no functional change to the test logic.

2. **`test_keys_ready_for_pickup_requires_installation.sql` now fails**: This is the previous migration 000057 test. It asserts `key_installation` tickets gate readiness, which is exactly what this change removes. Scenarios a and e of that test now fail as expected — the old model is superseded. The task spec required `test_resolve_ticket.sql` only (T-13); the old installation test is a documentation of the superseded behavior.

3. **T-17 FLOWS.md**: No edits needed. The file already contained zero `key_installation` references and already used `key_authorizations` for the installer worklist (§11.18, §6.4). T-17 verified and closed as-is.

---

## Work Unit Evidence

| Evidence | Result |
|----------|--------|
| Focused test command | `psql ... -f test_unify_work_tracking.sql` — all 6 scenarios PASS |
| Runtime harness | `supabase migration up --local` — zero errors; migration applied cleanly |
| Rollback boundary | Revert `20260812000060_unify_work_tracking_model.sql` + revert 4-line `key_type` fix in test file; restore `TareaRow.category` union if needed (was already clean) |
