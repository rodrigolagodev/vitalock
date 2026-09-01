# Spec: ticket-terminal-immutability

**Change**: terminal-state-immutability

## Delta

### 1. Terminal status set

`support.tickets` terminal = `{ 'resolved', 'cancelled' }`.

### 2. Database trigger — `support.tickets_terminal_immutable`

**DB-1**: BEFORE UPDATE trigger function `support.tickets_terminal_immutable()` bound to `support.tickets`.

**DB-2**: When `OLD.status IN ('resolved', 'cancelled')`, raise exception with:
- `errcode`: `P0001`
- Message: `TICKETS_TERMINAL: cannot modify % row (status: %)` (row id + OLD.status)

**DB-3**: `BEFORE UPDATE ON support.tickets FOR EACH ROW`.

**DB-4**: No column whitelist — total row immutability.

**DB-5**: No `set_config` bypass.

**DB-6**: When `OLD.status NOT IN` terminal, return `NEW` unmodified.

**DB-7**: Transition `in_progress → resolved` succeeds (OLD.status non-terminal).

### 3. UI guard — TareaDetailPage

**UI-1**: "Editar" button MUST NOT render when `status IN ('resolved', 'cancelled')`.

**UI-2**: Otherwise renders as before.

**UI-3**: `useMutateTarea` + `TareaFormSheet` don't need independent guards — the Editar button is the sole form entry point.

### 4. Out of scope

- No reopen/correction mechanism.
- No cleanup of `resolved → in_progress` dead-code (in `tickets_validate`, `TareaFormSheet.VALID_TRANSITIONS`).
- No audit log table.

## Scenarios

### T-1: UPDATE on resolved ticket rejected

- Given a ticket with `status = 'resolved'`
- When any UPDATE is issued (any column)
- Then P0001 raised with prefix `TICKETS_TERMINAL:` and row unchanged.

### T-2: UPDATE on cancelled ticket rejected

- Given a ticket with `status = 'cancelled'`
- When any UPDATE is issued
- Then P0001 raised and row unchanged.

### T-3: UPDATE on non-terminal ticket succeeds

- Given a ticket with `status = 'in_progress'`
- When UPDATE assigns new assignee
- Then UPDATE succeeds.

### T-4: Transition in_progress → resolved succeeds

- Given ticket with `status = 'in_progress'`
- When UPDATE sets `status = 'resolved'`
- Then UPDATE succeeds (OLD.status non-terminal, trigger passes through).

### T-5: Full happy path

- Given a ticket created with `status = 'open'`
- When status updated to `in_progress`, then `resolved`
- Then both transitions succeed.

### T-6: UI — Editar hidden for resolved ticket

- Given TareaDetailPage rendered with resolved ticket
- Then "Editar" button not in DOM.

### T-7: UI — Editar hidden for cancelled ticket

- Given TareaDetailPage rendered with cancelled ticket
- Then "Editar" button not in DOM.

### T-8: UI — Editar present for non-terminal ticket

- Given TareaDetailPage rendered with `in_progress` ticket
- Then "Editar" button present.

## Cross-References

- `support.tickets_validate` (state machine) unaffected; the `resolved → in_progress` branch becomes dead code.
- `AssignEquipmentDialog` in `TareaDetailPage` already gates on non-terminal — no change.
- Naming: `<schema>.<table>_terminal_immutable()` parallels `technical_order_items_intent_immutable`.

## Test Files Expected

- `apps/admin/src/routes/tareas/__tests__/TareaDetailPage.test.tsx` (new/extended) — T-6, T-7, T-8.
- `apps/admin/src/hooks/__tests__/useMutateTarea.test.ts` (new) — T-1, T-2, T-3, T-4 via mocked client.
