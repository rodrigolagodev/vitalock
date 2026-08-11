# Delta for Support Tickets

**Change**: stock-inventory
**Domain**: support-tickets
**Type**: Delta (modifies `openspec/specs/tickets/spec.md`)
**Date**: 2026-08-10

## ADDED Requirements

### Requirement: Extended Ticket Categories

The system MUST expand `support.tickets.category` CHECK constraint to include: `key_configuration`, `key_installation`, `equipment_installation` (in addition to the existing `maintenance`, `installation` categories). The TypeScript `TareaRow.category` union type MUST be updated in the same change batch as the DB migration.

#### Scenario: New category values accepted by DB

- GIVEN the CHECK constraint has been updated
- WHEN a ticket is inserted with category=`key_configuration`
- THEN the insert succeeds

#### Scenario: Invalid category still rejected

- GIVEN the new CHECK constraint is in place
- WHEN a ticket is inserted with category=`unknown_type`
- THEN the DB rejects the insert with a CHECK violation

---

### Requirement: Key Configuration Task Auto-Creation

The system MUST automatically create a `key_configuration` ticket when an `order_item` of type `key` with a non-null `product_id` is inserted. The ticket MUST reference the same `building_id` and `order_id` as the order_item. If `product_id` is NULL, no ticket is created for this item.

#### Scenario: key order_item with product_id creates key_configuration ticket

- GIVEN an order_item with item_type=`key`, product_id=5, building_id=10 is inserted
- WHEN the DB trigger fires
- THEN a `support.tickets` row is created with category=`key_configuration` and building_id=10

#### Scenario: key order_item without product_id creates no ticket

- GIVEN an order_item with item_type=`key`, product_id=NULL
- WHEN the DB trigger fires
- THEN no `key_configuration` ticket is created

#### Scenario: particular order emits key_configuration ticket

- GIVEN an order with `administration_id = NULL` (particular) contains an order_item with item_type=`key`, product_id=7
- WHEN the DB trigger fires
- THEN a `key_configuration` ticket is created (particular orders are NOT exempt)

---

### Requirement: Equipment Installation Task Auto-Creation

The system MUST automatically create an `equipment_installation` ticket when an `order_item` of type `equipment` with a non-null `product_id` is inserted.

#### Scenario: equipment order_item with product_id creates equipment_installation ticket

- GIVEN an order_item with item_type=`equipment`, product_id=3 is inserted
- WHEN the DB trigger fires
- THEN a `support.tickets` row is created with category=`equipment_installation`

---

### Requirement: Resolution Chain — key_configuration to key_installation

When a `key_configuration` ticket is resolved (status → `resolved`), the system MUST automatically create a `key_installation` ticket for the same building and order. When a `key_configuration` ticket is cancelled, NO `key_installation` ticket MUST be created. A `key_installation` ticket is terminal: resolving it MUST NOT spawn further tickets.

#### Scenario: Resolving key_configuration spawns key_installation

- GIVEN a `key_configuration` ticket T with building_id=10, order_id=5
- WHEN T.status is set to `resolved`
- THEN a new `key_installation` ticket is created with building_id=10, order_id=5

#### Scenario: Cancelling key_configuration does NOT spawn key_installation

- GIVEN a `key_configuration` ticket T with building_id=10
- WHEN T.status is set to `cancelled`
- THEN no `key_installation` ticket is created

#### Scenario: Resolving key_installation creates no further tickets

- GIVEN a `key_installation` ticket T
- WHEN T.status is set to `resolved`
- THEN no additional tickets are created (terminal state)

---

### Requirement: Equipment Installation Resolution Side-Effect

When an `equipment_installation` ticket is resolved:
1. A new `operations.equipment` row MUST be created using the serial number provided at resolution time.
2. The stock reservation for the originating order_item MUST be converted to an `egreso_instalacion` movement (atomic with ticket resolution).
3. If the originating order_item has no `product_id`, no stock movement is emitted (backward compatibility).

#### Scenario: Resolving equipment_installation creates equipment row and egreso

- GIVEN an `equipment_installation` ticket linked to order_item with product_id=3
- WHEN the ticket is resolved with serial="SN-001"
- THEN an `operations.equipment` row is created with serial="SN-001"
- AND an `egreso_instalacion` stock movement is created for product_id=3
- AND `stock_reservado` decrements accordingly

#### Scenario: equipment_installation resolution without product_id emits no movement

- GIVEN an `equipment_installation` ticket linked to order_item with product_id=NULL
- WHEN the ticket is resolved
- THEN an `operations.equipment` row is created
- AND no `stock_movements` row is created
