# Delta for Tickets

**Change**: atomic-stock-work-resolution
**Date**: 2026-08-12

## ADDED Requirements

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

## MODIFIED Requirements

### Requirement: Resolve Ticket (Pessimistic, via RPC)

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
