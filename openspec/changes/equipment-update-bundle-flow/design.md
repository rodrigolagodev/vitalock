# SDD Design: equipment-update-bundle-flow

## 0. Purpose

This document decides HOW the requirements from `spec.md` are implemented. It is
architectural, not procedural — the slice-by-slice tasks are defined in `tasks.md`.

## 1. Architecture at a glance

Four surfaces, one PR. Each surface has a narrow contract with the DB layer; the
DB is the single point where correctness of the 4-lane state machine is enforced.

```
┌────────────────────────────────────────────────────────────────────────────┐
│                       resolve_equipment_update RPC                         │
│      (single migration; adds key_order_items branch, keeps legacy)         │
└──────────────┬─────────────────────────────────────────────────────────────┘
               │  writes key_order_items.status='installed'
               │  → fires key_order_items_recompute_order_status_trigger
               │  → advances key_orders through 4-lane machine
               ▼
┌─────────────────────────┐  ┌─────────────────────────┐  ┌───────────────────┐
│  Admin snapshot panel   │  │  Admin history panel    │  │  Installer        │
│  (per-equipment 3-group)│  │  (all past equipment_   │  │  rollback         │
│                         │  │  updates for equipment) │  │  section          │
│  usePendingKeysFor      │  │  useEquipmentUpdate     │  │  (reuses          │
│  Equipment(equipmentId) │  │  History(equipmentId)   │  │  useEquipment     │
│                         │  │                         │  │  Updates,         │
│  → PostgREST (3 seq     │  │  → PostgREST + batched  │  │  filters resolved)│
│    queries) + client    │  │    useStaffByIds        │  │                   │
│    zip                  │  │                         │  │                   │
└─────────────────────────┘  └─────────────────────────┘  └───────────────────┘
```

## 2. Architectural decisions (ADR-style)

### ADR-1: Single migration bundling RPC replacement AND test-data seeding

**Decision**: One migration file `20260827000104_resolve_equipment_update_advance_key_order_items.sql`.
It (a) `create or replace`s the `public.resolve_equipment_update` function and
(b) nothing else — no test-data seeding.

**Rationale**:
- Migrations must be idempotent on prod. Seeding test data inside a schema
  migration is a foot-gun (multi-tenant prod, dev with fixtures, CI with pgTAP
  fixtures all diverge).
- The pgTAP tests (test_092_C extension, test_095, test_096) own their own
  fixture SETUP blocks — the established convention in `supabase/tests-sql/`.
- Keeping the migration surface small also minimises rollback complexity: a
  simple `create or replace` back to the prior body is the entire down-plan.

**Rejected alternatives**:
- *Split RPC and test seeding* — no seeding was ever needed at migration level;
  moot.
- *Multiple migrations (one per concern)* — the RPC has exactly one concern.
  Splitting would add noise.

### ADR-2: RPC code structure — parallel branches, NOT a unified helper

**Decision**: Inside `resolve_equipment_update`'s per-key loop, keep the legacy
`order_items` branch and add the new `key_order_items` branch in parallel. No
extracted helper function.

**Rationale**:
- The two branches operate on different tables with different join paths
  (`rfid_keys.order_item_id` vs. `key_order_items.produced_key_id`) and different
  `recompute_*` targets (`recompute_order_status` vs. trigger-driven
  `recompute_key_order_status`). Unifying them would obscure exactly the thing a
  reviewer needs to see: which path each row takes.
- Backward compat is explicit: legacy rows with a non-null `order_item_id` still
  hit the old branch untouched.
- A helper adds ceremony for zero reuse (no other RPC needs this pairing today).

**Code shape** (inside the existing activate loop, after
`update public.rfid_keys set status='active' … returning order_item_id`):

```sql
-- Legacy path: rfid_keys.order_item_id → order_items → recompute_order_status
if v_order_item_id is not null then
  select order_id into v_order_id
    from public.order_items where id = v_order_item_id;
  if v_order_id is not null then
    perform public.recompute_order_status(v_order_id);
  end if;
end if;

-- New path: key_order_items.produced_key_id = v_key_id
-- The AFTER UPDATE OF status trigger fires recompute_key_order_status.
update public.key_order_items
   set status = 'installed'
 where produced_key_id = v_key_id
   and status = 'configured';
-- No explicit recompute call — the trigger owns it.
```

**Rejected alternatives**:
- *Replace legacy with unified helper* — breaks backward compat.
- *Explicit `perform recompute_key_order_status(...)` after the UPDATE* — double-
  fires the recompute (once from trigger, once explicit). The trigger is the
  contract.

### ADR-3: Lock ordering — order-level, then keys, then items

**Decision**: The RPC acquires locks in this order per iteration:
1. `select … for update` on the `key_orders` row (implicit via trigger cascade —
   trigger `recompute_key_order_status` reads/writes `key_orders`).
2. `update public.rfid_keys` (already present — acquires row lock on `rfid_keys`).
3. `update public.key_order_items` (new — acquires row lock on `key_order_items`).

Since the loop processes ONE key at a time and the trigger fires per UPDATE, the
effective order per key is: `rfid_keys` → `key_order_items` → `key_orders` (via
trigger). This is consistent across every RPC touching this graph
(`configure_key_order_item`, `mark_key_order_item_installed`,
`resolve_equipment_update`).

**Rationale**:
- All three RPCs that write `key_order_items.status` follow the same walk-down
  ordering (key → item → order) → no deadlock cycle.
- `resolve_equipment_update` batches N keys per call. Within one transaction,
  Postgres holds each row lock until commit; releasing between iterations is
  impossible. That is fine because all RPCs use the same order.

**Documented explicitly** in the migration comment header so future changes do
not silently reorder.

**Rejected alternatives**:
- *Explicit `select … for update` on `key_orders` at the top of the loop* — the
  trigger already covers this; adding it opens the door to lock upgrade deadlock
  if a concurrent `cancel_key_order` happens to be running.

### ADR-4: Snapshot query — three sequential PostgREST calls, client-side zip

**Decision**: `usePendingKeysForEquipment(equipmentId)` issues three sequential
PostgREST queries and zips them into a `{ toActivate, toDisable, unchanged }`
shape in the hook. NO SECURITY DEFINER RPC, NO view.

**Rationale**:
- Rejected the SECURITY DEFINER function alternative because:
  1. It bypasses RLS, forcing us to re-implement equipment-scoped visibility
     inside the function body (admin-only + org-scoped) — every future RLS change
     must be mirrored there.
  2. It couples a UI concern (three-group presentation) to the DB. If admin
     later wants a fourth group (e.g. "reserved for another equipment"), a new
     migration is required.
  3. Testability was cited as a reason for the RPC — but the pgTAP fixture cost
     for a SECURITY DEFINER function that only ADMINS see is higher than a
     Vitest with mocked supabase, which we need anyway for the UI shape.
- Three PostgREST calls is acceptable at the observed scale (< 50 keys per
  equipment, one admin at a time). `useQuery` batches them behind one hook and
  React Query caches per-equipment.
- The proposal already noted: "a server view can be added later without contract
  change." That escape hatch remains available if load ever demands it.

**Query shape**:
- Query 1 — `to_activate`: `rfid_keys` join `rfid_key_intended_equipment`
  filtered by `equipment_id` and `status='pending_installation'`.
- Query 2 — `to_disable`: `rfid_keys` join `operations.key_authorizations`
  filtered by `equipment_id`, `status='pending_disable'`, `sync_state='installed'`.
- Query 3 — `unchanged`: `rfid_keys` join `operations.key_authorizations`
  filtered by `equipment_id`, `status='active'`, `sync_state='installed'`,
  `removed_at is null`.

Cross-schema joins to `units.number` follow the same pattern already used in
`useAssignedTickets` — batch fetch and map, avoiding PostgREST embed failures
on cross-schema FKs.

**Rejected alternatives**:
- *SECURITY DEFINER `public.pending_keys_for_equipment(uuid)`* — see rationale.
- *SQL view* — a view still needs an RPC or PostgREST wrapper to accept the
  parameter; adds a migration for no isolation benefit.
- *Single PostgREST UNION* — PostgREST does not support UNION in a single call.
  Confirmed.

### ADR-5: History hook — new `useEquipmentUpdateHistory`, do NOT extend `useEquipmentUpdates`

**Decision**: Add a new hook `useEquipmentUpdateHistory(equipmentId)` in
`apps/admin/src/hooks/useEquipmentUpdateHistory.ts`. Keep `useEquipmentUpdates`
unchanged.

**Rationale**:
- `useEquipmentUpdates` is already used by `EquipmentUpdatePanel` (2 callers).
  Its consumers care only about the **active train** (the panel filters to
  `open|in_progress`). Repurposing it for history would leak history-only concerns
  (staff name resolution, resolved-only filtering) into every existing caller.
- The two hooks share the exact same base query. To avoid duplication, the
  history hook composes on top: it re-uses `useEquipmentUpdates(equipmentId)`
  (already cached), then layers `useStaffByIds` for the resolved-by names.
  Zero duplicated fetch code, zero shared mutability.
- This mirrors the established pattern: `useStaff` (roster) vs `useStaffByIds`
  (batch lookup for a specific set) — one hook per query intent.

**Contract**:
```typescript
useEquipmentUpdateHistory(equipmentId: string | undefined): UseQueryResult<{
  rows: (EquipmentUpdateRow & { resolved_by_name: string | null })[];
}>
```

Internally: calls `useEquipmentUpdates(equipmentId)`, then extracts
`resolved_by_staff_id` set → `useStaffByIds(set)` → maps names onto rows.
Returns a `useQuery`-shaped result derived via `useMemo` so callers get the same
`isLoading`/`isError` ergonomics.

**Rejected alternatives**:
- *Extend `useEquipmentUpdates` return* — leaks history-only fields onto the
  panel caller; larger blast radius.
- *Duplicate the base query* — two Realtime subscriptions and two caches for
  the same underlying data.

### ADR-6: Admin UI layout on `EquipoDetailPage`

**Decision**: Two new `<Section>` blocks added after "Órdenes técnicas asociadas"
and before "Historial" (the existing synthesized timeline).

**Section order (top-down)**:
1. ...existing sections through "Llaves autorizadas"...
2. ...existing "Órdenes técnicas asociadas"...
3. **NEW** — "Estado de llaves pendientes" (snapshot, three tabs)
4. **NEW** — "Historial de actualizaciones" (past equipment_updates)
5. ...existing "Historial" (synthesized timeline)...

**Snapshot layout**: Three **tabs** (not collapsibles) using `<Tabs>` from
`@vitalock/ui`, with counts in each tab label:
- "A activar (N)" · "A dar de baja (N)" · "Sin cambios (N)"

Each tab renders a compact list of `RFID · Unidad`. When a group is empty, show
"Ninguna" muted text.

**Rationale for tabs over collapsibles**: The three groups are mutually
exclusive views of the same equipment; tabs make the exclusivity visual and
reduce vertical scroll. Collapsibles imply "expand to see more" which is wrong
here — every row is small.

**History layout**: `DataTable` from `@vitalock/ui`, columns:
- Fecha (created_at, formatted es-AR)
- Estado (ticket_status badge)
- Altas (count of `keys_to_activate`)
- Bajas (count of `keys_to_disable`)
- Resuelta (resolved_at, formatted, or "—")
- Por (resolved_by_name, or "—")
- Acción ("Descargar .mdb" button per row)

**MDB export in history**: Per-row "Descargar .mdb" button ONLY.
No copy-to-clipboard, no CSV download for the whole table. Rationale:
- The MDB is the artifact of value; CSV of metadata is a UI-tourist feature
  with zero use case identified in exploration.
- One button per row keeps the UI mechanical and matches the installer's
  existing pattern (`EquipmentUpdateResolveDetail.handleDownload`).

**Rejected alternatives**:
- *Three collapsible sections* — vertical noise.
- *CSV download* — no identified caller.
- *Combined single "Actividad" panel* — snapshot (present state) and history
  (past events) are semantically different; combining them is confusing.

### ADR-7: Installer rollback UI

**Decision**: A collapsible `<details>` block at the bottom of
`EquipmentUpdateResolveDetail`'s `DialogContent`, above `DialogFooter`.

**Layout**:
```
<details>
  <summary>Actualizaciones previas de este equipo (N)</summary>
  ⚠️  Warning banner:
      "Cargar un archivo anterior desincronizará la base de datos hasta el
       próximo update correctivo."
  <list>
    - Fecha · Altas N · Bajas N · [Descargar .mdb]
    - Fecha · Altas N · Bajas N · [Descargar .mdb]
    ...
  </list>
</details>
```

**Data source**: A new hook `usePreviousEquipmentUpdates(equipmentId, excludeTaskId)`
in `apps/installer/src/hooks/`. Fetches all **resolved** equipment_updates for
the equipment, excludes the current task. Uses the same `support.equipment_updates`
query shape as `useEquipmentUpdates` but filters `resolved_at is not null` and
`id != excludeTaskId`.

**Note**: `EquipmentUpdateResolveDetail` receives an `AssignedTicket`, not an
`equipmentId` directly. `equipment_updates.equipment_id` lives on the snapshot
row, not on the ticket. We source it from the snapshot the installer already
sees (it is fetched into `equipmentUpdateSnapshot` in `useAssignedTickets`, but
`equipment_id` is not currently selected there — the fetch in
`useAssignedTickets` needs `equipment_id` added to its select list to avoid a
second round trip). This is a **one-line change** to
`apps/installer/src/hooks/useAssignedTickets.ts` inside its `.select(...)`.

**Signed URL**: `supabase.storage.from('equipment-updates-mdb').createSignedUrl(path, 300)`
— matching the existing pattern in `handleDownload`. (Bucket name is hyphenated,
not `equipment_updates` — confirmed in existing code.)

**Rationale**:
- Collapsed by default: rollback is exceptional; the primary CTA is "Resolver".
- Warning banner appears only when the collapsible is open — no unnecessary
  friction on the happy path.
- Native `<details>` avoids importing a heavier `Accordion` component.

**Rejected alternatives**:
- *Separate section above snapshot* — competes visually with primary CTA.
- *Modal-in-modal* — dialog nesting is a known accessibility hazard.

### ADR-8: Rollback semantics — Option A confirmed, DB-side is a no-op

**Decision**: Rollback is **out-of-DB**. The UI provides signed-URL downloads of
historical `.mdb` files only. NO new RPC. NO inverse update logic. NO DB state
mutation.

**UI mandatory warning** (installer + admin history rows that offer the MDB):
> "Cargar un archivo anterior desincronizará la base de datos hasta el próximo
> update correctivo."

The admin history panel shows the same warning as a tooltip on each row's
download button OR (chosen for clarity) a single banner above the history table:
"La descarga de un archivo `.mdb` histórico es solo consultiva. Aplicarlo en el
dispositivo desincronizará la base de datos hasta el próximo update correctivo."

**Rationale**: Directly per proposal Section "Rollback Option A". The
exploration analysed Option B (inverse RPC) and found it introduces edge-case
validation (rolled-back keys may have moved states since) beyond this bundle's
scope.

### ADR-9: Test data strategy

**Decision**:
- Extend `test_092_C` in-place (existing fixtures reused). This is the RED step.
- **New pgTAP**:
  - `test_095_resolve_equipment_update_advances_key_order_items.sql` — builds
    ITS OWN minimal new-path fixture (one key_order, one item, one equipment,
    one key). Does NOT reuse test_092 or test_113 fixtures because those
    fixtures test different things and importing them creates coupling.
  - `test_096_resolve_equipment_update_multi_item_order.sql` — builds ITS OWN
    fixture with one key_order, THREE items across TWO equipments. Resolves
    equipment_update for equipment A; asserts item A → installed, items B/C →
    still configured, order → still pending_installation. Then resolves for
    equipment B; asserts order → ready_for_pickup.
- **Vitest**:
  - `apps/admin/src/hooks/__tests__/usePendingKeysForEquipment.test.ts` —
    mocks `supabase` per the established pattern in
    `useEquipmentUpdates.test.ts` (from Engram — this file is referenced in the
    original task brief; if it does not exist, mirror the pattern in
    `useMutateEquipmentUpdate.test.ts` and `useStaffByIds.test.ts`).
  - `apps/admin/src/hooks/__tests__/useEquipmentUpdateHistory.test.ts` — mocks
    both `useEquipmentUpdates` return and `useStaffByIds` return; asserts
    `resolved_by_name` is projected onto each row.

**Rationale for fresh fixtures per test**: pgTAP tests in this repo have zero
shared fixture files; each `.sql` file is self-contained. Sharing fixtures across
files creates order-of-execution dependencies that break parallelism.

### ADR-10: i18n / copy

**Decision**: All new UI strings are Rioplatense Spanish, matching existing
admin/installer conventions (`Crear tarea de actualización`, `Descargar .mdb`,
`Sin llaves a activar.`). No i18n framework — inline strings only.

Copy inventory (canonical wording, subject to per-slice refinement):
- Snapshot section title: "Estado de llaves pendientes"
- Snapshot tabs: "A activar (N)" · "A dar de baja (N)" · "Sin cambios (N)"
- Snapshot empty: "Ninguna"
- History section title: "Historial de actualizaciones"
- History empty: "Sin actualizaciones registradas para este equipo."
- History download: "Descargar .mdb"
- History banner: "La descarga de un archivo `.mdb` histórico es solo consultiva.
  Aplicarlo en el dispositivo desincronizará la base de datos hasta el próximo
  update correctivo."
- Installer rollback summary: "Actualizaciones previas de este equipo (N)"
- Installer rollback warning: "Cargar un archivo anterior desincronizará la base
  de datos hasta el próximo update correctivo."

## 3. Component and data flow map

### Files affected (structural)

| File | Change kind |
|---|---|
| `supabase/migrations/20260827000104_resolve_equipment_update_advance_key_order_items.sql` | NEW |
| `supabase/tests-sql/test_092_resolve_rpcs_dual_fk.sql` | EXTEND scenario C |
| `supabase/tests-sql/test_095_resolve_equipment_update_advances_key_order_items.sql` | NEW |
| `supabase/tests-sql/test_096_resolve_equipment_update_multi_item_order.sql` | NEW |
| `apps/admin/src/hooks/usePendingKeysForEquipment.ts` | NEW |
| `apps/admin/src/hooks/__tests__/usePendingKeysForEquipment.test.ts` | NEW |
| `apps/admin/src/hooks/useEquipmentUpdateHistory.ts` | NEW |
| `apps/admin/src/hooks/__tests__/useEquipmentUpdateHistory.test.ts` | NEW |
| `apps/admin/src/components/equipment/EquipmentPendingKeysSnapshotPanel.tsx` | NEW |
| `apps/admin/src/components/equipment/EquipmentUpdateHistoryPanel.tsx` | NEW |
| `apps/admin/src/routes/equipos/EquipoDetailPage.tsx` | EXTEND (mount two new panels) |
| `apps/installer/src/hooks/usePreviousEquipmentUpdates.ts` | NEW |
| `apps/installer/src/hooks/useAssignedTickets.ts` | EXTEND (add `equipment_id` to snapshot select) |
| `apps/installer/src/components/work/EquipmentUpdateResolveDetail.tsx` | EXTEND (add rollback section) |

### Data flow

**Snapshot query flow** (per admin page load):
```
usePendingKeysForEquipment(equipmentId)
  ├─ queryFn (react-query cache key: ['admin','pending-keys',equipmentId])
  │   ├─ Q1: rfid_keys ⋈ rfid_key_intended_equipment WHERE eqId, pending_installation
  │   ├─ Q2: rfid_keys ⋈ operations.key_authorizations WHERE eqId, pending_disable, installed
  │   ├─ Q3: rfid_keys ⋈ operations.key_authorizations WHERE eqId, active, installed
  │   ├─ collect unit_ids, batch-fetch units.number → Map
  │   └─ zip: { toActivate, toDisable, unchanged }
  └─ returns { data, isLoading, isError }
```

**History flow**:
```
useEquipmentUpdateHistory(equipmentId)
  ├─ useEquipmentUpdates(equipmentId)  → cached list
  ├─ ids = rows.map(r => r.resolved_by_staff_id).filter(Boolean)
  ├─ useStaffByIds(ids)                → cached Map<id, {full_name}>
  └─ memo: rows.map(r => ({ ...r, resolved_by_name: map.get(r.resolved_by_staff_id)?.full_name ?? null }))
```

**Resolve → advance flow (already correct after ADR-2)**:
```
resolve_equipment_update(taskId, ticketId)
  loop over keys_to_activate:
    UPDATE rfid_keys.status = 'active' RETURNING order_item_id
    IF legacy → recompute_order_status(...)
    UPDATE key_order_items.status = 'installed' WHERE produced_key_id = key
      └─ TRIGGER fires recompute_key_order_status(order_id)
          └─ advances to ready_for_pickup when all items installed
  loop over keys_to_disable: (unchanged)
```

## 4. Slice breakdown (input to `sdd-tasks`)

Six slices, ordered by dependency. Line estimates are rough — tasks phase will formalise.

| # | Slice | Est. lines | Test file(s) written FIRST (RED) | Notes |
|---|---|---|---|---|
| 1 | DB migration + pgTAP (RED-first) | ~250 | `test_092_C` extension, `test_095`, `test_096` | Migration only lands AFTER all three pgTAP fail; then migration turns them green. |
| 2 | Backend hook `usePendingKeysForEquipment` | ~120 | `usePendingKeysForEquipment.test.ts` | Vitest first. Depends on nothing else. |
| 3 | Backend hook `useEquipmentUpdateHistory` | ~80 | `useEquipmentUpdateHistory.test.ts` | Vitest first. Depends on existing `useEquipmentUpdates` + `useStaffByIds`. |
| 4 | Admin UI: snapshot panel | ~150 | Consumed by Vitest for the hook; component-level test optional | `EquipmentPendingKeysSnapshotPanel.tsx` + mount in `EquipoDetailPage`. |
| 5 | Admin UI: history panel | ~180 | Same as (4) — hook is already covered | `EquipmentUpdateHistoryPanel.tsx` (DataTable) + mount in `EquipoDetailPage`. Includes rollback warning banner. |
| 6 | Installer UI: rollback section | ~140 | Extend existing `EquipmentUpdateResolveDetail.test.tsx` | Adds `<details>` collapsible + warning + list. Requires one-line `useAssignedTickets` extension. |

**Total estimate**: ~920 lines. This exceeds the 800-line budget by ~120 lines
(15%). Slices 4 and 5 combined are ~330 lines of admin UI; if `sdd-tasks`
forecasts confirm the overage, raise `size:exception` per the proposal delivery
note. Do NOT split the bundle — the four surfaces are only meaningful together.

## 5. Test file assignments (per slice)

| Slice | Test file | Purpose | Location |
|---|---|---|---|
| 1 | `test_092_resolve_rpcs_dual_fk.sql` (extend C) | Assert `key_order_items.status='installed'` and `key_orders.status='ready_for_pickup'` after resolve on new-path fixture | `supabase/tests-sql/` |
| 1 | `test_095_resolve_equipment_update_advances_key_order_items.sql` | Single-item new-path advancement | `supabase/tests-sql/` |
| 1 | `test_096_resolve_equipment_update_multi_item_order.sql` | Multi-item partial advancement across 2 equipments | `supabase/tests-sql/` |
| 2 | `usePendingKeysForEquipment.test.ts` | 3-group shape from mocked supabase | `apps/admin/src/hooks/__tests__/` |
| 3 | `useEquipmentUpdateHistory.test.ts` | `resolved_by_name` projection from mocked useEquipmentUpdates + useStaffByIds | `apps/admin/src/hooks/__tests__/` |
| 4 | (rely on hook test) | — | — |
| 5 | (rely on hook test) | — | — |
| 6 | `EquipmentUpdateResolveDetail.test.tsx` (extend) | Rollback collapsible renders warning + list; download button calls createSignedUrl | `apps/installer/src/components/work/__tests__/` |

## 6. Rollback plan (if migration breaks pgTAP mid-apply)

If the migration lands and the pgTAP suite goes red for a NON-target test (i.e.
regression on a test we did not extend):

1. **Roll forward, not back**: the migration is `create or replace`, so a fix is
   a follow-up migration `20260827000105_<fix>.sql` that re-issues the function
   body with the correction. Do NOT `drop function` — signature preservation is
   critical (the RPC is called from `useResolveEquipmentUpdate`).
2. **Preserve legacy branch integrity**: if the failing test is on the legacy
   `order_items` path, the fix is to leave the legacy branch verbatim (per
   ADR-2) — do not touch it in the corrective migration.
3. **Fixture drift**: if new pgTAP (`test_095`/`test_096`) reveals a fixture
   assumption we did not anticipate, the corrective is to the test fixture only;
   the RPC contract is authoritative.
4. **Local rollback for CI**: `supabase db reset` (already the standard CI
   command per `supabase/README.md` convention) re-applies migrations from
   scratch; no manual DB surgery.

If the migration itself is unrunnable (syntax error caught by `supabase db push`
before pgTAP): the migration file is deleted from the branch — no follow-up
needed, since it never applied. This is why we keep the migration to one file:
the atomic unit of rollback is the file.

## 7. Architectural risks and open assumptions

| Risk / assumption | Impact | Mitigation |
|---|---|---|
| PostgREST cross-schema embed rejects `units` from `public.rfid_keys` join | Snapshot Q1/Q2/Q3 need a fallback | Follow `useAssignedTickets` batch-fetch pattern (already the established convention) |
| `equipment_id` not currently selected in `useAssignedTickets` snapshot fetch | Installer rollback section has no equipmentId to query | ADR-7: one-line extension to the `.select(...)` in `useAssignedTickets` |
| Storage bucket name assumption (`equipment-updates-mdb` vs `equipment_updates`) | Signed URL fails silently | Confirmed from existing code — bucket is hyphenated `equipment-updates-mdb`. All new download paths use the same string |
| `DataTable` from `@vitalock/ui` supports our column shape | History panel implementation | Confirmed — same component powers `EquipmentTable` with per-row actions |
| React Query cache key collision between `useEquipmentUpdates` and `useEquipmentUpdateHistory` | Stale data | New hook does NOT create a second base cache — it composes; distinct query keys used only if we ever separate them |
| Trigger `key_order_items_recompute_order_status_trigger` semantics for partial multi-item orders | test_096 could fail if trigger does not handle partial | Exploration confirms 4-lane machine handles partial correctly; test_096 is designed to exercise this exactly |

## 8. Explicit non-decisions

The following are outside this design's scope and MUST NOT be introduced during
apply:
- Modifying the `recompute_key_order_status` function (4-lane machine).
- Modifying `mark_key_order_item_installed` or its callers.
- Adding an inverse `equipment_update` RPC (Option B rollback).
- Adding columns to `support.equipment_updates`.
- Introducing a cross-equipment batch UI.
- Introducing an i18n framework.
- Adding realtime subscriptions to any of the new hooks (existing
  `useEquipmentUpdates` has none; the history hook composes on top and inherits
  that — invalidation flows through the `useResolveEquipmentUpdate` mutation
  callbacks already in place).

## 9. Ready for `sdd-tasks`

This design is complete. The tasks phase should produce a work-item list
grouped by slice (§4), each slice starting with the failing test (§5), and
budget guarded per §4's line estimate. If the tasks phase forecasts >800
authored lines, raise `size:exception` — do not split the bundle.
