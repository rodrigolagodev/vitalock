# Delta for installer-home

**Change**: installer-mobile-hig
**Date**: 2026-10-05

The baseline `installer-home` spec is partly stale (it still describes `BuildingWorkCard`); this delta touches only R4 (Loading) and R7 (Connectivity Banner) and adds an error-state requirement. Requirement identifiers follow the baseline's R-numbering. Dashboard means the Inicio page; Tareas is the worklist page. All UI copy stays Spanish.

## MODIFIED Requirements

### R4 — Loading State

On initial data load the Dashboard (Inicio) MUST render a skeleton placeholder (pulsing, token-coloured blocks laid out like the loaded page: title area and 3-4 card-shaped blocks), and MUST NOT render a bare "Cargando…" text. During background refetch while content is already visible, a subtle header indicator MUST show refetch activity; content MUST remain visible and interactive. The skeleton MUST be exposed to assistive tech as busy (`aria-busy="true"` on the region, or an equivalent status), and pulse animation is subject to the global reduced-motion rule.

(Previously: 3-4 skeleton card placeholders were required by the baseline, but the Dashboard rendered "Cargando…" text.)

#### Scenario: SC-R4-1 — Initial load skeleton on Dashboard

- GIVEN the Dashboard mounts and its queries have not resolved
- WHEN the component renders
- THEN 3 to 4 skeleton card shapes are visible
- AND no real data or actions are rendered
- AND the text "Cargando…" is not in the document

#### Scenario: Skeleton is marked busy

- GIVEN the Dashboard is in its initial loading state
- WHEN the loading region is inspected
- THEN it has `aria-busy="true"` (or an equivalent busy status)

#### Scenario: SC-R4-2 — Background refetch indicator

- GIVEN the Dashboard has previously loaded data
- WHEN a background refetch is in progress (`isFetching` true)
- THEN existing content remains fully visible and interactive
- AND a subtle indicator in the header signals the background refresh
- AND no skeleton replaces the content

### R7 — Connectivity Banner

When `navigator.onLine === false`, the connectivity banner MUST be shown informing the user that data may be stale. The banner is mounted once by the installer shell (see `installer-shell`) and MUST NOT be mounted by the Dashboard or any other page. The banner MUST NOT block the rest of the UI.

(Previously: the banner was mounted per page, on Tareas only, at component mount.)

#### Scenario: SC-R7-1 — Offline at mount

- GIVEN `navigator.onLine` is false when the app mounts
- WHEN the shell and the Dashboard render
- THEN a connectivity banner is visible
- AND the Dashboard content (or its empty state) still renders below the banner

#### Scenario: Pages do not mount the banner

- GIVEN the Dashboard and Tareas components are rendered without the shell, with `navigator.onLine` false
- WHEN the document is queried for the banner
- THEN none is found

## ADDED Requirements

### Requirement: Error State with Retry

When the data query behind the Dashboard or behind Tareas reports `isError` and there is no data to show, the page MUST render the shared `ErrorState` with an `onRetry` bound to that query's `refetch`, instead of an empty list or an indefinite loading state. Activating "Reintentar" MUST call `refetch` once per activation. If a query errors while previously loaded data exists, the page MUST keep showing that data (no regression to the error screen). Neither page MAY ignore `isError`. Error copy is Spanish.

#### Scenario: Dashboard shows ErrorState on failure

- GIVEN the Dashboard's data query is in error with no data
- WHEN the Dashboard renders
- THEN an `ErrorState` is shown with a "Reintentar" button
- AND no skeleton, empty state or "Estás al día" message is rendered

#### Scenario: Dashboard retry calls refetch

- GIVEN the Dashboard shows the ErrorState with a `refetch` spy
- WHEN the user clicks "Reintentar"
- THEN the spy is called exactly once

#### Scenario: Tareas shows ErrorState on failure

- GIVEN the Tareas worklist query is in error with no data
- WHEN Tareas renders
- THEN an `ErrorState` is shown with a "Reintentar" button
- AND the empty-worklist message is not rendered

#### Scenario: Tareas retry calls refetch

- GIVEN Tareas shows the ErrorState with a `refetch` spy
- WHEN the user clicks "Reintentar"
- THEN the spy is called exactly once

#### Scenario: Refetch failure keeps stale data

- GIVEN a page has loaded data and a later background refetch fails
- WHEN the page re-renders with `isError` true and data present
- THEN the data remains rendered
- AND the ErrorState is not shown
