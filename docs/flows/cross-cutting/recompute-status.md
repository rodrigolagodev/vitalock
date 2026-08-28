---
name: recompute-status
title: Order Status Recomputation Triggers
kind: cross-cutting
actors: [system]
covers_requirements:
  - ordenes-admin#recompute-status-drives-state
  - tickets#tickets-sync-order-status-trigger
related_rpcs:
  - public.recompute_key_order_status
  - public.recompute_technical_order_status
  - public.key_order_items_recompute_order_status
  - public.tickets_sync_order_status
related_tables:
  - public.key_orders
  - public.key_order_items
  - public.technical_orders
  - support.tickets
  - public.technical_order_items
covering_tests:
  pgtap:
    - supabase/tests-sql/test_108_technical_order_state_machine.sql
    - supabase/tests-sql/test_113_key_order_installation_stage.sql
  vitest: []
last_verified: 2026-08-27
---

# Order Status Recomputation Triggers

## Purpose

Order status is **derived** state — an admin should NEVER manually set
`key_orders.status='ready_for_pickup'` or
`technical_orders.status='completed'`. Instead, the status is
recomputed by a pair of trigger functions that fire whenever the
underlying items or tickets change.

This document describes the two independent state machines and the
triggers that drive them.

## The two state machines are independent

- **Key orders** are driven by `key_order_items.status` changes.
- **Technical orders** are driven by `support.tickets.status` changes.

They do not share code paths, do not share state values, and do not
call each other. Do not confuse them.

## Key order recompute

### Trigger wiring

Defined at
`supabase/migrations/20260818000087_rpc_key_order_lifecycle.sql:113`
and rewritten at
`supabase/migrations/20260823000097_key_orders_installation_stage.sql:71`:

```sql
create trigger key_order_items_recompute_order_status_trigger
after update of status on public.key_order_items
for each row execute function public.key_order_items_recompute_order_status();
```

The trigger function calls
`public.recompute_key_order_status(new.order_id)`. See the state
machine details in [[key-order-lifecycle]] under "State machine".

### 4-lane rules (from migration 097 line 98+)

Counts `pending`, `configured`, `installed`, `cancelled`:

- `pending > 0` AND `(configured > 0 OR installed > 0)` → `in_progress`
- `pending > 0` AND nothing advanced → `confirmed`
- `pending = 0` AND `configured > 0` → `pending_installation`
- `pending = 0` AND `configured = 0` AND `installed > 0` → `ready_for_pickup`

Terminals (`draft`, `completed`, `invoiced`, `cancelled`) are never
recomputed. The transition to `completed` happens ONLY via
`record_order_key_pickup` (see [[key-order-lifecycle]] Phase 5).

## Technical order recompute

### Trigger wiring

Defined at
`supabase/migrations/20260818000090_rpc_technical_order_lifecycle.sql:98`:

```sql
create or replace function public.tickets_sync_order_status()
returns trigger language plpgsql
security definer set search_path = public, support, extensions
as $$
declare v_technical_order_id uuid;
begin
  if new.technical_order_item_id is null then return new; end if;
  select order_id into v_technical_order_id
    from public.technical_order_items
   where id = new.technical_order_item_id;
  if v_technical_order_id is not null then
    perform public.recompute_technical_order_status(v_technical_order_id);
  end if;
  return new;
end $$;
```

Two important design choices:

1. **Ticket must be linked to a technical order item** via
   `technical_order_item_id` for the recompute to fire. Tickets NOT
   linked (`key_order_item_id` set instead, or unlinked) do not
   drive any order.
2. The trigger fires on **every** ticket UPDATE, not just status
   changes. The RPC internally short-circuits if status is not in
   the active range (`confirmed`, `in_progress`).

### Rules (from migration 090 line 30+)

Counts `resolved`, `in_progress`, `open` on non-cancelled tickets
linked to non-cancelled items of the order:

- `resolved = total_tickets` → `completed`
- `in_progress > 0 OR resolved > 0` → `in_progress`
- Otherwise no transition

Terminals (`draft`, `completed`, `invoiced`, `cancelled`) do NOT
recompute.

## Why triggers instead of app-side recompute?

Three reasons:

1. **Concurrency**. Two admins configuring items simultaneously can
   race the app-side recompute; the trigger runs in the same
   transaction as the mutation and is serializable per row.
2. **Cancellation cascades** (see [[key-order-lifecycle]] cancellation).
   The cancel trigger cascades item statuses, which fires recompute.
   Doing this app-side would require the app to know the cascade.
3. **Cross-actor completeness**. The installer app resolves tickets;
   the admin app confirms orders. Neither knows about the other's
   downstream effects. The trigger IS the shared contract.

## Interaction with app-side cache

TanStack Query invalidates caches after mutations. But the trigger
fires INSIDE the DB transaction — by the time the mutation returns,
the order status has already been recomputed. There is no race
between the trigger and the client refetch.

For realtime, [[realtime-channels]] subscribes to relevant tables and
invalidates on changes.

## Error paths & guards

| Trigger | Guard | Effect |
|---|---|---|
| Recompute on a terminal order | Status filter inside recompute RPC | RPC returns without change |
| Recompute on missing order id | `if not found then return` | RPC no-op |
| Circular trigger cascade | Recompute UPDATEs `key_orders`, but no trigger on that table drives items | Bounded |
| Trigger inside another trigger (deadlock risk) | `security definer` + short body | Safe in practice |

## Known gaps

1. **The recompute functions are `security definer`** — they run
   with elevated permissions. Anyone who can trigger an item/ticket
   UPDATE can indirectly write to `key_orders.status`. This is
   correct for the design (only allowed transitions are applied), but
   verify RLS on items/tickets so unauthorized callers cannot indirectly
   move an order forward.
2. **No coverage guarantee that both order types are tested per
   change**. Regression risk: a schema change to `key_orders.status`
   CHECK constraint that forgets to update the recompute RPC would
   silently break the flow. Consider adding a pgTAP test that
   asserts the CHECK values match the RPC's `IN` list.

## QA checklist

Key orders:
- [ ] Create a confirmed order with 3 pending items. Configure item 1
      → verify `key_orders.status='in_progress'`. Configure items 2
      and 3 → verify `pending_installation`.
- [ ] Call `mark_key_order_item_installed` for all 3 → verify
      `ready_for_pickup`.
- [ ] Cancel item 3 (via cascade) → verify order goes back to
      `in_progress` (Known gap? — verify current behavior).

Technical orders:
- [ ] Create a confirmed order with 2 tickets. Move ticket 1 to
      `in_progress` → verify `technical_orders.status='in_progress'`.
- [ ] Resolve both tickets → verify `completed`.
- [ ] Cancel a ticket → verify the parent transitions do not regress.

## Related flows

- [[key-order-lifecycle]] — the state machine details.
- [[technical-order-lifecycle]] — sibling.
- [[realtime-channels]] — how clients discover recomputed changes.
