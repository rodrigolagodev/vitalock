# Ordenes Admin Specification

## Purpose

Full CRUD + preparation lifecycle for admin-managed service orders. An order
aggregates one or more service items (key, equipment, maintenance, installation)
for a single client (administration or particular). The preparation phase
(ConfigureKeyItemSheet) is the mechanism by which key items are resolved into
`rfid_keys` rows.

## Requirements

### Requirement: Order Number Generation

The system MUST auto-generate a unique order number in `ORD-YYYY-NNNNNN` format
via a DB sequence on insert. Admin staff MUST NOT supply the order number
manually. The system MUST surface a friendly toast when a uniqueness collision
(SQLSTATE 23505) occurs.

#### Scenario: Order number auto-generated on create

- GIVEN an admin submits a valid new order form
- WHEN the RPC `create_order_with_items` executes
- THEN the created order has `order_number` matching `ORD-{year}-{6-digit-padded-seq}`
- AND the order number is visible in the list and detail views

#### Scenario: Uniqueness collision surfaces friendly toast

- GIVEN the DB returns SQLSTATE 23505 on order insert
- WHEN the mutation error is handled
- THEN a toast describes the conflict in Spanish
- AND the form remains open for correction

---

### Requirement: Client Type Selection

The system MUST support two mutually exclusive client types: `administration` and
`particular`. Client type is chosen via radio button in OrdenFormSheet. When
`administration` is selected, the form MUST show an administration combobox
(populated via `useAdministrations`). When `particular` is selected, the form
MUST show inline fields: `particular_full_name` (required), `dni`, `phone`,
`email`. The DB MUST enforce a CHECK that `administration_id` is non-null when
`client_type='administration'` and `particular_full_name` is non-empty when
`client_type='particular'`.

#### Scenario: Admin selects administration client type

- GIVEN the OrdenFormSheet is open
- WHEN the admin selects "Administración"
- THEN the administration combobox appears
- AND particular inline fields are hidden

#### Scenario: Admin selects particular client type

- GIVEN the OrdenFormSheet is open
- WHEN the admin selects "Particular"
- THEN full_name, dni, phone, email fields appear
- AND the administration combobox is hidden

#### Scenario: Administration client type requires administration_id

- GIVEN client_type is 'administration' and administration_id is null
- WHEN the admin attempts to submit
- THEN form validation blocks submission with a required-field error

---

### Requirement: Order Items — Four Types

The create form MUST allow adding one or more items via a dynamic field array
(RHF useFieldArray). Each item MUST have: `item_type`
(`key`|`equipment`|`maintenance`|`installation`), `quantity` (>0),
`description`, and `building_id` (required when item_type is `key`).
The admin MUST be able to add additional items via an "Agregar ítem" button and
remove individual items. The form MUST reject submission when no items are present.

#### Scenario: Key item requires building_id

- GIVEN an item row with item_type = 'key'
- WHEN the admin attempts to submit without selecting a building
- THEN form validation blocks submission with a building-required error on that row

#### Scenario: Non-key item does not require building_id

- GIVEN an item row with item_type = 'equipment'
- WHEN the admin leaves building_id empty and submits
- THEN no building validation error is raised for that row

#### Scenario: No items blocks submission

- GIVEN the item array is empty
- WHEN the admin attempts to submit
- THEN form validation blocks submission

---

### Requirement: Atomic Order Creation

The system MUST create the order and all its items in a single atomic operation
via the PL/pgSQL RPC `create_order_with_items`. Partial writes (order saved,
items lost) MUST NOT be possible.

#### Scenario: Successful order + items creation

- GIVEN a valid order form with 2 items
- WHEN the admin submits
- THEN a single RPC call creates both the order and all items
- AND a success toast is shown
- AND the sheet closes and the order list refreshes

#### Scenario: RPC failure leaves no partial state

- GIVEN the RPC returns an error midway
- WHEN the mutation completes with failure
- THEN neither the order nor any item row exists in the DB
- AND an error toast is shown

---

### Requirement: Order List with Filters and Search

OrdenesPage MUST display all orders in a table with columns: order_number,
client name/type, item count, status badge, created_at. The page MUST provide:
(a) status filter pills (`all | draft | in_preparation | ready_for_pickup |
completed | cancelled`) and (b) a text search input (debounced 300 ms) that
matches `order_number` OR administration `company_name` OR
`particular_full_name` server-side (ILIKE). The table MUST show a skeleton
during loading. The page MUST distinguish "no records exist" from "no results
match the current filter".

#### Scenario: Status filter narrows list

- GIVEN orders exist in multiple statuses
- WHEN the admin clicks the "in_preparation" pill
- THEN only orders with status='in_preparation' are shown

#### Scenario: Text search with debounce

- GIVEN orders exist for "Administración ABC" and "Particular García"
- WHEN the admin types "ABC" and waits 300 ms
- THEN only the matching order is shown
- AND no request fires before 300 ms elapses

#### Scenario: Empty state — no records

- GIVEN no orders exist
- WHEN OrdenesPage loads with no filters active
- THEN an empty state with dashed border is shown (not a zero-row table)

#### Scenario: Empty state — no results

- GIVEN orders exist but none match the active filter/search
- WHEN the filtered list resolves
- THEN a "no results" empty state is shown distinguishable from the no-records state

---

### Requirement: Order Status State Machine

Orders MUST follow the state machine: `draft → in_preparation →
ready_for_pickup → completed`; any non-terminal state → `cancelled`.
The DB MUST enforce that status transitions are legal (no skip, no reverse
from terminal). Specific rules:

- `draft → in_preparation`: manual button on OrdenDetailPage
- `in_preparation → ready_for_pickup`: auto-transition via DB trigger when all
  non-cancelled key items reach `status='configured'`
- `ready_for_pickup → completed`: allowed in DB; no UI this cycle
- Any non-terminal → `cancelled`: manual "Cancelar orden" button

#### Scenario: Manual start of preparation

- GIVEN order status is 'draft'
- WHEN the admin clicks "Iniciar preparación"
- THEN order status becomes 'in_preparation'
- AND the status badge updates on the detail page

#### Scenario: Auto-transition to ready_for_pickup

- GIVEN an order in 'in_preparation' with 2 key items both pending
- WHEN the admin configures both key items (each reaches 'configured')
- THEN the DB trigger fires and order status becomes 'ready_for_pickup'
- AND no manual admin action is required

#### Scenario: Cancelled item excluded from auto-transition check

- GIVEN an order in 'in_preparation' with 1 configured key item and 1 cancelled key item
- WHEN the trigger recomputes
- THEN the order transitions to 'ready_for_pickup' (cancelled item not counted)

#### Scenario: Cancel order from any non-terminal state

- GIVEN order status is 'draft', 'in_preparation', or 'ready_for_pickup'
- WHEN the admin clicks "Cancelar orden" and confirms
- THEN order status becomes 'cancelled'

#### Scenario: Cancel blocked on terminal state

- GIVEN order status is 'completed' or 'cancelled'
- WHEN the admin attempts to cancel
- THEN the cancel button is absent or disabled

---

### Requirement: Order Detail View

OrdenDetailPage MUST display: order_number, client identity, status badge,
notes, and an items table. The items table MUST show per item: item_type icon,
description, quantity, status badge, and a "Configurar" action button for key
items with status='pending'. Items with status other than 'pending', or
non-key item types, MUST NOT show the Configurar button.

#### Scenario: Configure button shown only for pending key items

- GIVEN an order with 1 pending key item and 1 configured key item
- WHEN OrdenDetailPage loads
- THEN only the pending key item row shows the "Configurar" button

---

### Requirement: Configure Key Item (ConfigureKeyItemSheet)

The system MUST provide ConfigureKeyItemSheet for resolving a pending key item.
The sheet MUST collect: `rfid_code` (required text), `unit_id` (required select
from units belonging to the item's building, plus a QuickUnitCreateDialog link),
and an optional multi-select of equipment in the same building for
`key_authorizations`. On save the system MUST:
1. INSERT an `rfid_keys` row with `order_item_id` = the order item id.
2. INSERT `key_authorizations` for each selected equipment (if any).
3. UPDATE `order_items.produced_key_id` and `status='configured'`.
The `rfid_keys.order_item_id` MUST be immutable once set (DB trigger enforced).
SQLSTATE 23503 (FK violation) MUST map to a friendly toast.

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

---

### Requirement: Cancel Individual Order Item

The system MUST allow an admin to cancel an individual order item from the
items table on OrdenDetailPage. A cancelled item MUST NOT block the
auto-transition logic (trigger excludes cancelled items). Items already in
'configured' or later states SHOULD NOT show a cancel action.

#### Scenario: Admin cancels a pending item

- GIVEN an order item with status='pending'
- WHEN the admin clicks the item cancel action and confirms
- THEN the item status becomes 'cancelled'
- AND the auto-transition trigger re-evaluates the parent order

#### Scenario: Configured item has no cancel action

- GIVEN an order item with status='configured'
- WHEN the admin inspects the item row actions
- THEN no cancel action is present

---

### Requirement: Mutual Exclusion of FK Origins

An `rfid_keys` row MUST NOT have both `key_request_item_id` and
`order_item_id` set simultaneously. The DB MUST enforce this via a CHECK
constraint (`key_request_item_id IS NULL OR order_item_id IS NULL`).

#### Scenario: Dual-FK insert blocked by constraint

- GIVEN an rfid_keys row has key_request_item_id set
- WHEN an insert or update attempts to also set order_item_id
- THEN the DB rejects the write with a CHECK constraint violation
- AND an error toast is shown

---

### Requirement: Error Mapping

`mapMutationError` MUST handle SQLSTATE 23505 (order_number uniqueness) and
23503 (FK violation on order_item operations) with Spanish-language friendly
toasts. Unrecognized codes fall back to a generic error toast.

#### Scenario: 23505 mapped for order_number collision

- GIVEN the DB returns SQLSTATE 23505 on order creation
- WHEN mapMutationError processes the error
- THEN a toast describes the order number conflict in Spanish

#### Scenario: 23503 mapped for FK violation

- GIVEN the DB returns SQLSTATE 23503 during configure-key save
- WHEN mapMutationError processes the error
- THEN a toast describes the referential integrity issue in Spanish
