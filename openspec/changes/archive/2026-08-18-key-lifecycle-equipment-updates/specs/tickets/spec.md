# Delta for Tickets

## ADDED Requirements

### Requirement: equipment_update Category

The system SHALL add `equipment_update` to the `support.tickets.category` CHECK
constraint. The TypeScript `TareaRow.category` union MUST be updated in the same
change batch as the DB migration.

#### Scenario: equipment_update ticket accepted

- GIVEN the CHECK constraint is extended
- WHEN a ticket is inserted with category `equipment_update`
- THEN the insert succeeds

#### Scenario: Unknown category still rejected

- GIVEN the updated CHECK constraint is in place
- WHEN a ticket is inserted with category `unknown_type`
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
