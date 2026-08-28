---
name: active-key-transfer
title: Active Key Transfer & Authorization Sync
kind: cross-cutting
actors: [system, installer]
covers_requirements:
  - equipment-admin#replace-equipment-transfers-authorizations
  - equipment-updates#atomic-key-batch-toggle
  - key-lifecycle#authorization-sync-states
related_rpcs:
  - operations.replace_equipment
  - resolve_equipment_update
related_tables:
  - operations.key_authorizations
  - operations.equipment
  - public.rfid_keys
covering_tests:
  pgtap:
    - supabase/tests-sql/test_066_equipment_updates_table.sql
    - supabase/tests-sql/test_092_resolve_rpcs_dual_fk.sql
    - supabase/tests-sql/test_119_technical_order_replacement_equipment.sql
    - supabase/tests-sql/test_120_two_step_configure_resolve.sql
  vitest: []
last_verified: 2026-08-27
---

# Active Key Transfer & Authorization Sync

## Purpose

Two very different flows produce a "transfer of active keys":

1. **Equipment replacement** — the whole authorization set on the old
   equipment moves to the new equipment atomically. Consumers should
   not notice a swap.
2. **Equipment update** — a batch of individual keys is toggled ON
   or OFF for a single existing equipment. This is the
   admin-orchestrated equivalent of "give these people access; revoke
   those".

Both go through `operations.key_authorizations` — the join table
between `rfid_keys` and `operations.equipment` that carries a
`sync_state` field mirroring the physical device state.

## The `sync_state` domain

`operations.key_authorizations.sync_state` values
(verify against `supabase/migrations/*key_authorizations*`):

| Sync state | Meaning |
|---|---|
| `pending_install` | Authorization exists in DB, not yet on device |
| `installed` | Physically present on the device |
| `pending_removal` | Marked for removal, not yet gone from device |
| `removed` | Gone from device, retained in DB for audit |

Transitions are guarded by `key_authorizations_validate` — the trigger
forces INSERTs to `pending_install` (never directly to `installed`),
and rejects illegal transitions.

## Flow A — Equipment replacement transfer

Triggered by `resolve_equipment_replacement` → calls
`operations.replace_equipment` with `p_activate_keys_directly=true`
(default in the two-step resolve flow).

### Steps (from
`supabase/migrations/20260826000103_technical_ticket_two_step_configure_resolve.sql:76`)

1. Snapshot the currently `installed` authorizations on the OLD
   equipment into a temp table (line 110-116). Must happen **before**
   the next step because the trigger that fires next will close them.
2. UPDATE old equipment to `status='dead'`. This fires
   `equipment_close_authorizations_on_dead`, which transitions
   `installed → pending_removal → removed` on the old device's
   authorizations. From the DB's point of view, the old equipment now
   has zero installed authorizations.
3. INSERT the new equipment (`status='active'`,
   `replaces_equipment_id=<old>`).
4. INSERT one new authorization on the new equipment per snapshotted
   key. `key_authorizations_validate` forces
   `sync_state='pending_install'`.
5. Because `p_activate_keys_directly=true`, immediately UPDATE the
   new authorizations to `sync_state='installed'` (line 144-149).
   `installed_by_staff_id` set to the resolving staff.

**Net effect for a customer's key**: it was `installed` on old, now
`installed` on new. Same `rfid_keys` row. No visible interruption in
access. No `rfid_keys.status` change.

The `p_activate_keys_directly` flag exists because the operator model
in Vitalock is: **the installer's physical device sync IS the install
act**. There is no separate "pending_install → installed" step; the
same trip that replaces the equipment also syncs its DB.

## Flow B — Equipment update batch toggle

Triggered by `resolve_equipment_update` (see
[[equipment-update-ticket]]). This flow does NOT transfer between
equipments — it toggles keys on ONE equipment.

### For each key in `keys_to_activate`:

- Requires `rfid_keys.status='pending_installation'`.
- Advances key → `active`.
- INSERT `key_authorization` (sync_state defaults to
  `pending_install` via validate trigger).
- Immediately UPDATE to `sync_state='installed'`. Same rationale as
  replacement.
- Emit `key_events(activated)`.

### For each key in `keys_to_disable`:

- Requires `rfid_keys.status='pending_disable'`.
- Advances key → `disabled`.
- Locate the current `installed` authorization on this equipment,
  advance `installed → pending_removal → removed`.
- Emit `key_events(disabled)`.

### Skip semantics

If a snapshot key is not in the expected precursor state (someone
mutated it between snapshot and resolve), the RPC does NOT abort —
it appends the key to `skipped_key_ids` and emits a
`snapshot_skipped` event. This is a deliberate operator-in-the-field
optimization.

## Concurrency

Both flows lock rows with `FOR UPDATE`. The reservation-level
concurrency invariant is that only ONE flow can hold the write lock
on a given equipment at a time. For the update flow, the snapshot is
locked at task-level (`equipment_updates` row), so two admins queuing
back-to-back updates on the same equipment serialize naturally.

## Cross-cutting effects

- **RFID key lifecycle** — this is the primary transition path for
  `pending_installation → active` and `pending_disable → disabled`.
- **`key_events` audit trail** — every transition emits an event
  with the actor id.
- **Order recompute** — the update flow calls the legacy
  `recompute_order_status` if the key is linked to a legacy
  `order_items` row (line 116 of the update RPC).

## Error paths & guards

| Trigger | Guard | Effect |
|---|---|---|
| `replace_equipment` when old is already `dead` | Check line 103 | Raises |
| Direct INSERT into `key_authorizations` with `sync_state != pending_install` | `key_authorizations_validate` trigger | Rejected |
| Illegal `sync_state` transition | Trigger | Rejected |
| Update trying to activate a key not in `pending_installation` | Non-fatal skip | Logged in `skipped_key_ids` |
| Concurrent updates on the same equipment | `FOR UPDATE` row lock | Serialize |

## Known gaps

1. **The immediate `pending_install → installed` UPDATE relies on
   operator claim**. If the RPC succeeds but the installer's device
   sync silently failed on the ground, the DB and physical device
   drift. There is no reconciliation loop today. Consider a
   confirmation step where the installer re-scans keys to prove
   they made it onto the device.
2. **`snapshot_skipped` is a signal that needs monitoring**. If it
   fires often, admins are creating snapshots faster than
   installations can consume them — indicating stale data. No
   dashboard exists.

## QA checklist

Equipment replacement:
- [ ] Setup: 1 old equipment with 3 keys, all
      `authorizations.sync_state='installed'`.
- [ ] Trigger `resolve_equipment_replacement` (via ticket resolve
      or directly). Verify:
  - Old equipment `status='dead'`.
  - 3 old authorizations `sync_state='removed'`.
  - New equipment `status='active'`,
    `replaces_equipment_id=<old>`.
  - 3 new authorizations on new equipment,
    `sync_state='installed'`.
  - No `rfid_keys.status` changed.
  - No `key_events` for the keys (transfer is not a state change).

Equipment update — activate:
- [ ] Setup: 1 equipment, 2 keys in `pending_installation`.
- [ ] Trigger `resolve_equipment_update` with both keys in
      `keys_to_activate`. Verify:
  - Both keys → `status='active'`.
  - 2 new authorizations on the equipment,
    `sync_state='installed'`.
  - 2 `key_events` `event_type='activated'`.

Equipment update — skip:
- [ ] Same setup but flip one of the keys to `disabled` before
      resolving. Resolve → verify:
  - The stale key stays `disabled` (unchanged).
  - Skipped list contains its id.
  - `snapshot_skipped` event emitted.
  - Other key still activates normally.

## Related flows

- [[equipment-replacement-ticket]] — primary consumer of
  `replace_equipment`.
- [[equipment-update-ticket]] — primary consumer of the batch
  toggle path.
- [[key-order-lifecycle]] — the upstream flow that produces keys in
  `pending_installation`.
