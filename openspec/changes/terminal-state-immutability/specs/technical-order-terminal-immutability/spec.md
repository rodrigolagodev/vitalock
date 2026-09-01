# Spec: technical-order-terminal-immutability

**Change**: terminal-state-immutability

## Delta

### 1. Terminal status set

`public.technical_orders` terminal = `{ 'invoiced', 'cancelled' }`.

`'completed'` explicitly NOT terminal. `mark_technical_order_invoiced` writes `completed → invoiced`; declaring `completed` terminal would break that RPC without any bypass in scope.

Matches existing `TERMINAL_STATUSES = Set(['invoiced', 'cancelled'])` in `TechnicalOrderDetailPage.tsx:19`.

### 2. Database trigger — `public.technical_orders_terminal_immutable`

**DB-1**: BEFORE UPDATE trigger function `public.technical_orders_terminal_immutable()` bound to `public.technical_orders`.

**DB-2**: When `OLD.status IN ('invoiced', 'cancelled')`, raise:
- `errcode`: `P0001`
- Message: `TECHNICAL_ORDER_TERMINAL: cannot modify % row (status: %)`

**DB-3**: `BEFORE UPDATE ON public.technical_orders FOR EACH ROW`.

**DB-4**: No column whitelist.

**DB-5**: No `set_config` bypass.

**DB-6**: When `OLD.status NOT IN` terminal, return `NEW` unmodified.

**DB-7**: Transition `completed → invoiced` (via `mark_technical_order_invoiced`) succeeds — OLD.status non-terminal.

### 3. No UI guard required

`TechnicalOrderDetailPage.tsx` already gates on `TERMINAL_STATUSES`.

### 4. Out of scope

- No reopen/correction.
- No audit log.
- No row-level terminal locking for `technical_order_items` (covered by `technical_order_items_intent_immutable`).

## Scenarios

### TO-1: UPDATE on invoiced order rejected

- Given `technical_orders` row with `status = 'invoiced'`
- When any UPDATE issued
- Then P0001 with prefix `TECHNICAL_ORDER_TERMINAL:`, row unchanged.

### TO-2: UPDATE on cancelled order rejected

- Same as TO-1 with `status = 'cancelled'`.

### TO-3: UPDATE on non-terminal order succeeds

- Given `status = 'in_progress'` order
- When UPDATE changes a field
- Then UPDATE succeeds.

### TO-4: `completed → invoiced` transition succeeds

- Given `status = 'completed'` order
- When `mark_technical_order_invoiced` runs
- Then UPDATE succeeds (OLD.status non-terminal, trigger passes through).

### TO-5: Full happy path

- `confirmed → in_progress → completed → invoiced` all succeed.

### TO-6: `cancel_technical_order` cascade excludes terminal tickets

- Given an `in_progress` order with one `resolved` ticket and one `in_progress` ticket
- When `cancel_technical_order` executes
- Then order becomes `cancelled`, non-terminal ticket cancelled, resolved ticket untouched (cascade WHERE excludes resolved/cancelled), no P0001.

### TO-7: Add item to invoiced order fails

- Given invoiced order
- When client attempts INSERT into `technical_order_items` referencing it — actually this is INSERT on child, not UPDATE on order. Reword: attempts UPDATE on the order (add item via UPDATE of the order aggregate)
- Then P0001 raised.

### TO-8: Non-terminal `completed` order can still be mutated

- Given `status = 'completed'` order
- When UPDATE changes notes
- Then UPDATE succeeds (completed is not terminal).

## Cross-References

- `mark_technical_order_invoiced` transitions `completed → invoiced` — the reason `completed` is not terminal.
- `cancel_technical_order` cascade uses `AND status NOT IN ('resolved', 'cancelled')` — no collision.
- `recompute_technical_order_status` only drives `confirmed`/`in_progress` — no collision.

## Test Files Expected

- `apps/admin/src/hooks/__tests__/useMutateTechnicalOrder.test.ts` (extended) — TO-1, TO-2, TO-3, TO-4.
- `apps/admin/src/routes/servicio-tecnico/__tests__/TechnicalOrderDetailPage.test.tsx` (extended) — verify existing terminal UI guard.
