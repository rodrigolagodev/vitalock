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

The system MUST support two mutually exclusive client types: `administration`
and `particular`. Client type is chosen via radio button in OrdenFormSheet.
When `administration` is selected, the form MUST show an administration
combobox (populated via `useAdministrations`). When `particular` is selected,
the form MUST show a ParticularSelector (server-side search by name or DNI)
plus a QuickParticularCreateDialog link for inline creation; the submitted
order MUST carry `particular_id` (existing DNI match or inline-created row).
The flat `particular_full_name/dni/phone/email` fields MUST be retained as an
audit snapshot, auto-populated from the selected particular. The DB MUST
enforce a CHECK that `administration_id` is non-null when
`client_type='administration'` and `particular_full_name` is non-empty when
`client_type='particular'`.

#### Scenario: Admin selects administration client type

- GIVEN the OrdenFormSheet is open
- WHEN the admin selects "Administración"
- THEN the administration combobox appears
- AND particular fields are hidden

#### Scenario: Admin selects particular client type

- GIVEN the OrdenFormSheet is open
- WHEN the admin selects "Particular"
- THEN the ParticularSelector and inline-create link appear
- AND the administration combobox is hidden

#### Scenario: Existing particular selected by search

- GIVEN a particular exists with DNI 30111222
- WHEN the admin searches, selects it, and submits
- THEN the order is created with particular_id pointing to that particular
- AND the flat particular_* snapshot is populated from the entity

#### Scenario: Inline-created particular linked on submit

- GIVEN no particular matches the order's buyer
- WHEN the admin creates the particular inline and submits
- THEN the new particular is linked as particular_id
- AND order and items are created atomically

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
(a) status filter pills (`all | draft | confirmed | in_progress | ready_for_pickup |
completed | cancelled`) and (b) a text search input (debounced 300 ms) that
matches `order_number` OR administration `company_name` OR
`particular_full_name` server-side (ILIKE). The table MUST show a skeleton
during loading. The page MUST distinguish "no records exist" from "no results
match the current filter".

(Previously: status filter pills included `in_preparation` and excluded `confirmed` and `in_progress`)

#### Scenario: Status filter narrows list

- GIVEN orders exist in multiple statuses
- WHEN the admin clicks the "confirmed" pill
- THEN only orders with status=`confirmed` are shown

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

Orders MUST follow the state machine:
`draft → confirmed → in_progress → ready_for_pickup → completed → invoiced`;
any non-terminal state → `cancelled`.

The `in_preparation` enum value MUST be removed. The DB MUST enforce that status
transitions are legal (no skip, no reverse from terminal). Specific rules:

- `draft → confirmed`: admin clicks "Confirmar orden" on OrdenDetailPage.
- `confirmed → in_progress`: auto-transition via `recompute_order_status` when
  work begins — for keys orders: first key item reaches `configured`; for
  technical orders: first ticket enters `in_progress`.
- `in_progress → ready_for_pickup`: auto-transition when ALL of the following
  hold for a keys order: (a) every non-cancelled key `order_item` has
  `produced_key_id` IS NOT NULL, AND (b) every `key_authorizations` row whose
  `rfid_key_id` belongs to those items has `sync_state IN ('installed',
  'cancelled')`. `sync_state = 'pending_install'` blocks readiness. The
  `key_authorizations` rows themselves are now created at `equipment_update`
  resolution, not at `key_configuration`. An order MUST NOT promote to
  `ready_for_pickup` until the relevant `equipment_update` task has resolved
  and minted the `key_authorizations` rows.
- `ready_for_pickup → in_progress` (demotion): if an order is `ready_for_pickup`
  and any `key_authorizations` row for its keys transitions to `pending_install`,
  `recompute_order_status` MUST demote the order back to `in_progress`.
- `ready_for_pickup → completed`: auto-transition when all non-cancelled key
  items have `picked_up_at` set.
- `completed → invoiced`: manual admin action.
- Any non-terminal → `cancelled`: manual "Cancelar orden" button.

(Previously: `in_progress → ready_for_pickup` could trigger as soon as
`key_authorizations` rows were inserted at `configure_key_order_item` time
with `sync_state = 'pending_install'`. Under the new lifecycle, `key_authorizations`
are never created at configure time — they are created only at
`equipment_update` resolution, at which point `sync_state` reflects the
physically-confirmed installation state. `ready_for_pickup` therefore fires
only after the installer has completed and resolved the `equipment_update` task.)

#### Scenario: Order does NOT reach ready_for_pickup after configure only

- GIVEN a keys order in `in_progress` with a configured key item (produced_key_id set)
- AND the relevant `equipment_update` task has NOT yet been resolved
- WHEN `recompute_order_status` runs
- THEN the order stays `in_progress`
- AND no `key_authorizations` row exists yet (none were created at configure time)

#### Scenario: Order promotes to ready_for_pickup after equipment_update resolves

- GIVEN a keys order in `in_progress` with all non-cancelled key items configured
- AND the relevant `equipment_update` task resolves, minting `key_authorizations`
  with `sync_state = 'installed'`
- WHEN `recompute_order_status` runs (triggered by the resolution)
- THEN the order status becomes `ready_for_pickup`

#### Scenario: Confirm order transitions draft to confirmed

- GIVEN an order with status `draft`
- WHEN the admin clicks "Confirmar orden"
- THEN order status becomes `confirmed`
- AND the status badge updates on the detail page

#### Scenario: confirmed auto-advances to in_progress on first key configured

- GIVEN a keys order with status `confirmed`
- WHEN the first key item reaches status `configured`
- THEN `recompute_order_status` transitions the order to `in_progress`

#### Scenario: Unconfigured key item blocks ready_for_pickup

- GIVEN a keys order in `in_progress` with 2 key items
- AND item A has `produced_key_id` set; item B has `produced_key_id IS NULL`
- WHEN `recompute_order_status` runs
- THEN the order stays `in_progress`

#### Scenario: pending_install authorization blocks ready_for_pickup

- GIVEN a keys order in `in_progress` with all key items configured
- AND a `key_authorizations` row exists with `sync_state = 'pending_install'`
- WHEN `recompute_order_status` runs
- THEN the order stays `in_progress`

#### Scenario: ready_for_pickup demotes to in_progress when authorization flips to pending_install

- GIVEN an order with status `ready_for_pickup`
- WHEN an existing `key_authorizations` row for one of its keys transitions to `sync_state = 'pending_install'`
- THEN `recompute_order_status` sets the order status back to `in_progress`

#### Scenario: All keys picked up completes the order

- GIVEN an order in `ready_for_pickup` with 2 configured key items
- WHEN the last pickup is registered
- THEN the order status becomes `completed`

#### Scenario: Cancel order from any non-terminal state

- GIVEN order status is `draft`, `confirmed`, `in_progress`, or `ready_for_pickup`
- WHEN the admin clicks "Cancelar orden" and confirms
- THEN order status becomes `cancelled`

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

---

### Requirement: Draft Order Editability

Orders in `draft` status MUST be fully editable via a dedicated edit route
(`/ordenes/:id/editar`). The `update_draft_order_with_items` RPC MUST accept a
header patch and a full items diff (add/remove/update) in a single atomic
transaction. The edit route MUST reuse the `OrdenForm` component shared with
`/ordenes/nueva`. The edit action MUST be absent or disabled for orders in any
status other than `draft`.

#### Scenario: Admin edits a draft order header and items

- GIVEN an order with status `draft`
- WHEN the admin navigates to `/ordenes/:id/editar`, changes the notes field, removes one item, adds another, and saves
- THEN the order header and item list are updated atomically
- AND a success toast is shown
- AND the detail page reflects the changes

#### Scenario: Edit action absent for confirmed order

- GIVEN an order with status `confirmed`
- WHEN OrdenDetailPage renders
- THEN no "Editar" button is visible or enabled

#### Scenario: Partial edit failure leaves order unchanged

- GIVEN the `update_draft_order_with_items` RPC returns an error mid-transaction
- WHEN the mutation completes with failure
- THEN the order and its items are unchanged
- AND an error toast is shown

---

### Requirement: Confirm Order RPC — Atomic Commitment

The `confirm_order(order_id uuid)` RPC MUST:
1. Validate that the order is in `draft` status; reject otherwise.
2. Atomically transition status to `confirmed`.
3. Create `support.tickets` rows for all technical order items.
4. Write negative `reserva` movements to `stock_movements` for all key items
   with a non-null `product_id`.
5. Roll back the entire transaction on any failure.

The RPC MUST be idempotent-safe: a second call on the same order MUST fail with
a clean error (not create duplicate tickets or reservations).

#### Scenario: Confirm order creates tickets and reservations atomically

- GIVEN a draft order with 1 technical item and 1 key item (product_id non-null)
- WHEN `confirm_order` is called
- THEN order status becomes `confirmed`
- AND a `support.tickets` row is created for the technical item
- AND a `reserva` movement is created for the key item
- AND all three writes are in the same transaction

#### Scenario: Confirm rejected for non-draft order

- GIVEN an order with status `confirmed`
- WHEN `confirm_order` is called again
- THEN the RPC returns an error
- AND no duplicate tickets or reservations are created

#### Scenario: Confirm rolls back on ticket creation failure

- GIVEN a draft order where ticket creation would fail (e.g., FK violation)
- WHEN `confirm_order` executes
- THEN no status change, no ticket, and no reservation are persisted

---

### Requirement: No Side Effects in Draft

Orders in `draft` status MUST NOT have associated `support.tickets` rows or
`stock_movements` reservation rows. The `order_items_create_tarea` trigger MUST
NOT create tickets or reservations when the parent order's status is `draft`.

#### Scenario: Item inserted into draft order produces no tickets

- GIVEN a draft order
- WHEN an order_item is inserted
- THEN no `support.tickets` row is created for that item

#### Scenario: Item inserted into draft order produces no reservation

- GIVEN a draft order with an item with item_type=`key` and product_id non-null
- WHEN the item is inserted
- THEN no `reserva` movement is created for that item

---

### Requirement: Cancellation Cleanup by Status

Cancellation from `draft` MUST require no cleanup (no side effects exist).
Cancellation from `confirmed` or `in_progress` MUST release all pending stock
reservations via the existing `cancel_order_releases_reservations` mechanism.

#### Scenario: Cancel draft order requires no reservation cleanup

- GIVEN an order with status `draft` and one key item (product_id non-null)
- WHEN the order is cancelled
- THEN no `liberacion_reserva` movement is created
- AND order status becomes `cancelled`

#### Scenario: Cancel confirmed order releases reservations

- GIVEN an order with status `confirmed` and one key item with a `reserva` movement
- WHEN the order is cancelled
- THEN a `liberacion_reserva` movement is created for that item
- AND `stock_reservado` decrements accordingly
- AND order status becomes `cancelled`

---

### Requirement: OrdenDetailPage Action Visibility

OrdenDetailPage MUST display actions conditionally based on order status:

| Action | Visible when |
|---|---|
| "Confirmar orden" | status = `draft` |
| "Editar" | status = `draft` |
| "Cancelar orden" | status is non-terminal |
| "Marcar facturada" | status = `completed` |

The "Iniciar preparación" action MUST be removed.

#### Scenario: Draft order shows confirm and edit actions

- GIVEN an order with status `draft`
- WHEN OrdenDetailPage renders
- THEN "Confirmar orden" and "Editar" buttons are visible
- AND "Iniciar preparación" is absent

#### Scenario: Confirmed order shows only cancel action

- GIVEN an order with status `confirmed`
- WHEN OrdenDetailPage renders
- THEN "Cancelar orden" is visible
- AND "Confirmar orden" and "Editar" are absent

---

### Requirement: Draft Edit Concurrency Guard

The `update_draft_order_with_items` RPC MUST accept an `updated_at` timestamp parameter and reject the update if the order's current `updated_at` does not match (optimistic concurrency). A mismatch MUST return a clean conflict error — not silently overwrite concurrent changes.

#### Scenario: Concurrent edit rejected on stale updated_at

- GIVEN admin A and admin B both open the same draft order at the same `updated_at = T`
- WHEN admin A saves first (advancing `updated_at` to T+1)
- AND admin B submits with the original `updated_at = T`
- THEN the RPC returns a conflict error
- AND admin B sees an error toast indicating the order was modified concurrently

#### Scenario: Edit accepted when updated_at matches

- GIVEN an admin opens a draft order with `updated_at = T`
- WHEN the admin saves without concurrent modification (order still at `updated_at = T`)
- THEN the update is applied and `updated_at` advances

---

### Requirement: Enum Backfill Safety

The migration MUST atomically:
1. Delete all orders with `status = 'draft'` (cascade-deleting associated order_items, tickets, and reservations).
2. Update all orders with `status = 'in_preparation'` to `status = 'in_progress'`.
3. Remove the `in_preparation` value from the `order_status` enum.

No window MUST exist between the trigger rewrite and the enum change where item inserts into `draft` orders can produce partial side effects.

#### Scenario: in_preparation rows migrated to in_progress

- GIVEN the DB contains orders with `status = 'in_preparation'` before migration
- WHEN the backfill migration runs
- THEN all such rows have `status = 'in_progress'`
- AND no `in_preparation` value exists in the enum

#### Scenario: draft orders deleted by backfill

- GIVEN the DB contains orders with `status = 'draft'` before migration (confirmed as test data)
- WHEN the backfill migration runs
- THEN all such orders and their child rows (order_items, tickets, reservations) are removed

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

`mapMutationError` MUST handle SQLSTATE 23505 (order_number uniqueness OR
duplicate particular DNI/unit) and 23503 (FK violation on order_item
operations) with Spanish-language friendly toasts. Unrecognized codes fall
back to a generic error toast.

#### Scenario: 23505 mapped for order_number collision

- GIVEN the DB returns SQLSTATE 23505 on order creation
- WHEN mapMutationError processes the error
- THEN a toast describes the order number conflict in Spanish

#### Scenario: 23505 mapped for duplicate particular

- GIVEN the DB returns SQLSTATE 23505 while saving a particular (DNI or unit)
- WHEN mapMutationError processes the error
- THEN a toast explains the duplicate DNI or unit in Spanish

#### Scenario: 23503 mapped for FK violation

- GIVEN the DB returns SQLSTATE 23503 during configure-key save
- WHEN mapMutationError processes the error
- THEN a toast describes the referential integrity issue in Spanish

---

### Requirement: Pickup Person Selection

OrdenDetailPage MUST include a pickup section ("quién retira la llave") for
orders with a particular client. The section MUST offer: (a) a
ParticularSelector to pick an existing particular, (b) a
QuickParticularCreateDialog link for inline creation, and (c) a checkbox
"usar mismos datos de compra" that sets `pickup_particular_id =
particular_id`. Orders without a particular (administration client) MUST NOT
show the section this cycle.

#### Scenario: Checkbox reuses buyer as pickup person

- GIVEN a particular order with buyer particular P
- WHEN the admin checks "usar mismos datos de compra"
- THEN pickup_particular_id equals P
- AND no separate pickup search is required

#### Scenario: Explicit pickup person selected

- GIVEN a particular order
- WHEN the admin searches and selects a different particular Q as pickup person
- THEN pickup_particular_id equals Q
- AND the checkbox is unchecked

#### Scenario: Pickup person created inline

- GIVEN no suitable pickup particular exists
- WHEN the admin creates one via the dialog
- THEN the new particular is set as pickup_particular_id

#### Scenario: Section hidden for administration orders

- GIVEN an order with client_type 'administration'
- WHEN OrdenDetailPage renders
- THEN the pickup section is not shown

---

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

