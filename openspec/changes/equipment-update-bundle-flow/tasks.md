# equipment-update-bundle-flow — Implementation Tasks

**Spec**: openspec/changes/equipment-update-bundle-flow/spec.md
**Design**: openspec/changes/equipment-update-bundle-flow/design.md
**Delivery**: single-pr (size:exception documented — estimated ~920 lines vs 800 budget)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~920 (SQL migration ~250, hooks ~200, admin UI ~330, installer UI ~140) |
| 400-line budget risk | High |
| Chained PRs recommended | No |
| Suggested split | Single PR — four surfaces are only coherent bundled |
| Delivery strategy | single-pr |
| Chain strategy | size-exception |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 (all) | DB fix + pgTAP + hooks + admin UI + installer UI | single-pr | `pnpm test:sql && pnpm --filter @vitalock/admin test && pnpm --filter @vitalock/installer test` | local Supabase + admin dev server | `git revert` removes migration + all new files atomically |

## Test commands (verified from repo scripts)

- pgTAP: `pnpm --filter @vitalock/supabase test:sql`
- Admin Vitest: `pnpm --filter @vitalock/admin test`
- Installer Vitest: `pnpm --filter @vitalock/installer test`
- Typecheck: `pnpm typecheck`

---

## Slice 1 — DB migration + pgTAP (RED first)

**Satisfies**: Req 1 — `resolve_equipment_update` advances `key_order_items.status` and triggers 4-lane recompute.

- [x] T-1-1 (RED): In `supabase/tests-sql/test_092_resolve_rpcs_dual_fk.sql` scenario C, extend the DO-block after the `rfid_keys.status = 'active'` assert with two new assertions: `key_order_items.status = 'installed'` (SELECT WHERE produced_key_id = v_key_id) AND `key_orders.status = 'ready_for_pickup'` (SELECT WHERE id = v_key_order_id). Update `SELECT plan(5)` to `SELECT plan(7)` (two added assertions become two new `ok()` checks via explicit SELECT). Marker: `FAIL 092-C: key_order_items not advanced` / `FAIL 092-C: key_order not ready_for_pickup`.
- [x] T-1-2 (RED): Create `supabase/tests-sql/test_095_resolve_equipment_update_advances_key_order_items.sql` with `SELECT plan(5)`. Scenario 095-1: new-path single key → `key_order_items.status='installed'`, order → `ready_for_pickup`. Scenario 095-2: legacy key (`order_item_id IS NOT NULL`) → existing behavior unchanged (key → active, no `key_order_items` row touched). Scenario 095-3: skip scenario (key already active) → RPC skips, `key_order_items.status` unchanged. Scenario 095-4: NULL `keys_to_activate` → no `key_order_items` updated. Scenario 095-5: key with no `key_order_items` row (`produced_key_id` absent) → no error, key still activates.
- [x] T-1-3 (RED): Create `supabase/tests-sql/test_096_resolve_equipment_update_multi_item_order.sql` with `SELECT plan(3)`. Scenario 096-1: two-item order, first equipment_update resolves one key → order stays `pending_installation`. Scenario 096-2: second equipment_update resolves last key → order advances to `ready_for_pickup`. Scenario 096-3: three-item order, two equipment_updates resolve two keys → order still `pending_installation`.
- [x] T-1-4 (verify RED): Run `pnpm --filter @vitalock/supabase test:sql` — T-1-1 through T-1-3 assertions MUST fail; existing tests 093–094 MUST pass.
- [x] T-1-5 (GREEN): Create migration `supabase/migrations/20260827000104_resolve_equipment_update_advance_key_order_items.sql`. `CREATE OR REPLACE FUNCTION public.resolve_equipment_update(...)`. In the activate loop, after `UPDATE public.rfid_keys SET status = 'active' WHERE id = v_key_id`, add: `SELECT id, status INTO v_koi_id, v_koi_status FROM public.key_order_items WHERE produced_key_id = v_key_id; IF FOUND AND v_koi_status = 'configured' THEN UPDATE public.key_order_items SET status = 'installed' WHERE id = v_koi_id; END IF;` — trigger fires `recompute_key_order_status` automatically. Declare `v_koi_id uuid; v_koi_status text;` in DECLARE block. Preserve legacy `order_items` branch verbatim. Document lock order in header: `rfid_keys → key_order_items → key_orders (via trigger)`.
- [x] T-1-6 (verify GREEN): Run `pnpm --filter @vitalock/supabase test:sql` — all 31+ tests including extended 092-C, new 095, new 096 MUST pass.

---

## Slice 2 — `usePendingKeysForEquipment` hook + Vitest (RED first)

**Satisfies**: Req 2 — 3-group pending-keys query scoped to a single equipment.

- [x] T-2-1 (RED): Create `apps/admin/src/hooks/__tests__/usePendingKeysForEquipment.test.ts`. Mock `supabase` client (established pattern from existing admin hook tests). Assert: (a) hook returns `{ toActivate: [...], toDisable: [...], unchanged: [...] }` shape; (b) `toActivate` contains keys with `status='pending_installation'` linked via `rfid_key_intended_equipment`; (c) `toDisable` contains keys with `status='pending_disable'` in `key_authorizations` for this equipment; (d) `unchanged` contains keys with `status='active'` and `sync_state='installed'` and `removed_at=null`; (e) empty arrays returned when no keys match.
- [x] T-2-2 (verify RED): Run `pnpm --filter @vitalock/admin test` — T-2-1 MUST fail (hook does not exist).
- [x] T-2-3 (GREEN): Create `apps/admin/src/hooks/usePendingKeysForEquipment.ts`. Three sequential PostgREST queries (cross-schema batch pattern — no UNION ALL via PostgREST). Return `{ toActivate: PendingKey[], toDisable: PendingKey[], unchanged: PendingKey[] }`. Type `PendingKey = { id: string; rfid_code: string; unit_number: string | null }`. Use `useQuery` with key `['pending-keys-for-equipment', equipmentId]`.
- [x] T-2-4 (verify GREEN): Run `pnpm --filter @vitalock/admin test` — T-2-1 MUST pass.

---

## Slice 3 — `useEquipmentUpdateHistory` hook + Vitest (RED first)

**Satisfies**: Req 3 — all resolved equipment_updates for a given equipment, ordered newest-first.

- [x] T-3-1 (RED): Create `apps/admin/src/hooks/__tests__/useEquipmentUpdateHistory.test.ts`. Assert: (a) hook returns array of `EquipmentUpdateHistoryRow` ordered by `created_at DESC`; (b) each row includes `id`, `created_at`, `resolved_at`, `resolved_by_staff_id`, `mdb_storage_path`, `keys_to_activate`, `keys_to_disable`; (c) empty array when no rows.
- [x] T-3-2 (verify RED): Run `pnpm --filter @vitalock/admin test` — T-3-1 MUST fail.
- [x] T-3-3 (GREEN): Create `apps/admin/src/hooks/useEquipmentUpdateHistory.ts`. Composes on `useEquipmentUpdates` — fetches `support.equipment_updates` filtered by `equipment_id`, ordered by `created_at DESC`. Type `EquipmentUpdateHistoryRow`. Export `useEquipmentUpdateHistory(equipmentId: string)`.
- [x] T-3-4 (verify GREEN): Run `pnpm --filter @vitalock/admin test` — T-3-1 MUST pass.

---

## Slice 4 — Admin snapshot panel on `EquipoDetailPage`

**Satisfies**: Req 4 — per-equipment 3-group key snapshot (A activar / A dar de baja / Sin cambios) with Tabs layout.

- [x] T-4-1: Create `apps/admin/src/components/equipment/EquipmentKeySnapshotPanel.tsx`. Accepts `equipmentId: string`. Calls `usePendingKeysForEquipment(equipmentId)`. Renders `<Tabs>` with three tabs: "A activar" (count badge), "A dar de baja" (count badge), "Sin cambios" (count badge). Each tab renders a table with columns: RFID code, Unidad. Loading and empty states included. Rioplatense ES copy.
- [x] T-4-2: In `apps/admin/src/routes/equipos/EquipoDetailPage.tsx`, insert `<Section title="Llaves pendientes de actualización">` block between "Órdenes técnicas asociadas" (line ~349) and "Historial" (line ~392). Import `EquipmentKeySnapshotPanel`. Pass `equipment.id` as `equipmentId`.
- [x] T-4-3 (verify): Run `pnpm typecheck` (no Vitest for page-level — no test currently exists; type check is the gate).

---

## Slice 5 — Admin history panel on `EquipoDetailPage`

**Satisfies**: Req 5 — full list of resolved equipment_updates with `DataTable` and per-row MDB download.

- [x] T-5-1: Create `apps/admin/src/components/equipment/EquipmentUpdateHistoryPanel.tsx`. Accepts `equipmentId: string`. Calls `useEquipmentUpdateHistory(equipmentId)`. Renders `DataTable` (from `@vitalock/ui`) with columns: Fecha, Resuelto por (staff name via batch lookup), Llaves activadas (count), Llaves desactivadas (count), Descargar MDB (button). MDB download: generate signed URL from bucket `equipment-updates-mdb`, TTL 300s (matches `EquipmentUpdateResolveDetail` pattern). No CSV export. Rioplatense ES copy.
- [x] T-5-2: In `apps/admin/src/routes/equipos/EquipoDetailPage.tsx`, insert `<Section title="Historial de actualizaciones de firmware">` block between the new snapshot section (T-4-2) and the existing "Historial" section. Import `EquipmentUpdateHistoryPanel`. Pass `equipment.id`.
- [x] T-5-3 (verify): Run `pnpm typecheck`.

---

## Slice 6 — Installer rollback section on `EquipmentUpdateResolveDetail`

**Satisfies**: Req 6 — collapsible prior-updates section with MDB download per row; mandatory warning banner.

- [x] T-6-1 (RED): Extend `apps/installer/src/components/work/__tests__/EquipmentUpdateResolveDetail.test.tsx`. Add test: renders `<details>` collapsible "Actualizaciones anteriores" when `equipmentUpdateSnapshot.equipment_id` is present and prior updates exist. Add test: renders warning banner in Rioplatense ES ("Atención: restaurar una actualización anterior..."). Add test: each prior update row has a download button.
- [x] T-6-2 (verify RED): Run `pnpm --filter @vitalock/installer test` — new assertions MUST fail.
- [x] T-6-3: Extend `useAssignedTickets` select query in `apps/installer/src/hooks/useAssignedTickets.ts` (line ~58 select block) — add `equipment_id` to the `support.tickets` select. Update the `AssignedTicket` type and the `rows` inline type to include `equipment_id: string | null`. Pass it through to `EquipmentUpdateSnapshot` or separately to the component.
- [x] T-6-4 (GREEN): In `apps/installer/src/components/work/EquipmentUpdateResolveDetail.tsx`, add collapsible section at bottom of `DialogContent` above `DialogFooter`. Uses native `<details>/<summary>` (no new dependency). Summary label: "Actualizaciones anteriores". Fetches prior `equipment_updates` rows for `equipment_id` via a new inline query (supabase, `support.equipment_updates`, filter by `equipment_id`, `resolved_at IS NOT NULL`, order by `created_at DESC`). Renders warning banner (Rioplatense ES). Each row: date + download button (signed URL from `equipment-updates-mdb`, TTL 300s). Skips render if `equipment_id` is null.
- [x] T-6-5 (verify GREEN): Run `pnpm --filter @vitalock/installer test` — all T-6-1 assertions MUST pass.
- [x] T-6-6 (verify GREEN): Run `pnpm typecheck`.

---

## Final verification

- [x] T-7-1: Run full suite `pnpm --filter @vitalock/supabase test:sql` — all pgTAP tests pass including 092-C, 095, 096.
- [x] T-7-2: Run `pnpm --filter @vitalock/admin test` — all admin Vitest pass.
- [x] T-7-3: Run `pnpm --filter @vitalock/installer test` — all installer Vitest pass.
- [x] T-7-4: Run `pnpm typecheck` — zero type errors.
