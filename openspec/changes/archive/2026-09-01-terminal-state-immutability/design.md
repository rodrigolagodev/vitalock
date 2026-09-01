# Design: terminal-state-immutability

## Context

Three business aggregates — `support.tickets`, `public.technical_orders`, `public.key_orders` — have no DB guard against UPDATE on terminal rows. Vitalock already enforces immutability for narrower invariants (`technical_order_items_intent_immutable`, `equipment_prevent_reassignment`, etc.). This change brings the three primary aggregates in line with those patterns.

## Goals

- Terminal rows reject any UPDATE at the DB layer with P0001.
- Legitimate late transitions still succeed: `completed → invoiced` on orders; `in_progress → resolved` on tickets.
- Primary UI surfaces hide edit affordances before user reaches a P0001 toast.
- No bypass mechanism.

## Non-Goals

- Reopen mechanism, correction ticket pattern, audit log — all deferred until real correction case appears.
- Data migration.
- Cleanup of `resolved → in_progress` dead-code branches (follow-up).

## Decisions

### 1. Trigger function shape and naming

Three BEFORE UPDATE trigger functions, one per aggregate, following `<schema>.<table>_terminal_immutable()` convention. `LANGUAGE plpgsql`, no `SECURITY DEFINER`.

Body pattern (identical across all three; only terminal set + message prefix differ):

```sql
IF OLD.status IN (<terminal_set>) THEN
  RAISE EXCEPTION '<AGGREGATE>_TERMINAL: cannot modify % row (status: %)',
    TG_TABLE_NAME, OLD.status
    USING ERRCODE = 'P0001';
END IF;
RETURN NEW;
```

| Function | Table |
|---|---|
| `support.tickets_terminal_immutable()` | `support.tickets` |
| `public.technical_orders_terminal_immutable()` | `public.technical_orders` |
| `public.key_orders_terminal_immutable()` | `public.key_orders` |

Rejected: single generic function via `TG_ARGV` — adds complexity for no gain over three small, self-contained functions.

### 2. Terminal sets

| Aggregate | Terminal | Intentionally excluded |
|---|---|---|
| `support.tickets` | `resolved`, `cancelled` | — |
| `public.technical_orders` | `invoiced`, `cancelled` | `completed` |
| `public.key_orders` | `invoiced`, `cancelled` | `completed` |

`completed` excluded because `mark_*_invoiced` writes `completed → invoiced`. Consistent with existing UI constant in `TechnicalOrderDetailPage.tsx:19`.

### 3. No set_config bypass

Full RPC audit found zero legitimate writes to genuinely-terminal rows:
- `resolve_ticket → recompute_technical_order_status`: early-exits for status outside `confirmed`/`in_progress`.
- `cancel_technical_order → tickets cascade`: `AND status NOT IN ('resolved', 'cancelled')`.
- `cancel_key_order → items cascade`: only cancels non-cancelled items.
- `mark_*_invoiced`: `completed → invoiced`; `completed` not terminal.
- `setKeyOrderPickupPerson`: addressed by UI guard (Decision 5).

Trigger is maximally strict.

### 4. Trigger execution order

PostgreSQL executes BEFORE UPDATE triggers in alphabetical order by trigger name. For `support.tickets`:

- `tickets_terminal_immutable` (`ti...`) fires **before** `tickets_validate` (`tv...`).

This is intentional — the terminal guard rejects the UPDATE before the state-machine validator runs. The `resolved → in_progress` branch in `tickets_validate.VALID_TRANSITIONS` becomes dead code (expected).

`technical_orders` and `key_orders` have no BEFORE UPDATE trigger today — no ordering conflict.

### 5. UI edit-gate design

**Surface 1 — `TareaDetailPage.tsx` Editar button (line 121)**:

```ts
function isTerminalTicket(status: string): boolean {
  return status === 'resolved' || status === 'cancelled';
}
```

```tsx
{!isTerminalTicket(tarea.status) && (
  <Button onClick={() => setEditOpen(true)}>Editar</Button>
)}
```

`useMutateTarea` and `TareaFormSheet` don't need independent guards — the button is the sole entry point. `AssignEquipmentDialog` already gates on non-terminal (lines 162-163).

**Surface 2 — Pickup action in `KeyOrderItemsTable` (via `KeyOrderDetailPage`)**:

Guard the `canRegisterPickup` prop derivation in `KeyOrderDetailPage`:

```ts
function isTerminalOrder(status: string): boolean {
  return status === 'invoiced' || status === 'cancelled';
}

canRegisterPickup={
  !isTerminalOrder(order.status) &&
  order.client_type === 'particular' &&
  order.status === 'ready_for_pickup'
}
```

Both helpers local (not exported). Centralization = follow-up.

Rejected: disable/grey out — hiding is the existing pattern; a hidden affordance is less confusing than a disabled one for an action that will never succeed.

### 6. Migration file structure

Single delta, all six DDL statements in one atomic transaction:

`supabase/migrations/20260901170000_add_terminal_immutability_triggers.sql`

### 7. Test plan

**Extend**:
- `apps/admin/src/hooks/__tests__/useMutateTechnicalOrder.test.ts` — mutation against `invoiced` fixture raises P0001; `completed → invoiced` still passes.
- `apps/admin/src/hooks/__tests__/useMutateKeyOrder.test.ts` — same for key orders.
- `apps/admin/src/routes/llaves/__tests__/KeyOrderDetailPage.test.tsx` — pickup absent when terminal.
- `apps/admin/src/routes/tareas/__tests__/TareaDetailPage.test.tsx` — Editar absent for resolved/cancelled fixture.

**New**: `apps/admin/src/hooks/__tests__/useMutateTarea.test.ts` — `updateTarea` against resolved-status fixture surfaces P0001.

**Manual verification checklist** (`manual-verification.md`):
1. Resolved ticket → Editar absent.
2. `UPDATE support.tickets SET description='x' WHERE status='resolved' LIMIT 1;` → P0001 `TICKETS_TERMINAL:`.
3. `mark_technical_order_invoiced` on completed order still works.
4. `resolve_ticket` on in_progress ticket still works.
5. Invoiced key order → pickup action absent.

### 8. Dead-code branches (out of scope)

- `tickets_validate` (baseline:4880): `resolved → in_progress` VALID_TRANSITIONS entry unreachable.
- `TareaFormSheet.VALID_TRANSITIONS`: same.

Left as-is. "No reopen" makes dead code expected. Cleanup = follow-up.

## Migration Sequence (SQL sketch)

```sql
-- supabase/migrations/20260901170000_add_terminal_immutability_triggers.sql

CREATE OR REPLACE FUNCTION support.tickets_terminal_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status IN ('resolved', 'cancelled') THEN
    RAISE EXCEPTION 'TICKETS_TERMINAL: cannot modify % row (status: %)',
      TG_TABLE_NAME, OLD.status USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER tickets_terminal_immutable
  BEFORE UPDATE ON support.tickets
  FOR EACH ROW EXECUTE FUNCTION support.tickets_terminal_immutable();

CREATE OR REPLACE FUNCTION public.technical_orders_terminal_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status IN ('invoiced', 'cancelled') THEN
    RAISE EXCEPTION 'TECHNICAL_ORDER_TERMINAL: cannot modify % row (status: %)',
      TG_TABLE_NAME, OLD.status USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER technical_orders_terminal_immutable
  BEFORE UPDATE ON public.technical_orders
  FOR EACH ROW EXECUTE FUNCTION public.technical_orders_terminal_immutable();

CREATE OR REPLACE FUNCTION public.key_orders_terminal_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status IN ('invoiced', 'cancelled') THEN
    RAISE EXCEPTION 'KEY_ORDER_TERMINAL: cannot modify % row (status: %)',
      TG_TABLE_NAME, OLD.status USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER key_orders_terminal_immutable
  BEFORE UPDATE ON public.key_orders
  FOR EACH ROW EXECUTE FUNCTION public.key_orders_terminal_immutable();
```

## Rollback

```sql
DROP TRIGGER IF EXISTS tickets_terminal_immutable ON support.tickets;
DROP FUNCTION IF EXISTS support.tickets_terminal_immutable();
DROP TRIGGER IF EXISTS technical_orders_terminal_immutable ON public.technical_orders;
DROP FUNCTION IF EXISTS public.technical_orders_terminal_immutable();
DROP TRIGGER IF EXISTS key_orders_terminal_immutable ON public.key_orders;
DROP FUNCTION IF EXISTS public.key_orders_terminal_immutable();
```

## Open Questions

None blocking:
1. `PickupKeyDialog` writes to `key_order_items`, not `key_orders` — terminal trigger doesn't apply; `canRegisterPickup` UI guard is sufficient.
2. Future reopen (if needed): dedicated RPC with set_config bypass, not removing the trigger.
3. Dead-code cleanup: `resolved → in_progress` branches in next routine cleanup pass.
