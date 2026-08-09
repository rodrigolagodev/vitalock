# Worklist (Llaves) Specification

**Change**: installer-worklist
**Domain**: worklist
**Type**: New (no prior spec)
**Date**: 2026-08-09

## Purpose

Defines what the Llaves sub-section of each `BuildingWorkCard` MUST show and
how the installer interacts with pending key authorization rows (mark installed,
mark removed). Covers data shape, grouping, actions, pessimistic mutations, and
error handling.

## Requirements

### R1 — Authorization Display

The Llaves sub-section MUST display all `pending_install` and `pending_removal`
authorizations for the building. Authorizations MUST be sub-grouped by equipment,
with equipment sorted by `description`. Each row MUST show: RFID key code, unit
number, unit type, and a two-step action button appropriate to the `sync_state`.

#### SC-R1-1 — Grouped by equipment

```
Given  "Torre Callao" has 2 pending_install authorizations for "Puerta Cochera"
  And  1 pending_removal authorization for "Ascensor Principal"
When   the Llaves sub-section renders
Then   two equipment groups are visible: "Ascensor Principal" and "Puerta Cochera"
  And  "Ascensor Principal" contains 1 row; "Puerta Cochera" contains 2 rows
  And  groups are sorted alphabetically by equipment description
```

#### SC-R1-2 — Row content

```
Given  a pending_install authorization row is visible
When   the installer views the row
Then   the row shows the RFID key code, the unit number, and the unit type
  And  a "Cargar" action button is displayed
```

#### SC-R1-3 — pending_removal row shows Borrar

```
Given  a pending_removal authorization row is visible
When   the installer views the row
Then   the row shows the RFID key code, the unit number, and the unit type
  And  a "Borrar" action button is displayed
```

### R2 — Mark Installed (Two-Step Confirm)

When the installer taps "Cargar" on a `pending_install` row, the button MUST
change to "Confirmar" state. A second tap MUST fire the mutation. The mutation
MUST be pessimistic: a per-row spinner MUST block further interaction until the
DB confirms. The row MUST disappear only after successful DB confirmation
(via Realtime invalidation or `onSuccess`).

#### SC-R2-1 — Happy path: mark installed

```
Given  a pending_install row is visible with "Cargar" button
When   Bruno taps "Cargar"
Then   the button changes to "Confirmar"
When   Bruno taps "Confirmar"
Then   a per-row spinner appears
  And  the mutation payload { sync_state: 'installed', installed_by_staff_id } is sent
  And  once DB confirms, the row disappears and a Sonner toast confirms success
```

#### SC-R2-2 — No action on first tap only

```
Given  a pending_install row shows "Confirmar" after the first tap
When   no second tap occurs within the session
Then   no mutation is sent to the DB
  And  the row remains in "Confirmar" state until the second tap or navigation
```

### R3 — Mark Removed (Two-Step Confirm with Optional Reason)

When the installer taps "Borrar" on a `pending_removal` row, an optional
`remove_reason` textarea MUST appear inline between the first and second tap.
The second tap MUST fire the mutation with `remove_reason: value || null`.
Mutation behavior follows the same pessimistic pattern as R2.

#### SC-R3-1 — Happy path: mark removed without reason

```
Given  a pending_removal row shows "Borrar"
When   Bruno taps "Borrar"
Then   the button changes to "Confirmar" and a remove_reason textarea appears
When   Bruno leaves the textarea empty and taps "Confirmar"
Then   the mutation payload includes { sync_state: 'removed', removed_by_staff_id, remove_reason: null }
  And  on DB confirm the row disappears and a Sonner toast confirms
```

#### SC-R3-2 — Mark removed with reason

```
Given  the remove_reason textarea is visible
When   Bruno types "Cliente solicitó baja" and taps "Confirmar"
Then   the mutation payload includes { remove_reason: 'Cliente solicitó baja' }
  And  on DB confirm the row disappears
```

### R4 — Error Handling for Authorization Actions

Mutation errors MUST be surfaced as Sonner toasts in Spanish. The five mapped
SQLSTATE cases MUST produce the following messages:

| Condition | Message |
|---|---|
| 23514 (status already changed) | "El estado ya fue actualizado. Actualizá la lista." |
| 42501 (RLS denial) | "No tenés permiso. Es posible que el ticket haya sido reasignado." |
| Network / timeout | "Error de conexión. Intentá de nuevo." |
| Generic unhandled | "Ocurrió un error. Código: {sqlstate}" |

#### SC-R4-1 — Status already changed

```
Given  Bruno taps "Confirmar" on a pending_install row
When   DB returns SQLSTATE 23514 (check violation for status transition)
Then   the row spinner disappears; the row is NOT removed from the list
  And  a Sonner toast shows "El estado ya fue actualizado. Actualizá la lista."
```

#### SC-R4-2 — Network error

```
Given  Bruno taps "Confirmar" on a pending_install row
When   the network request fails with a network or timeout error
Then   a Sonner toast shows "Error de conexión. Intentá de nuevo."
  And  the row remains visible
```

### R5 — Llaves Empty / Hidden

When a building's Llaves sub-section has no pending authorizations, the sub-section
MUST be hidden entirely (not rendered as an empty collapsible). When the last
authorization in a building clears, the Llaves sub-section MUST hide reactively.

#### SC-R5-1 — Section hides when empty

```
Given  "Torre Callao"'s Llaves sub-section shows 1 pending authorization
When   Bruno successfully marks it installed
Then   the Llaves sub-section in "Torre Callao" is no longer rendered
  And  if Trabajos is also empty, the entire "Torre Callao" card disappears
```
