---
name: key-configuration-ticket
title: Key Configuration Ticket — Resolution Flow
kind: journey
actors: [admin]
covers_requirements:
  - tickets#category-domain
  - key-lifecycle#pending-creation-to-pending-installation
related_rpcs:
  - configure_key_order_item
related_tables:
  - support.tickets
  - public.rfid_keys
  - public.key_order_items
covering_tests:
  pgtap:
    - supabase/tests-sql/test_102_configure_key_order_item.sql
  vitest: []
last_verified: 2026-08-27
---

# Key Configuration Ticket — Resolution Flow

## Purpose

`support.tickets.category = 'key_configuration'` is a **legacy artifact
category** created by the old (pre-000086) `confirm_order` for the key
family. In the current key order lifecycle
([[key-order-lifecycle]]), key orders do NOT create tickets — the
comment at
`supabase/migrations/20260818000086_rpc_create_key_order_with_items.sql:18`
is explicit: "Key orders do NOT create tickets (technical-only
concern)."

The `key_configuration` category still exists in the CHECK constraint
(`supabase/migrations/20260818000067_tickets_equipment_update_category.sql:20`)
for backward compatibility with older orders confirmed under the
pre-refactor schema, but the new lifecycle does not emit it.

## Actors & preconditions

- **admin** — resolves any legacy tickets in this category directly by
  running `configure_key_order_item` for the linked
  `order_items.id`. The RPC's legacy-path branch (lines 61-133 of
  `supabase/migrations/20260818000088_rpc_configure_key_order_item.sql`)
  detects tickets via `stock_movements.ticket_id` and closes them.
- **installer** — NOT involved. Key configuration is an admin desk
  operation, not field work.

## State machine

Same three-state ticket machine as any other:
`open → in_progress → resolved`. The `configure_key_order_item` RPC's
legacy branch performs the transition atomically at line 119.

## Happy path (legacy flow)

1. A pre-refactor `confirm_order` created the ticket with
   `category='key_configuration'`, `status='open'`.
2. Admin runs `configure_key_order_item(p_order_item_id, p_rfid_code,
   p_unit_id, p_equipment_ids)` against the linked `order_items.id`.
3. RPC (legacy branch, line 66+):
   - Mints `rfid_keys` with `status='pending_creation'`.
   - Updates `order_items.status='configured'`.
   - Emits `egreso_grabacion` + `liberacion_reserva`.
   - Locates the ticket via `stock_movements.ticket_id` and closes it
     via `open → in_progress → resolved` (lines 119-125).
   - Advances rfid_keys → `pending_installation`.

## Cross-cutting effects

Same as the new-path branch of `configure_key_order_item` (see
[[key-order-lifecycle]] Phase 3) — but scoped to the legacy schema.

## Error paths & guards

Same as [[key-order-lifecycle]] Phase 3.

## Known gaps

1. **Category retained for compat but new flow does not emit it**.
   Consider a policy decision: keep the category and legacy branch
   indefinitely (safer for archived orders), or drop it in a future
   migration once all pre-refactor orders are terminal.

## QA checklist

Skip unless a legacy order (created before 2026-08-18) is still active
in the system. In the current schema, this category should not appear
on new orders.

## Related flows

- [[key-order-lifecycle]] — the current flow (no tickets).
- [[stock-reservation]] — for the auto stock movements.
