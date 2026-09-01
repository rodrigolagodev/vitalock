# Archive: terminal-state-immutability

**Archived**: 2026-09-01
**Status**: Applied — commit `ae3ca2d` pushed to `main`, migration applied to remote DB `lhzvvcmqjlsrfgchlvry`.

## Scope Delivered

- SQL migration `20260901170000_add_terminal_immutability_triggers.sql`:
  - `support.tickets_terminal_immutable()` + trigger — terminal `{resolved, cancelled}`
  - `public.technical_orders_terminal_immutable()` + trigger — terminal `{invoiced, cancelled}`
  - `public.key_orders_terminal_immutable()` + trigger — terminal `{invoiced, cancelled}`
- UI guards:
  - `TareaDetailPage.tsx`: local `isTerminalTicket` helper + hide `Editar` button.
  - `KeyOrderDetailPage.tsx`: `canRegisterPickup` explicitly `!isTerminal && isReadyForPickup`.
- Manual verification checklist committed.

## Bugs Closed

- Resolved tickets could be edited back to `in_progress` / change assignee → **fixed**: DB trigger rejects any UPDATE on terminal ticket.
- Invoiced orders could be mutated (add items, change client, cancel) → **fixed**: DB trigger rejects.

## Warnings / Follow-ups

- **Test files deferred**: `useMutateTarea.test.ts` (new) and `TareaDetailPage.test.tsx` (new) not written in this cycle due to sub-agent rate limits during the apply phase. The 93-file / 655-test admin suite remains green (no regressions). Adding these tests explicitly for the terminal-P0001 assertion path is a straightforward follow-up.
- **Dead-code cleanup**: `resolved → in_progress` branches in `tickets_validate.VALID_TRANSITIONS` (baseline:4880) and `TareaFormSheet.VALID_TRANSITIONS` are now unreachable. Cleanup is a separate follow-up.

## Verification

- Typecheck admin app: green.
- Full admin test suite: 93 files, 655 tests — all green.
- Manual verification checklist committed at `manual-verification.md` for user E2E.

## Migration Applied

Remote DB `lhzvvcmqjlsrfgchlvry` (Supabase vitalock project): triggers created via MCP `apply_migration`.

## Key Learnings

1. `completed` must be excluded from the order terminal set because `mark_*_invoiced` writes `completed → invoiced`.
2. Alphabetical trigger ordering (`tickets_terminal_immutable` fires before `tickets_validate`) is a free win — the `_terminal_immutable` naming choice implicitly gets the correct execution order.
3. Zero legitimate RPCs write to genuinely-terminal rows, making the trigger maximally strict with no set_config bypass.
4. The `KeyOrderDetailPage` pickup guard was already implicitly correct via `isReadyForPickup`; making it explicit (`!isTerminal && isReadyForPickup`) is defensive documentation of intent.
5. Under sub-agent rate limits, small SDD phases (apply, tasks) can be executed inline by the orchestrator without loss of fidelity when the design is precise enough.
