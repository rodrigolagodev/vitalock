# Tickets (Trabajos) Specification

**Change**: installer-worklist
**Domain**: tickets
**Type**: New (no prior spec)
**Date**: 2026-08-09

## Purpose

Defines what the Trabajos sub-section of each `BuildingWorkCard` MUST show and
how the installer interacts with assigned tickets: viewing details and comments,
adding comments (optimistic), and resolving tickets (pessimistic). Covers error
handling, race conditions (reassignment), and section visibility rules.

## Requirements

### R1 — Ticket Display

The Trabajos sub-section MUST display all `open` and `in_progress` tickets
assigned to the installer for the building. Tickets MUST be sorted by status
then `opened_at`. Each ticket card MUST show: title and status badge. Tapping
the card MUST expand it to show description and a chronological comment timeline
(oldest first).

#### SC-R1-1 — Ticket card collapsed view

```
Given  an open ticket "Cambio de cerradura" is assigned to Bruno in "Torre Callao"
When   the Trabajos sub-section renders
Then   a ticket card shows the title "Cambio de cerradura" and an "open" status badge
  And  the description and comments are NOT visible
```

#### SC-R1-2 — Ticket card expanded view

```
Given  Bruno taps the "Cambio de cerradura" ticket card
When   the card expands
Then   the description is visible
  And  comments are displayed chronologically (oldest first)
  And  each comment shows author full name, relative timestamp, and body
```

#### SC-R1-3 — Sort order

```
Given  "Torre Callao" has one 'open' ticket opened at 09:00 and one 'in_progress' ticket
When   the Trabajos sub-section renders
Then   'in_progress' ticket appears before 'open' ticket (status sort first)
  And  among same-status tickets, earlier opened_at appears first
```

### R2 — Add Comment (Optimistic)

The installer MUST be able to add a comment to any expanded ticket. The comment
MUST appear immediately with a pending visual indicator (optimistic insert). On
DB success the pending indicator MUST be removed. On error the comment MUST be
rolled back and a Sonner toast MUST be shown.

#### SC-R2-1 — Optimistic comment appears

```
Given  a ticket card is expanded and the inline comment textarea is visible
When   Bruno types "Revisé la instalación" and submits
Then   the comment appears immediately in the timeline with a pending visual indicator
  And  the textarea clears
```

#### SC-R2-2 — Comment confirmed

```
Given  the optimistic comment is visible with a pending indicator
When   the DB confirms the insert
Then   the pending indicator is removed and the comment shows the confirmed state
```

#### SC-R2-3 — Comment rollback on error

```
Given  the optimistic comment is visible with a pending indicator
When   the network request fails
Then   the pending comment is removed from the timeline
  And  a Sonner toast shows "Error de conexión. Intentá de nuevo."
```

### R3 — Resolve Ticket (Pessimistic, Inline)

A "Resolver" inline expand MUST appear within an expanded ticket card. Tapping
it MUST reveal a `resolution_notes` textarea. The textarea MUST be required.
On submit the mutation payload MUST include `{ status: 'resolved', resolution_notes,
resolved_by_staff_id: staff.id }`. The mutation MUST be pessimistic. On DB
success the ticket MUST disappear from the section and a Sonner toast MUST confirm.

#### SC-R3-1 — Happy path: resolve ticket

```
Given  Bruno expands the "Resolver" inline section on a ticket card
When   Bruno types "Reemplacé el cilindro" and submits
Then   a spinner blocks further interaction
  And  the payload includes { status: 'resolved', resolution_notes: 'Reemplacé el cilindro', resolved_by_staff_id: staff.id }
  And  on DB confirm, the ticket disappears and a Sonner toast confirms resolution
```

#### SC-R3-2 — Empty resolution_notes blocked client-side

```
Given  the "Resolver" textarea is visible and empty
When   Bruno submits the resolve form
Then   client-side validation prevents the network request
  And  the inline error "Escribí una nota de resolución." is shown
  And  no mutation is sent
```

#### SC-R3-3 — resolved_by_staff_id always included

```
Given  Bruno submits a resolve form with valid resolution_notes
When   the mutation fires
Then   the payload always includes resolved_by_staff_id equal to Bruno's staff.id
  And  it is never null or undefined
```

### R4 — Error Handling for Ticket Actions

Mutation errors MUST be surfaced as Sonner toasts in Spanish per the SQLSTATE catalog:

| Condition | Message |
|---|---|
| 23514 (status transition violation) | "El estado ya fue actualizado. Actualizá la lista." |
| 23514 (resolution_notes missing) | "Agregá una nota de resolución antes de cerrar el ticket." |
| 42501 (RLS denial) | "No tenés permiso. Es posible que el ticket haya sido reasignado." |
| Network / timeout | "Error de conexión. Intentá de nuevo." |
| Generic unhandled | "Ocurrió un error. Código: {sqlstate}" |

#### SC-R4-1 — RLS denial on resolve (reassignment race)

```
Given  Bruno's ticket was reassigned to another staff member between UI load and submit
When   Bruno submits the resolve form
When   DB returns SQLSTATE 42501
Then   the ticket is removed from Bruno's local list
  And  a Sonner toast shows "No tenés permiso. Es posible que el ticket haya sido reasignado."
```

### R5 — Reassignment Race via Realtime

When a ticket is reassigned away from Bruno mid-shift, the Realtime subscription
MUST trigger a query invalidation. After invalidation, the ticket MUST disappear
from Bruno's Trabajos section. If that ticket was the only work in its building,
the entire building card MUST disappear.

#### SC-R5-1 — Ticket disappears on reassignment

```
Given  Bruno's UI shows a ticket for "Torre Callao" in the Trabajos section
When   an admin reassigns the ticket to another installer in a separate session
Then   within ~2 s, the ticket disappears from Bruno's Trabajos section
  And  if no other work remains in "Torre Callao", the building card also disappears
```

### R6 — Trabajos Empty / Hidden

When a building's Trabajos sub-section has no `open` or `in_progress` assigned
tickets, the sub-section MUST be hidden entirely (not rendered as an empty collapsible).

#### SC-R6-1 — Section hides when empty

```
Given  "Torre Callao"'s Trabajos sub-section shows 1 ticket
When   Bruno resolves it successfully
Then   the Trabajos sub-section in "Torre Callao" is no longer rendered
  And  if Llaves is also empty, the entire "Torre Callao" card disappears
```
