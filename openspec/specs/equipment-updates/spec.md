# Equipment Updates Specification

## Purpose

Defines the `equipment_update` task category: admin creation flow, snapshot
semantics, `.mdb` blob storage, atomic resolution, installer resolve flow, and
the uniqueness and access-control rules that govern the entire capability.

## Requirements

### Requirement: equipment_update Task Category

The system SHALL support `equipment_update` as a valid `support.tickets.category`
value. An `equipment_update` ticket MUST reference a specific equipment record
via the existing FK path. Creation MUST go through a dedicated admin UI — NOT
through the generic `TareaFormSheet`.

#### Scenario: equipment_update ticket accepted by DB

- GIVEN the category CHECK constraint is extended
- WHEN a ticket is inserted with category `equipment_update`
- THEN the insert succeeds

#### Scenario: Generic TareaFormSheet does not expose equipment_update

- GIVEN an admin opens the generic task creation sheet
- WHEN the category selector renders
- THEN `equipment_update` is not present as a selectable option

---

### Requirement: Snapshot Frozen at Task Creation

When an `equipment_update` task is created, the system MUST capture a frozen
snapshot of all keys currently in `pending_installation` (for activation) and
`pending_disable` (for disable) on that equipment. This snapshot MUST be stored
immutably in `support.equipment_updates` and MUST NOT change after creation,
even when new pending keys arrive for that equipment.

#### Scenario: Snapshot captures current pending keys at creation time

- GIVEN equipment E has keys K1 (`pending_installation`) and K2 (`pending_disable`)
- WHEN an admin creates an `equipment_update` task for equipment E
- THEN `equipment_updates.keys_to_activate` contains K1
- AND `equipment_updates.keys_to_disable` contains K2

#### Scenario: Keys arriving after task creation are excluded from snapshot

- GIVEN an `equipment_update` task exists for equipment E with snapshot {K1}
- WHEN key K3 transitions to `pending_installation` on equipment E afterward
- THEN K3 is NOT added to the existing snapshot
- AND K3 appears in the pending-keys guardrail count for the next train

---

### Requirement: .mdb Blob Storage

The system MUST store the `.mdb` file for each `equipment_update` task in a
private Supabase Storage bucket `equipment-updates-mdb`. The path MUST follow
the pattern `{ticket_id}/{filename}.mdb`. Access to the blob MUST require a
signed URL; direct public access MUST be denied.

#### Scenario: .mdb file stored under correct path

- GIVEN an admin uploads a `.mdb` file when creating an equipment_update task
- WHEN the upload completes
- THEN the file is stored at `{ticket_id}/{filename}.mdb` in `equipment-updates-mdb`

#### Scenario: Direct public access to .mdb is denied

- GIVEN a `.mdb` file exists in the storage bucket
- WHEN an unauthenticated request attempts to access it by URL
- THEN access is denied (bucket is private)

#### Scenario: Signed URL grants temporary download access

- GIVEN an installer is assigned to a task
- WHEN the installer requests a download URL for the .mdb file
- THEN a signed URL is returned that grants temporary read access

---

### Requirement: Atomic Resolution via resolve_equipment_update

The `resolve_equipment_update` RPC MUST atomically perform all of the following
as a single transaction — or fail entirely with no partial state changes:

1. Lock the task row for update and validate category=`equipment_update` and status=`in_progress`.
2. Transition each `pending_installation` key in the snapshot to `active` and mint a `key_authorizations` row.
3. Transition each `pending_disable` key in the snapshot to `disabled`.
4. Skip stale keys silently and emit `snapshot_skipped` events.
5. Emit `key_events` rows for each processed key.
6. Mark the ticket `resolved` with `resolved_by_staff_id` and `resolved_at`.
7. Trigger `recompute_order_status` for all orders linked to newly-activated keys.

#### Scenario: Full atomic resolution happy path

- GIVEN an `equipment_update` task in `in_progress` with snapshot {K1: activate, K2: disable}
- WHEN `resolve_equipment_update(task_id, actor)` executes
- THEN K1.status becomes `active` and a `key_authorizations` row is created for K1
- AND K2.status becomes `disabled`
- AND `key_events` rows are emitted for both K1 and K2
- AND the ticket status becomes `resolved`
- AND `recompute_order_status` runs for any order containing K1

#### Scenario: Partial failure causes complete rollback

- GIVEN the resolution RPC encounters a constraint error mid-transaction
- WHEN the RPC returns an error
- THEN no key status changes, no authorizations, no events, and no ticket status change are persisted

#### Scenario: ready_for_pickup triggered by resolution

- GIVEN an order O has a key K1 whose only blocking authorization is `pending_install`
- AND K1 is in the snapshot of the resolved `equipment_update` task
- WHEN `resolve_equipment_update` executes and K1 becomes `active`
- THEN the minted `key_authorizations` for K1 has `sync_state = 'installed'` (or equivalent)
- AND `recompute_order_status` promotes order O to `ready_for_pickup`

---

### Requirement: Uniqueness — One Active Train per Equipment

At most one `equipment_update` ticket with status `open` or `in_progress` MUST
be allowed per equipment at any time. The system MUST enforce this at the
database level.

#### Scenario: Second concurrent task for same equipment is rejected

- GIVEN an `equipment_update` task exists for equipment E with status `open`
- WHEN an admin attempts to create a second `equipment_update` task for equipment E
- THEN the database rejects the insert
- AND the first task remains unchanged

#### Scenario: New task allowed after previous task is resolved

- GIVEN a previous `equipment_update` task for equipment E is `resolved`
- WHEN an admin creates a new `equipment_update` task for equipment E
- THEN the insert succeeds

---

### Requirement: Admin Creation Flow

The system MUST provide a dedicated `EquipmentUpdateFormSheet` accessible from
the equipment detail view. The sheet MUST display the keys-to-activate list and
keys-to-disable list (derived from the frozen snapshot) and MUST accept a `.mdb`
file attachment before submission.

#### Scenario: Admin sees snapshot lists before creating task

- GIVEN an admin opens `EquipmentUpdateFormSheet` for equipment E
- WHEN the sheet renders
- THEN the keys-to-activate list shows all keys in `pending_installation` on E
- AND the keys-to-disable list shows all keys in `pending_disable` on E

#### Scenario: Form requires .mdb attachment

- GIVEN the admin fills the task details but does not attach a `.mdb` file
- WHEN the admin attempts to submit
- THEN submission is blocked with a required-field validation error

---

### Requirement: Installer Resolve Flow

The system MUST surface `equipment_update` tasks in the installer's worklist.
The installer MUST be able to download the `.mdb` file, review the snapshot
lists, and resolve the task via the resolve UI. The generic batch-resolve
toolbar MUST NOT include `equipment_update` tickets.

#### Scenario: equipment_update task appears in installer worklist

- GIVEN an `equipment_update` task is assigned to installer Bruno
- WHEN Bruno's home page loads
- THEN the task appears in the Trabajos sub-section of the correct building card

#### Scenario: Installer downloads .mdb file

- GIVEN Bruno opens the `equipment_update` task detail
- WHEN Bruno taps the download button
- THEN a signed URL is resolved and the download begins

#### Scenario: Installer resolves equipment_update task

- GIVEN Bruno opens the task detail and is satisfied the sync is complete
- WHEN Bruno taps "Resolver" and confirms
- THEN `resolve_equipment_update(task_id, Bruno.staff_id)` is called
- AND on success, the task disappears from Bruno's worklist
- AND a success toast is shown

#### Scenario: equipment_update excluded from generic batch resolve toolbar

- GIVEN Bruno's building card has a `maintenance` ticket and an `equipment_update` ticket
- WHEN the Trabajos section renders
- THEN only the `maintenance` ticket appears in the selectable batch toolbar
- AND the `equipment_update` ticket has its own dedicated resolve UI

---

### Requirement: RLS — Admin and Installer Scoping

Admin users MUST have full CRUD access to `support.equipment_updates` via the
`is_admin()` helper. Installer users MUST have SELECT access only for rows where
the linked ticket's `assigned_to_staff_id` matches the caller's identity.
Installers MUST NOT perform direct writes to `equipment_updates` rows; writes
are gated exclusively through the `resolve_equipment_update` RPC.

#### Scenario: Admin reads any equipment_update row

- GIVEN an `equipment_updates` row exists for any task
- WHEN an admin queries it
- THEN the row is returned

#### Scenario: Installer reads only own assigned tasks

- GIVEN equipment_updates rows exist for tasks assigned to installer A and installer B
- WHEN installer A queries `equipment_updates`
- THEN only the row for A's assigned task is returned

#### Scenario: Installer direct write is blocked

- GIVEN installer A is assigned to task T
- WHEN installer A attempts a direct UPDATE on `equipment_updates`
- THEN the write is rejected by RLS
