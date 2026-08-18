# Delta for Installer Home / Worklist

## ADDED Requirements

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
