# Delta for Equipment Admin

## ADDED Requirements

### Requirement: Pending-Keys Guardrail Badge

The equipment detail view MUST display a `PendingKeysGuardrailBadge` whenever
the equipment has keys in `pending_installation` or `pending_disable` status
that are NOT included in any currently `open` or `in_progress` `equipment_update`
task (i.e., pending keys outside the current train). The badge MUST show the
count of such keys and convey that they are awaiting a new train.

#### Scenario: Badge appears when pending keys exist outside active train

- GIVEN equipment E has key K1 in `pending_installation`
- AND there is no `open` or `in_progress` `equipment_update` task that includes K1
- WHEN the equipment detail view renders
- THEN a `PendingKeysGuardrailBadge` shows a count of 1 pending key

#### Scenario: Badge absent when all pending keys are in an active train

- GIVEN equipment E has key K1 in `pending_installation`
- AND an `open` `equipment_update` task exists with K1 in its snapshot
- WHEN the equipment detail view renders
- THEN no `PendingKeysGuardrailBadge` is shown (or the count is 0)

#### Scenario: Badge absent when no pending keys exist

- GIVEN equipment E has no keys in `pending_installation` or `pending_disable`
- WHEN the equipment detail view renders
- THEN no `PendingKeysGuardrailBadge` is displayed

---

### Requirement: Equipment Update Task Creation Entry Point

The equipment detail view MUST provide an entry point to create a new
`equipment_update` task for that equipment. This entry point MUST open the
dedicated `EquipmentUpdateFormSheet`. The entry point MUST be disabled or absent
when an `open` or `in_progress` `equipment_update` task already exists for the
equipment (uniqueness guard).

#### Scenario: Admin opens EquipmentUpdateFormSheet from equipment detail

- GIVEN no `open` or `in_progress` `equipment_update` task exists for equipment E
- WHEN the admin clicks the create-equipment-update entry point
- THEN `EquipmentUpdateFormSheet` opens pre-populated with equipment E's context

#### Scenario: Entry point disabled when active train exists

- GIVEN an `open` or `in_progress` `equipment_update` task exists for equipment E
- WHEN the equipment detail view renders
- THEN the create-equipment-update entry point is disabled or absent
