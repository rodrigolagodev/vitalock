# equipment-update-bundle-flow — Delta Specification

## Purpose

This delta fixes a correctness gap in `resolve_equipment_update` where new-path key orders (produced via `configure_key_order_item`) never advance `key_order_items` to `installed`, leaving `key_orders` permanently stuck in `pending_installation`. Alongside the DB fix, the delta adds a per-equipment pre-dispatch snapshot panel and a historical audit panel for admins on the equipment detail page, plus a prior-MDB re-download section in the installer resolve screen — making the equipment-update workflow coherent end-to-end: correct state advancement in the DB, informed dispatch for admins, and a manual recovery lane for installers.

---

## Requirements

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

## Constraints (Regression Guard)

The following behaviors MUST remain unchanged after this delta is applied. They are verified by the existing pgTAP suite and serve as regression scenarios.

### Constraint: 4-lane state machine is not modified

- The body of `recompute_key_order_status` MUST be identical to the pre-delta version.
- The states (`confirmed`, `in_progress`, `pending_installation`, `ready_for_pickup`) and their transition rules MUST not change.
- Verified by: existing scenarios in `test_113_key_order_installation_stage.sql` (all MUST remain green).

### Constraint: Pickup flow is not touched

- `mark_key_order_item_installed` RPC signature and behavior MUST remain unchanged.
- No new caller is introduced; its call graph remains empty from the UI layer.

### Constraint: Legacy order_items branch is preserved

- For any key where `rfid_keys.order_item_id IS NOT NULL`, `resolve_equipment_update` MUST still call `recompute_order_status` on the linked order (existing behavior).
- No existing test that exercises the legacy path may be broken.

---

## Test Coverage Specification

### Extending test_092_resolve_rpcs_dual_fk.sql — Scenario C (RED step)

Scenario C MUST be extended to assert, after `resolve_equipment_update` resolves a new-path key:
- `key_order_items.status = 'installed'` for the resolved key's item.
- `key_orders.status = 'ready_for_pickup'` for the parent order (when it is the only item).

This extension is the intentional TDD RED step. The extended assertion MUST fail until the new migration is applied. The apply phase MUST NOT skip or soften this assertion.

### New pgTAP test_095 — Single-item new-path advancement

- Sets up one `key_orders` with one `key_order_items` (new-path, `produced_key_id` set).
- Calls `resolve_equipment_update`.
- Asserts `key_order_items.status = 'installed'` and `key_orders.status = 'ready_for_pickup'`.

### New pgTAP test_096 — Multi-item partial advancement

- Sets up one `key_orders` with two `key_order_items` across two separate equipment.
- Resolves only one equipment_update.
- Asserts the resolved item is `installed`, the other is still `configured`, and `key_orders.status = 'pending_installation'`.
- Resolves the second equipment_update.
- Asserts both items are `installed` and `key_orders.status = 'ready_for_pickup'`.

### New Vitest — usePendingKeysForEquipment

- Mocks the Supabase client.
- Provides fixture data covering all three groups plus a cross-equipment key.
- Asserts the hook returns `{ to_activate: [...], to_disable: [...], unchanged: [...] }`.
- Asserts the cross-equipment key does not appear in any group.
