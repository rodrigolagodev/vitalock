# Delta for Sales Orders

**Change**: stock-inventory
**Domain**: sales-orders
**Type**: Delta (modifies `openspec/specs/ordenes-admin/spec.md`)
**Date**: 2026-08-10

## ADDED Requirements

### Requirement: order_items.product_id Nullable FK

The `order_items` table MUST gain a nullable FK column `product_id → public.products(id)`. The column MUST default to NULL. Existing rows without a stock product are valid (backward compatible). The `create_order_with_items` RPC MUST accept an optional `product_id` per item.

#### Scenario: Order item created with product_id

- GIVEN a product P exists in `public.products`
- WHEN admin creates an order_item with item_type=`key`, product_id=P.id
- THEN the row is persisted with product_id set
- AND a stock reservation is triggered (see Reservation Lifecycle requirement)

#### Scenario: Order item created without product_id (legacy/particular)

- GIVEN no product_id is supplied for an order_item
- WHEN the order is created
- THEN the order_item row is persisted with product_id=NULL
- AND no stock reservation is triggered

---

### Requirement: Reservation Lifecycle on Order Events

The system MUST automatically manage stock reservations tied to order lifecycle events:

1. **On order_item insert** (item_type `key`/`equipment` with non-null `product_id`): emit a `reserva` movement for the product.
2. **On order cancel**: emit `liberacion_reserva` for every `reserva` movement with no paired definitive egreso (pending reservations only).
3. Reservations MUST be idempotent: a duplicate trigger fire MUST NOT produce a second `reserva` (enforced by partial UNIQUE index).

#### Scenario: Reservation emitted on key order_item insert

- GIVEN product P has `stock_reservado = 0`
- WHEN an order_item with item_type=`key`, product_id=P.id, quantity=2 is inserted
- THEN a `reserva` movement of qty=2 is created for product P
- AND `stock_reservado` becomes 2

#### Scenario: particular order_item still triggers reservation

- GIVEN an order with `administration_id = NULL` (particular) has an item with item_type=`key`, product_id=P.id
- WHEN the item is inserted
- THEN a `reserva` movement is created (particular orders are NOT exempt)

#### Scenario: Order cancellation releases pending reservations

- GIVEN order O has an order_item with a `reserva` movement and no paired egreso
- WHEN order O status is set to `cancelled`
- THEN a `liberacion_reserva` movement is created for each pending reserva
- AND `stock_reservado` decrements accordingly

#### Scenario: Egreso-consumed reservations are NOT re-released on cancel

- GIVEN an order_item has a `reserva` and a paired `egreso_grabacion`
- WHEN the parent order is cancelled
- THEN no `liberacion_reserva` is emitted for that item (already consumed)
