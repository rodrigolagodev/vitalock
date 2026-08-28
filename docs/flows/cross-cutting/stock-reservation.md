---
name: stock-reservation
title: Stock Reservation & Consumption Mechanics
kind: cross-cutting
actors: [admin, installer, system]
covers_requirements:
  - stock-inventory#reservation-on-confirm
  - stock-inventory#egress-on-consumption
  - stock-inventory#idempotency-of-reserva
related_rpcs:
  - confirm_key_order
  - confirm_technical_order
  - configure_key_order_item
  - resolve_equipment_installation
  - resolve_equipment_replacement
  - cancel_key_order
  - cancel_technical_order
related_tables:
  - public.stock_movements
  - public.products
covering_tests:
  pgtap:
    - supabase/tests-sql/test_101_confirm_key_order.sql
    - supabase/tests-sql/test_102_configure_key_order_item.sql
    - supabase/tests-sql/test_103_cancel_key_order.sql
    - supabase/tests-sql/test_105_confirm_technical_order.sql
    - supabase/tests-sql/test_092_resolve_rpcs_dual_fk.sql
    - supabase/tests-sql/test_110_resolve_dual_fk_ticket_paths.sql
    - supabase/tests-sql/test_119_technical_order_replacement_equipment.sql
  vitest: []
last_verified: 2026-08-27
---

# Stock Reservation & Consumption Mechanics

## Purpose

Stock in Vitalock is an **append-only ledger**. Every operation that
would decrease inventory emits a new row with a negative quantity;
every release emits a positive. The type column encodes the semantic
direction. This document explains the auto-emitted types (the manual
ones live in [[stock-loading]]).

The design invariant: **`stock_disponible` = SUM(`quantity`) filtered
by non-reservation types + net of reserva/liberacion for reservations**.
The actual computation is inside the view/aggregation that populates
`products.stock_*` columns; the ledger is authoritative.

## The auto types (recap from [[stock-loading]])

| Type | Origin | Sign |
|---|---|---|
| `reserva` | order confirm | negative |
| `liberacion_reserva` | order cancel + order-item consume | positive |
| `egreso_grabacion` | `configure_key_order_item` | negative |
| `egreso_instalacion` | `resolve_equipment_installation` | negative |
| `egreso_reemplazo` | `resolve_equipment_replacement` | negative |

Sign is enforced by `stock_movements_sign_matches_type`
(`supabase/migrations/20260812000061_atomic_stock_work_resolution.sql:52`).

## Reservation phase

### Where reservations are born

Both order types create reservations at their `confirm_*` RPC:

- `confirm_key_order`
  (`supabase/migrations/20260818000086_rpc_create_key_order_with_items.sql:198`)
  — one `reserva` per `key_order_items` row with `product_id`, using
  `order_kind='key'`.
- `confirm_technical_order`
  (`supabase/migrations/20260818000089_rpc_create_technical_order_with_items.sql:221`)
  — one `reserva` per `technical_order_items` row with `product_id`,
  using `order_kind='technical'`.

Both use `ON CONFLICT (order_item_id, type) WHERE type='reserva'
DO NOTHING` to make the reservation **idempotent**. Re-running the
same confirm on a partial retry does not double-book stock.

### The reservation row itself

```sql
INSERT INTO public.stock_movements (
  product_id, type, quantity, note, order_id, order_item_id, order_kind
) VALUES (
  <product_id>, 'reserva', -<item.quantity>,
  'Reserva de stock desde <kind>_order_item <item.id>',
  <order_id>, <item.id>, '<key|technical>'
);
```

Sign check: `type='reserva' AND quantity < 0` — enforced by the CHECK.

## Consumption phase

Consumption is a **paired write**: one negative `egreso_*` for the
definitive out, one positive `liberacion_reserva` to release the
reservation. Net effect on availability: no change (the goods were
already "committed" — the reservation just becomes a real egress).

### Key order consumption — configuration

`configure_key_order_item`
(`supabase/migrations/20260818000088_rpc_configure_key_order_item.sql:24`)
emits both movements at once (lines 195-212 in the new path):

```
egreso_grabacion       -quantity  (definitive out)
liberacion_reserva     +quantity  (release the reserva)
```

### Technical order consumption — installation

`resolve_equipment_installation`
(`supabase/migrations/20260818000092_resolve_rpcs_dual_fk_aware.sql:40`)
locates the reserva via the dual-FK-aware path and emits (lines 161-181):

```
egreso_instalacion     -quantity
liberacion_reserva     +quantity
```

### Technical order consumption — replacement

`resolve_equipment_replacement`
(`supabase/migrations/20260818000092_resolve_rpcs_dual_fk_aware.sql:207`)
emits (lines 308-330):

```
egreso_reemplazo       -quantity
liberacion_reserva     +quantity
```

### Cancellation → release without consumption

When an order is cancelled BEFORE consumption, the cancel-cascade
trigger releases the reservation without an egress:

- `key_orders_cancel_release_reservations`
  (`supabase/migrations/20260818000087_rpc_key_order_lifecycle.sql:122`)
  emits one `liberacion_reserva` per outstanding `reserva`.
- (equivalent trigger for `technical_orders` — see
  [[technical-order-lifecycle]] cancellation cascade).

Net effect: reservation freed, availability restored.

## Dual-FK lineage

`stock_movements` links back to orders through **two** fields:
`order_id` + `order_item_id` plus `order_kind IN ('key', 'technical')`.
This is because the two order tables live in the same schema but do
not share a supertype. The `order_kind` column disambiguates:

- `order_kind='key'` → JOIN to `public.key_order_items`.
- `order_kind='technical'` → JOIN to `public.technical_order_items`.
- `order_kind=NULL` → legacy pre-refactor rows against
  `public.order_items` (still exists).

The `dual_fk_aware` resolve RPCs
(`supabase/migrations/20260818000092_resolve_rpcs_dual_fk_aware.sql`)
detect via the ticket's `technical_order_item_id` which path to take.

## Idempotency & partial retry semantics

- **Reserva**: idempotent per (`order_item_id`, `type='reserva'`).
  Retrying `confirm_*_order` is safe.
- **Egresos**: NOT idempotent. Two calls to `configure_key_order_item`
  on the same item would emit two egresses — however the item's
  status transition (`pending → configured`) is guarded, so the second
  call is rejected before emitting.
- **Liberacion at cancel**: idempotent because the cancel trigger
  only fires on `!= 'cancelled' → 'cancelled'` transition.

## Availability computation

`products.stock_total`, `stock_reservado`, `stock_disponible` are
**incrementally maintained** by the trigger
`stock_movements_maintain_counters`
(`supabase/migrations/20260811000030_stock_counters_maintenance.sql:83`,
patched in `20260812000061_atomic_stock_work_resolution.sql:426` to
include `egreso_reemplazo`). Every INSERT into `stock_movements`
fires the trigger, which increments/decrements
`products.stock_total` and `products.stock_reservado` based on the
movement type.

`stock_movements` itself is append-only — a companion trigger
(`stock_movements_prevent_modification`, line 28-34 of migration 030)
rejects UPDATEs and DELETEs unconditionally, raising
`stock_movements are append-only`.

**Non-negative invariant is enforced by the `products` table
CHECKs**:

```
stock_total     >= 0
stock_reservado >= 0
stock_reservado <= stock_total
```

Any INSERT that would cause the trigger's UPDATE on `products` to
violate one of these CHECKs is rejected — including a `reserva` that
would exceed `stock_total`.

## Known gaps

1. **Reserva `ticket_id` on new-path is NULL**. The dual-FK-aware
   resolve routes (`supabase/migrations/20260818000092_*.sql`) handle
   this correctly. Any code that JOINs `stock_movements` via
   `ticket_id` will miss new-path reservas.
2. **No availability projection at INSERT time**. The trigger updates
   `products.stock_reservado` via `+=` — meaning a concurrent race
   between two `confirm_*_order` calls both computing "enough
   available" client-side (via `stock_disponible`) can still result
   in one succeeding and the other failing at the CHECK. The failure
   is safe (rejected atomically) but the operator sees a confusing
   error. Consider a per-product advisory lock inside `confirm_*_order`
   to serialize.

## QA checklist

- [ ] Create a key order with 1 item using product X with
      `stock_disponible=10`. After confirm: verify
      `stock_reservado += 1`, `stock_disponible=9`.
- [ ] Configure the item. Verify: 2 new rows
      (`egreso_grabacion=-1`, `liberacion_reserva=+1`); net
      `stock_reservado -= 1`, `stock_total -= 1`,
      `stock_disponible=9`.
- [ ] Cancel the same order (before configure). Verify:
      `liberacion_reserva=+1`, `stock_disponible=10`.
- [ ] Create a technical order with 1 `equipment` item using product
      Y with stock_disponible=5. Confirm → reserva. Resolve
      installation with a serial. Verify egreso_instalacion +
      liberacion_reserva.
- [ ] Same as above but resolve replacement instead. Verify
      egreso_reemplazo.

## Related flows

- [[key-order-lifecycle]] — the primary key-side producer of egresses.
- [[technical-order-lifecycle]] — technical-side producer.
- [[stock-loading]] — manual movements complement.
- [[recompute-status]] — orthogonal (stock does not drive status).
