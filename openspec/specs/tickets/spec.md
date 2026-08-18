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

### Requirement: Category-Specific Resolution for Equipment Tickets

For any `support.tickets` row with `category IN ('equipment_installation', 'equipment_replacement')`, resolution MUST go through the category-specific RPC (`public.resolve_equipment_installation` or `public.resolve_equipment_replacement`, respectively). The client MUST NOT invoke `public.resolve_ticket` for these categories. The DB does not currently enforce this gate at the SQL level (deferred as Option 5), but TypeScript exhaustive dispatch MUST enforce it at compile time.

#### Scenario: equipment_installation ticket resolved through correct RPC

- GIVEN an `equipment_installation` ticket T with status=`open`
- WHEN the admin calls `public.resolve_equipment_installation(T.id, serial, unit_id, note, actor_id)`
- THEN T.status transitions to `resolved`
- AND the stock movements are emitted atomically (egreso_instalacion + liberacion_reserva where product_id IS NOT NULL)

#### Scenario: generic resolve_ticket MUST NOT be called for equipment_installation

- GIVEN the TypeScript `AssignEquipmentDialog` component handles an `equipment_installation` ticket
- WHEN the component determines the resolution path at compile time
- THEN the exhaustive category switch routes to `useResolveEquipmentInstallation`, never `useResolveTickets`
- AND a compile-time error is raised if the `equipment_installation` branch is unhandled

---

### Requirement: Installer App Exclusion of Equipment Categories from Batch Resolution

The installer app MUST NOT surface `equipment_installation` or `equipment_replacement` tickets as batch-resolvable in `TicketsSection`. These categories are the admin's responsibility. The installer MUST see them as read-only "Pendiente de admin" cards (not selectable, not included in the "Marcar resueltos" batch toolbar count). The `AssignedTicket` shape returned by `useAssignedTickets` MUST expose the `category` field so `TicketsSection` can filter them.

#### Scenario: Building with mixed ticket categories — only stock-neutral tickets are selectable

- GIVEN a building has 1 `maintenance` ticket and 1 `equipment_installation` ticket assigned to installer Bruno
- WHEN the `TicketsSection` renders
- THEN only the `maintenance` ticket appears in the selectable batch toolbar
- AND the `equipment_installation` ticket is rendered as a read-only "Pendiente de admin" card
- AND the batch toolbar count is 1 (not 2)

#### Scenario: equipment_replacement ticket rendered as read-only "Pendiente de admin"

- GIVEN an `equipment_replacement` ticket is assigned to installer Bruno
- WHEN the `TicketsSection` renders
- THEN the ticket is displayed as a read-only card labeled "Pendiente de admin"
- AND the ticket cannot be selected for batch resolution by the installer

#### Scenario: useAssignedTickets exposes category on AssignedTicket shape

- GIVEN the `useAssignedTickets` hook returns a list of assigned tickets
- WHEN `TicketsSection` maps over the results
- THEN each `AssignedTicket` object has a `category` field of type string
- AND `TicketsSection` uses `category` to classify each ticket as selectable or read-only

---

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

### R3 — Resolve Ticket (Pessimistic, via RPC)

An installer resolves selected tickets through the "Marcar resueltos" selection toolbar. Resolution for stock-neutral categories (`maintenance`, `installation`) MUST go through the `public.resolve_ticket(ticket_id, note)` RPC — never through a direct `UPDATE status = 'resolved'`. The RPC runs the legal state-machine transition `open → in_progress → resolved` inside a single transaction (a direct `open → resolved` hop is rejected by `support.tickets_validate`), records `resolved_by_staff_id` from the JWT identity, `resolved_at`, and a non-empty `resolution_notes` (falling back to `Resuelta por <staff name>` when no note is provided). RLS scopes the RPC: installers may resolve only tickets assigned to them; admins may resolve any. On success the ticket MUST disappear from the section and a Sonner toast MUST confirm. The mutation MUST be pessimistic. The generic `public.resolve_ticket` RPC MUST NOT be called for `equipment_installation` or `equipment_replacement` categories; those categories are resolved by the admin via category-specific RPCs.

(Previously: R3 stated resolution goes through `public.resolve_ticket` without restricting which categories are allowed. Now restricted to stock-neutral categories only: `maintenance` and `installation`.)

#### SC-R3-1 — Happy path: resolve ticket (stock-neutral categories)

```
Given  Bruno selects one or more of his assigned open/in_progress tickets of category maintenance or installation
When   Bruno taps "Marcar resueltos"
Then   the client calls public.resolve_ticket for each selected ticket
  And  the RPC transitions the ticket through in_progress to resolved
  And  on DB confirm, the tickets disappear and a Sonner toast confirms resolution
```

#### SC-R3-2 — Direct open -> resolved UPDATE must not be used

```
Given  a ticket is in status 'open'
When   a client tries a direct UPDATE support.tickets SET status = 'resolved'
Then   the DB trigger rejects it (invalid tickets.status transition)
  And  the ticket remains 'open' until resolved via the correct RPC
```

#### SC-R3-3 — resolved_by_staff_id and resolution_notes always recorded

```
Given  Bruno resolves a maintenance ticket through public.resolve_ticket with no note
When   the RPC runs
Then   resolved_by_staff_id equals Bruno's staff.id (from the JWT, never client input)
  And  resolution_notes is never null — it falls back to 'Resuelta por <name>'
```

#### SC-R3-4 — installation category resolves via resolve_ticket with no stock movement

```
Given  Bruno has an 'installation' category ticket (item_type=installation, no product_id, no reserva)
When   Bruno resolves it via public.resolve_ticket
Then   the ticket transitions to resolved
  And  no stock_movements row is created (no reserva exists for this category)
```

#### SC-R3-5 — equipment_installation MUST NOT be routed through resolve_ticket by the installer

```
Given  the installer TicketsSection has filtered out equipment_installation tickets from the batch toolbar
When   Bruno taps "Marcar resueltos" for his remaining selectable tickets
Then   no public.resolve_ticket call is made for any equipment_installation ticket
  And  the equipment_installation ticket remains visible as a "Pendiente de admin" card
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

---

### Requirement: Extended Ticket Categories

The system MUST expand `support.tickets.category` CHECK constraint to include: `key_configuration`, `key_installation`, `equipment_installation`, `equipment_update` (in addition to the existing `maintenance`, `installation` categories). The TypeScript `TareaRow.category` union type MUST be updated in the same change batch as the DB migration.

#### Scenario: New category values accepted by DB

- GIVEN the CHECK constraint has been updated
- WHEN a ticket is inserted with category=`key_configuration`
- THEN the insert succeeds

#### Scenario: equipment_update category accepted by DB

- GIVEN the CHECK constraint is extended
- WHEN a ticket is inserted with category `equipment_update`
- THEN the insert succeeds

#### Scenario: Invalid category still rejected

- GIVEN the new CHECK constraint is in place
- WHEN a ticket is inserted with category=`unknown_type`
- THEN the DB rejects the insert with a CHECK violation

---

### Requirement: Cancellation Blocked Once in_progress for equipment_update

For tickets with category `equipment_update`, the system MUST prevent status
transitions from `in_progress` to `cancelled`. This block MUST be enforced at
the database level. Cancellation from `open` remains permitted.

(Rationale: once `in_progress`, the installer has already left with the `.mdb`
file. Cancellation at that point cannot undo the physical trip.)

#### Scenario: Open equipment_update task can be cancelled

- GIVEN an `equipment_update` ticket with status `open`
- WHEN an admin cancels it
- THEN the ticket status becomes `cancelled`

#### Scenario: in_progress equipment_update task cannot be cancelled

- GIVEN an `equipment_update` ticket with status `in_progress`
- WHEN any actor attempts to set status to `cancelled`
- THEN the database rejects the transition
- AND the ticket remains `in_progress`

#### Scenario: in_progress maintenance ticket can still be cancelled (unaffected)

- GIVEN a `maintenance` ticket with status `in_progress`
- WHEN an admin cancels it
- THEN the ticket status becomes `cancelled`
- AND the cancellation block does not apply to non-equipment_update categories

---

### Requirement: Key Configuration Task Auto-Creation

The system MUST automatically create a `key_configuration` ticket when an `order_item` of type `key` with a non-null `product_id` is inserted. The ticket MUST reference the same `building_id` and `order_id` as the order_item. If `product_id` is NULL, no ticket is created for this item.

#### Scenario: key order_item with product_id creates key_configuration ticket

- GIVEN an order_item with item_type=`key`, product_id=5, building_id=10 is inserted
- WHEN the DB trigger fires
- THEN a `support.tickets` row is created with category=`key_configuration` and building_id=10

#### Scenario: key order_item without product_id creates no ticket

- GIVEN an order_item with item_type=`key`, product_id=NULL
- WHEN the DB trigger fires
- THEN no `key_configuration` ticket is created

#### Scenario: particular order emits key_configuration ticket

- GIVEN an order with `administration_id = NULL` (particular) contains an order_item with item_type=`key`, product_id=7
- WHEN the DB trigger fires
- THEN a `key_configuration` ticket is created (particular orders are NOT exempt)

---

### Requirement: Equipment Installation Task Auto-Creation

The system MUST automatically create an `equipment_installation` ticket when an `order_item` of type `equipment` with a non-null `product_id` is inserted.

#### Scenario: equipment order_item with product_id creates equipment_installation ticket

- GIVEN an order_item with item_type=`equipment`, product_id=3 is inserted
- WHEN the DB trigger fires
- THEN a `support.tickets` row is created with category=`equipment_installation`

---

### Requirement: No New key_installation Tickets

The system MUST NOT create new `support.tickets` rows with `category = 'key_installation'`. Enforcement:

1. The `support.tickets_resolution_chain` trigger MUST be updated to remove its `key_installation` spawn branch (see next requirement).
2. A BEFORE INSERT trigger on `support.tickets` MUST reject any row with `category = 'key_installation'` with a clear error message referencing this change.
3. The TypeScript `TareaRow.category` union in `apps/admin/src/hooks/useTareas.ts` MUST be updated to remove `key_installation` in the same change batch.

The `support.tickets.category` CHECK constraint MAY keep `key_installation` as an allowed value to grandfather existing (soft-cancelled) rows. Hardening the CHECK to drop the value entirely is deferred as a follow-up once historical rows can be safely purged.

(Previously: the chain trigger spawned `key_installation` tickets on `key_configuration` resolve; no gate prevented other code paths from inserting them.)

#### Scenario: chain trigger no longer spawns key_installation

- GIVEN a `key_configuration` ticket in `open` status
- WHEN it transitions to `resolved` via the configure_key_order_item RPC
- THEN no new `support.tickets` row with `category = 'key_installation'` is created

#### Scenario: direct insert of key_installation is rejected

- GIVEN the write-path guard trigger is in place
- WHEN any process attempts to insert a ticket with `category = 'key_installation'`
- THEN the insert is rejected with an error referencing unify-work-tracking-model

#### Scenario: existing soft-cancelled key_installation rows remain queryable

- GIVEN historical `key_installation` tickets exist with `status = 'cancelled'` after the data migration
- WHEN admin queries `support.tickets` for audit
- THEN those rows are returned normally; the CHECK constraint does not reject them

#### Scenario: Invalid unknown category still rejected

- GIVEN the CHECK constraint is in place
- WHEN a ticket is inserted with `category = 'unknown_type'`
- THEN the DB rejects the insert with a CHECK violation

---

### Requirement: Resolution Chain — key_configuration (terminal)

When a `key_configuration` ticket is resolved (status → `resolved`), the system MUST NOT automatically create any follow-up ticket. The `tickets_resolution_chain` trigger MUST remove the `key_configuration → key_installation` branch. Other category branches in the trigger (if any) remain untouched. When a `key_configuration` ticket is cancelled, no follow-up ticket is created (unchanged).

(Previously: resolving a `key_configuration` ticket automatically created a `key_installation` ticket for the same building and order)

#### Scenario: Resolving key_configuration spawns no follow-up ticket

- GIVEN a `key_configuration` ticket T with building_id=10, order_id=5
- WHEN T.status is set to `resolved`
- THEN no new `support.tickets` row is created

#### Scenario: Cancelling key_configuration still creates no ticket

- GIVEN a `key_configuration` ticket T with building_id=10
- WHEN T.status is set to `cancelled`
- THEN no `key_installation` or any other follow-up ticket is created

#### Scenario: Non-key_configuration resolution chain still fires for other categories

- GIVEN the `tickets_resolution_chain` trigger is installed
- WHEN a ticket of a category that has a defined chain rule (not `key_configuration`) is resolved
- THEN the expected follow-up ticket for that category is created (chain unaffected)

---

### Requirement: key_authorizations as Sole Installation Record

`operations.key_authorizations` MUST be the sole source of truth for the state of "installer physically installed a key at a reader". No `support.tickets` row SHALL represent a key installation event. The `sync_state` column on `key_authorizations` drives order readiness directly; there is no ticket intermediary.

#### Scenario: Configuring a key does not create a key_installation ticket

- GIVEN a `key_configuration` ticket exists for order_item OI
- WHEN `configure_key_order_item` RPC completes successfully
- THEN the `key_configuration` ticket is resolved
- AND no `support.tickets` row with category=`key_installation` is created

#### Scenario: Installer marking authorization as installed does not create or resolve any ticket

- GIVEN a `key_authorizations` row with `sync_state = 'pending_install'`
- WHEN the installer updates `sync_state` to `installed`
- THEN no `support.tickets` row is created or modified as a side effect
- AND `recompute_order_status` is the mechanism that reacts to the authorization update

---

### Requirement: Data Migration — Soft-Cancel Existing key_installation Tickets

Existing open `support.tickets` rows with category=`key_installation` MUST be soft-cancelled: `status` set to `cancelled`, `cancellation_reason` set to `'superseded by key_authorizations model'`. Hard deletion is prohibited. After cancellation, `recompute_order_status` MUST be invoked for every order that had a cancelled ticket, so that orders stuck behind ghost tickets may promote if all their authorizations are `installed`.

#### Scenario: Existing open key_installation ticket is soft-cancelled

- GIVEN a `support.tickets` row exists with category=`key_installation` and status=`open`
- WHEN the data migration runs
- THEN that row has status=`cancelled`
- AND cancellation_reason=`'superseded by key_authorizations model'`
- AND the row is NOT deleted (audit trail preserved)

#### Scenario: Order recomputed after ticket cancellation may promote

- GIVEN order X was `in_progress` solely because a `key_installation` ghost ticket existed
- AND all `key_authorizations` rows for order X's keys have `sync_state = 'installed'`
- WHEN the migration soft-cancels the ticket and invokes `recompute_order_status` for order X
- THEN order X transitions to `ready_for_pickup`

---

### Requirement: Equipment Installation Resolution Side-Effect

When an `equipment_installation` ticket is resolved:
1. A new `operations.equipment` row MUST be created using the serial number provided at resolution time.
2. The stock reservation for the originating order_item MUST be converted to an `egreso_instalacion` movement (atomic with ticket resolution).
3. If the originating order_item has no `product_id`, no stock movement is emitted (backward compatibility).

#### Scenario: Resolving equipment_installation creates equipment row and egreso

- GIVEN an `equipment_installation` ticket linked to order_item with product_id=3
- WHEN the ticket is resolved with serial="SN-001"
- THEN an `operations.equipment` row is created with serial="SN-001"
- AND an `egreso_instalacion` stock movement is created for product_id=3
- AND `stock_reservado` decrements accordingly

#### Scenario: equipment_installation resolution without product_id emits no movement

- GIVEN an `equipment_installation` ticket linked to order_item with product_id=NULL
- WHEN the ticket is resolved
- THEN an `operations.equipment` row is created
- AND no `stock_movements` row is created
