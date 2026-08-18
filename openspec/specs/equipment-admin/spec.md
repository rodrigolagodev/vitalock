# Equipment Admin Specification

## Purpose

Admin surface for managing equipment (locks/devices) nested within a building. Rendered in the "Equipos" tab of BuildingDetailPage. Covers listing, creation, editing mutable fields, status transitions (including the dead/decommission flow with impact preview), and the dedicated Replace Equipment dialog that calls `operations.replace_equipment()`.

## Requirements

### Requirement: Equipment List Nested in Building

The system MUST display all equipment belonging to the current building in the Equipos tab. Each row MUST show: model/name, serial number, status (`active` / `maintenance` / `dead`), and installed date.

#### Scenario: Admin views equipment for a building

- GIVEN the admin navigates to `/buildings/:buildingId` and selects the Equipos tab
- WHEN the tab loads
- THEN all equipment with `building_id = :buildingId` is listed
- AND an empty state is shown when no equipment exists for the building

---

### Requirement: Create Equipment

The system MUST provide a Sheet form for creating a new equipment record within the current building context. The `building_id` MUST be pre-populated from the route and MUST NOT be editable. `serial_number` and `installed_at` MUST be supplied by the admin at creation time. `replaces_equipment_id` MUST NOT be settable through the create form (it is only set via the Replace Equipment RPC).

#### Scenario: Admin creates new equipment

- GIVEN the admin opens the "Nuevo equipo" sheet
- WHEN they supply serial number, model, and installed_at, and submit
- THEN the equipment record is created with `building_id` equal to the current building and status = `active`
- AND the equipment list refreshes
- AND a success toast is shown

#### Scenario: replaces_equipment_id absent from create form

- GIVEN the admin opens the create equipment sheet
- WHEN the form renders
- THEN no `replaces_equipment_id` field is visible or editable

---

### Requirement: Edit Equipment — Mutable Fields Only

The system MUST allow an admin to edit only the mutable fields of an equipment record: model name, notes, and any non-immutable metadata. The following fields MUST be rendered as read-only in the edit form and MUST NOT be submitted as part of an edit mutation: `serial_number`, `building_id`, `installed_at`, `replaces_equipment_id`.

#### Scenario: Admin edits equipment model name

- GIVEN the admin opens the edit sheet for an existing equipment record
- WHEN they change the model name and save
- THEN only the mutable fields are updated in the database
- AND a success toast is shown

#### Scenario: Immutable fields visible but read-only in edit form

- GIVEN the admin opens the edit sheet for existing equipment
- WHEN the form renders
- THEN `serial_number`, `building_id`, `installed_at`, and `replaces_equipment_id` are displayed but not editable
- AND those values are not included in the update payload sent to the database

#### Scenario: 23514 trigger error mapped to friendly toast

- GIVEN a mutation attempts to write to an immutable equipment field
- WHEN the database returns SQLSTATE 23514
- THEN `mapMutationError` maps it to a descriptive toast explaining the field cannot be changed after creation
- AND the toast is shown in Spanish

---

### Requirement: Equipment Status Transitions

The equipment edit form MUST include a single-select field for status with values `active`, `maintenance`, and `dead`. Selecting `dead` MUST open an inline decommission dialog before committing the change. Transitions from `dead` to any other status MUST NOT be permitted (dead is terminal per DB trigger).

#### Scenario: Admin sets equipment to maintenance

- GIVEN the equipment is currently `active`
- WHEN the admin selects `maintenance` and saves
- THEN the equipment status becomes `maintenance`
- AND a success toast is shown

#### Scenario: Selecting dead opens decommission dialog

- GIVEN the admin selects `dead` in the status selector
- WHEN the selection is made
- THEN an inline decommission dialog opens before any mutation fires
- AND the dialog requires a non-empty `decommission_reason`
- AND the dialog shows the count of active `key_authorizations` that will be closed by this action ("N autorizaciones se cerrarán")

#### Scenario: Admin confirms dead with decommission_reason

- GIVEN the decommission dialog is open with a valid reason entered
- WHEN the admin confirms
- THEN the equipment status becomes `dead` with the provided `decommission_reason`
- AND affected `key_authorizations` are closed (via DB trigger)
- AND a success toast is shown

#### Scenario: Admin cancels decommission dialog

- GIVEN the decommission dialog is open
- WHEN the admin cancels
- THEN the status selector reverts to the previous value
- AND no mutation is sent to the database

#### Scenario: Dead equipment status selector is read-only

- GIVEN the equipment status is already `dead`
- WHEN the admin opens the edit form
- THEN the status field is rendered as read-only (no transitions allowed)
- AND no decommission dialog is triggered

---

### Requirement: Decommission Impact Preview

Before confirming a dead transition, the system MUST display the count of active `key_authorizations` associated with the equipment that will be automatically closed by the DB trigger. This count MUST be fetched before the dialog is shown.

#### Scenario: Impact count shown in decommission dialog

- GIVEN the admin selects `dead` for a piece of equipment
- WHEN the decommission dialog opens
- THEN the count of active `key_authorizations` for that equipment is displayed
- AND the admin can read the impact before deciding to confirm or cancel

#### Scenario: Zero impact shown when no active authorizations exist

- GIVEN the equipment has no active `key_authorizations`
- WHEN the decommission dialog opens
- THEN the count shown is 0
- AND the admin may still proceed to confirm decommission

---

### Requirement: Replace Equipment Dialog

The system MUST provide a dedicated Replace Equipment dialog, separate from the edit form, that invokes `operations.replace_equipment()` RPC. The dialog MUST collect the new equipment's serial number and model. On success, the new equipment record exists with `replaces_equipment_id` pointing to the old device, the old device is marked `dead`, and installed `key_authorizations` are migrated to `pending_install` on the new device.

#### Scenario: Admin opens Replace Equipment dialog

- GIVEN the admin views an active equipment record
- WHEN they open the Replace Equipment dialog
- THEN a form collects the new device's serial number and model
- AND the old device's details are shown for reference (read-only)

#### Scenario: Successful equipment replacement

- GIVEN the admin fills in new device details and confirms
- WHEN `operations.replace_equipment()` RPC executes
- THEN a new equipment record is created with `replaces_equipment_id` = old device id
- AND the old device status becomes `dead`
- AND all installed `key_authorizations` on the old device are migrated to `pending_install` on the new device
- AND the equipment list refreshes
- AND a success toast is shown

#### Scenario: RPC failure is surfaced as error toast

- GIVEN the replace RPC fails (network, constraint, or RPC error)
- WHEN the mutation completes with an error
- THEN no partial state change is visible (RPC is atomic)
- AND a descriptive error toast is shown

---

### Requirement: No Physical Delete

No delete action SHALL be present for any equipment record at any point in the admin UI. Deactivation (status to `dead` or `maintenance`) is the only lifecycle exit available through the UI.

#### Scenario: No Delete button in equipment list or edit form

- GIVEN any equipment record in any state
- WHEN the admin inspects available actions
- THEN no delete, remove, or destroy action is present

---

### Requirement: createKey Accepts order_item_id

`useMutateKey.createKey` input type MUST accept an optional `order_item_id`
field. When `order_item_id` is provided, the INSERT into `rfid_keys` MUST
include that value. When omitted, the existing behaviour (null `order_item_id`)
MUST be preserved. The DB CHECK constraint (`key_request_item_id IS NULL OR
order_item_id IS NULL`) MUST be respected; callers are responsible for not
supplying both FKs simultaneously.

#### Scenario: createKey with order_item_id persists the FK

- GIVEN a configure-key flow provides a valid order_item_id
- WHEN createKey is called with that order_item_id
- THEN the rfid_keys row is inserted with order_item_id set to the provided value
- AND key_request_item_id remains null on that row

#### Scenario: createKey without order_item_id preserves existing behaviour

- GIVEN a legacy key creation flow does not provide order_item_id
- WHEN createKey is called without order_item_id
- THEN the rfid_keys row is inserted with order_item_id = null
- AND existing key_request_item_id semantics are unaffected

---

### Requirement: Order-Key Pickup Registration

The system MUST allow registering the pickup of an order-produced key. The
`rfid_keys_validate_pickup` trigger MUST accept the `order_item_id` origin
path, recording `picked_up_by_name/surname/dni`, `picked_up_at`, and
`delivered_by_staff_id`. On that path, `picked_up_by_dni` MUST match the
order's authorized particular — the buyer (`orders.particular_id`) or the
explicit pickup person (`orders.pickup_particular_id`). The existing
`key_request_item_id` branch MUST remain unchanged, and the already-set
key_requests and rfid_keys triggers MUST NOT be modified (immutability).

#### Scenario: Pickup by buyer DNI succeeds

- GIVEN an order key item whose buyer particular is authorized
- WHEN a pickup registers with picked_up_by_dni equal to the buyer's DNI
- THEN picked_up_at, picked_up_by_*, and delivered_by_staff_id are recorded

#### Scenario: Pickup by explicit pickup person succeeds

- GIVEN the order has pickup_particular_id set to particular Q
- WHEN a pickup registers with picked_up_by_dni equal to Q's DNI
- THEN the pickup is accepted and recorded

#### Scenario: Unauthorized DNI rejected

- GIVEN the authorized DNIs are the buyer and the explicit pickup person
- WHEN a pickup registers with a different DNI
- THEN the write is rejected with an error
- AND picked_up_at is not set

#### Scenario: Order without a particular cannot use the order path

- GIVEN an administration order (no particular) with an order-produced key
- WHEN a pickup attempts to register via the order_item_id path
- THEN the write is rejected (no authorized particular exists)

#### Scenario: key_requests path regression-free

- GIVEN a key produced via key_requests
- WHEN its pickup is registered as before
- THEN the pickup succeeds with identical trigger behavior
- AND the order path changes do not affect it

---

### Requirement: Pending-Keys Guardrail Badge

The equipment detail view MUST display a `PendingKeysGuardrailBadge` whenever
the equipment has keys in `pending_installation` or `pending_disable` status
that are NOT included in any currently `open` or `in_progress` `equipment_update`
task (i.e., pending keys outside the current train). The badge MUST show the
count of such keys and convey that they are awaiting a new train.

#### Scenario: Badge appears when pending keys exist outside active train

- GIVEN equipment E has key K1 in `pending_installation`
- AND there is no `open` or `in_progress` `equipment_update` task that includes K1
- WHEN the equipment detail view renders
- THEN a `PendingKeysGuardrailBadge` shows a count of 1 pending key

#### Scenario: Badge absent when all pending keys are in an active train

- GIVEN equipment E has key K1 in `pending_installation`
- AND an `open` `equipment_update` task exists with K1 in its snapshot
- WHEN the equipment detail view renders
- THEN no `PendingKeysGuardrailBadge` is shown (or the count is 0)

#### Scenario: Badge absent when no pending keys exist

- GIVEN equipment E has no keys in `pending_installation` or `pending_disable`
- WHEN the equipment detail view renders
- THEN no `PendingKeysGuardrailBadge` is displayed

---

### Requirement: Equipment Update Task Creation Entry Point

The equipment detail view MUST provide an entry point to create a new
`equipment_update` task for that equipment. This entry point MUST open the
dedicated `EquipmentUpdateFormSheet`. The entry point MUST be disabled or absent
when an `open` or `in_progress` `equipment_update` task already exists for the
equipment (uniqueness guard).

#### Scenario: Admin opens EquipmentUpdateFormSheet from equipment detail

- GIVEN no `open` or `in_progress` `equipment_update` task exists for equipment E
- WHEN the admin clicks the create-equipment-update entry point
- THEN `EquipmentUpdateFormSheet` opens pre-populated with equipment E's context

#### Scenario: Entry point disabled when active train exists

- GIVEN an `open` or `in_progress` `equipment_update` task exists for equipment E
- WHEN the equipment detail view renders
- THEN the create-equipment-update entry point is disabled or absent
