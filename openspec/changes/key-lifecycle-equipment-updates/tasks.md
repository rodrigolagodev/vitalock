# Tasks: Key Lifecycle and Equipment Updates

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~1 800–2 200 (SQL migrations ~500, TS/TSX ~1 300–1 700) |
| 800-line review budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | Single PR with `size:exception` (delivery strategy: `single-pr`) |
| Delivery strategy | single-pr |
| Chain strategy | size-exception |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: size-exception
400-line budget risk: High

> **Note**: Delivery strategy is `single-pr`. The estimated diff exceeds the 800-line review budget.
> A maintainer-approved `size:exception` is required before `sdd-apply` begins.
> Rationale: this is a dev-only single PR touching tightly coupled migrations, RPCs, and matching
> frontend wiring; splitting would leave the app in a broken intermediate state.

### Suggested Work Units

| Unit | Goal | PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|----|----------------------|-----------------|-------------------|
| W1–W2 | DB foundation (CHECKs, triggers, equipment_updates table) | 1 (size:exception) | `supabase db reset && psql … test_064.sql test_065.sql test_066.sql` | `supabase db reset` | Drop migrations 064–066 in reverse |
| W3–W6 | RPCs (configure rework, disable RPCs, resolve, cancel guard) | 1 (size:exception) | `psql … test_067.sql test_068.sql test_069.sql test_070.sql` | `supabase db reset` | Drop migrations 067–070, restore 000040 body |
| W7–W8 | Storage bucket + RLS | 1 (size:exception) | `psql … test_071.sql` | Supabase Studio bucket check | Drop migration 071, delete bucket |
| W9 | Supabase types + RPC wrappers | 1 (size:exception) | `pnpm --filter @vitalock/supabase typecheck` | N/A — generated code | Revert generated files |
| W10–W13 | Frontend (admin + installer UI) | 1 (size:exception) | `pnpm test -- --reporter=verbose` | Storybook / dev server smoke | Revert component files |
| W14 | Verification pass | 1 (size:exception) | Full suite: `supabase db reset && pnpm test && pnpm typecheck` | Seed walkthrough end-to-end | N/A — read-only verification |

---

## W1 — DB Foundation: rfid_keys CHECK + sync_deactivated_at trigger, key_events CHECK

### T-01 — RED: test_064 — status CHECK and deactivated_at trigger
- [x] Write `supabase/migrations/test_064_rfid_keys_status_check.sql`:
  verify `pending_creation`, `pending_installation`, `active`, `pending_disable`, `disabled` are accepted;
  verify `revoked` is rejected (CHECK violation); verify `disabled` sets `deactivated_at`; verify `pending_disable → active` clears `deactivated_at`.
  [key-lifecycle:R1, key-lifecycle:R2-deactivated_at]

### T-02 — GREEN: migration 064 — rfid_keys CHECK + sync_deactivated_at
- [x] Write `supabase/migrations/20260818000064_rfid_keys_status_check_and_sync_trigger.sql`:
  ALTER the `rfid_keys.status` CHECK to 5 states; UPDATE existing `rfid_keys_sync_deactivated_at` trigger body to set `deactivated_at` on `disabled` and clear it on `pending_disable → active`.
  [key-lifecycle:R1, key-lifecycle:R2-deactivated_at]

### T-03 — RED: test_065 — key_events event_type CHECK
- [x] Write `supabase/migrations/test_065_key_events_event_type.sql`:
  insert rows with each new event_type (`creation_requested`, `configured`, `disable_requested`, `disable_cancelled`, `snapshot_skipped`); verify existing `activated`/`deactivated` still accepted; verify an unknown value is rejected.
  [key-lifecycle:R3-audit]

### T-04 — GREEN: migration 065 — key_events event_type CHECK
- [x] Write `supabase/migrations/20260818000065_key_events_event_type_check.sql`:
  ALTER `key_events.event_type` CHECK to include all new values while preserving historical ones.
  [key-lifecycle:R3-audit]

---

## W2 — equipment_updates Table + Partial Unique Index

### T-05 — RED: test_066 — equipment_updates schema and uniqueness
- [x] Write `supabase/migrations/test_066_equipment_updates_table.sql`:
  insert a valid row; verify partial unique index blocks a second `open` task for same equipment; verify resolved task allows a new insert; verify cardinality CHECK blocks empty arrays; verify RLS: admin sees all, installer A cannot see installer B's row, installer direct UPDATE is rejected.
  [equipment-updates:R4-uniqueness, equipment-updates:R6-rls]

### T-06 — GREEN: migration 066 — support.equipment_updates + RLS + partial unique
- [x] Write `supabase/migrations/20260818000066_support_equipment_updates.sql`:
  CREATE `support.equipment_updates` with all columns (id, ticket_id UNIQUE FK, equipment_id FK, mdb_storage_path, keys_to_activate uuid[], keys_to_disable uuid[], created_at, created_by_staff_id, resolved_at, resolved_by_staff_id); CHECK cardinality > 0; CREATE partial unique index on `equipment_id WHERE resolved_at IS NULL`; ENABLE RLS; admin policy via `is_admin()`; installer SELECT policy via `tickets.assigned_to_staff_id = auth.uid()`.
  [equipment-updates:R4-uniqueness, equipment-updates:R6-rls]

---

## W3 — rfid_key_intended_equipment + configure_key_order_item Rework

### T-07 — RED: test_068 — configure_key_order_item new behavior
- [x] Write `supabase/migrations/test_068_configure_key_order_item.sql`:
  call RPC with equipment IDs; assert key created as `pending_creation`; assert NO `key_authorizations` row exists; assert `rfid_key_intended_equipment` junction rows created for each equipment ID; assert `key_configuration` ticket auto-resolved advances key to `pending_installation`; assert `order_item_id` immutability trigger blocks re-configure; assert stock movement emitted when `product_id` present.
  [key-config:R1, key-lifecycle:R2-pending_creation, equipment-updates:R1]

### T-08 — GREEN: migration 068 — rfid_key_intended_equipment + configure_key_order_item rewrite
- [x] Write `supabase/migrations/20260818000068_configure_key_order_item_rework.sql`:
  CREATE `public.rfid_key_intended_equipment (rfid_key_id, equipment_id, created_at)` junction table with FKs; REWRITE `configure_key_order_item` RPC body: INSERT `rfid_keys` with `status='pending_creation'`, UPDATE `order_items`, optional stock movement, populate `rfid_key_intended_equipment` from `p_equipment_ids`, resolve `key_configuration` ticket (key advances to `pending_installation`); DROP the inline `key_authorizations` INSERT loop.
  [key-config:R1, key-lifecycle:R2-pending_creation]

---

## W4 — Reversible Disable RPCs

### T-09 — RED: test_069 — request_key_disable and cancel_key_disable
- [x] Write `supabase/migrations/test_069_disable_rpcs.sql`:
  call `request_key_disable` on active key → assert `pending_disable` + `disable_requested` event; call `cancel_key_disable` → assert `active` + `disable_cancelled` event + `deactivated_at` cleared; assert idempotency on double call; assert `request_key_disable` on non-active key is rejected; assert `disabled` key cannot be further transitioned.
  [key-lifecycle:R2-active→pending_disable, key-lifecycle:R2-pending_disable→active]

### T-10 — GREEN: migration 069 — request_key_disable + cancel_key_disable
- [x] Write `supabase/migrations/20260818000069_disable_rpcs.sql`:
  CREATE `request_key_disable(p_key_id, p_actor, p_note)` SECURITY DEFINER: validate `active` state, UPDATE status to `pending_disable`, INSERT `key_events` `disable_requested`; CREATE `cancel_key_disable(p_key_id, p_actor, p_note)` SECURITY DEFINER: validate `pending_disable` state, UPDATE status to `active`, INSERT `key_events` `disable_cancelled`; GRANT execute to authenticated.
  [key-lifecycle:R2-active→pending_disable, key-lifecycle:R2-pending_disable→active]

---

## W5 — tickets CHECK + cancel guard + tickets_require_equipment_on_resolve Patch

### T-11 — RED: test_067 — tickets category CHECK + cancel guard + require_equipment
- [x] Write `supabase/migrations/test_067_tickets_equipment_update_category.sql`:
  insert ticket with `equipment_update` → accepted; insert with `unknown_type` → rejected; open `equipment_update` → cancel succeeds; `in_progress equipment_update` → cancel rejected (trigger); `in_progress maintenance` → cancel succeeds; assert `tickets_require_equipment_on_resolve` still fires for `equipment_update` category.
  [tickets:R1-category, tickets:R2-cancel-guard]

### T-12 — GREEN: migration 067 — tickets category CHECK + require_equipment patch + cancel guard trigger
- [x] Write `supabase/migrations/20260818000067_tickets_equipment_update_category.sql`:
  ALTER `support.tickets.category` CHECK to add `equipment_update`; UPDATE `tickets_require_equipment_on_resolve` trigger/function to handle `equipment_update`; CREATE `tickets_block_equipment_update_cancel_in_progress` BEFORE UPDATE trigger that raises exception when `NEW.status='cancelled'` AND `OLD.status='in_progress'` AND `OLD.category='equipment_update'`.
  [tickets:R1-category, tickets:R2-cancel-guard]

---

## W5b — resolve_equipment_update + create_equipment_update (the atomic core)

### T-13 — RED: test_070 — resolve_equipment_update atomicity
- [x] Write `supabase/migrations/test_070_resolve_equipment_update.sql`:
  seed order → configure → create equipment_update task (3-key snapshot: K1 `pending_installation`, K2 `pending_disable`, K3 stale `active`); call RPC; assert K1 → `active` + `key_authorizations` row with `sync_state='installed'`; assert K2 → `disabled`; assert K3 unchanged + `snapshot_skipped` event; assert ticket `resolved`; assert `recompute_order_status` ran and order is `ready_for_pickup`; assert partial failure rolls back completely; assert uniqueness violation on second in-flight task.
  [equipment-updates:R3-atomic, equipment-updates:R4-uniqueness, key-lifecycle:R4-stale-skip, ordenes:R1-ready_for_pickup]

### T-14 — GREEN: migration 070 — resolve_equipment_update + create_equipment_update + grants
- [x] Write `supabase/migrations/20260818000070_resolve_equipment_update.sql`:
  CREATE `resolve_equipment_update(p_task_id uuid, p_actor_staff_id uuid DEFAULT NULL)` SECURITY DEFINER: FOR UPDATE lock ticket + snapshot + each key; validate category=`equipment_update` + status validation; open→in_progress transition; bulk flip `pending_installation → active` + INSERT `key_authorizations` (`sync_state='pending_install'` INSERT then UPDATE to `installed` in same tx); bulk flip `pending_disable → disabled`; skip stale keys + emit `snapshot_skipped` events; emit `key_events` for each processed key; mark ticket `resolved`; PERFORM `recompute_order_status` per distinct order_id; CREATE `create_equipment_update(...)` helper for atomic ticket + snapshot insert; GRANT execute to authenticated.
  [equipment-updates:R3-atomic, key-lifecycle:R2-pending_installation→active, key-lifecycle:R2-pending_disable→disabled]

---

## W7 — Storage Bucket + RLS

### T-15 — RED: test_071 — storage bucket policies
- [x] Write `supabase/migrations/test_071_storage_bucket.sql`:
  assert bucket `equipment-updates-mdb` is private; assert unauthenticated SELECT on `storage.objects` for this bucket is rejected; assert admin can INSERT/SELECT/DELETE; assert installer can SELECT only paths matching their assigned ticket_id; assert path pattern `{ticket_id}/{filename}.mdb` is enforced by policy prefix check.
  [equipment-updates:R2-mdb-storage, equipment-updates:R6-rls]

### T-16 — GREEN: migration 071 — equipment-updates-mdb bucket + storage policies
- [x] Write `supabase/migrations/20260818000071_storage_bucket_equipment_updates.sql`:
  INSERT into `storage.buckets` (`equipment-updates-mdb`, public=false, file_size_limit=52428800); CREATE RLS policies on `storage.objects`: admin full CRUD via `is_admin()`; installer SELECT policy keyed on path prefix matching `tickets.assigned_to_staff_id = auth.uid()`.
  [equipment-updates:R2-mdb-storage, equipment-updates:R6-rls]

---

## W9 — Supabase Types Regeneration + RPC Wrappers

### T-17 — Regenerate Supabase types
- [x] Run `supabase gen types typescript --local > packages/supabase/src/database.types.ts` and commit the updated generated file. Verify new tables (`equipment_updates`, `rfid_key_intended_equipment`), new RPCs, and updated CHECKs appear in the type output.
  [all specs — type safety prerequisite for W10–W13]

### T-18 — RPC wrapper: resolveEquipmentUpdate
- [x] Create `packages/supabase/src/rpc/resolveEquipmentUpdate.ts`: typed wrapper calling `supabase.rpc('resolve_equipment_update', { p_task_id, p_actor_staff_id })` returning `{ data, error }`.
  [equipment-updates:R3-atomic]

### T-19 — RPC wrappers: requestKeyDisable + cancelKeyDisable
- [x] Create `packages/supabase/src/rpc/requestKeyDisable.ts` and `cancelKeyDisable.ts`: typed wrappers for the two disable RPCs.
  [key-lifecycle:R2-active→pending_disable, key-lifecycle:R2-pending_disable→active]

### T-20 — RPC wrapper: createEquipmentUpdate
- [x] Create `packages/supabase/src/rpc/createEquipmentUpdate.ts`: typed wrapper for the admin creation RPC including snapshot population.
  [equipment-updates:R5-admin-creation]

---

## W10 — Admin UI: Key States

### T-21 — RED: KeyStatusChangeDialog dispatches per source state
- [x] Write Vitest test in `apps/admin/src/components/keys/__tests__/KeyStatusChangeDialog.test.tsx`: assert dialog shows "Solicitar baja" action when key is `active`; assert dialog shows "Cancelar baja" when key is `pending_disable`; assert correct RPC wrapper is called for each action.
  [key-lifecycle:R2-active→pending_disable, key-lifecycle:R2-pending_disable→active]

### T-22 — GREEN: Update useKeys + KeysTable for 5 states
- [x] Update `apps/admin/src/hooks/useKeys.ts`: add `pending_creation`, `pending_installation`, `pending_disable` to status query and STATUS_LABEL map. Update `apps/admin/src/components/keys/KeysTable.tsx`: render status badge for all 5 states.
  [key-lifecycle:R1]

### T-23 — GREEN: KeyStatusChangeDialog — context-aware disable actions
- [x] Update `apps/admin/src/components/keys/KeyStatusChangeDialog.tsx`: render "Solicitar baja" button calling `requestKeyDisable` when source state is `active`; render "Cancelar baja" button calling `cancelKeyDisable` when source state is `pending_disable`; update `useMutateKey.ts` to expose `requestDisable` and `cancelDisable` mutations.
  [key-lifecycle:R2-active→pending_disable, key-lifecycle:R2-pending_disable→active]

### T-24 — Update KeyDetailDialog for new states
- [x] Update `apps/admin/src/components/keys/KeyDetailDialog.tsx`: display `pending_disable` state with disable-cancel action; show key_events with new event_type labels; surface `pending_creation` and `pending_installation` as informational states.
  [key-lifecycle:R1, key-lifecycle:R3-audit]

---

## W11 — Admin UI: equipment_update Create + Detail

### T-25 — RED: useMutateEquipmentUpdate upload+rollback
- [x] Write Vitest test in `apps/admin/src/hooks/__tests__/useMutateEquipmentUpdate.test.ts`: assert storage upload occurs before RPC call; assert on RPC error the uploaded file is deleted (rollback); assert 50 MB client-side validation blocks files over the cap; assert mutation returns error state on failure.
  [equipment-updates:R2-mdb-storage, equipment-updates:R5-admin-creation]

### T-26 — GREEN: useEquipmentUpdates query hook
- [x] Create `apps/admin/src/hooks/useEquipmentUpdates.ts`: query `support.equipment_updates` joined with ticket + equipment for a given equipment_id; return snapshot lists and task status.
  [equipment-updates:R5-admin-creation, equipment-updates:R6-rls]

### T-27 — GREEN: useMutateEquipmentUpdate mutation hook
- [x] Create `apps/admin/src/hooks/useMutateEquipmentUpdate.ts`: orchestrate storage upload to `equipment-updates-mdb/{ticket_id}/{filename}.mdb` (client-side 50 MB guard + server-side length check), then call `createEquipmentUpdate` RPC; on error delete orphaned storage object.
  [equipment-updates:R2-mdb-storage, equipment-updates:R5-admin-creation]

### T-28 — GREEN: EquipmentUpdateFormSheet component
- [x] Create `apps/admin/src/components/equipment/EquipmentUpdateFormSheet.tsx`: equipment-context sheet with keys-to-activate list (all `pending_installation` on equipment), keys-to-disable list (all `pending_disable`), `.mdb` file input with 50 MB validation, submit calls `useMutateEquipmentUpdate`; block submit if no file attached.
  [equipment-updates:R5-admin-creation]

### T-29 — GREEN: EquipmentUpdateTaskDetail component
- [x] Create `apps/admin/src/components/equipment/EquipmentUpdateTaskDetail.tsx`: admin view of an equipment_update task; dual snapshot lists (activate / disable); download button calling signed URL; task status badge.
  [equipment-updates:R5-admin-creation, equipment-updates:R3-atomic]

### T-30 — Update useMutateTarea to reject equipment_update category
- [x] Update `apps/admin/src/hooks/useMutateTarea.ts`: guard at the top of the generic create/update mutation to throw if `category === 'equipment_update'`; update `categoryLabels` map to include `equipment_update` label for display-only use.
  [equipment-updates:R1-no-generic-form]

---

## W12 — Admin UI: Guardrail Badge on Equipment Detail

### T-31 — RED: PendingKeysGuardrailBadge math
- [ ] Write Vitest test in `apps/admin/src/components/equipment/__tests__/PendingKeysGuardrailBadge.test.tsx`: assert badge renders with count=1 when one `pending_installation` key is outside active train; assert badge hidden when all pending keys are covered by an active train; assert badge absent when no pending keys.
  [equipment-admin:R1-guardrail-badge]

### T-32 — GREEN: PendingKeysGuardrailBadge component
- [ ] Create `apps/admin/src/components/equipment/PendingKeysGuardrailBadge.tsx`: compute count of keys in `pending_installation` or `pending_disable` for the equipment that do NOT appear in any `open`/`in_progress` equipment_update snapshot (`keys_to_activate` or `keys_to_disable` arrays); render badge with count when > 0.
  [equipment-admin:R1-guardrail-badge]

### T-33 — GREEN: Equipment detail page integration
- [ ] Update the equipment detail page component: render `PendingKeysGuardrailBadge`; add "Crear tarea de actualización" button that opens `EquipmentUpdateFormSheet`; disable button when active train exists (query from `useEquipmentUpdates`).
  [equipment-admin:R2-creation-entry-point]

---

## W13 — Installer UI: equipment_update Resolve Flow

### T-34 — GREEN: useAssignedTickets category union
- [ ] Update `apps/installer/src/hooks/useAssignedTickets.ts`: include `equipment_update` in the ticket category union returned by the query; ensure `equipment_update` tickets are included in the Trabajos sub-section data.
  [installer-home:R1-worklist]

### T-35 — GREEN: EquipmentUpdateResolveCard in installer worklist
- [ ] Create `apps/installer/src/components/EquipmentUpdateResolveCard.tsx`: renders as distinct card type in Trabajos section; NOT included in batch-resolve toolbar selection; shows task status + equipment name; on tap opens `EquipmentUpdateResolveDetail`.
  [installer-home:R1-worklist, installer-home:R2-task-detail]

### T-36 — GREEN: EquipmentUpdateResolveDetail view
- [ ] Create `apps/installer/src/views/EquipmentUpdateResolveDetail.tsx`: display keys-to-activate list, keys-to-disable list from frozen snapshot; download button calling `supabase.storage.from('equipment-updates-mdb').createSignedUrl(path, 300)`; "Resolver" button with confirmation dialog calling `resolveEquipmentUpdate(task_id, actor)`; on success invalidate worklist query + show toast; on partial skip surface warning with skipped key list.
  [installer-home:R2-task-detail, key-lifecycle:R4-stale-skip]

---

## W14 — Verification Pass

### T-37 — Local migration run + seed walkthrough
- [ ] Run `supabase db reset` with all 8 migrations applied; execute all 8 `test_*.sql` files; run seed and manually walk through: configure key item → create equipment_update task → assign to installer → resolve → assert order `ready_for_pickup` and key `active`.
  [all specs — success criteria]

### T-38 — pnpm typecheck + test suite
- [ ] Run `pnpm --filter @vitalock/supabase typecheck`; run `pnpm test` across admin and installer apps; assert all Vitest tests pass (T-01 through T-31 RED tests must turn GREEN before this task runs).
  [all specs — success criteria]

### T-39 — Success-criteria walkthrough
- [ ] Verify each spec scenario manually or via test: 5-state CHECK enforced; disable/cancel round-trip works; equipment_update uniqueness blocks second concurrent task; atomic resolution promotes order; stale key yields `snapshot_skipped` event and does not abort; installer sees task in worklist and can download + resolve; `PendingKeysGuardrailBadge` count is correct; generic TareaFormSheet does not expose `equipment_update`.
  [all specs — success criteria]
