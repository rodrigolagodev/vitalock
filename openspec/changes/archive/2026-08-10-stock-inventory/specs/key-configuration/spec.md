# Delta for Key Configuration

**Change**: stock-inventory
**Domain**: key-configuration
**Type**: Delta (modifies `openspec/specs/ordenes-admin/spec.md` — Configure Key Item requirement)
**Date**: 2026-08-10

## MODIFIED Requirements

### Requirement: Configure Key Item (ConfigureKeyItemSheet)

The system MUST provide ConfigureKeyItemSheet for resolving a pending key item. The sheet MUST collect: `rfid_code` (required text), `unit_id` (required select from units belonging to the item's building, plus a QuickUnitCreateDialog link), and an optional multi-select of equipment in the same building for `key_authorizations`. On save the system MUST atomically:
1. INSERT an `rfid_keys` row with `order_item_id` = the order item id.
2. INSERT `key_authorizations` for each selected equipment (if any).
3. UPDATE `order_items.produced_key_id` and `status='configured'`.
4. **If `order_items.product_id` is non-null**: emit an `egreso_grabacion` movement for that product and decrement `products.stock_total` (all within the same transaction as steps 1–3).
5. **If a `key_configuration` ticket exists for this order_item**: mark it `resolved` automatically.
6. **If `order_items.product_id` is null**: steps 1–3 execute normally; NO stock movement is emitted (backward compatible).

The `rfid_keys.order_item_id` MUST be immutable once set (DB trigger enforced). SQLSTATE 23503 (FK violation) MUST map to a friendly toast. The `ConfigureKeyItemSheet` UI MUST remain unchanged from the admin's perspective — stock movement is a transparent back-end side-effect.
(Previously: on save the RPC only inserted rfid_keys, key_authorizations, and updated order_items; no stock movement was emitted; no ticket was resolved)

#### Scenario: Admin configures a key item successfully

- GIVEN a pending key item for building B
- WHEN the admin fills rfid_code, selects unit U, selects equipment E, and saves
- THEN an rfid_keys row is created with order_item_id set
- AND a key_authorizations row is created for equipment E
- AND order_items.status becomes 'configured'
- AND a success toast is shown
- AND the sheet closes

#### Scenario: Configure with no equipment selected

- GIVEN the admin fills rfid_code and unit but selects no equipment
- WHEN the admin saves
- THEN the rfid_keys row is created with order_item_id set
- AND no key_authorizations rows are created
- AND order_items.status becomes 'configured'

#### Scenario: QuickUnitCreateDialog creates unit in-context

- GIVEN no suitable unit exists for the item's building
- WHEN the admin opens QuickUnitCreateDialog from within ConfigureKeyItemSheet
- THEN a new unit can be created for that building
- AND the new unit appears in the unit_id select immediately after creation

#### Scenario: order_item_id immutability enforced

- GIVEN an rfid_keys row already has order_item_id set
- WHEN a second configure attempt tries to overwrite order_item_id
- THEN the DB trigger blocks the update
- AND an error toast is shown

#### Scenario: Stock decremented atomically on configure (product_id present)

- GIVEN a key order_item with product_id=P (P has stock_total=5, stock_reservado=1)
- WHEN admin configures the key item successfully
- THEN an `egreso_grabacion` movement is created for product P
- AND `stock_total` decrements by the item quantity
- AND `stock_reservado` decrements by the item quantity (reservation consumed)
- AND the rfid_keys row and order_item update are committed in the same transaction

#### Scenario: No stock movement emitted when product_id is null

- GIVEN a key order_item with product_id=NULL
- WHEN admin configures the key item
- THEN rfid_keys and order_items are updated normally
- AND no `stock_movements` row is created

#### Scenario: key_configuration ticket auto-resolved on configure success

- GIVEN a `key_configuration` ticket exists for the order_item being configured
- WHEN the configure RPC succeeds
- THEN the `key_configuration` ticket status is set to `resolved`
- AND a `key_installation` ticket is created (per resolution chain rule)
