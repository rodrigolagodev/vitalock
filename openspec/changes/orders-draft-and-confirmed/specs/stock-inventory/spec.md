# Delta for Stock Inventory

## MODIFIED Requirements

### Requirement: Reservation Lifecycle on Order Events

The system MUST automatically manage stock reservations tied to order lifecycle events:

1. **On `confirm_order` RPC** (not on item insert): emit a `reserva` movement for every order_item with item_type `key` or `equipment` and a non-null `product_id`.
2. **On order cancel** (from `confirmed` or `in_progress`): emit `liberacion_reserva` for every `reserva` movement with no paired definitive egreso (pending reservations only). Cancellation from `draft` requires no cleanup.
3. Reservations MUST be idempotent: a duplicate trigger fire MUST NOT produce a second `reserva` (enforced by partial UNIQUE index on `(order_item_id, type) WHERE type = 'reserva'`).

(Previously: reservations were emitted by the `order_items_create_tarea` trigger on item INSERT, regardless of parent order status. Now they are emitted only on explicit confirmation.)

#### Scenario: Reservation emitted on confirm_order for key item

- GIVEN product P has `stock_reservado = 0`
- WHEN `confirm_order` is called on a draft order containing a key item with product_id=P.id, quantity=2
- THEN a `reserva` movement of qty=2 is created for product P
- AND `stock_reservado` becomes 2

#### Scenario: No reservation emitted on order_item insert into draft order

- GIVEN a draft order and product P with `stock_reservado = 0`
- WHEN an order_item with item_type=`key`, product_id=P.id is inserted into the draft order
- THEN no `reserva` movement is created
- AND `stock_reservado` remains 0

#### Scenario: Particular order item reservation emitted on confirm

- GIVEN a draft order with `administration_id = NULL` (particular) and a key item with product_id=P.id
- WHEN `confirm_order` is called
- THEN a `reserva` movement is created (particular orders are NOT exempt)

#### Scenario: Order cancellation from confirmed releases pending reservations

- GIVEN order O has status `confirmed` and an order_item with a `reserva` movement and no paired egreso
- WHEN order O status is set to `cancelled`
- THEN a `liberacion_reserva` movement is created for each pending reserva
- AND `stock_reservado` decrements accordingly

#### Scenario: Egreso-consumed reservations are NOT re-released on cancel

- GIVEN an order_item has a `reserva` and a paired `egreso_grabacion`
- WHEN the parent order is cancelled
- THEN no `liberacion_reserva` is emitted for that item (already consumed)

#### Scenario: Idempotent confirm — duplicate reserva blocked

- GIVEN a `reserva` movement already exists for order_item 42 (from a prior confirm attempt)
- WHEN the confirm transaction fires the reservation trigger again for the same order_item
- THEN no new `stock_movements` row is inserted (UNIQUE conflict silently absorbed)
- AND `stock_reservado` is unchanged
