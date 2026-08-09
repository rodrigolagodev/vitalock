# Realtime Specification

**Change**: installer-worklist
**Domain**: realtime
**Type**: New (no prior spec)
**Date**: 2026-08-09

## Purpose

Defines what the installer app's Realtime subscriptions MUST do to keep the
home page current when administrators add, change, or reassign work mid-shift.
Covers subscription setup, filter requirements, invalidation behavior, cleanup,
and the new-building appearance scenario.

## Requirements

### R1 — Key Authorization Subscription

The `useWorklist` hook MUST establish a Supabase Realtime channel subscribed to
`postgres_changes` on `operations.key_authorizations` with the filter
`sync_state=in.(pending_install,pending_removal)`. On any event the hook MUST
call `invalidateQueries` on the worklist query key. The subscription MUST be
torn down when the hook unmounts.

#### SC-R1-1 — New authorization triggers UI update

```
Given  Bruno's home page is loaded
When   an admin creates a new key_authorization for Bruno's building
  And  its sync_state is 'pending_install'
Then   within ~2 s, the new authorization row appears in the correct building's Llaves section
```

#### SC-R1-2 — Implicit delete on installed

```
Given  a pending_install authorization is visible in Bruno's list
When   the authorization's sync_state is changed to 'installed' (by Bruno's own action)
Then   the Realtime event for that row (no longer matching the filter) fires
  And  the worklist query is invalidated
  And  the row disappears from the UI
```

#### SC-R1-3 — New building appears

```
Given  Bruno has no pending work in "Edificio Nuevo"
When   an admin creates a pending authorization for Bruno at "Edificio Nuevo"
Then   within ~2 s, a new BuildingWorkCard for "Edificio Nuevo" appears on the home page
  And  it is sorted alphabetically among the other building cards
```

#### SC-R1-4 — Subscription cleanup on unmount

```
Given  the useWorklist hook has an active Realtime channel
When   the component unmounts
Then   supabase.removeChannel is called for the channel
  And  no further invalidation events are triggered after unmount
```

### R2 — Ticket Subscription

The `useAssignedTickets` hook MUST establish a Supabase Realtime channel
subscribed to `postgres_changes` on `support.tickets` filtered by
`assigned_to_staff_id=eq.{staff.id}`. On any event the hook MUST call
`invalidateQueries` on the tickets query key. The subscription MUST be torn
down when the hook unmounts.

#### SC-R2-1 — New ticket assignment triggers UI update

```
Given  Bruno's home page shows no tickets for "Edificio Roma"
When   an admin assigns an open ticket in "Edificio Roma" to Bruno
Then   within ~2 s, the ticket appears in "Edificio Roma"'s Trabajos section
  And  if "Edificio Roma" had no prior work card, one appears now
```

#### SC-R2-2 — Ticket disappears on unassignment

```
Given  Bruno's Trabajos section shows a ticket in "Torre Callao"
When   an admin reassigns the ticket away from Bruno
Then   within ~2 s the ticket disappears from Bruno's UI
  And  if no other work remains in "Torre Callao", the building card disappears
```

#### SC-R2-3 — Subscription cleanup on unmount

```
Given  the useAssignedTickets hook has an active Realtime channel
When   the component unmounts
Then   supabase.removeChannel is called for the channel
  And  no further invalidation events are triggered after unmount
```

### R3 — RLS Applies to Realtime Events

Realtime events MUST be subject to the same RLS policies as standard queries.
Bruno MUST NOT receive Realtime events for authorizations or tickets he cannot
read via a direct query.

#### SC-R3-1 — RLS filters Realtime payload

```
Given  a key_authorization exists for another installer's building
When   an admin updates that authorization's sync_state
Then   Bruno's Realtime subscription does NOT receive a notification for that row
  And  Bruno's UI does not change
```
