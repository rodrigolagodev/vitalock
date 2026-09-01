# Tasks: terminal-state-immutability

## Phase 1 — SQL migration

- [ ] 1.1 Create `supabase/migrations/20260901170000_add_terminal_immutability_triggers.sql` with header comment explaining scope, terminal sets per aggregate, and the "no bypass" invariant.
- [ ] 1.2 Add `CREATE OR REPLACE FUNCTION support.tickets_terminal_immutable()` with body: `IF OLD.status IN ('resolved', 'cancelled') THEN RAISE EXCEPTION 'TICKETS_TERMINAL: cannot modify % row (status: %)', TG_TABLE_NAME, OLD.status USING ERRCODE = 'P0001'; END IF; RETURN NEW;`. LANGUAGE plpgsql, no SECURITY DEFINER.
- [ ] 1.3 Add `CREATE TRIGGER tickets_terminal_immutable BEFORE UPDATE ON support.tickets FOR EACH ROW EXECUTE FUNCTION support.tickets_terminal_immutable();`. Verify alphabetical ordering: `tickets_terminal_immutable` (`ti…`) fires before `tickets_validate` (`tv…`).
- [ ] 1.4 Add `CREATE OR REPLACE FUNCTION public.technical_orders_terminal_immutable()` — same shape, terminal set `('invoiced', 'cancelled')`, message prefix `TECHNICAL_ORDER_TERMINAL:`.
- [ ] 1.5 Add `CREATE TRIGGER technical_orders_terminal_immutable BEFORE UPDATE ON public.technical_orders FOR EACH ROW EXECUTE FUNCTION public.technical_orders_terminal_immutable();`.
- [ ] 1.6 Add `CREATE OR REPLACE FUNCTION public.key_orders_terminal_immutable()` — same shape, terminal set `('invoiced', 'cancelled')`, message prefix `KEY_ORDER_TERMINAL:`.
- [ ] 1.7 Add `CREATE TRIGGER key_orders_terminal_immutable BEFORE UPDATE ON public.key_orders FOR EACH ROW EXECUTE FUNCTION public.key_orders_terminal_immutable();`.

## Phase 2 — Admin UI guards

- [ ] 2.1 In `apps/admin/src/routes/tareas/TareaDetailPage.tsx`: define local helper `function isTerminalTicket(status: string): boolean { return status === 'resolved' || status === 'cancelled'; }`.
- [ ] 2.2 In `apps/admin/src/routes/tareas/TareaDetailPage.tsx`: wrap the `Editar` button (line ~121) with `{!isTerminalTicket(tarea.status) && ( ... )}`.
- [ ] 2.3 In `apps/admin/src/routes/llaves/KeyOrderDetailPage.tsx`: define local helper `function isTerminalOrder(status: string): boolean { return status === 'invoiced' || status === 'cancelled'; }`.
- [ ] 2.4 In `apps/admin/src/routes/llaves/KeyOrderDetailPage.tsx`: update the `canRegisterPickup` prop derivation passed to `KeyOrderItemsTable` — prepend `!isTerminalOrder(order.status) &&` to the existing condition.

## Phase 3 — Tests

- [ ] 3.1 Extend `apps/admin/src/hooks/__tests__/useMutateTechnicalOrder.test.ts`: add test case for mutation against `invoiced` fixture — expect P0001 with `TECHNICAL_ORDER_TERMINAL:` prefix. Add test case for `completed → invoiced` (mark_technical_order_invoiced) still succeeds.
- [ ] 3.2 Extend `apps/admin/src/hooks/__tests__/useMutateKeyOrder.test.ts`: same shape — invoiced/cancelled reject, `completed → invoiced` passes.
- [ ] 3.3 Extend `apps/admin/src/routes/llaves/__tests__/KeyOrderDetailPage.test.tsx`: assert `Registrar retiro` action absent (or `canRegisterPickup=false`) when order status is `invoiced` or `cancelled`; present for `ready_for_pickup`.
- [ ] 3.4 Extend `apps/admin/src/routes/tareas/__tests__/TareaDetailPage.test.tsx` (create if it doesn't exist): assert `Editar` button absent for resolved/cancelled fixtures; present for `in_progress`.
- [ ] 3.5 Create `apps/admin/src/hooks/__tests__/useMutateTarea.test.ts`: assert `updateTarea` against a resolved-status fixture surfaces the P0001 error via mocked supabase client.

## Phase 4 — Manual verification checklist

- [ ] 4.1 Create `openspec/changes/terminal-state-immutability/manual-verification.md` with the 5-step checklist from `design.md` §7 (resolved ticket Editar absent, direct SQL UPDATE on resolved → P0001, `mark_technical_order_invoiced` on completed works, `resolve_ticket` on in_progress works, invoiced key order pickup absent).

## Phase 5 — Verification

- [ ] 5.1 `pnpm --filter @vitalock/admin typecheck` green.
- [ ] 5.2 `pnpm --filter @vitalock/admin test` green (all tests pass, including new + extended).
- [ ] 5.3 `pnpm test` at monorepo root green.

## Review Workload Forecast

| Metric | Value |
|---|---|
| Estimated changed lines | 200-300 (3 trigger fns + 3 CREATE TRIGGER = ~60 SQL; 2 UI files = ~20 lines; 5 test files = ~120-150 lines; 1 checklist doc = ~30 lines) |
| 800-line budget risk | Low |
| Chained PRs recommended | No |
| Decision needed before apply | No |
| Delivery strategy | single-pr (as preflighted) |

## Key Learnings

1. Migration is a single atomic transaction with 6 DDL statements — no data changes.
2. Two UI guards, both use local helpers (no need to centralize the terminal set).
3. Tests are additive; no existing tests break because none today mutates a terminal-status fixture expecting success.
4. Verification is code-side (typecheck + Vitest) + manual DB checklist because no pgTAP infra exists.
5. Rollback is trivial (6 DROP statements, no data reversal needed).
