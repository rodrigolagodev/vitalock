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
