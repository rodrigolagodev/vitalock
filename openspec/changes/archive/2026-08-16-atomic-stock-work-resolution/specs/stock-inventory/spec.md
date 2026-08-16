# Delta for Stock Inventory

**Change**: atomic-stock-work-resolution
**Date**: 2026-08-12

## ADDED Requirements

### Requirement: Egreso Reemplazo Movement Type

The `public.stock_movements.type` CHECK constraint MUST accept the value `egreso_reemplazo` in addition to the existing nine types (`compra`, `devolucion`, `ajuste_manual`, `egreso_grabacion`, `egreso_instalacion`, `baja_defectuoso`, `baja_perdida`, `reserva`, `liberacion_reserva`). The sign constraint (`stock_movements_sign_matches_type`) MUST classify `egreso_reemplazo` as a negative-quantity egreso (quantity < 0).

#### Scenario: egreso_reemplazo accepted by CHECK constraint

- GIVEN the updated `stock_movements.type` CHECK is in place
- WHEN a `stock_movements` row is inserted with type=`egreso_reemplazo` and quantity=-1
- THEN the insert succeeds and the row is persisted

#### Scenario: egreso_reemplazo with positive quantity is rejected

- GIVEN the updated constraints are in place
- WHEN a `stock_movements` row is inserted with type=`egreso_reemplazo` and quantity=+1
- THEN the DB rejects the insert (sign constraint violated)
- AND no row is persisted

---

### Requirement: Atomic Stock Closure on Equipment Installation Resolution

For every resolved `support.tickets` row with `category = 'equipment_installation'` and a matching `reserva` movement (`stock_movements.ticket_id = ticket.id AND type = 'reserva'`), there MUST exist a matching `egreso_instalacion` movement AND a `liberacion_reserva` movement, both stamped with the same `ticket_id`, `order_item_id`, and `product_id`. The backfill migration MUST close this gap for any pre-existing resolved tickets that violate it. The idempotency guard is `WHERE NOT EXISTS (SELECT 1 FROM stock_movements m2 WHERE m2.ticket_id = t.id AND m2.type IN ('egreso_instalacion','liberacion_reserva'))`.

#### Scenario: Resolved equipment_installation ticket has paired egreso and liberacion

- GIVEN a resolved `equipment_installation` ticket T with a `reserva` movement for product P qty=2
- WHEN the stock ledger is queried for ticket T
- THEN a `stock_movements` row with type=`egreso_instalacion`, quantity=-2, ticket_id=T.id exists
- AND a `stock_movements` row with type=`liberacion_reserva`, quantity=+2, ticket_id=T.id exists

#### Scenario: Backfill DO block is idempotent — running twice does not double-insert

- GIVEN the backfill DO block has already run once for a resolved `equipment_installation` ticket T
- WHEN the backfill DO block runs a second time
- THEN no new `egreso_instalacion` or `liberacion_reserva` rows are inserted for T
- AND all counters remain unchanged

#### Scenario: equipment_installation ticket with product_id=NULL gets no stock movement

- GIVEN a resolved `equipment_installation` ticket whose `reserva` movement has `product_id = NULL`
- WHEN the backfill DO block runs
- THEN no `egreso_instalacion` or `liberacion_reserva` is inserted for that ticket

---

### Requirement: Atomic Stock Closure on Equipment Replacement Resolution

For every resolved `support.tickets` row with `category = 'equipment_replacement'` and a matching `reserva` movement, there MUST exist a matching `egreso_reemplazo` movement AND a `liberacion_reserva` movement, both stamped with the same `ticket_id`, `order_item_id`, and `product_id`. If the originating `order_items` row has `product_id IS NULL`, no stock movement is emitted but the ticket MUST still resolve and the equipment swap MUST still occur.

#### Scenario: Resolved equipment_replacement ticket (with product_id) has egreso_reemplazo and liberacion

- GIVEN a resolved `equipment_replacement` ticket T linked to an order_item with product_id=P, quantity=1
- WHEN the stock ledger is queried for ticket T
- THEN a `stock_movements` row with type=`egreso_reemplazo`, quantity=-1, ticket_id=T.id exists
- AND a `stock_movements` row with type=`liberacion_reserva`, quantity=+1, ticket_id=T.id exists

#### Scenario: equipment_replacement ticket where order_item has no product_id — no stock movement

- GIVEN an `equipment_replacement` ticket T whose order_item has product_id=NULL (no reserva exists)
- WHEN `public.resolve_equipment_replacement` is called
- THEN no `stock_movements` row is inserted (no egreso_reemplazo, no liberacion_reserva)
- AND the ticket is resolved to status=`resolved`
- AND the equipment swap (old → new) is executed via `operations.replace_equipment`

---

### Requirement: resolve_equipment_replacement RPC

The `public.resolve_equipment_replacement(p_ticket_id, p_old_equipment_id, p_new_serial, p_new_model, p_new_description, p_note, p_actor_staff_id)` RPC MUST atomically: (a) validate the ticket exists, has `category='equipment_replacement'`, and is not already resolved; (b) call `operations.replace_equipment` to swap the equipment and migrate key authorizations; (c) if the originating order_item has `product_id IS NOT NULL`, emit `egreso_reemplazo` (negative qty) + `liberacion_reserva` (positive qty); (d) update `support.tickets.equipment_id` to the new equipment UUID; (e) resolve the ticket via the two-step state machine (`open → in_progress → resolved`). All steps MUST execute in one transaction. A second call on an already-resolved ticket MUST raise `SQLSTATE P0001` and emit no duplicate movements.

#### Scenario: Happy path — resolve_equipment_replacement emits correct movements and resolves ticket

- GIVEN an `equipment_replacement` ticket T (status=`open`) linked to order_item OI with product_id=P, quantity=1
- AND a `reserva` movement exists stamped with ticket_id=T.id
- WHEN `public.resolve_equipment_replacement(T.id, old_eq_id, 'SN-NEW', 'Model X', null, null, staff_id)` is called
- THEN a new `operations.equipment` row is created with serial_number=`SN-NEW`
- AND `support.tickets.equipment_id` is updated to the new equipment UUID
- AND a `stock_movements` row with type=`egreso_reemplazo`, quantity=-1, ticket_id=T.id is inserted
- AND a `stock_movements` row with type=`liberacion_reserva`, quantity=+1, ticket_id=T.id is inserted
- AND `support.tickets` T.status = `resolved`
- AND the RPC returns the new equipment UUID

#### Scenario: Second call on already-resolved ticket raises P0001 and emits no duplicate movements

- GIVEN ticket T is already in status=`resolved` (first call succeeded)
- WHEN `public.resolve_equipment_replacement` is called again with the same arguments
- THEN the RPC raises SQLSTATE P0001
- AND no new `stock_movements` rows are inserted
- AND no new `operations.equipment` row is inserted
