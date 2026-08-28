# SDD Proposal: equipment-update-bundle-flow

## Intent

Today, when an installer resolves an `equipment_update` for a new-path key order (produced via `configure_key_order_item`), the `resolve_equipment_update` RPC activates the RFID key but never advances the `key_order_items` row to `installed`. As a result, the parent `key_orders` row is stuck in `pending_installation` and never reaches `ready_for_pickup` — breaking the 4-lane state machine for every new-path order routed through the equipment-update flow. Admins have no in-app view of what keys are pending on a given equipment before dispatching the installer, and no way to consult past equipment updates for that same equipment when something goes wrong on-site.

This change bundles the DB correctness fix with two admin surfaces (pre-dispatch snapshot + historical audit) and one installer surface (previous-MDB re-download for physical rollback) so that the equipment-update workflow becomes coherent end-to-end: correct state advancement in the DB, informed dispatch in admin, and a manual recovery lane for the installer.

## In-scope

- **Backend**:
  - New migration rewriting `resolve_equipment_update` to look up `key_order_items` by `produced_key_id` for each activated key and update its status to `installed` (letting the existing `key_order_items_recompute_order_status_trigger` fire `recompute_key_order_status`). Legacy `order_items` branch preserved for backward compatibility.
- **Admin UI**:
  - New hook `usePendingKeysForEquipment(equipmentId)` returning three groups (to_activate / to_disable / unchanged) via PostgREST, scoped by `rfid_key_intended_equipment` and `key_authorizations`.
  - Per-equipment snapshot section in `EquipoDetailPage` showing the three groups (replacing/supplementing the building-wide `allKeys` filter currently in `EquipmentUpdatePanel`).
  - Historical panel in `EquipoDetailPage` listing all past `support.equipment_updates` rows for that equipment (created_at DESC), each with an MDB download button using existing `mdb_storage_path`.
- **Installer UI**:
  - Rollback / previous-updates collapsible section in `EquipmentUpdateResolveDetail` listing prior equipment_updates for the same equipment, each offering an MDB download.
- **Tests**:
  - Extend `supabase/tests-sql/test_092_resolve_rpcs_dual_fk.sql` scenario C to assert `key_order_items.status = 'installed'` and `key_orders.status = 'ready_for_pickup'` after resolve.
  - New pgTAP `test_095_resolve_equipment_update_advances_key_order_items.sql` for single-item new-path advancement.
  - New pgTAP `test_096_resolve_equipment_update_multi_item_order.sql` covering partial advancement across a multi-item order.
  - New Vitest `apps/admin/src/hooks/__tests__/usePendingKeysForEquipment.test.ts` asserting the 3-group shape.

## Out-of-scope (NON-goals)

- No changes to the 4-lane state machine (`recompute_key_order_status`).
- No changes to the pickup flow or `mark_key_order_item_installed` RPC signature.
- No new "inverse equipment_update" RPC (Option B rollback is explicitly deferred).
- No DB write, no state reversal, and no automatic device re-sync as part of rollback — the installer downloads the historical `.mdb` and physically syncs it out-of-band.
- No removal of the legacy `order_items` branch inside `resolve_equipment_update`.
- No expansion of `support.equipment_updates` schema — the table already carries every column the history panel needs.
- No cross-equipment or cross-building batch UI.

## Actors affected

- **admin**: gains a per-equipment pre-dispatch snapshot (three groups: to_activate / to_disable / unchanged) on the equipment detail page and a full historical audit of past equipment updates with MDB re-download.
- **installer**: gains a rollback surface inside the resolve screen listing prior equipment updates for the same equipment, each with an MDB download link for manual device restoration.
- **system**: `resolve_equipment_update` now writes to `key_order_items.status`, which fires the existing `key_order_items_recompute_order_status_trigger` and advances the parent `key_orders` row through the 4-lane machine. `mark_key_order_item_installed` remains untouched.

## Success criteria

- After `resolve_equipment_update` runs against a new-path order, `key_order_items.status = 'installed'` for every key activated and, when every item across the order is installed, `key_orders.status = 'ready_for_pickup'`.
- Extended `test_092_resolve_rpcs_dual_fk.sql` scenario C and the two new pgTAP tests (`test_095`, `test_096`) pass.
- Existing pgTAP suite remains green (no regression on the legacy `order_items` path or the pickup flow).
- Admin can open an equipment detail page and see (a) the current three-group snapshot for that equipment and (b) every past equipment update for that equipment with a working MDB download link.
- Installer can open the resolve screen and see prior equipment updates for the same equipment with working MDB download links.
- `usePendingKeysForEquipment` Vitest returns the three-group shape from mocked Supabase data.

## Constraints (from exploration)

- Do NOT modify the 4-lane state machine (`recompute_key_order_status`).
- Do NOT touch the pickup flow or `mark_key_order_item_installed` RPC.
- Preserve the legacy `order_items` branch in `resolve_equipment_update` for backward compatibility (add the new `key_order_items` branch alongside it, do not replace).
- The pending-keys snapshot MUST scope by `rfid_key_intended_equipment` (not the building-wide `allKeys` list already in `EquipmentUpdatePanel`).
- Keep the existing pgTAP suite green; extending `test_092_C` is the intentional RED step.

## Risks accepted

- **Transaction size**: `resolve_equipment_update` will issue N extra UPDATEs to `key_order_items` per activated key. Mitigation: typical batches are 5–20 keys; lock contention only becomes a concern beyond ~100 keys per batch — outside current operational envelope.
- **Multi-equipment orders**: an order spanning multiple equipment stays in `pending_installation` until every equipment_update is resolved. Mitigation: this is existing workflow behavior; the trigger already handles partial advancement correctly.
- **Extended test 092-C fails until fix lands**: this is the intended TDD RED step and is called out to the apply/verify phases so nobody treats it as a regression.
- **Snapshot query surface area**: three separate SELECTs joined by UNION ALL, driven from the client. Mitigation: bounded by keys-per-equipment (small); a server-side view can be introduced later without changing the hook contract.

## Explicit trade-offs

- **Rollback Option A** (re-download only): between an installer rollback and the next corrective equipment_update, DB state (`rfid_keys.status`, `key_authorizations`) may diverge from the physical device (which now runs an older MDB). Accepted for simplicity — Option B (inverse equipment_update) is deferred until a product owner identifies a concrete case where this drift is unacceptable.
- **No new RPC for snapshot or history**: both are client-side PostgREST queries. Trades a small amount of duplicated query shape (client vs SQL) for zero migration surface and faster iteration on UI. A view or RPC can be introduced later without breaking callers.
- **Legacy `order_items` branch preserved even if unreachable**: trades a few dead lines of SQL for guaranteed backward compatibility with any pre-existing rows that still carry `rfid_keys.order_item_id`.

## Delivery note (single-pr, 800-line budget)

The change is expected to fit the `single-pr` strategy with the resolved 800-line budget. The scope is: one SQL migration (~40 lines), one client hook (~60 lines), two admin UI sections (~250 lines combined), one installer UI section (~120 lines), two extended/new pgTAP files (~200 lines combined), and one Vitest (~80 lines) — well inside 800 authored lines. If tasks-phase forecasting reveals higher line counts (e.g. i18n copy, storybook fixtures), `sdd-tasks` should raise a `size:exception` rather than silently splitting the bundle, since the four surfaces (DB fix, admin snapshot, admin history, installer rollback) are only individually meaningful when shipped together.
