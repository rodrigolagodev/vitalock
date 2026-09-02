# Tasks: terminal-state-immutability

## Phase 1 — SQL migration

- [x] 1.1 Create `supabase/migrations/20260901170000_add_terminal_immutability_triggers.sql` with header comment explaining the immutability contract.
- [x] 1.2 Add `support.tickets_terminal_immutable()` function + `tickets_terminal_immutable` BEFORE UPDATE trigger.
- [x] 1.3 Add `public.technical_orders_terminal_immutable()` function + trigger.
- [x] 1.4 Add `public.key_orders_terminal_immutable()` function + trigger.
- [x] 1.5 Apply migration to remote via `mcp__supabase__apply_migration`.

## Phase 2 — Admin UI guards

- [x] 2.1 `apps/admin/src/routes/tareas/TareaDetailPage.tsx`: introduce local `isTerminalTicket(status)` helper and gate the "Editar" button (line 121).
- [x] 2.2 `apps/admin/src/routes/llaves/KeyOrderDetailPage.tsx`: introduce local `isTerminalOrder(status)` helper and gate the `canRegisterPickup` prop derivation to exclude terminal orders.

## Phase 3 — Tests

- [x] 3.1 Extend `apps/admin/src/routes/tareas/__tests__/TareaDetailPage.test.tsx` (or create) — Editar absent when status is resolved/cancelled; present otherwise.
- [x] 3.2 Extend `apps/admin/src/routes/llaves/__tests__/KeyOrderDetailPage.test.tsx` — pickup action absent when order status is invoiced/cancelled.
- [x] 3.3 New `apps/admin/src/hooks/__tests__/useMutateTarea.test.ts` — mutation against resolved-status fixture surfaces P0001.
- [x] 3.4 Extend `apps/admin/src/hooks/__tests__/useMutateTechnicalOrder.test.ts` — mutation against invoiced fixture surfaces P0001; `completed → invoiced` still works.
- [x] 3.5 Extend `apps/admin/src/hooks/__tests__/useMutateKeyOrder.test.ts` — same for key orders.

## Phase 4 — Verification

- [x] 4.1 `pnpm --filter @vitalock/admin typecheck && pnpm test` — full suite green.
- [x] 4.2 Manual verification checklist in `openspec/changes/terminal-state-immutability/manual-verification.md`:
  1. Resolved ticket in admin UI → Editar absent.
  2. `UPDATE support.tickets SET description='x' WHERE status='resolved' LIMIT 1;` → P0001 `TICKETS_TERMINAL:`.
  3. `mark_technical_order_invoiced` still works on a `completed` order.
  4. `resolve_ticket` still works on an `in_progress` ticket.
  5. Invoiced key order → pickup action absent in items table.

## Phase 5 — Commit + push

- [ ] 5.1 Single commit with conventional message.
- [ ] 5.2 Push to origin main.

## Review Workload Forecast

| Metric | Value |
|---|---|
| Estimated changed lines | 150–250 |
| 800-line budget risk | Low |
| Chained PRs recommended | No |
| Decision needed before apply | No |

Single PR, well under budget.
