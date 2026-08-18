# Proposal: Key Lifecycle and Equipment Updates

## Intent

Today Vitalock treats an RFID key as a two-state entity (`active` / `disabled`), but the real physical workflow has four distinct waypoints between "requested" and "usable at the door": configured in Access, exported to `.mdb`, carried to the site, and synced into the equipment. The admin cannot see where a key really is, orders complete before the equipment is actually synced (so tenants arrive to a door that rejects them), and there is no first-class task that represents the installer trip that carries the `.mdb` file. This change models the true lifecycle and introduces the `equipment_update` task that batches activations and disables per equipment.

## Scope

### In Scope
- Expand `rfid_keys.status` to 5 states (`pending_creation`, `pending_installation`, `active`, `pending_disable`, `disabled`).
- New task category `equipment_update` (admin-created, installer-resolved, with `.mdb` attachment).
- New table `support.equipment_updates` storing immutable snapshot (`keys_to_activate[]`, `keys_to_disable[]`, `mdb_storage_path`, install metadata).
- Atomic RPC `resolve_equipment_update(task_id, actor)` that flips key states, mints `key_authorizations`, emits `key_events`, and drives order `ready_for_pickup`.
- New RPCs `request_key_disable`, `cancel_key_disable` (reversible pre-terminal transition).
- Rework `configure_key_order_item` to mint keys as `pending_creation` and defer authorization inserts.
- Admin UI: `EquipmentUpdateFormSheet`, `EquipmentUpdateTaskDetail`, `PendingKeysGuardrailBadge`, extended `KeyStatusChangeDialog`.
- Installer UI: resolve flow for `equipment_update` category.
- Supabase Storage bucket `equipment-updates-mdb` with RLS.
- Extend `key_events.event_type` CHECK for the 5 transitions.

### Out of Scope
- Parsing, generating, or automating the `.mdb` file — it stays an opaque blob.
- Replacing the Microsoft Access configuration program.
- Remote/online sync with the physical equipment.
- Backfilling historical data (dev DB only, seed data resettable).
- Feature flag / staged rollout — ships directly to test envs.

## Capabilities

### New Capabilities
- `key-lifecycle`: 5-state RFID key state machine, named transitions, event audit trail, and the RPCs that drive them.
- `equipment-updates`: `equipment_update` task category, snapshot table, `.mdb` storage, atomic resolution, installer resolve flow, admin creation flow.

### Modified Capabilities
- `tickets`: adds `equipment_update` to category domain; blocks cancellation once `in_progress` for this category.
- `key-configuration`: `configure_key_order_item` now mints `pending_creation` and no longer inserts `key_authorizations` inline.
- `ordenes-admin`: `ready_for_pickup` now triggered by authorizations created at `equipment_update` resolution (not `key_configuration`).
- `equipment-admin`: equipment detail surfaces the pending-keys guardrail badge and the equipment_update creation entry.
- `installer-home` / `worklist`: adds `equipment_update` category to installer worklist and its resolve UI.

## Approach

Model the key as a linear state machine with one reversible edge (`active` ↔ `pending_disable`) and one terminal state (`disabled`). Task-driven transitions:

- `key_configuration` resolves → key becomes `pending_installation`.
- Admin explicit "dar de baja" → `active` → `pending_disable`; "cancelar baja" → `pending_disable` → `active`.
- `equipment_update` resolves atomically → each `pending_installation` in snapshot → `active` (+ mint `key_authorizations`); each `pending_disable` → `disabled`.

Concurrency = **release train**. Snapshot is frozen at task creation. New pending keys that appear later are visible via a badge on the equipment view but wait for the next train. Escape hatch: cancel-and-recreate while still `open`; once `in_progress` cancellation is blocked (installer already left with the `.mdb`).

The atomic RPC follows the `resolve_equipment_installation` / `atomic-stock-work-resolution` pattern: `FOR UPDATE` lock, validate category+status, apply bulk state transitions, mint authorizations, emit events, mark ticket resolved, recompute affected orders.

## Key Design Decisions

### Closed by user

1. **Five-state lifecycle with named transitions.** Rationale: matches the real physical workflow (configuration → export → travel → sync) and lets each screen show a truthful status. `disabled` reused as terminal because it also serves emergency out-of-flow disables (lost/stolen keys); no `revoked` synonym.
2. **`equipment_update` as a first-class task with frozen snapshot + `.mdb` blob.** Rationale: the `.mdb` is the physical unit of work; batching per equipment matches how the installer trip actually happens; the snapshot removes ambiguity about "what was in this trip" even if new requests arrive later.
3. **Atomic resolution via single Postgres RPC.** Rationale: reuses the proven `resolve_equipment_installation` pattern; guarantees state, authorizations, events, and order status change together or not at all.
4. **Option A for `configure_key_order_item`: mint `pending_creation`, defer authorizations to `equipment_update` resolve.** Rationale: preserves the existing `key_authorizations_validate` trigger untouched (it already requires `active`), and naturally aligns `ready_for_pickup` with the moment the key is actually usable at the door.
5. **Installer is primary resolver; admin has escape valve.** Rationale: the installer is at the site verifying the sync; admin close covers exceptions.
6. **Release-train concurrency with cancel-and-recreate escape hatch.** Rationale: prevents mid-trip surprises; guardrail badge keeps admin aware of pending work not in the current train.
7. **`disabled` is terminal, `pending_disable` is the reversible waypoint.** Rationale: consistent naming with the existing `disabled` state; single terminal simplifies queries and audit.
8. **`rfid_code` remains the human-facing identifier.** No schema change needed.

### Resolved from open technical questions

1. **`equipment_updates` schema**: `support.equipment_updates` — colocated with `support.tickets` because it is a task-scoped artifact, not a domain entity.
2. **Stale-key behavior at resolve**: **skip silently and log a warning** in `key_events` (event_type `snapshot_skipped`). Fail-hard would strand the installer at the site with no recovery path; the snapshot semantics already mean "reconcile physical to snapshot", and skipping is idempotent under retry.
3. **Storage bucket name**: `equipment-updates-mdb` (kebab-case per existing bucket-naming conventions; scoped by task via path `{ticket_id}/{filename}.mdb`).
4. **`key_events.event_type` CHECK extension**: replace `('activated','deactivated')` with `('creation_requested','configured','activated','disable_requested','disable_cancelled','disabled','snapshot_skipped')`. Historical rows migrate: `activated` → `activated`, `deactivated` → `disabled`.
5. **RLS on `equipment_updates`**: admin full CRUD (via `is_admin()`); installer SELECT only where the linked `tickets.assigned_to_staff_id` matches the caller; installer UPDATE gated to their assigned tasks via the RPC only (no direct table writes).

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `supabase/migrations/*` | New | Status CHECK expansion, `equipment_updates` table, RPCs, storage bucket, RLS, trigger updates |
| `public.rfid_keys` | Modified | Status domain + `rfid_keys_sync_deactivated_at` trigger updated |
| `public.key_authorizations` | Modified | Inserted at `equipment_update` resolve, not `key_configuration` resolve |
| `public.key_events` | Modified | event_type CHECK extended |
| `support.tickets` | Modified | Category CHECK + `tickets_require_equipment_on_resolve` include `equipment_update`; cancellation block for `in_progress` |
| `support.equipment_updates` | New | Snapshot table with FKs, storage path, install metadata |
| `configure_key_order_item` RPC | Modified | Mint `pending_creation`, drop inline authorization insert |
| `resolve_equipment_update` RPC | New | Atomic bulk transition |
| `request_key_disable`, `cancel_key_disable` RPCs | New | Reversible pre-terminal transitions |
| `recompute_order_status` | Unchanged | Naturally triggered when authorizations mint at resolve |
| `apps/admin/features/keys/*` | Modified | Status labels, status change dialog, key detail dialog |
| `apps/admin/features/tickets/*` | Modified | Category labels; equipment_update excluded from generic TareaFormSheet |
| `apps/admin/features/equipment-updates/*` | New | Form sheet, task detail, hooks |
| `apps/admin/features/equipment/*` | Modified | Pending-keys guardrail badge |
| `apps/installer/*` | Modified | Category union + resolve flow |
| Supabase Storage | New | `equipment-updates-mdb` bucket + policies |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Extend status CHECK without updating `rfid_keys_sync_deactivated_at` trigger (same class as stock_movements counter bug) | High | Both changes in the SAME migration; verification checklist in sdd-tasks |
| `configure_key_order_item` rework breaks existing order flow | High | Update RPC + all consumers atomically; regenerate seed; verify order lifecycle end-to-end in test |
| `key_authorizations_validate` trigger rejects pending-state keys mid-flow | High | Design mints `pending_creation`, defers auth insert to resolve — trigger stays untouched |
| Snapshot stale keys at resolve time cause silent failures | Medium | Explicit `snapshot_skipped` event + warning surfaced in installer UI; skip-not-fail chosen deliberately |
| Storage bucket policies too permissive (privacy leak on `.mdb`) | Medium | Bucket private-by-default, signed URLs only, RLS on select via ticket assignment |
| RLS on `equipment_updates` misconfigured (installer sees other trips) | Medium | Policy uses `tickets.assigned_to_staff_id`; test with two installer accounts |
| Admin creates duplicate equipment_update while one is in flight | Low | Guardrail badge shows pending count; DB uniqueness on `(equipment_id, ticket_id where status IN open,in_progress)` prevents double trains |
| Installer resolves with wrong actor context | Low | RPC validates `actor` staff matches `tickets.assigned_to_staff_id` or `is_admin()` |
| `key_events.event_type` CHECK migration loses historical rows | Low | Explicit `activated` → `activated`, `deactivated` → `disabled` mapping in migration |

## Rollback Plan

Single-PR delivery on dev DB with seed data — rollback = revert migration set + reset seed. Concretely:
1. Drop `resolve_equipment_update`, `request_key_disable`, `cancel_key_disable` RPCs.
2. Drop `support.equipment_updates` table.
3. Revert `rfid_keys.status` CHECK to `('active','disabled')`; UPDATE any pending states to `active` (dev data only).
4. Revert `configure_key_order_item` to prior version (mints `active` + inserts authorizations).
5. Revert `key_events.event_type` CHECK.
6. Delete `equipment-updates-mdb` bucket.
7. Roll back UI changes via git revert of the feature PR.

Because there is no production data, rollback is destructive-safe.

## Dependencies

- Supabase Storage available in target env (already provisioned).
- Existing `resolve_equipment_installation` / `resolve_equipment_replacement` patterns as reference implementations.
- Existing `is_admin()` and `staff_can_read_ticket()` RLS helpers.

## Success Criteria

- [ ] A key mints as `pending_creation`, advances through `pending_installation` → `active` when its `equipment_update` resolves, and can be disabled reversibly then terminally.
- [ ] Admin can create an `equipment_update` for an equipment, attach a `.mdb`, and see two lists (altas/bajas) that match the frozen snapshot.
- [ ] Installer sees the `equipment_update` in their worklist, can download the `.mdb`, and can resolve the task in one atomic action.
- [ ] After resolution, all snapshot keys reflect the correct new state, `key_authorizations` exist for newly-active keys, `key_events` records each transition, and any fully-covered order flips to `ready_for_pickup`.
- [ ] `request_key_disable` and `cancel_key_disable` produce the expected reversible transition and are audited.
- [ ] Equipment detail view shows a badge when pending keys exist outside the current train.
- [ ] `open` `equipment_update` tasks can be cancelled; `in_progress` cannot.
- [ ] All migrations pass locally on `supabase db reset` with the current seed.
