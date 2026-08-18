# Delta for Key Configuration

## MODIFIED Requirements

### Requirement: Configure Key Item (ConfigureKeyItemSheet)

The system MUST provide ConfigureKeyItemSheet for resolving a pending key item.
The sheet MUST collect: `rfid_code` (required text), `unit_id` (required select
from units belonging to the item's building, plus a QuickUnitCreateDialog link),
and an optional multi-select of equipment in the same building for future
`key_authorizations`. On save the system MUST atomically:
1. INSERT an `rfid_keys` row with `order_item_id` = the order item id and
   status = `pending_creation`.
2. UPDATE `order_items.produced_key_id` and `status = 'configured'`.
3. **If `order_items.product_id` is non-null**: emit an `egreso_grabacion`
   movement for that product and decrement `products.stock_total`.
4. **If a `key_configuration` ticket exists for this order_item**: mark it
   `resolved` automatically (which advances the key to `pending_installation`).
5. **MUST NOT** insert `key_authorizations` rows at this step — authorization
   mint is deferred to `resolve_equipment_update`.

The `rfid_keys.order_item_id` MUST be immutable once set (DB trigger enforced).
SQLSTATE 23503 (FK violation) MUST map to a friendly toast.

(Previously: on save the RPC inserted rfid_keys with status `active`, inserted
`key_authorizations` for selected equipment inline, and updated order_items.
Authorization insert at configure time is no longer performed.)

#### Scenario: Admin configures a key item — key minted as pending_creation

- GIVEN a pending key item for building B
- WHEN the admin fills rfid_code, selects unit U, selects equipment E, and saves
- THEN an `rfid_keys` row is created with status `pending_creation` and order_item_id set
- AND NO `key_authorizations` row is created
- AND order_items.status becomes `configured`
- AND a success toast is shown

#### Scenario: Configure with no equipment selected

- GIVEN the admin fills rfid_code and unit but selects no equipment
- WHEN the admin saves
- THEN the `rfid_keys` row is created with status `pending_creation`
- AND no `key_authorizations` rows are created
- AND order_items.status becomes `configured`

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
- AND `stock_reservado` decrements by the item quantity
- AND the rfid_keys row and order_item update are in the same transaction

#### Scenario: No stock movement emitted when product_id is null

- GIVEN a key order_item with product_id=NULL
- WHEN admin configures the key item
- THEN rfid_keys and order_items are updated normally
- AND no `stock_movements` row is created

#### Scenario: key_configuration ticket auto-resolved on configure success

- GIVEN a `key_configuration` ticket exists for the order_item being configured
- WHEN the configure RPC succeeds
- THEN the `key_configuration` ticket status is set to `resolved`
- AND the `rfid_keys` row advances to status `pending_installation`
- AND no `key_installation` ticket is spawned
