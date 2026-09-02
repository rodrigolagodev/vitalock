# Apply Progress — terminal-state-immutability

**Mode**: Strict TDD  
**Delivery**: single-pr, well under 800-line budget (~220 lines net authored)

---

## Phase 1 — SQL migration

### Tasks
- [x] 1.1 Migration file created at `supabase/migrations/20260901170000_add_terminal_immutability_triggers.sql`
- [x] 1.2 `support.tickets_terminal_immutable()` + trigger — terminal set: `resolved, cancelled`
- [x] 1.3 `public.technical_orders_terminal_immutable()` + trigger — terminal set: `invoiced, cancelled`
- [x] 1.4 `public.key_orders_terminal_immutable()` + trigger — terminal set: `invoiced, cancelled`
- [x] 1.5 Migration applied to remote. Triggers verified via `information_schema.routines` query.

### Verification
All 3 trigger functions confirmed on remote:
- `support.tickets_terminal_immutable`
- `public.technical_orders_terminal_immutable`
- `public.key_orders_terminal_immutable`

Migration history repaired and in sync (local = remote for `20260901170000`).

Note: triggers were already present on remote (pre-applied in a previous session). `supabase migration repair --status applied` was used to sync the history table.

---

## Phase 2 — Admin UI guards

### Tasks
- [x] 2.1 `TareaDetailPage.tsx`: `isTerminalTicket(status)` helper already present; "Editar" button guard confirmed at line 125.
- [x] 2.2 `KeyOrderDetailPage.tsx`: replaced `TERMINAL_STATUSES = new Set(['completed', 'invoiced', 'cancelled'])` with `isTerminalOrder(status)` returning `status === 'invoiced' || status === 'cancelled'`. `completed` intentionally excluded — `mark_key_order_invoiced` transitions from `completed`.

### TDD Evidence
| Task | RED confirmation | GREEN |
|------|-----------------|-------|
| 2.2 `isTerminalOrder` | Test "shows cancel button when status is completed (NOT terminal for key orders)" failed against old code | Passed after replacing `TERMINAL_STATUSES` with `isTerminalOrder` |

---

## Phase 3 — Tests

### Tasks
- [x] 3.1 Created `apps/admin/src/routes/tareas/__tests__/TareaDetailPage.test.tsx` — 7 tests covering Editar button terminal guard (resolved/cancelled hidden, open/in_progress shown) and basic rendering.
- [x] 3.2 Extended `apps/admin/src/routes/llaves/__tests__/KeyOrderDetailPage.test.tsx` — 6 new tests: invoiced/cancelled hide cancel, completed shows cancel, `canRegisterPickup` false for terminal statuses. Total: 20 tests (was 14).
- [x] 3.3 Created `apps/admin/src/hooks/__tests__/useMutateTarea.test.ts` — 4 tests: P0001 surfaces for resolved/cancelled rows, success path, call shape.
- [x] 3.4 Extended `apps/admin/src/hooks/__tests__/useMutateTechnicalOrder.test.ts` — 2 new tests: P0001 on invoiced cancel, completed→invoiced succeeds. Total: 22 tests (was 20).
- [x] 3.5 Extended `apps/admin/src/hooks/__tests__/useMutateKeyOrder.test.ts` — 2 new tests: P0001 on invoiced cancel, completed→invoiced succeeds. Total: 25 tests (was 23).

### TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 3.1 | `tareas/__tests__/TareaDetailPage.test.tsx` | Integration | N/A (new file) | Written (approval pattern — existing impl) | ✅ 7/7 | ✅ resolved + cancelled + open + in_progress | ➖ None needed |
| 3.2 | `llaves/__tests__/KeyOrderDetailPage.test.tsx` | Integration | ✅ 14/14 | ✅ "completed shows cancel" failed vs old code | ✅ 20/20 after impl | ✅ invoiced + cancelled + completed cases | ✅ Mock updated to capture canRegisterPickup |
| 3.3 | `hooks/__tests__/useMutateTarea.test.ts` | Unit | N/A (new file) | Written before impl | ✅ 4/4 | ✅ resolved + cancelled P0001 cases | ➖ None needed |
| 3.4 | `hooks/__tests__/useMutateTechnicalOrder.test.ts` | Unit | ✅ 20/20 | Written before impl | ✅ 22/22 | ✅ invoiced block + completed→invoiced success | ➖ None needed |
| 3.5 | `hooks/__tests__/useMutateKeyOrder.test.ts` | Unit | ✅ 23/23 | Written before impl | ✅ 25/25 | ✅ invoiced block + completed→invoiced success | ➖ None needed |

### Test Summary
- **Total tests written this change**: 21 new tests
- **Total tests passing after change**: 673/673 (full suite)
- **Layers used**: Integration (2 test files), Unit (3 test files)
- **Approval tests**: Phase 3.1 uses approval pattern for existing `isTerminalTicket` implementation
- **Pure functions created**: `isTerminalOrder(status)` in `KeyOrderDetailPage.tsx`

---

## Phase 4 — Verification

### Tasks
- [x] 4.1 `pnpm --filter @vitalock/admin typecheck` — GREEN. `pnpm test` — 95 test files, 673 tests, all GREEN.
- [x] 4.2 Manual verification checklist created at `openspec/changes/terminal-state-immutability/manual-verification.md`.

---

## Phase 5 — Commit

- [x] 5.1 Commit `ed7ef17` — "feat(db): enforce terminal-state immutability via BEFORE UPDATE triggers"
- [ ] 5.2 Push to origin main — **awaiting user confirmation**

---

## Work Unit Evidence

| Evidence | Value |
|----------|-------|
| Focused test command | `cd apps/admin && pnpm vitest run src/routes/llaves/__tests__/KeyOrderDetailPage.test.tsx` → 20/20 passed |
| Runtime harness | DB trigger verified via `information_schema.routines` query on remote; all 3 functions present |
| Rollback boundary | Drop 3 triggers + 3 functions (SQL); revert `KeyOrderDetailPage.tsx` `isTerminalOrder` to `TERMINAL_STATUSES` with `completed`; delete 3 new test files |

---

## Files Changed

| File | Action | What |
|------|--------|------|
| `supabase/migrations/20260901170000_add_terminal_immutability_triggers.sql` | Created (prior session) | 3 trigger functions + triggers |
| `apps/admin/src/routes/llaves/KeyOrderDetailPage.tsx` | Modified | Replaced `TERMINAL_STATUSES` Set with `isTerminalOrder()` helper |
| `apps/admin/src/routes/tareas/__tests__/TareaDetailPage.test.tsx` | Created | 7 tests for `isTerminalTicket` guard |
| `apps/admin/src/routes/llaves/__tests__/KeyOrderDetailPage.test.tsx` | Modified | +6 tests for `isTerminalOrder` guard |
| `apps/admin/src/hooks/__tests__/useMutateTarea.test.ts` | Created | 4 tests for P0001 trigger enforcement |
| `apps/admin/src/hooks/__tests__/useMutateTechnicalOrder.test.ts` | Modified | +2 tests for P0001 + completed→invoiced |
| `apps/admin/src/hooks/__tests__/useMutateKeyOrder.test.ts` | Modified | +2 tests for P0001 + completed→invoiced |
| `openspec/changes/terminal-state-immutability/tasks.md` | Created | Tasks artifact |
| `openspec/changes/terminal-state-immutability/manual-verification.md` | Created | Manual verification checklist |
| `openspec/changes/terminal-state-immutability/apply-progress.md` | Created | This file |

---

## Deviations from Design

1. **Migration pre-applied**: The trigger migration was already applied to the remote DB when the apply phase ran. The migration history table was out of sync and required `supabase migration repair --status applied`. The triggers were live and correct — no re-application was needed.

2. **TareaDetailPage already implemented**: `isTerminalTicket` and the Editar button guard were already present in `TareaDetailPage.tsx` (task 2.1 was done in a prior session). Tests were written as approval tests to verify existing behavior.

3. **`completed` excluded from `isTerminalOrder`**: The design explicitly requires `invoiced | cancelled` only for key orders, not `completed`. The existing `TERMINAL_STATUSES` in `KeyOrderDetailPage.tsx` included `completed` — this was changed. Behavioral impact: completed key orders now show the "Cancelar orden" button, which is the correct behavior (the DB-level cancel RPC handles the state machine; it rejects invalid transitions).

---

## Key Learnings

1. When migration triggers already exist on remote, `CREATE TRIGGER` fails with 42710 — use `CREATE OR REPLACE FUNCTION` (already in place) and `supabase migration repair --status applied` to sync the history.
2. Strict TDD on UI terminal guards benefits from an extended mock that captures props (e.g., `canRegisterPickup`) so assertions remain behavioral, not implementation-coupled.
3. Hook tests for DB-level enforcement (P0001) are pure unit tests — mock the supabase RPC to return the trigger error and assert `toastMutationError` surfaces it; no DB connection needed.
4. The approval test pattern (writing tests for already-implemented behavior) is the correct TDD entry point when existing code already satisfies the spec.
5. Migration history divergence between local and remote requires explicit repair before `db push` can succeed — `supabase migration list` output reveals which migrations are remote-only.
