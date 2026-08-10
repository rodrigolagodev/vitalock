# Delta for Buildings Admin

## MODIFIED Requirements

### Requirement: Buildings List

The system MUST display buildings accessible to the authenticated admin inside a `BuildingsTable` component. When rendered inside `AdministrationDetailPage`, the table MUST be scoped to the administration's `administration_id`. Each row's building name MUST be a navigable link to `/buildings/:buildingId`. Each row MUST show: name (as link), address, status (`active` / `inactive`).

The top-level `/buildings` route (standalone paginated list) is REMOVED; the buildings list is now only accessible nested inside an administration's detail page.
(Previously: Buildings were a standalone top-level list at `/buildings`; building names were plain text; BuildingsTable did not accept an administrationId scope)

#### Scenario: Admin views buildings list inside administration detail

- GIVEN the admin navigates to `/administraciones/:adminId`
- WHEN the detail page loads
- THEN BuildingsTable renders with only buildings belonging to that administration
- AND each building name is a link to `/buildings/:buildingId`

#### Scenario: Building name link navigates to detail

- GIVEN the BuildingsTable is rendered inside administration detail
- WHEN the admin clicks a building name
- THEN the browser navigates to `/buildings/:buildingId`
- AND BuildingDetailPage renders correctly

#### Scenario: RLS enforces admin-only access

- GIVEN the buildings table has an `for all` admin RLS policy
- WHEN the scoped query executes
- THEN only buildings the admin role can read are returned
- AND no row-level bypass is possible from the client

---

### Requirement: Create Building

The system MUST provide a Sheet form that allows an admin to create a new building. When opened from `AdministrationDetailPage`, the `administration_id` MUST be pre-filled from the URL parameter and the administration Select MUST be hidden. On success the buildings list MUST refresh and a success toast MUST be displayed. On validation or DB error, a descriptive error toast MUST be shown.
(Previously: BuildingFormSheet always showed the administration Select; no pre-fill from context)

#### Scenario: Admin creates a building from administration detail — Select hidden

- GIVEN the admin opens "Nuevo edificio" from inside an administration detail page
- WHEN the sheet renders
- THEN the `administration_id` is pre-filled with the current administration's id
- AND the administration Select field is not visible

#### Scenario: New building appears in the scoped buildings list

- GIVEN the admin creates a building from inside administration detail
- WHEN the mutation succeeds
- THEN the buildings list scoped to that administration refreshes to include the new entry
- AND a success toast is displayed

#### Scenario: Create fails with a constraint error

- GIVEN the admin submits the create form
- WHEN the database returns a constraint violation
- THEN no building is created
- AND a descriptive error toast is shown with title and description

---

### Requirement: Edit Building

The system MUST allow an admin to edit a building's non-lifecycle fields (name, address, metadata) via a Sheet. The building's `id`, `created_at`, and `status` field MUST NOT be editable via the edit form; status changes are managed through the deactivation flow only.
(No behavior change — requirement unchanged; included for completeness of delta)

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
(No behavior change — requirement unchanged; included for completeness of delta)

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

---

### Requirement: BuildingDetailPage Breadcrumb

`BuildingDetailPage` MUST display a breadcrumb that includes the administration name. The administration name MUST be fetched via `useAdministration` (using the building's `administration_id`), which is cached from the administration list load. The breadcrumb MUST link back to `/administraciones/:adminId`.
(Previously: BuildingDetailPage had no breadcrumb linking to an administration)

#### Scenario: Admin navigates to building detail from administration detail

- GIVEN the admin clicks a building name link inside administration detail
- WHEN BuildingDetailPage renders
- THEN a breadcrumb displays the parent administration name
- AND the administration name is a link to `/administraciones/:adminId`

#### Scenario: Cold navigation to building detail — breadcrumb still resolves

- GIVEN the admin navigates directly to `/buildings/:buildingId`
- WHEN the page loads
- THEN `useAdministration` fetches the administration name using the building's `administration_id`
- AND the breadcrumb renders the correct administration name once data is available

## REMOVED Requirements

### Requirement: Buildings List (top-level route)

(Reason: Buildings are no longer a top-level entity; the list is nested inside AdministrationDetailPage scoped to a single administration. The `/buildings` route now redirects to `/administraciones`.)
(Migration: Any existing bookmarks or links to `/buildings` are automatically redirected to `/administraciones` by the route layer.)
