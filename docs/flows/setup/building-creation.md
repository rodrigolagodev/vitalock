---
name: building-creation
title: Building — Create / Edit / Deactivate (and Units)
kind: journey
actors: [admin]
covers_requirements:
  - buildings-admin#building-crud
  - buildings-admin#soft-delete-guard
  - units-admin#unit-uniqueness-within-building
related_rpcs: []
related_tables:
  - public.buildings
  - public.units
  - public.administrations
covering_tests:
  pgtap: []
  vitest:
    - apps/admin/src/hooks/__tests__/useMutateBuilding.test.ts
    - apps/admin/src/hooks/__tests__/useBuildingsByIds.test.ts
    - apps/admin/src/components/buildings/__tests__/BuildingFormSheet.test.tsx
last_verified: 2026-08-27
---

# Building — Create / Edit / Deactivate (and Units)

## Purpose

Buildings sit between `administrations` and `units`, and are the anchor for
`operations.equipment` and the parent of every `key_orders.building_id` at
the item level. Every physical asset (key, equipment) traces back to a
building.

This doc covers the CRUD flow for buildings and their units. Like
administrations, there is no state machine — status is binary. Units are
grouped here because they are almost always managed in the same UI session
(the operator creates a building, then creates its units before any orders
can reference them).

## Actors & preconditions

- **admin** — full CRUD via `BuildingFormSheet` and the unit sheet from
  `BuildingDetailPage`.
- **preconditions**:
  - Parent administration exists and is `status='active'` (the
    `AdministrationSelect` in `BuildingFormSheet` uses
    `useAdministrations()` with no status filter — so inactive
    administrations WILL appear; verify this is intended).

## Happy path

### Create building

1. Admin lands on `/administraciones/:adminId` →
   `AdministrationDetailPage.tsx` and clicks **Nuevo edificio**, OR opens
   the buildings list under a building detail page.
2. Opens `BuildingFormSheet.tsx:42` in create mode. When an
   `administrationId` prop is passed (from the detail page context), the
   administration Select is hidden and pre-filled
   (`BuildingFormSheet.tsx:69`).
3. Admin fills `name` (required, min 1 char), optional `address`,
   `administration_id` (via Select if not pre-filled). Zod schema
   validates (`BuildingFormSheet.tsx:26`).
4. Submits → `useMutateBuilding.createBuilding`
   (`apps/admin/src/hooks/useMutateBuilding.ts:25`) → direct
   `supabase.from('buildings').insert(...)`. No RPC.
5. DB validates: `administration_id NOT NULL` and FK RESTRICT to
   `administrations`; status defaults to `'active'`
   (`supabase/migrations/20260806000002_core_tables.sql:33`).
6. Invalidates `['admin', 'buildings']` → list refreshes → toast.

### Create units

7. Admin lands on `/buildings/:buildingId` → `BuildingDetailPage`.
8. Admin adds units one by one (form typically embedded on the detail
   page). Each unit has:
   - `number` (required, unique within building)
   - `unit_type` (free text — departamento, local, cochera, baulera, ...)
   - `status` (defaults to `'active'`)
9. INSERT into `public.units` with `building_id` set. DB enforces
   `UNIQUE(building_id, number)`
   (`supabase/migrations/20260806000002_core_tables.sql:78`) — two
   different buildings can each have a unit "101" but the same building
   cannot.

### Edit

10. Admin clicks the pencil in `BuildingsTable.tsx:56` → opens the sheet
    in edit mode. `administration_id` is fixed post-creation (not
    editable; only `name` and `address` can be updated).

### Deactivate

11. Admin clicks the power icon (`BuildingStatusToggle.tsx:20`) →
    confirmation dialog.
12. **Guard**: `BuildingStatusToggle.tsx:32` reads `useUnits(building.id)`
    and `useEquipment(building.id)`, computes
    `activeUnits + activeEquipment > 0` and, if true, replaces the
    confirm button with an "Entendido" acknowledgement — the UPDATE is
    never sent. Same pattern as `AdministrationStatusToggle`.
13. Otherwise `useMutateBuilding.deactivateBuilding` sets
    `status='inactive'`.

## Cross-cutting effects

- **Cascade rules**: `buildings.administration_id` FK is `ON DELETE
  RESTRICT`; same for `units.building_id`. No cascade delete anywhere in
  this hierarchy — soft-only.
- **Downstream consumers** (list at time of writing, from `useBuildings`
  callers via codegraph):
  `KeyOrderForm`, `TechnicalOrderForm`, `EquipmentFormSheet`,
  `ParticularFormSheet`, `AdministrationStatusToggle`,
  `useBuildingsByIds`, `EquiposPage`, `HistorialTable`, `StockPage`. Any
  building change ripples via TanStack Query invalidation of
  `['admin', 'buildings']`.
- **`useBuildings` computes per-building counts** client-side
  (`useBuildings.ts:36`) by fetching units → `rfid_keys` (active only)
  and `operations.equipment` (active only). This is N+1 in disguise —
  fine for a small tenant, expensive for many buildings.

## Error paths & guards

| Trigger | Guard | Effect |
|---|---|---|
| Empty `name` | zod schema | Field error, submit blocked |
| Non-UUID `administration_id` | zod schema | Field error |
| Missing `administration_id` (create only) | zod schema + DB NOT NULL | Rejected |
| Duplicate `(building_id, number)` unit | DB UNIQUE | Toast via `toastMutationError` |
| Delete an administration with buildings | DB FK ON DELETE RESTRICT | Rejected — must deactivate |
| Non-admin caller | RLS `admin_all_buildings` (analogous to admin_all_administrations) | Empty select; write rejected |

## Known gaps

1. **Inactive administrations still appear in the building form's
   administration selector**. `BuildingFormSheet.tsx:50` calls
   `useAdministrations()` without a status filter. An admin can create a
   building under an inactive administration. Either the guard belongs
   client-side or the query should filter.
2. **N+1 in `useBuildings`** — for large tenants, precomputing counts
   via three separate queries is expensive. Consider a view or an
   admin-side aggregate RPC.
3. **Deactivation guard is client-side only**. `BuildingStatusToggle`
   blocks the UI action when active units/equipment exist, but the DB
   does not enforce this. A direct UPDATE bypasses the guard.
   Consider a trigger on `buildings` that rejects
   `active → inactive` when there are active children.

## QA checklist

- [ ] Login as admin → `/administraciones/:id` → **Nuevo edificio** →
      only `name` filled → row appears with status "Activo" and 0 keys /
      0 equipos.
- [ ] Create a second building with the same name — DB has NO uniqueness
      on `name` so this succeeds. Confirm both appear.
- [ ] Try to create a unit "101" twice in the same building → second
      fails with unique-violation toast.
- [ ] Create "101" in two different buildings → both succeed.
- [ ] Edit a building → change address → row updates.
- [ ] Add a key + activate it under this building → refresh the list →
      confirm `key_count = 1`.
- [ ] Deactivate a building with 0 active units/equipment → verify
      status "Inactivo".
- [ ] Try to deactivate a building with >= 1 active unit or equipment
      → dialog shows "No se puede desactivar" and blocks the action
      (`BuildingStatusToggle.tsx:32` `hasActiveChildren` guard).
- [ ] Direct UPDATE on the DB bypassing the UI → succeeds (Known gap #3).

## Related flows

- [[administration-creation]] — the parent.
- [[stock-loading]] — buildings do not hold stock; SKUs are global.
- [[key-order-lifecycle]] — how `building_id` on `key_order_items` is
  used at configuration time.
- [[equipment-installation]] — how equipment is bound to a building.
