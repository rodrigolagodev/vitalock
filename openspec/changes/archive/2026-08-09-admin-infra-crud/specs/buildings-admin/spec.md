# Buildings Admin Specification

## Purpose

Admin surface for managing buildings — the top-level organizing entity for units and equipment. Covers listing, creation, editing non-lifecycle fields, and deactivation. No physical deletion.

## Requirements

### Requirement: Buildings List

The system MUST display all buildings accessible to the authenticated admin, ordered by name. Each row MUST show: name, address, status (`active` / `inactive`), and a count of associated units and equipment (informational).

#### Scenario: Admin views buildings list

- GIVEN the admin is authenticated and navigates to `/buildings`
- WHEN the page loads
- THEN all buildings are listed with name, address, and status visible
- AND an empty state is shown when no buildings exist

#### Scenario: RLS enforces admin-only access

- GIVEN the buildings table has an `for all` admin RLS policy
- WHEN the query executes
- THEN only rows the admin role can read are returned
- AND no row-level bypass is possible from the client

---

### Requirement: Create Building

The system MUST provide a Sheet form that allows an admin to create a new building by supplying at least a name and address. On success the list MUST refresh and a success toast MUST be displayed. On validation or DB error, a descriptive error toast MUST be shown.

#### Scenario: Admin creates a building successfully

- GIVEN the admin opens the "Nuevo edificio" sheet
- WHEN they fill in name and address and submit
- THEN the building is created in the database
- AND the buildings list refreshes to include the new entry
- AND a success toast is displayed

#### Scenario: Create fails with a constraint error

- GIVEN the admin submits the create form
- WHEN the database returns a constraint violation
- THEN no building is created
- AND a descriptive error toast is shown with title and description

---

### Requirement: Edit Building

The system MUST allow an admin to edit a building's non-lifecycle fields (name, address, metadata). The building's `id`, `created_at`, and `status` field MUST NOT be editable via the edit form; status changes are managed through the deactivation flow only.

#### Scenario: Admin edits a building name

- GIVEN the admin opens the edit sheet for an existing building
- WHEN they change the name and save
- THEN the building record is updated
- AND the list and any open detail page reflect the new name
- AND a success toast is displayed

#### Scenario: Status field absent from edit form

- GIVEN the admin opens the edit sheet
- WHEN the form renders
- THEN no status field is present or editable in the edit form

---

### Requirement: Deactivate Building

The system MUST provide a deactivate action that flips a building's status to `inactive`. Deactivating a building that has active units or active equipment MUST be blocked with a clear error message listing the count of active children, rather than cascading deactivation silently.

#### Scenario: Admin deactivates a building with no active children

- GIVEN a building has zero active units and zero active equipment
- WHEN the admin confirms deactivation
- THEN the building status becomes `inactive`
- AND the list reflects the updated status
- AND a success toast is displayed

#### Scenario: Deactivation blocked when active children exist

- GIVEN a building has one or more active units or active equipment
- WHEN the admin attempts to deactivate it
- THEN the operation is blocked
- AND an error toast or inline message is shown stating the count of active children that must be deactivated first

#### Scenario: No Delete button present

- GIVEN any building in the list or detail view
- WHEN the admin inspects available actions
- THEN no delete or remove action is present at any point in the UI
