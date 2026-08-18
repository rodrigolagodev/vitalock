# Installer Home Page Specification

**Change**: installer-worklist
**Domain**: installer-home
**Type**: New (no prior spec)
**Date**: 2026-08-09

## Purpose

Defines what the installer app's home page MUST present after the placeholder is
replaced. The home page is the single daily-driver screen for field technicians:
it aggregates all pending work organized by physical building location.

## Requirements

### R1 — Per-Building Work View

The home page MUST render one `BuildingWorkCard` per building where the installer
has at least one pending key authorization OR at least one assigned open/in-progress
ticket. Buildings MUST be sorted alphabetically by name. Each card MUST contain
a header and two collapsible sub-sections (Llaves, Trabajos), both expanded by default.

#### SC-R1-1 — Multiple buildings with pending work

```
Given  Bruno has pending authorizations in "Torre Callao" and "Edificio Roma"
  And  an open ticket assigned to Bruno in "Torre Callao"
When   the home page loads
Then   two BuildingWorkCards are rendered, sorted A-Z by building name
  And  "Edificio Roma" appears before "Torre Callao"
  And  each card header shows building name and administration name badge
```

#### SC-R1-2 — Building with tickets but no authorizations

```
Given  Bruno has a ticket in "Torre Callao" but no pending authorizations there
When   the home page loads
Then   "Torre Callao" card renders with Trabajos section populated
  And  Llaves section is empty and hidden within that card
```

#### SC-R1-3 — Building with authorizations but no tickets

```
Given  Bruno has pending authorizations in "Edificio Roma" but no assigned tickets there
When   the home page loads
Then   "Edificio Roma" card renders with Llaves section populated
  And  Trabajos section is empty and hidden within that card
```

### R2 — Card Header Summary Counts

Each `BuildingWorkCard` header MUST display a summary count of the form
"N llaves / M tickets" reflecting the number of pending authorizations and
open/in-progress tickets for that building. Counts MUST update reactively when
work is completed or new work arrives.

#### SC-R2-1 — Header reflects current counts

```
Given  "Torre Callao" has 3 pending authorizations and 1 open ticket
When   the card header is visible
Then   the header shows "3 llaves / 1 ticket"
```

#### SC-R2-2 — Header updates after completion

```
Given  the header shows "3 llaves / 1 ticket"
When   Bruno marks one authorization as installed
Then   the header updates to "2 llaves / 1 ticket"
```

### R3 — Empty State

When the installer has no pending authorizations and no assigned open/in-progress
tickets in any building, the home page MUST render the message
"Estás al día. No tenés tareas pendientes." with a positive icon.
No building cards MUST be rendered in this state.

#### SC-R3-1 — All work cleared

```
Given  Bruno has completed every pending authorization and ticket
When   the home page renders
Then   no BuildingWorkCards are visible
  And  the message "Estás al día. No tenés tareas pendientes." is displayed
```

### R4 — Loading State

On initial data load the home page MUST display 3–4 skeleton card placeholders.
During background refetch while content is already visible, a subtle header
indicator MUST show refetch activity; cards MUST remain visible and interactive.

#### SC-R4-1 — Initial load skeleton

```
Given  the home page is mounted and neither useWorklist nor useAssignedTickets
       has resolved
When   the component renders
Then   3 to 4 skeleton card shapes are visible
  And  no real building data or actions are rendered
```

#### SC-R4-2 — Background refetch indicator

```
Given  the home page has previously loaded data
When   a background refetch is in progress (isFetching is true)
Then   existing cards remain fully visible and interactive
  And  a subtle indicator in the header signals the background refresh
```

### R5 — Data Merging

`HomePage` MUST combine `useWorklist` and `useAssignedTickets` output via
`useMemo` into a `Building[]` shape, where each entry carries
`{ building, administration, authorizations, tickets }`. This merge MUST happen
client-side; no additional DB round-trip MUST be introduced for grouping.

#### SC-R5-1 — Merged shape completeness

```
Given  useWorklist returns authorizations across 2 buildings
  And  useAssignedTickets returns tickets across the same 2 buildings plus 1 more
When   useMemo merges the two results
Then   the resulting Building[] contains 3 entries
  And  each entry carries both its authorizations (possibly empty) and tickets (possibly empty)
```

### R6 — Collapsible Sub-Sections

Both Llaves and Trabajos sub-sections inside a `BuildingWorkCard` MUST default
to expanded. Either sub-section MUST be collapsible independently. Collapsing a
sub-section MUST NOT affect the other sub-section or any other building's cards.

#### SC-R6-1 — Default expanded

```
Given  a BuildingWorkCard has both Llaves and Trabajos populated
When   the card first renders
Then   both sub-sections are expanded and their content is visible
```

#### SC-R6-2 — Independent collapse

```
Given  both sub-sections are expanded in "Torre Callao"
When   the installer collapses only the Llaves sub-section
Then   Llaves content is hidden in "Torre Callao"
  And  Trabajos content remains visible in "Torre Callao"
  And  both sub-sections in other building cards are unaffected
```

### R7 — Connectivity Banner

When `navigator.onLine === false` at component mount, a connectivity banner
MUST be shown informing the user that data may be stale. The banner MUST NOT
block the rest of the UI.

#### SC-R7-1 — Offline at mount

```
Given  navigator.onLine is false when the home page mounts
When   the component renders
Then   a connectivity banner is visible
  And  building cards (or empty state) are still rendered below the banner
```

### R8 — Pipeline Health

All new source files MUST pass `pnpm install && pnpm build && pnpm typecheck &&
pnpm lint && pnpm test` in `apps/installer` with exit code 0.
At minimum 8 Vitest tests MUST exist covering hook happy paths and error cases.

#### SC-R8-1 — Pipeline green

```
Given  all installer-worklist artifacts are in place
When   the full pipeline runs
Then   every command exits with code 0
  And  the test suite reports at least 8 passing tests
```

## Requirement-to-Success-Criteria Traceability

| Proposal criterion | Requirement | Scenario(s) |
|---|---|---|
| 1. One card per building with pending work | R1 | SC-R1-1, SC-R1-2, SC-R1-3 |
| 1. Card header shows counts | R2 | SC-R2-1, SC-R2-2 |
| 11. Empty state message | R3 | SC-R3-1 |
| Skeleton on load; refetch indicator | R4 | SC-R4-1, SC-R4-2 |
| useMemo merge; no extra round-trip | R5 | SC-R5-1 |
| Both sections collapsible, both default expanded | R6 | SC-R6-1, SC-R6-2 |
| 10. Connectivity banner when offline | R7 | SC-R7-1 |
| 13. Pipeline green; ≥8 tests | R8 | SC-R8-1 |

---

### Requirement: equipment_update Task in Installer Worklist

The installer home page MUST surface `equipment_update` tickets assigned to the
installer in the Trabajos sub-section of the corresponding building card.
`equipment_update` tickets MUST NOT appear in the generic batch-resolve toolbar.
They MUST be rendered as a distinct card type with a dedicated resolve action.

#### Scenario: equipment_update ticket appears in Trabajos sub-section

- GIVEN an `equipment_update` task is assigned to installer Bruno for building B
- WHEN Bruno's home page loads
- THEN a card for the `equipment_update` task appears in building B's Trabajos section

#### Scenario: equipment_update excluded from generic batch resolve toolbar

- GIVEN Bruno's building card has a `maintenance` ticket and an `equipment_update` ticket
- WHEN the Trabajos section renders
- THEN only the `maintenance` ticket is included in the batch-resolve count
- AND the `equipment_update` ticket is rendered with its own dedicated resolve UI

---

### Requirement: equipment_update Task Detail in Installer App

When an installer opens an `equipment_update` task, the system MUST display:
(a) the keys-to-activate list from the frozen snapshot, (b) the keys-to-disable
list from the frozen snapshot, (c) a download button for the `.mdb` file, and
(d) a single resolve action that calls `resolve_equipment_update`.

#### Scenario: Task detail shows snapshot lists

- GIVEN an `equipment_update` task T with snapshot {K1: activate, K2: disable}
- WHEN installer Bruno opens task T's detail view
- THEN the keys-to-activate list shows K1
- AND the keys-to-disable list shows K2

#### Scenario: Installer downloads .mdb file

- GIVEN the task detail is open
- WHEN Bruno taps the download button
- THEN the app resolves a signed URL for the `.mdb` blob
- AND the download begins

#### Scenario: Installer resolves the task

- GIVEN Bruno has verified the physical sync is complete
- WHEN Bruno taps "Resolver" and confirms
- THEN `resolve_equipment_update(task_id, Bruno.staff_id)` is called
- AND on success the task disappears from the worklist
- AND a success toast is shown

#### Scenario: Stale-key skip warning surfaced in installer UI

- GIVEN the resolution RPC emitted `snapshot_skipped` events for one or more keys
- WHEN the resolution completes successfully
- THEN the installer UI surfaces a warning identifying the skipped keys
- AND the overall resolution is still treated as successful
