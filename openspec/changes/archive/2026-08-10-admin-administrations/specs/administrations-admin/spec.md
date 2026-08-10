# Administrations Admin Specification

## Purpose

Admin surface for managing administrations — the top-level organizing entity that owns buildings. Covers listing with server-side search, creation, editing non-lifecycle fields via Sheet, and deactivation guarded by active building count. No physical deletion.

## Requirements

### Requirement: Administrations List

The system MUST display all administrations accessible to the authenticated admin, ordered by `company_name`. Each row MUST show: company name, tax_id, status (`active` / `inactive`), and a skeleton loading state while a query is in-flight.

#### Scenario: Admin views administrations list

- GIVEN the admin is authenticated and navigates to `/administraciones`
- WHEN the page loads
- THEN all administrations are listed with company_name, tax_id, and status visible
- AND a success state renders the rows without skeletons

#### Scenario: Empty state — no records exist

- GIVEN no administrations have been created
- WHEN the page loads
- THEN the list shows the message "No hay administraciones registradas"
- AND the "Nueva administración" CTA remains visible

#### Scenario: Skeleton renders during fetch

- GIVEN the query is in-flight (`isFetching` is true)
- WHEN the page or a refetch is triggered
- THEN three skeleton rows are displayed in place of real data
- AND no stale data is visible while fetching

---

### Requirement: Server-Side Search

The system MUST filter administrations server-side using an ILIKE match on both `company_name` and `tax_id`. Input MUST be debounced 300 ms before the query fires. While `isFetching` is true after a search change, three skeleton rows MUST replace the current results.

#### Scenario: Search matches company_name

- GIVEN the admin types a partial company name into the search input
- WHEN 300 ms elapse after the last keystroke
- THEN the query fires with the search term
- AND only administrations whose `company_name` ILIKE matches are returned

#### Scenario: Search matches tax_id

- GIVEN the admin types a partial tax_id into the search input
- WHEN 300 ms elapse after the last keystroke
- THEN administrations whose `tax_id` ILIKE matches are returned
- AND matches are case-insensitive

#### Scenario: No results for query

- GIVEN the admin types a search term that matches no records
- WHEN the query resolves
- THEN the list shows "No se encontraron resultados para '<query>'"
- AND no skeleton rows remain

#### Scenario: Skeleton during search refetch

- GIVEN the admin has changed the search input
- WHEN the debounce fires and the query is in-flight
- THEN three skeleton rows replace the previously visible results

---

### Requirement: Create Administration

The system MUST provide a Sheet form allowing an admin to create a new administration by supplying at least `company_name`. All other fields (`tax_id`, `email`, `phone`, `address`, `notes`) are optional. On success the list MUST refresh and a success toast MUST appear. On a `tax_id` uniqueness violation (SQLSTATE 23505), a friendly error toast MUST be shown.

#### Scenario: Admin creates an administration successfully

- GIVEN the admin opens the "Nueva administración" sheet and fills in `company_name`
- WHEN they submit the form
- THEN the administration is created in the database
- AND the administrations list refreshes to include the new entry
- AND a success toast is displayed

#### Scenario: Duplicate tax_id blocked with friendly toast

- GIVEN an administration with the same `tax_id` already exists
- WHEN the admin submits the form with that `tax_id`
- THEN the database returns SQLSTATE 23505
- AND a descriptive error toast is displayed (friendly message, not raw SQL)
- AND no administration is created

---

### Requirement: Edit Administration

The system MUST allow an admin to edit an administration's non-lifecycle fields (`company_name`, `tax_id`, `email`, `phone`, `address`, `notes`) via a Sheet. The `id`, `created_at`, `updated_at`, and `status` fields MUST NOT be editable via the edit form.

#### Scenario: Admin edits administration info

- GIVEN the admin opens the edit sheet for an existing administration
- WHEN they change a field and save
- THEN the administration record is updated
- AND the list and detail page reflect the updated values
- AND a success toast is displayed

#### Scenario: Status field absent from edit form

- GIVEN the admin opens the edit sheet
- WHEN the form renders
- THEN no status field is present or editable

---

### Requirement: Deactivate Administration

The system MUST provide a deactivate action that sets an administration's `status` to `inactive`. Deactivating an administration that has active buildings MUST be blocked with a dialog displaying the count of active buildings ("N edificios activos"). No cascade deactivation occurs.

#### Scenario: Admin deactivates an administration with no active buildings

- GIVEN an administration has zero active buildings
- WHEN the admin confirms deactivation
- THEN the administration status becomes `inactive`
- AND the list reflects the updated status
- AND a success toast is displayed

#### Scenario: Deactivation blocked when active buildings exist

- GIVEN an administration has one or more active buildings
- WHEN the admin attempts to deactivate it
- THEN the operation is blocked
- AND a dialog or error message displays "N edificios activos" where N is the count
- AND no status change is persisted

#### Scenario: No delete action present

- GIVEN any administration in the list or detail view
- WHEN the admin inspects available actions
- THEN no delete or remove action is present at any point in the UI
