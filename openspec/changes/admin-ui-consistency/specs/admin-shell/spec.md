# Delta for Admin Shell

**Change**: admin-ui-consistency
**Date**: 2026-10-05

Phase F2 of the UI audit. It applies the F0 tokens and the F1 components (`ConfirmDialog`, `Skeleton`, `NotFoundState`, EmptyState v2, `ErrorState onRetry`) across `apps/admin`. Ordering: this delta applies AFTER F0 (`ui-foundations-hig`) and F1 (`ui-components-hig`) are archived; it adds requirements only and does not edit F1's "PageHeader Sizing". All UI copy stays Spanish. "Lint-free" does not substitute for the tests named in the scenarios.

Delivery: one PR with `size:exception`. Scope also includes FormField adoption across admin forms plus an axe e2e check (formerly follow-up `admin-form-fields`) and the data-router migration with route-navigation blocking (formerly follow-up `admin-data-router`). The only new dependency is the dev-only `@axe-core/playwright`; no runtime dependency is added. F1's `FormField` (see "Form Field Accessibility" in `ui-components-hig`) is consumed as-is.

## ADDED Requirements

### Requirement: Page Identity Consistency

Every admin page title, breadcrumb and list header MUST agree with the navigation label that reaches it, and detail breadcrumbs MUST end at the current item.

- **Title = nav label:** the KeyOrdersPage title, and the "Llaves" crumb of the KeyOrder list, detail and form breadcrumbs, MUST read "Órdenes de llaves" (the `AdminNav` label for `/llaves/ordenes`). HistorialPage keeps "Órdenes" (it already matches its nav label and `/ordenes`).
- **Breadcrumb tail:** AdministrationDetailPage and BuildingDetailPage MUST pass breadcrumbs whose last segment is the current item's name, rendered as non-link text, after the parent segments. Parent segments stay links.
- **List subtitles:** the list pages Equipos, Servicio técnico, KeyOrders, Inventario and Historial MUST each render a one-line Spanish subtitle under the title, consistent with the list pages that already have one.
- `e2e/admin/navigation.spec.ts` MUST be updated in the same change so its selectors use the renamed title.

#### Scenario: KeyOrdersPage title matches its nav label

- GIVEN the admin nav item for key orders has the label "Órdenes de llaves"
- WHEN KeyOrdersPage renders
- THEN its `h1` reads "Órdenes de llaves"
- AND no heading reads exactly "Llaves" on that page

#### Scenario: KeyOrder breadcrumbs use the nav label

- GIVEN KeyOrderDetailPage and the KeyOrder form page render
- WHEN their breadcrumbs are inspected
- THEN the list-level crumb reads "Órdenes de llaves" and links to the key orders list

#### Scenario: HistorialPage is unchanged

- GIVEN HistorialPage renders
- WHEN its `h1` and its nav label are compared
- THEN both read "Órdenes"

#### Scenario: Administration detail breadcrumb ends at the current item

- GIVEN AdministrationDetailPage loads an administration named "Admin Uno"
- WHEN the breadcrumb nav (`aria-label="Breadcrumb"`) is inspected
- THEN its last segment is the text "Admin Uno" and is not a link
- AND the preceding "Administraciones" segment is a link to `/administraciones`

#### Scenario: Building detail breadcrumb ends at the current item

- GIVEN BuildingDetailPage loads a building named "Edificio Sur" under administration "Admin Uno"
- WHEN the breadcrumb nav is inspected
- THEN the segments are the administrations list link, the "Admin Uno" link and the non-link "Edificio Sur" in that order

#### Scenario: Breadcrumb tail while data is loading

- GIVEN a detail page whose record has not loaded yet
- WHEN it renders the loading state
- THEN no breadcrumb segment renders the text "undefined" or an empty current crumb

#### Scenario: Every list page has a subtitle

- GIVEN Equipos, Servicio técnico, KeyOrders, Inventario and Historial list pages each render with mocked data
- WHEN the header is inspected
- THEN each shows a non-empty one-line subtitle element below its title

### Requirement: Loading and Not-Found States

Admin surfaces that load a single record MUST show a layout-matching `Skeleton` while loading and a `NotFoundState` when the record does not exist, and MUST NOT hand-roll spinners. The surfaces are EquipoDetailPage, KeyDetailPage, EquipmentKeySnapshotPanel and KeyItemDetailsDialog.

- While loading, each surface MUST render `Skeleton` placeholders occupying the same blocks as the loaded layout (header, cards or rows), not a bare centred spinner.
- When the record query resolves with no record, each page surface MUST render `NotFoundState` with a Spanish message and a link or action back to its list; the panel and dialog surfaces MUST render a compact not-found message instead of blank content.
- No raw `animate-spin` element MUST remain in these four files. A button-level spinner (inside a `Button`, with `role="status"` and an accessible name) is the only allowed spinner.
- The CargarProductoSheet submit button MUST keep its label text (no "Cargando..." swap) and, while pending, MUST show an inline button spinner with `role="status"` and be disabled.

#### Scenario: Detail page shows a skeleton while loading

- GIVEN EquipoDetailPage (and likewise KeyDetailPage) renders with its query pending
- WHEN the page is inspected
- THEN skeleton placeholders are present for the header and content blocks
- AND no element with `animate-spin` is present

#### Scenario: Missing record shows NotFoundState

- GIVEN EquipoDetailPage (and likewise KeyDetailPage) renders with its query resolved to no record
- WHEN the page is inspected
- THEN the NotFoundState message and its way back to the list are shown
- AND the detail content is not rendered

#### Scenario: Panel and dialog loading use skeletons

- GIVEN EquipmentKeySnapshotPanel and KeyItemDetailsDialog render with their queries pending
- WHEN they are inspected
- THEN each shows skeleton placeholders and no raw `animate-spin` div

#### Scenario: Panel and dialog missing record

- GIVEN EquipmentKeySnapshotPanel or KeyItemDetailsDialog resolves with no record
- WHEN it renders
- THEN a Spanish not-found message is visible instead of empty content

#### Scenario: Only button spinners remain

- GIVEN `apps/admin/src` is searched for `animate-spin`
- WHEN the matches are listed
- THEN every match is inside a `Button` and carries `role="status"`
- AND none is in the four surfaces above

#### Scenario: CargarProductoSheet keeps its label while pending

- GIVEN CargarProductoSheet is submitting
- WHEN the submit button is inspected
- THEN its label text is unchanged and the text "Cargando..." is absent
- AND it is disabled and contains an element with `role="status"`

### Requirement: Destructive and Unsaved-Change Confirmation

Admin destructive confirmations and unsaved-changes guards MUST use the shared `ConfirmDialog`, never a hand-rolled `Dialog` and never `window.confirm`.

- **Destructive confirm:** the StaffTable deactivate confirmation and the AdministrationStatusToggle deactivate-confirmation path MUST render `ConfirmDialog` with `variant="destructive"`, keeping the existing copy, including the emphasised (`<strong>`) person or administration name.
- **Informational exception:** the AdministrationStatusToggle "has active buildings" branch is informational (it offers no confirm action); it MUST stay a plain `Dialog` and MUST NOT use `ConfirmDialog`.
- **Unsaved changes:** KeyOrderForm and TechnicalOrderForm MUST NOT call `window.confirm`. Cancel on a dirty form MUST open a `ConfirmDialog` through a `useUnsavedChangesGuard` hook; Cancel on a clean form MUST leave immediately with no dialog. Confirming discards and leaves; dismissing keeps the user on the form with their input intact.
- **Route navigation:** while either form is dirty, in-app navigation away (sidebar link, breadcrumb link, browser back/forward) MUST be blocked by `useBlocker` (see "Data Router and Navigation Blocking") and MUST surface the same `ConfirmDialog` through `useUnsavedChangesGuard`. The Cancel button and route blocking share one hook and one dialog.

#### Scenario: StaffTable deactivation uses ConfirmDialog

- GIVEN StaffTable lists an active staff member "Ana"
- WHEN the user activates the deactivate action
- THEN a ConfirmDialog opens whose description contains "Ana" in a `strong` element
- AND confirming calls the deactivate mutation once and cancelling calls it zero times

#### Scenario: ConfirmDialog pending state

- GIVEN the deactivate mutation is pending
- WHEN the ConfirmDialog is inspected
- THEN both its buttons are disabled and it cannot be dismissed by overlay or Escape

#### Scenario: Administration deactivation uses ConfirmDialog

- GIVEN an active administration with no active buildings
- WHEN the user toggles it off
- THEN a destructive ConfirmDialog opens and confirming runs the status mutation once

#### Scenario: Active buildings branch stays informational

- GIVEN an administration with active buildings
- WHEN the user toggles it off
- THEN a plain Dialog explains the block with a single close action
- AND no confirm action and no status mutation is available

#### Scenario: Dirty Cancel opens the guard dialog

- GIVEN KeyOrderForm (and likewise TechnicalOrderForm) has a modified field and `window.confirm` is spied
- WHEN the user clicks Cancel
- THEN a ConfirmDialog opens and `window.confirm` is never called
- AND the user has not yet left the form

#### Scenario: Confirming the guard discards and leaves

- GIVEN the unsaved-changes ConfirmDialog is open
- WHEN the user confirms
- THEN the form navigates away to its list

#### Scenario: Dismissing the guard keeps the input

- GIVEN the unsaved-changes ConfirmDialog is open
- WHEN the user cancels the dialog
- THEN the dialog closes, the user remains on the form and the modified field value is preserved

#### Scenario: Clean Cancel leaves immediately

- GIVEN a form with no modifications
- WHEN the user clicks Cancel
- THEN the app navigates away and no dialog opens

#### Scenario: Dirty navigation is blocked

- GIVEN a dirty KeyOrderForm (and likewise TechnicalOrderForm) rendered under the data router
- WHEN the user clicks a sidebar link
- THEN the location does not change and the unsaved-changes ConfirmDialog opens

#### Scenario: Confirming the blocker proceeds

- GIVEN the blocker dialog is open after a blocked navigation
- WHEN the user confirms
- THEN navigation proceeds to the requested route

#### Scenario: Dismissing the blocker stays

- GIVEN the blocker dialog is open
- WHEN the user cancels the dialog
- THEN the user remains on the form with input intact and the blocker resets

#### Scenario: Clean or submitted form is not blocked

- GIVEN a clean form, or a form whose save just succeeded and navigates to its detail
- WHEN navigation occurs
- THEN no dialog opens and navigation proceeds

#### Scenario: Browser back is guarded

- GIVEN a dirty form
- WHEN the user triggers browser back
- THEN the blocker dialog opens before the location changes

#### Scenario: No window.confirm in admin

- GIVEN `apps/admin/src` is searched for `window.confirm`
- WHEN the matches are listed
- THEN there are none

### Requirement: Data Router and Navigation Blocking

The admin app MUST be served by a data router (`createBrowserRouter` + `RouterProvider`) instead of `<BrowserRouter>`, so `useBlocker` works. The route tree, paths, redirects (`/` and `/buildings` to `/administraciones`), layout nesting, auth guards, error and not-found boundaries MUST behave identically to the existing "Route Tree" requirement. No `<BrowserRouter>` MAY remain in `apps/admin/src` outside tests that deliberately wrap with a memory/data router. Test utilities and existing page/form tests MUST be updated to render under a data router (for example `createMemoryRouter`) and pass.

#### Scenario: Router is a data router

- GIVEN `apps/admin/src` is searched
- WHEN `BrowserRouter` and `createBrowserRouter` are looked up
- THEN the app entry uses `createBrowserRouter` with `RouterProvider` and no `BrowserRouter` remains in application code

#### Scenario: Route tree is unchanged

- GIVEN a user navigates to `/`, `/buildings`, `/buildings/123`, `/administraciones/456`, `/ordenes` and an unknown path
- WHEN each route resolves
- THEN the redirects, pages and NotFoundPage match the Route Tree requirement with the sidebar visible

#### Scenario: useBlocker does not throw

- GIVEN KeyOrderForm and TechnicalOrderForm render under the app router
- WHEN they mount
- THEN no "useBlocker must be used within a data router" error is raised

### Requirement: Form Field Adoption

All admin form fields that show validation or server errors MUST render through the shared `FormField` (about 67 sites across about 20 files), replacing hand-rolled label plus error markup. Each field MUST satisfy the FormField guarantees: label associated to the control, `aria-invalid="true"` and `aria-describedby` on error, error in a `role="alert"` element at `text-footnote`. Existing labels, placeholders, validation rules and Spanish copy MUST be unchanged. No admin form file MAY keep an ad-hoc error `<p>` styled with a destructive text class next to a control.

#### Scenario: Invalid field is wired

- GIVEN any migrated admin form is submitted with an invalid required field
- WHEN validation fails
- THEN the field has `aria-invalid="true"` and its `aria-describedby` references an element with `role="alert"` containing the message

#### Scenario: Label association

- GIVEN a migrated form renders
- WHEN each field is queried by its label text via `getByLabelText`
- THEN it resolves to the control

#### Scenario: Valid field is clean

- GIVEN a migrated form renders with valid values
- WHEN the controls are inspected
- THEN none has `aria-invalid="true"` and no `role="alert"` is present for them

#### Scenario: No ad-hoc error markup remains

- GIVEN `apps/admin/src` form files are searched for hand-rolled error paragraphs using a destructive text class beside a control
- WHEN the matches are listed
- THEN none remain outside FormField

#### Scenario: Existing form tests pass

- GIVEN the migration is applied
- WHEN the admin form test suites run
- THEN submit behaviour, labels and Spanish copy assertions pass, updating only structural queries that referenced removed markup

### Requirement: Accessibility E2E Gate

The repository MUST include an axe accessibility check for the admin app using `@axe-core/playwright`, added as a dev-only dependency of the workspace that owns the Playwright e2e suite (no runtime dependency, lockfile updated). The check MUST run axe against the main admin routes (at minimum: administraciones list, administration detail, building detail, ordenes list, key orders list, servicio técnico list, inventario, historial, the KeyOrderForm and TechnicalOrderForm pages, and login) in the light theme, and MUST fail on any `critical` or `serious` violation. Colour-contrast results MUST NOT be disabled. Any waived rule MUST be listed by id with a written reason in the spec file. The check MUST run in the same CI path as the existing admin e2e checks.

#### Scenario: Main routes have no serious violations

- GIVEN the admin app runs with seeded data
- WHEN axe scans each listed route
- THEN there are zero violations with impact `critical` or `serious` on every route

#### Scenario: Gate fails on a violation

- GIVEN a route contains an unlabelled input
- WHEN the axe e2e runs
- THEN the test fails and names the route and the rule id

#### Scenario: Dependency is dev-only

- GIVEN package manifests are inspected
- WHEN `@axe-core/playwright` is looked up
- THEN it appears only under `devDependencies` and no runtime dependency was added

#### Scenario: Waivers are explicit

- GIVEN the axe spec file is read
- WHEN `disableRules` or exclusions are looked up
- THEN each carries a rule id and a reason, and `color-contrast` is not disabled

### Requirement: Error Retry and Empty State Adoption

Admin `ErrorState` usages that sit on a data fetch MUST pass `onRetry` wired to that query's `refetch`, and admin list and section empty states MUST use the EmptyState v2 slots (`title`, `description`, and `action` when a create flow exists) instead of a bare message.

- All admin `ErrorState` sites tied to a TanStack Query (about 15) MUST render a "Reintentar" button that calls the failing query's `refetch`.
- Empty states MUST keep their existing Spanish meaning; the `action` slot is used only where the page already offers a matching create/clear-filter action.

#### Scenario: Retry refetches the failed query

- GIVEN an admin page whose query is in error and renders ErrorState
- WHEN the user clicks "Reintentar"
- THEN that query's `refetch` is called exactly once

#### Scenario: Every query-backed ErrorState has a retry

- GIVEN the admin pages and sections that render ErrorState for a failed query
- WHEN each renders in the error state in its page test
- THEN each exposes a "Reintentar" button

#### Scenario: List empty state uses title and description

- GIVEN an admin list page loads zero rows
- WHEN the empty state renders
- THEN it shows a title and a description, and no bare-message-only form

#### Scenario: Empty state action matches an existing flow

- GIVEN a list page with a create flow loads zero rows and no filters
- WHEN the empty state renders
- THEN its action triggers the same create flow as the page's primary button
