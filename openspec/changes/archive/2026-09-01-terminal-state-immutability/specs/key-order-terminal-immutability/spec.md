# Spec: key-order-terminal-immutability

**Change**: terminal-state-immutability

## Delta

### 1. Terminal status set

`public.key_orders` terminal = `{ 'invoiced', 'cancelled' }`.

`'completed'` NOT terminal. `mark_key_order_invoiced` writes `completed → invoiced`.

### 2. Database trigger — `public.key_orders_terminal_immutable`

**DB-1**: BEFORE UPDATE trigger function `public.key_orders_terminal_immutable()` bound to `public.key_orders`.

**DB-2**: When `OLD.status IN ('invoiced', 'cancelled')`, raise:
- `errcode`: `P0001`
- Message: `KEY_ORDER_TERMINAL: cannot modify % row (status: %)`

**DB-3**: `BEFORE UPDATE ON public.key_orders FOR EACH ROW`.

**DB-4**: No column whitelist.

**DB-5**: No `set_config` bypass.

**DB-6**: When `OLD.status NOT IN` terminal, return `NEW` unmodified.

**DB-7**: Transition `completed → invoiced` succeeds.

### 3. UI guard — pickup action

**UI-1**: The pickup action (`setKeyOrderPickupPerson`) MUST NOT render (or MUST be disabled/hidden) when `status IN ('invoiced', 'cancelled')`.

**UI-2**: Otherwise renders as before.

**UI-3**: Required because `setKeyOrderPickupPerson` issues a direct client `.update()` on `key_orders` outside RPC. Without this guard, a terminal-order user sees P0001 toast instead of a clean disabled affordance.

**UI-4**: DB trigger remains defense-in-depth for any other unguarded client path.

### 4. Out of scope

- No reopen/correction.
- No audit log.
- No row-level terminal locking for `key_order_items`.

## Scenarios

### KO-1: UPDATE on invoiced key order rejected

- Given `key_orders` row with `status = 'invoiced'`
- When any UPDATE issued
- Then P0001 with prefix `KEY_ORDER_TERMINAL:`, row unchanged.

### KO-2: UPDATE on cancelled key order rejected

- Same as KO-1 with `status = 'cancelled'`.

### KO-3: UPDATE on non-terminal key order succeeds

- Given `status = 'in_progress'` order
- When UPDATE runs
- Then succeeds.

### KO-4: `completed → invoiced` succeeds

- Given `status = 'completed'` order
- When `mark_key_order_invoiced` runs
- Then UPDATE succeeds.

### KO-5: Full happy path

- `confirmed → in_progress → pending_installation → ready_for_pickup → completed → invoiced` all succeed.

### KO-6: `setKeyOrderPickupPerson` on non-terminal order succeeds

- Given `status = 'ready_for_pickup'` order
- When `setKeyOrderPickupPerson` UPDATE
- Then succeeds, `pickup_person` written.

### KO-7: `setKeyOrderPickupPerson` on invoiced order rejected by trigger

- Given `status = 'invoiced'` order
- When `setKeyOrderPickupPerson` UPDATE
- Then P0001 with prefix `KEY_ORDER_TERMINAL:`.

### KO-8: UI — pickup hidden for invoiced order

- Given `KeyOrderItemsTable` (via `KeyOrderDetailPage`) rendered with invoiced order
- Then pickup action not in DOM (or disabled).

### KO-9: UI — pickup present for ready_for_pickup order

- Given ready_for_pickup order
- Then pickup action present and active.

## Cross-References

- `mark_key_order_invoiced` transitions `completed → invoiced` — reason `completed` is not terminal.
- `cancel_key_order` cascade only cancels non-cancelled items — no collision.
- `setKeyOrderPickupPerson` is the only direct client `.update()` on `key_orders` outside RPC (`packages/supabase/src/rpc/keyOrders.ts:157`).
- Trigger naming parallels `technical_order_items_intent_immutable`.

## Test Files Expected

- `apps/admin/src/hooks/__tests__/useMutateKeyOrder.test.ts` (extended) — KO-1, KO-2, KO-3, KO-4.
- `apps/admin/src/routes/llaves/__tests__/KeyOrderDetailPage.test.tsx` (extended) — KO-8, KO-9.
