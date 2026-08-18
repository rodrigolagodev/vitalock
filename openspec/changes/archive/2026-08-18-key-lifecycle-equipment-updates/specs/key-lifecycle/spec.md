# Key Lifecycle Specification

## Purpose

Defines the 5-state RFID key lifecycle: the named states, the allowed transition
edges, the actors that drive each transition, the `key_events` audit trail, and
the reversible pre-terminal path for disabling a key.

## Requirements

### Requirement: Five-State Key Status Domain

The system SHALL enforce that `rfid_keys.status` accepts exactly five values:
`pending_creation`, `pending_installation`, `active`, `pending_disable`,
`disabled`. No other value MUST be accepted by the database CHECK constraint.

#### Scenario: Valid status values accepted

- GIVEN the updated CHECK constraint is applied
- WHEN a key is inserted with status `pending_creation`
- THEN the insert succeeds

#### Scenario: Invalid status value rejected

- GIVEN the updated CHECK constraint is applied
- WHEN a key insert or update provides status `revoked`
- THEN the database rejects the write with a CHECK violation

---

### Requirement: Defined Transition Edges

The system MUST only allow the following status transitions on `rfid_keys`:

| From | To | Trigger |
|---|---|---|
| (new) | `pending_creation` | `configure_key_order_item` RPC |
| `pending_creation` | `pending_installation` | `key_configuration` ticket resolved |
| `pending_installation` | `active` | `equipment_update` task resolved |
| `active` | `pending_disable` | `request_key_disable` RPC |
| `pending_disable` | `active` | `cancel_key_disable` RPC |
| `pending_disable` | `disabled` | `equipment_update` task resolved |

No other transition MUST be allowed. Attempts to transition outside these edges
MUST be rejected.

#### Scenario: pending_creation created by configure_key_order_item

- GIVEN a pending key order_item exists
- WHEN `configure_key_order_item` RPC executes successfully
- THEN an `rfid_keys` row is created with status `pending_creation`
- AND no `key_authorizations` row is created at this point

#### Scenario: pending_creation advances to pending_installation at key_configuration resolve

- GIVEN an `rfid_keys` row with status `pending_creation`
- AND the linked `key_configuration` ticket is resolved
- WHEN the resolution RPC completes
- THEN `rfid_keys.status` becomes `pending_installation`

#### Scenario: pending_installation advances to active at equipment_update resolve

- GIVEN an `rfid_keys` row with status `pending_installation` in an equipment_update snapshot
- WHEN `resolve_equipment_update` executes
- THEN `rfid_keys.status` becomes `active`
- AND a `key_authorizations` row is created for that key

#### Scenario: active transitions to pending_disable via request_key_disable

- GIVEN an `rfid_keys` row with status `active`
- WHEN `request_key_disable` RPC is called
- THEN `rfid_keys.status` becomes `pending_disable`
- AND a `key_events` row with event_type `disable_requested` is emitted

#### Scenario: pending_disable reverted to active via cancel_key_disable

- GIVEN an `rfid_keys` row with status `pending_disable`
- WHEN `cancel_key_disable` RPC is called
- THEN `rfid_keys.status` becomes `active`
- AND a `key_events` row with event_type `disable_cancelled` is emitted

#### Scenario: pending_disable advances to disabled at equipment_update resolve

- GIVEN an `rfid_keys` row with status `pending_disable` in an equipment_update snapshot
- WHEN `resolve_equipment_update` executes
- THEN `rfid_keys.status` becomes `disabled`

#### Scenario: disabled is terminal — no further transition allowed

- GIVEN an `rfid_keys` row with status `disabled`
- WHEN any RPC or direct UPDATE attempts to change status to any other value
- THEN the write is rejected
- AND the key remains `disabled`

---

### Requirement: Key Events Audit Trail

The system MUST emit a `key_events` row for every state transition and for
stale-key skips during resolution. The `event_type` CHECK constraint MUST
include: `creation_requested`, `configured`, `activated`, `disable_requested`,
`disable_cancelled`, `disabled`, `snapshot_skipped`.

#### Scenario: Each lifecycle transition produces an audit event

- GIVEN an `rfid_keys` row transitions from `pending_installation` to `active`
- WHEN `resolve_equipment_update` runs
- THEN a `key_events` row is created with event_type `activated`
- AND the row references the `rfid_keys.id` and the task actor

#### Scenario: snapshot_skipped event emitted for stale keys

- GIVEN an `rfid_keys` row in the equipment_update snapshot has status that is not `pending_installation` or `pending_disable` at resolve time
- WHEN `resolve_equipment_update` runs
- THEN a `key_events` row with event_type `snapshot_skipped` is emitted for that key
- AND the key's status is not changed

#### Scenario: Historical event_type values remain valid

- GIVEN rows exist in `key_events` with event_type `activated` from before this change
- WHEN the migration runs
- THEN those rows remain queryable and the CHECK constraint does not reject them

---

### Requirement: Stale-Key Skip-Silently Behavior

When `resolve_equipment_update` encounters a key in its snapshot whose current
status does not match the expected pre-transition state, the system MUST skip
that key silently, emit a `snapshot_skipped` `key_events` row, and continue
processing remaining keys. The resolution MUST NOT fail or abort due to stale keys.

#### Scenario: Stale key in activation list is skipped

- GIVEN an equipment_update snapshot includes key K in `keys_to_activate`
- AND key K's current status is `active` (already activated by another task)
- WHEN `resolve_equipment_update` executes
- THEN key K is not re-processed
- AND a `key_events` row with event_type `snapshot_skipped` is created for key K
- AND all other snapshot keys are processed normally

#### Scenario: Stale key in disable list is skipped

- GIVEN an equipment_update snapshot includes key K in `keys_to_disable`
- AND key K's current status is `disabled`
- WHEN `resolve_equipment_update` executes
- THEN key K is skipped
- AND a `snapshot_skipped` event is emitted for key K
- AND the overall resolution succeeds

---

### Requirement: deactivated_at Trigger Compatibility

The `rfid_keys_sync_deactivated_at` trigger MUST be updated to handle the
expanded status domain. It MUST set `deactivated_at` when status transitions to
`disabled`. It MUST clear `deactivated_at` when status transitions away from
`pending_disable` back to `active`.

#### Scenario: deactivated_at set on disabled

- GIVEN an `rfid_keys` row transitions to status `disabled`
- WHEN the trigger fires
- THEN `deactivated_at` is set to the current timestamp

#### Scenario: deactivated_at cleared on cancel_key_disable

- GIVEN an `rfid_keys` row transitions from `pending_disable` back to `active`
- WHEN the trigger fires
- THEN `deactivated_at` is cleared (set to NULL)
