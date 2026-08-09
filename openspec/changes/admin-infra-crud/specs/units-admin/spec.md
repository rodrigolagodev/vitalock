# Units Admin Specification

## Purpose

Admin surface for managing units nested within a building. Rendered in the "Unidades" tab of BuildingDetailPage. Covers listing, creation, editing, deactivation, and the `is_administrative` toggle — which is unique-per-building and carries a friendly 23505 error mapping.

## Requirements

### Requirement: Units List Nested in Building

The system MUST display all units belonging to the current building in the Unidades tab, ordered by unit identifier. Each row MUST show: identifier/name, status (`active` / `inactive`), and `is_administrative` flag.

#### Scenario: Admin views units for a building

- GIVEN the admin navigates to `/buildings/:buildingId` and selects the Unidades tab
- WHEN the tab loads
- THEN all units belonging to that building are listed
- AND an empty state is shown when no units exist for the building

#### Scenario: Units from other buildings are not shown

- GIVEN there are units belonging to other buildings
- WHEN the Unidades tab renders for building X
- THEN only units with `building_id = X` are displayed

---

### Requirement: Create Unit

The system MUST provide a Sheet form for creating a unit within the current building context. The `building_id` MUST be pre-populated from the route and MUST NOT be editable by the admin. On success the list MUST refresh and a success toast MUST be displayed.

#### Scenario: Admin creates a unit in a building

- GIVEN the admin opens the "Nueva unidad" sheet inside a building detail
- WHEN they fill in the required fields and submit
- THEN the unit is created with `building_id` equal to the current building
- AND the units list refreshes to include the new entry
- AND a success toast is shown

#### Scenario: building_id not present in form

- GIVEN the admin opens the create unit sheet
- WHEN the form renders
- THEN no `building_id` input is visible or editable

---

### Requirement: Edit Unit

The system MUST allow an admin to edit a unit's name and metadata. The `building_id`, `id`, and `created_at` MUST NOT be editable. The `is_administrative` flag MAY be toggled through the edit form (see `is_administrative` requirement below).

#### Scenario: Admin edits a unit name

- GIVEN the admin opens the edit sheet for an existing unit
- WHEN they change the name and save
- THEN the unit record is updated
- AND the list reflects the change
- AND a success toast is shown

---

### Requirement: is_administrative Toggle

The system MUST allow toggling `is_administrative` on an existing unit post-creation. Because only one unit per building may be `is_administrative`, attempting to set it when another unit in the same building already has `is_administrative = true` MUST surface a friendly Spanish error toast rather than a raw database error. The SQLSTATE is `23505`.

#### Scenario: Admin enables is_administrative on the only eligible unit

- GIVEN no other unit in the building has `is_administrative = true`
- WHEN the admin toggles `is_administrative` to true and saves
- THEN the unit is updated
- AND a success toast is shown

#### Scenario: 23505 on is_administrative conflict mapped to friendly toast

- GIVEN another unit in the same building already has `is_administrative = true`
- WHEN the admin attempts to set `is_administrative = true` on a second unit
- THEN the database returns SQLSTATE 23505
- AND `mapMutationError` maps it to: title "Unidad administrativa duplicada", description "Ya existe una unidad administrativa en este edificio."
- AND that toast is shown to the admin
- AND the toggle is reverted to its previous state

---

### Requirement: Deactivate Unit

The system MUST provide a deactivate action that flips a unit's status to `inactive`. No physical delete action SHALL be present. A unit may be deactivated regardless of its `is_administrative` status.

#### Scenario: Admin deactivates a unit

- GIVEN the admin confirms deactivation of a unit
- WHEN the mutation executes
- THEN the unit status becomes `inactive`
- AND the list reflects the updated status
- AND a success toast is shown

#### Scenario: No Delete button present

- GIVEN any unit in the units list
- WHEN the admin inspects available actions
- THEN no delete or remove action is present
