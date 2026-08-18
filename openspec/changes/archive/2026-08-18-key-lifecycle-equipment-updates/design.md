# Design: Key Lifecycle and Equipment Updates

## Technical Approach

Model the physical RFID key lifecycle as an explicit 5-state machine in `rfid_keys.status`; introduce a new `equipment_update` support ticket category that carries a frozen snapshot of keys to activate/disable per equipment plus an installer-facing `.mdb` file; add one atomic `resolve_equipment_update` RPC that flips the snapshot atomically, mints `key_authorizations`, emits `key_events`, and re-runs `recompute_order_status`. Reuses the exact resolve-RPC pattern of `resolve_equipment_installation` (000041) and the CHECK+trigger co-migration discipline established in the `stock_movements` counter incident.

## Architecture Decisions

| Decision | Choice | Alternatives | Rationale |
|---|---|---|---|
| Snapshot storage | Dedicated table `support.equipment_updates` (colocated with `support.tickets`) | Reuse `stock_movements` shape / JSONB column on tickets | Same schema domain as tickets; typed UUID[] snapshot for FK-safe joins; matches proposal §Approach |
| Concurrency model | Release-train: at-most-one open `equipment_update` per equipment (partial unique index) + snapshot frozen at task creation | Live snapshot recomputed at resolve / queue of updates | Matches installer trip semantics; snapshot is contractual; cancel-and-recreate is the escape hatch |
| Stale-key at resolve | Skip silently, emit `key_events` with `event_type='snapshot_skipped'` | Fail-hard, block resolution | Fail-hard would strand installer at site — proposal §D closed |
| Disable flow | Two new RPCs (`request_key_disable`, `cancel_key_disable`) that only touch `rfid_keys.status` + `key_events` | Extend `change_key_status` with new states | `change_key_status` semantics (revoke authorizations) belong to emergency-terminal disables; the new reversible `pending_disable` is a different concept |
| Authorization mint timing | `configure_key_order_item` mints `pending_creation` and skips `key_authorizations` INSERT; auths minted at `resolve_equipment_update` | Extend `key_authorizations_validate` trigger to allow non-active keys | Trigger untouched; preserves invariant "authorization implies key was ready to authorize"; simpler blast radius |
| `recompute_order_status` | **No change required** — verified against 000060: it already derives readiness from `key_authorizations.sync_state='pending_install'` traversed via `order_items.produced_key_id` | Rewrite to derive from `rfid_keys.status` | Under the new timing, `configure_key_order_item` no longer inserts auths at configure time; auths appear only after `equipment_update` resolve. That naturally holds the order in `in_progress` until the installer resolves the update, then flips to `ready_for_pickup` when auths land with `sync_state='installed'`. **Key insight**: the new `resolve_equipment_update` must INSERT auths and immediately set them to `sync_state='installed'` (bypassing pending_install) so `recompute_order_status` sees zero blocking auths. This is legal because the equipment update IS the install act. |
| `.mdb` storage | Private Supabase bucket `equipment-updates-mdb`, path `{ticket_id}/{filename}.mdb`, signed URLs on demand | Public bucket / DB bytea | Private avoids leaking building layout; signed URL is standard for authenticated downloads |
| Disable-cancel guard | New trigger `support.tickets_block_equipment_update_cancel_in_progress` (BEFORE UPDATE OF status) | Application-layer check | State machine consistency requires DB enforcement |

## Data Flow

    Admin: create equipment_update
      → InsertS ticket (category='equipment_update', status='open')
      → Insert support.equipment_updates (snapshot of pending keys)
      → Upload .mdb to bucket at {ticket_id}/{filename}.mdb

    Installer: opens task
      → SELECT ticket + equipment_updates row (RLS: assigned_to_staff_id)
      → GET signed URL for .mdb download

    Installer: resolve
      → RPC resolve_equipment_update(task_id, actor)
         ├─ FOR UPDATE lock ticket + equipment_updates row
         ├─ Validate category, status, actor authorization
         ├─ For each key in keys_to_activate:
         │    ├─ If status='pending_installation': UPDATE → 'active'
         │    │    INSERT key_events (activated)
         │    │    INSERT key_authorizations (sync_state='installed')
         │    └─ Else: INSERT key_events (snapshot_skipped)
         ├─ For each key in keys_to_disable:
         │    ├─ If status='pending_disable': UPDATE → 'disabled'
         │    │    INSERT key_events (disabled)
         │    │    UPDATE existing key_authorizations to 'removed'
         │    └─ Else: INSERT key_events (snapshot_skipped)
         ├─ UPDATE ticket open→in_progress→resolved
         └─ PERFORM recompute_order_status(order_id) for every affected key's order

## Schema Changes

### 1. `rfid_keys.status` CHECK expansion (co-migrated with sync_deactivated_at trigger)

```sql
alter table public.rfid_keys drop constraint rfid_keys_status_check;
alter table public.rfid_keys add constraint rfid_keys_status_check
  check (status in ('pending_creation','pending_installation','active','pending_disable','disabled'));
```

Update `rfid_keys_sync_deactivated_at`: fill `deactivated_at` when transitioning to `disabled` (terminal); leave NULL for all other transitions. `pending_disable → active` clears any stale `deactivated_at`. `rfid_keys_prevent_reassignment` unchanged — no assignment fields touched by lifecycle changes.

### 2. `support.equipment_updates` (new table)

```sql
create table support.equipment_updates (
  id                    uuid        primary key default gen_random_uuid(),
  ticket_id             uuid        not null unique references support.tickets(id) on delete cascade,
  equipment_id          uuid        not null references operations.equipment(id) on delete restrict,
  mdb_storage_path      text        not null,
  keys_to_activate      uuid[]      not null default '{}',  -- rfid_keys.id
  keys_to_disable       uuid[]      not null default '{}',
  created_at            timestamptz not null default now(),
  created_by_staff_id   uuid        references identity.staff(id) on delete set null,
  resolved_at           timestamptz,
  resolved_by_staff_id  uuid        references identity.staff(id) on delete set null,
  constraint equipment_updates_snapshot_nonempty
    check (cardinality(keys_to_activate) + cardinality(keys_to_disable) > 0)
);

-- At most one open update per equipment.
create unique index equipment_updates_one_open_per_equipment_uidx
  on support.equipment_updates (equipment_id)
  where resolved_at is null;

create index equipment_updates_ticket_id_idx on support.equipment_updates (ticket_id);
```

RLS: admin CRUD via `identity.is_admin()`; installer SELECT via `exists(select 1 from support.tickets t where t.id = equipment_updates.ticket_id and t.assigned_to_staff_id = auth.uid())`. No installer INSERT/UPDATE/DELETE — writes flow through RPCs only.

### 3. `support.tickets.category` CHECK (co-migrated with require_equipment_on_resolve trigger and cancel-guard trigger)

Add `'equipment_update'` to the CHECK. Extend `tickets_require_equipment_on_resolve` category set to include `'equipment_update'`. Install new trigger `tickets_block_equipment_update_cancel_in_progress`:

```sql
create or replace function support.tickets_block_equipment_update_cancel_in_progress()
returns trigger language plpgsql as $$
begin
  if new.status = 'cancelled' and old.status = 'in_progress'
     and old.category = 'equipment_update' then
    raise exception 'equipment_update in_progress tickets cannot be cancelled'
      using errcode = 'check_violation';
  end if;
  return new;
end; $$;
```

### 4. `key_events.event_type` CHECK expansion

```sql
alter table public.key_events drop constraint key_events_event_type_check;
alter table public.key_events add constraint key_events_event_type_check
  check (event_type in (
    'activated','deactivated',           -- historical, preserved
    'creation_requested','configured',
    'disable_requested','disable_cancelled','disabled',
    'snapshot_skipped'
  ));

-- Historical mapping: 'deactivated' events remain 'deactivated' (immutable audit).
-- Terminal disables emitted post-migration use 'disabled'. No UPDATE needed.
```

## RPCs

### `resolve_equipment_update(p_task_id uuid, p_actor_staff_id uuid default null) returns uuid`

- SECURITY DEFINER, `set search_path = public, support, operations, identity`
- Preconditions: ticket exists, category='equipment_update', status IN ('open','in_progress'), `equipment_updates` snapshot row exists
- Idempotency: `status='resolved'` raises P0001 (matches 000041)
- Locks: `select ... for update` on `support.tickets`, `support.equipment_updates`, and each `rfid_keys` row
- Transitions: bulk state flips, mint auths (`sync_state='installed'`), emit `key_events`, two-step ticket transition (open→in_progress→resolved) mirroring 000041
- Order recompute: `perform public.recompute_order_status(oi.order_id)` for the distinct `order_id`s reached via each activated key's `order_item_id`
- Errors: `P0001` for missing/invalid/already-resolved; `check_violation` bubbled from triggers
- `grant execute on function public.resolve_equipment_update(uuid, uuid) to authenticated`

### `request_key_disable(p_key_id uuid, p_actor_staff_id uuid default null, p_note text default null) returns void`

- SECURITY DEFINER. Validates `rfid_keys.status='active'`; UPDATE → `pending_disable`; INSERT `key_events (event_type='disable_requested', note, actor)`. Idempotent no-op when already `pending_disable`.

### `cancel_key_disable(p_key_id uuid, p_actor_staff_id uuid default null, p_note text default null) returns void`

- SECURITY DEFINER. Validates `rfid_keys.status='pending_disable'`; UPDATE → `active`; INSERT `key_events (event_type='disable_cancelled', ...)`. Idempotent no-op when already `active`.

### Modified `configure_key_order_item`

- Mint `rfid_keys.status='pending_creation'` (was `'active'`)
- REMOVE the `foreach v_eq_id in array p_equipment_ids loop … insert into operations.key_authorizations` block. Store `p_equipment_ids` NOWHERE — the equipment binding surfaces later when admin creates the `equipment_update`.
- Immediately after inserting the key, emit `key_events (event_type='creation_requested')` and, in the same statement path, UPDATE the key to `pending_installation` + emit `key_events (event_type='configured')`. Rationale: `configure_key_order_item` represents both "created" and "programmed" — both events matter for the audit trail; there is no user-facing gap between them.
- Everything else (stock movements, ticket resolve) unchanged.

### Modified `recompute_order_status`

**No change.** Verified against the current definition (migration 000060): it counts `key_authorizations WHERE sync_state='pending_install'`. Under the new flow, no auths exist between configure and equipment_update resolve → keys count as "assigned" (`produced_key_id NOT NULL`) but `v_unresolved_install` is zero. The order sits at `in_progress`. When `resolve_equipment_update` inserts auths at `sync_state='installed'`, still zero pending → order promotes to `ready_for_pickup`. Add a regression test to lock this contract.

## Storage: `equipment-updates-mdb` bucket

- Private (`public = false`)
- Path scheme: `{ticket_id}/{filename}.mdb`
- Client validation: extension `.mdb`, MIME `application/x-msaccess` (best-effort — browsers vary), max size **50 MB** (Access databases used by Vitalock's Access frontend rarely exceed 10 MB; 50 MB is a comfortable ceiling that still blocks abuse)
- Policies:

```sql
-- admin CRUD
create policy "admin_all_equipment_updates_mdb" on storage.objects
  for all to authenticated
  using (bucket_id = 'equipment-updates-mdb' and identity.is_admin())
  with check (bucket_id = 'equipment-updates-mdb' and identity.is_admin());

-- installer SELECT for assigned tickets
create policy "installer_read_assigned_equipment_updates_mdb" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'equipment-updates-mdb'
    and exists (
      select 1 from support.tickets t
       where t.id::text = split_part(name, '/', 1)
         and t.assigned_to_staff_id = auth.uid()
    )
  );
```

Signed URLs via `supabase.storage.from('equipment-updates-mdb').createSignedUrl(path, 300)` in the installer UI.

## Frontend Architecture

### Admin

| Component/Hook | Kind | Responsibility |
|---|---|---|
| `useEquipmentUpdates(buildingId)` | New hook | List/query equipment_update tickets + joined `equipment_updates` snapshot |
| `useMutateEquipmentUpdate` | New hook | `createEquipmentUpdate({equipment_id, keys_to_activate[], keys_to_disable[], file: File})`: uploads .mdb → inserts ticket + snapshot row in a transactional pair (or a single RPC `create_equipment_update` for atomicity — recommended) |
| `EquipmentUpdateFormSheet` | New sheet | Equipment picker → auto-populates key lists (pending_installation + pending_disable filtered by equipment.building_id); .mdb dropzone; preview of altas/bajas |
| `EquipmentUpdateTaskDetail` | New view | Dual list (altas / bajas) with per-key status badge; download button (signed URL); resolve action (invokes `resolve_equipment_update`) |
| `PendingKeysGuardrailBadge` | New badge | Shows N keys in `pending_installation` or `pending_disable` for an equipment that are NOT in the current open `equipment_update`'s snapshot (or all pending, when none open) |
| `KeyStatusChangeDialog` | Modified | Context-aware: `active → pending_disable` (calls `request_key_disable`); `pending_disable → active` (calls `cancel_key_disable`); reflects new labels. Terminal `disabled` reached only via `resolve_equipment_update` |
| `useMutateKey` | Modified | Add `requestDisable`, `cancelDisable` mutations wrapping the new RPCs; existing `changeStatus` retained for emergency-out-of-flow use (admin-only, still allowed to force terminal `disabled` via `change_key_status`) |
| `useKeys` `KeyRow.status` | Modified | Union expanded to 5 states |
| `KeysTable` `STATUS_LABEL` | Modified | Add labels for 3 new states |
| `useMutateTarea` | Modified | Reject `equipment_update` in generic form; creation only through `EquipmentUpdateFormSheet` |
| `categoryLabels` | Modified | Add `equipment_update` label |
| `useKeyEvents` `event_type` | Modified | Union expanded to 8 event types |

### Installer

| Component/Hook | Kind | Responsibility |
|---|---|---|
| `useAssignedTickets` | Modified | Category union includes `equipment_update` |
| `EquipmentUpdateResolve` (new view) | New | Two collapsible lists (altas / bajas) with key codes; download `.mdb` (signed URL); resolve button → `resolve_equipment_update`; disabled while offline |

## Migration Ordering

Filenames use next-available prefix (last is 20260817000063). Group critical CHECK+trigger pairs in the SAME file per the counter-trigger precedent.

1. `20260818000064_rfid_keys_lifecycle_states.sql` — CHECK expansion + `rfid_keys_sync_deactivated_at` update **together**
2. `20260818000065_key_events_event_type_expansion.sql` — CHECK expansion only (no trigger dependency)
3. `20260818000066_support_equipment_updates_table.sql` — table + partial unique index + RLS policies
4. `20260818000067_tickets_equipment_update_category.sql` — tickets CHECK + `tickets_require_equipment_on_resolve` update + `tickets_block_equipment_update_cancel_in_progress` trigger **together**
5. `20260818000068_configure_key_order_item_pending_creation.sql` — RPC rewrite (mint pending_creation, drop auth insert, add events)
6. `20260818000069_key_disable_lifecycle_rpcs.sql` — `request_key_disable`, `cancel_key_disable`
7. `20260818000070_resolve_equipment_update_rpc.sql` — atomic resolver + `create_equipment_update` helper RPC + GRANTs
8. `20260818000071_equipment_updates_mdb_bucket.sql` — bucket create + storage policies

Migrations 1 and 4 are the CHECK-trigger-together critical pairs. Migrations 5, 6, 7 must run in this order (5 changes mint semantics; 6 is used by tests before 7).

## Testing Strategy

| Layer | What | Approach |
|---|---|---|
| Migration (SQL) | State machine transitions — every legal edge, every rejected edge | Insert fixture keys per state, assert allowed UPDATEs and rejected UPDATEs with expected SQLSTATE |
| Migration (SQL) | `resolve_equipment_update` atomicity | Snapshot with 3 keys (1 mint-happy, 1 stale, 1 to-disable), call RPC once, assert final states + `key_events` rows + `key_authorizations` rows + ticket resolved + `orders.status` recomputed; call twice, assert P0001 |
| Migration (SQL) | Uniqueness | Insert two open `equipment_updates` for same equipment_id, assert second fails on unique index |
| Migration (SQL) | RLS | Two installer accounts + admin: assert installer A sees only own ticket's snapshot, installer B blocked, admin sees all |
| Vitest | `useMutateEquipmentUpdate` | Mock supabase client; assert upload + insert ordering and rollback on either failure |
| Vitest | `KeyStatusChangeDialog` | Assert correct RPC called per source state; disabled state hides toggle |
| Vitest | `PendingKeysGuardrailBadge` | Snapshot exclusion math; zero-badge when everything is in-train |
| Integration (dev DB + seed) | End-to-end train flow | Seed order → configure key → key in `pending_installation` → create equipment_update with .mdb → resolve → assert `orders.status='ready_for_pickup'`, key active, auth `installed` |

## Migration / Rollout

Dev-database-only single-PR rollout per proposal. No production data exists. Rollback = drop new migrations in reverse (071 → 064), git revert UI PR, `supabase db reset`. Rollback SQL sketch:

```sql
-- 071
delete from storage.buckets where id = 'equipment-updates-mdb';
-- 070
drop function public.resolve_equipment_update(uuid, uuid);
drop function public.create_equipment_update(...);
-- 069
drop function public.request_key_disable(uuid, uuid, text);
drop function public.cancel_key_disable(uuid, uuid, text);
-- 068
-- restore configure_key_order_item body from 20260811000040
-- 067
drop trigger tickets_block_equipment_update_cancel_in_progress on support.tickets;
-- restore tickets_require_equipment_on_resolve from 20260811000052
-- alter table support.tickets drop constraint tickets_category_check; add prior CHECK
-- 066
drop table support.equipment_updates;
-- 065
-- alter table public.key_events drop constraint key_events_event_type_check; add prior CHECK
-- 064
update public.rfid_keys set status = 'active'
 where status in ('pending_creation','pending_installation','pending_disable');
-- restore rfid_keys_sync_deactivated_at from 20260806000003
-- alter table public.rfid_keys drop constraint rfid_keys_status_check; add prior CHECK
```

## Open Questions

None. Every question raised in exploration/proposal is closed and reflected above.
