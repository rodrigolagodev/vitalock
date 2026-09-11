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

---

## Merged from change `equipment-update-bundle-flow` (verified 2026-08-28, archived 2026-09-10)

### Requirement: resolve_equipment_update Advances key_order_items

The `resolve_equipment_update` RPC MUST, for each RFID key it successfully activates, look up the corresponding `key_order_items` row via `key_order_items.produced_key_id = <key_id>` and update that row's status to `installed` within the same transaction. The existing `key_order_items_recompute_order_status_trigger` (AFTER UPDATE OF status) MUST fire as a result, driving the 4-lane `recompute_key_order_status` function. The legacy `order_items` branch (guarded by `rfid_keys.order_item_id IS NOT NULL`) MUST remain untouched and continue to call `recompute_order_status` for old-path keys.

#### Scenario: Single-item order reaches ready_for_pickup after resolve

- GIVEN a `key_orders` row KO with exactly one `key_order_items` row KI (`status = 'configured'`)
- AND KI has `produced_key_id = K` (new-path key, `rfid_keys.order_item_id IS NULL`)
- AND an `equipment_update` ticket EU references key K in its `keys_to_activate` snapshot
- WHEN `resolve_equipment_update(EU.ticket_id, actor)` is called
- THEN `rfid_keys.status` for K is `active`
- AND `key_order_items.status` for KI is `installed`
- AND `key_orders.status` for KO is `ready_for_pickup`

#### Scenario: Multi-item order stays pending_installation until all items resolved

- GIVEN a `key_orders` row KO with two `key_order_items` rows KI1 (`produced_key_id = K1`) and KI2 (`produced_key_id = K2`)
- AND equipment EU1 covers K1 and equipment EU2 covers K2 in separate `equipment_update` tickets
- WHEN `resolve_equipment_update(EU1.ticket_id, actor)` is called (only K1 activated)
- THEN `key_order_items.status` for KI1 is `installed`
- AND `key_order_items.status` for KI2 is still `configured`
- AND `key_orders.status` for KO is `pending_installation`
- WHEN `resolve_equipment_update(EU2.ticket_id, actor)` is subsequently called (K2 activated)
- THEN `key_order_items.status` for KI2 is `installed`
- AND `key_orders.status` for KO is `ready_for_pickup`

#### Scenario: Legacy-path key still triggers order_items recompute unchanged

- GIVEN a key K with `rfid_keys.order_item_id IS NOT NULL` (old-path)
- AND K is in the `keys_to_activate` snapshot of equipment_update EU
- WHEN `resolve_equipment_update(EU.ticket_id, actor)` is called
- THEN `rfid_keys.status` for K is `active`
- AND `recompute_order_status` is called for the linked `order_items.order_id`
- AND no `key_order_items` row is updated (the new branch does not apply to old-path keys)

#### Scenario: Key with no linked key_order_item is a no-op (no error)

- GIVEN a key K with `rfid_keys.order_item_id IS NULL`
- AND no `key_order_items` row has `produced_key_id = K`
- AND K is in the `keys_to_activate` snapshot of equipment_update EU
- WHEN `resolve_equipment_update(EU.ticket_id, actor)` is called
- THEN `rfid_keys.status` for K is `active`
- AND the RPC completes without error
- AND no `key_order_items` row is modified

#### Scenario: Snapshot skip does not advance any key_order_item

- GIVEN a key K that is NOT in the expected precursor state (e.g. already `active` or `disabled`)
- AND K appears in the `keys_to_activate` snapshot of equipment_update EU
- WHEN `resolve_equipment_update(EU.ticket_id, actor)` is called
- THEN K is skipped (a `snapshot_skipped` key_event is emitted)
- AND no `key_order_items` row is updated for K
- AND other keys in the snapshot that ARE in the correct precursor state are still processed normally

---

### Requirement: Pending-Keys Snapshot Query (usePendingKeysForEquipment)

A client-side hook `usePendingKeysForEquipment(equipmentId)` MUST return exactly three groups (`to_activate`, `to_disable`, `unchanged`) for the given equipment, using PostgREST queries scoped via `rfid_key_intended_equipment` and `key_authorizations`. The query MUST NOT return keys belonging to a different equipment.

Group definitions:

- `to_activate`: `rfid_keys` with `status = 'pending_installation'` joined to `rfid_key_intended_equipment` for this equipment.
- `to_disable`: `rfid_keys` with `status = 'pending_disable'` that have an `operations.key_authorizations` row for this equipment with `sync_state = 'installed'`.
- `unchanged`: `rfid_keys` with `status = 'active'` that have an `operations.key_authorizations` row for this equipment with `sync_state = 'installed'` and `removed_at IS NULL`.

Each group entry MUST include at minimum: `rfid_key_id`, `rfid_code`, `unit_number`, and `group` label.

#### Scenario: to_activate group includes pending_installation keys for this equipment

- GIVEN keys K1 and K2 with `status = 'pending_installation'`
- AND `rfid_key_intended_equipment(K1, EQ)` exists
- AND `rfid_key_intended_equipment(K2, OTHER_EQ)` exists (different equipment)
- WHEN `usePendingKeysForEquipment(EQ)` is called
- THEN the `to_activate` group contains K1
- AND K2 is NOT present in any group

#### Scenario: to_disable group includes pending_disable keys installed on this equipment

- GIVEN key K3 with `status = 'pending_disable'`
- AND a `key_authorizations` row for (K3, EQ) with `sync_state = 'installed'`
- WHEN `usePendingKeysForEquipment(EQ)` is called
- THEN the `to_disable` group contains K3

#### Scenario: unchanged group includes active keys currently installed on this equipment

- GIVEN key K4 with `status = 'active'`
- AND a `key_authorizations` row for (K4, EQ) with `sync_state = 'installed'` and `removed_at IS NULL`
- WHEN `usePendingKeysForEquipment(EQ)` is called
- THEN the `unchanged` group contains K4

#### Scenario: No cross-equipment leaks

- GIVEN key K5 with `status = 'pending_installation'`
- AND `rfid_key_intended_equipment(K5, OTHER_EQ)` exists (a different equipment)
- WHEN `usePendingKeysForEquipment(EQ)` is called
- THEN K5 does NOT appear in any group of the result

#### Scenario: RLS — admin can see all results; installer sees only their assigned scope

- GIVEN the query is run as an admin user
- THEN all three groups return rows correctly (admin has full visibility via `is_admin()`)
- GIVEN the query is run as an installer user
- THEN results are restricted by the existing `installer_read_*` RLS policies

---

### Requirement: Equipment Update History Query (useEquipmentUpdates)

The `useEquipmentUpdates(equipmentId)` hook MUST return ALL `support.equipment_updates` rows for the given equipment (both resolved and open), ordered by `created_at DESC`. Each row MUST include: `id`, `ticket_id`, `created_at`, `resolved_at`, `resolved_by_staff_id`, `keys_to_activate`, `keys_to_disable`, and `mdb_storage_path`.

#### Scenario: Returns both resolved and open updates in created_at DESC order

- GIVEN equipment EQ has three `equipment_updates` rows: EU_old (resolved), EU_mid (resolved), EU_new (open)
- WHEN `useEquipmentUpdates(EQ.id)` is called
- THEN the result contains all three rows
- AND the order is EU_new first, then EU_mid, then EU_old

#### Scenario: All required columns are present

- GIVEN equipment EQ has at least one resolved `equipment_updates` row EU
- WHEN `useEquipmentUpdates(EQ.id)` is called
- THEN each row includes `mdb_storage_path`, `resolved_at`, `resolved_by_staff_id`, `keys_to_activate`, `keys_to_disable`

#### Scenario: Empty array when equipment has no updates

- GIVEN equipment EQ has no `equipment_updates` rows
- WHEN `useEquipmentUpdates(EQ.id)` is called
- THEN the result is an empty array (no error)

---

### Requirement: Admin UI — Equipment Detail Snapshot Panel

`EquipoDetailPage` MUST include a snapshot section that displays the three groups from `usePendingKeysForEquipment` and gives the admin a way to copy/export the snapshot content (copy-to-clipboard or CSV — design chooses). The section MUST only render when the equipment status is `active`.

#### Scenario: Section renders for active equipment with pending keys

- GIVEN equipment EQ has `status = 'active'`
- AND `usePendingKeysForEquipment(EQ.id)` returns non-empty groups
- WHEN the admin opens `EquipoDetailPage` for EQ
- THEN the snapshot section is visible
- AND each group (`to_activate`, `to_disable`, `unchanged`) is displayed with its respective keys

#### Scenario: Empty groups show "no pending" message

- GIVEN equipment EQ has `status = 'active'`
- AND all three groups from `usePendingKeysForEquipment(EQ.id)` are empty
- WHEN the admin opens `EquipoDetailPage` for EQ
- THEN each empty group renders a "no pending" (or equivalent) placeholder — no blank space or error

#### Scenario: Copy action puts formatted snapshot text into clipboard

- GIVEN the snapshot section is rendered with at least one non-empty group
- WHEN the admin clicks the "Copy" (or equivalent) action
- THEN the browser clipboard receives a formatted text representation of the three groups
- AND no navigation or page reload occurs

#### Scenario: Section does not render for non-active equipment

- GIVEN equipment EQ does NOT have `status = 'active'`
- WHEN the admin opens `EquipoDetailPage` for EQ
- THEN the snapshot section is NOT rendered

---

### Requirement: Admin UI — Equipment Detail History Panel

`EquipoDetailPage` MUST include a history panel showing all past `support.equipment_updates` for that equipment in `created_at DESC` order. Each row MUST display: date, installer name (resolved_by_staff_id resolved to a display name), key counts (keys_to_activate count, keys_to_disable count), and a download link for the `.mdb` file. Resolved rows MUST show `resolved_at` and installer name. Open rows MUST show a "pending resolution" indicator in place of `resolved_at` and installer name.

#### Scenario: Table lists rows in created_at DESC order

- GIVEN equipment EQ has multiple `equipment_updates` rows
- WHEN the admin views the history panel in `EquipoDetailPage`
- THEN rows are displayed newest-first (created_at DESC)

#### Scenario: .mdb download link resolves to a signed URL

- GIVEN an `equipment_updates` row EU with a non-null `mdb_storage_path`
- WHEN the admin clicks the download link for EU
- THEN the browser navigates to (or opens) a signed Supabase Storage URL for `mdb_storage_path`
- AND the download respects storage RLS (admin has access; unauthorized users do not)

#### Scenario: Resolved row shows resolved_at and installer name

- GIVEN an `equipment_updates` row EU with non-null `resolved_at` and `resolved_by_staff_id`
- WHEN the admin views the history panel
- THEN EU's row displays the `resolved_at` timestamp and the resolved-by staff member's display name

#### Scenario: Open row shows "pending resolution" indicator

- GIVEN an `equipment_updates` row EU with `resolved_at IS NULL`
- WHEN the admin views the history panel
- THEN EU's row displays a "pending resolution" (or equivalent) indicator in place of resolution date and installer

---

### Requirement: Installer UI — Rollback Download Section

`EquipmentUpdateResolveDetail` MUST include a "Historial del equipo" (or equivalent) collapsible section that lists all prior `equipment_updates` rows for the SAME equipment (excluding the current open task), each with an MDB download link. No DB write or ticket state change is performed as part of the download — rollback is entirely manual (the installer downloads the `.mdb` and syncs it to the device out-of-band).

#### Scenario: Only this equipment's updates are listed (RLS-scoped)

- GIVEN the installer is resolving task EU for equipment EQ
- AND equipment EQ has prior updates EU_prev1, EU_prev2
- AND another equipment OTHER_EQ also has updates (not related to EQ)
- WHEN the installer opens the resolve screen for EU
- THEN the history section lists EU_prev1 and EU_prev2
- AND updates for OTHER_EQ are NOT shown

#### Scenario: Download link opens a signed URL for the historical .mdb

- GIVEN a prior `equipment_updates` row EU_prev with a non-null `mdb_storage_path`
- WHEN the installer clicks the download link for EU_prev in the history section
- THEN the browser navigates to (or opens) a signed Supabase Storage URL for `mdb_storage_path`
- AND the installer can retrieve the file

#### Scenario: Rollback is manual — no DB write occurs

- GIVEN the installer clicks the download link for a prior update EU_prev
- THEN no `support.tickets` or `support.equipment_updates` row is modified
- AND no `rfid_keys` status is changed
- AND no `key_order_items` or `key_orders` row is changed

#### Scenario: History section is empty when no prior updates exist

- GIVEN the current task EU is the FIRST equipment_update ever created for equipment EQ
- WHEN the installer opens the resolve screen for EU
- THEN the history section renders with an empty state (no error, no crash)

---
