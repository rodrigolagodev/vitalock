# Tasks: admin-infra-crud

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | PR1 ~420 · PR2 ~260 · PR3 ~480 |
| 400-line budget risk | PR1 High · PR2 Low · PR3 High |
| Chained PRs recommended | Yes |
| Suggested split | PR1 → PR2 → PR3 (stacked-to-main) |
| Delivery strategy | auto-chain |
| Chain strategy | stacked-to-main |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|---|---|---|---|---|---|
| 1 | Toaster + AppShell + Buildings CRUD | PR1 | `pnpm --filter admin test -- buildings` | `pnpm --filter admin dev` → navigate /buildings | Revert `main.tsx`, `App.tsx`, `components/layout/`, `components/buildings/`, `hooks/useBuildings*`, `routes/buildings/BuildingsPage.tsx` |
| 2 | BuildingDetailPage + Units CRUD | PR2 | `pnpm --filter admin test -- units` | navigate /buildings/:id?tab=unidades | Revert `routes/buildings/BuildingDetailPage.tsx`, `components/units/`, `hooks/useUnits*` |
| 3 | Equipment CRUD + Replace flow | PR3 | `pnpm --filter admin test -- equipment` | navigate /buildings/:id?tab=equipos | Revert `components/equipment/`, `hooks/useEquipment*`, `hooks/useReplaceEquipment*`, `hooks/useDecommissionImpact*` |

---

## Phase 1 — PR1: Shell + Foundation + Buildings (→ main)

- [x] 1.1 Install shadcn primitives for PR1: `sheet`, `dialog`, `table`, `input`, `label`, `switch`, `badge`, `sonner` (+ radix peers) into `apps/admin/src/components/ui/`.
- [x] 1.2 Mount `<Toaster>` (Sonner) as the sole instance in `apps/admin/src/main.tsx`; add `QueryClientProvider` if missing. Satisfies: Sonner Toaster Mount.
- [x] 1.3 Create `apps/admin/src/lib/queryKeys.ts` with `buildingsKey`, `buildingKey`, `unitsKey`, `equipmentKey`, `decommissionImpactKey` exports.
- [x] 1.4 Create `apps/admin/src/hooks/mapMutationError.ts` — admin-flavored SQLSTATE→toast switch (23505 `units_one_admin_per_building` branch, 23514 immutable/dead/invalid-transition branches, 23503, 42501, P0001 substring, default). Mirrors installer pattern; NOT lifted to shared.
- [x] 1.5 Create `apps/admin/src/components/layout/NavSection.tsx` and `NavItem.tsx` — `NavLink`-based; disabled sections render muted `<div>` + `<Badge>Próximamente</Badge>`.
- [x] 1.6 Create `apps/admin/src/components/layout/Sidebar.tsx` — `w-60` fixed at `md+`; four sections (Infraestructura active, Personal/Ventas/Tickets disabled); hamburger slide-over below `md`. Satisfies: Persistent Sidebar Layout.
- [x] 1.7 Create `apps/admin/src/components/layout/AppShell.tsx` — header 56px + `<Sidebar>` + `<Outlet/>`. Replace empty `<main>` in existing `App.tsx`; place between `ProtectedRoute` and entity routes.
- [x] 1.8 Create `apps/admin/src/routes/index.tsx` — `<Navigate to="/buildings" replace />`. Satisfies: Root Route Redirect.
- [x] 1.9 Create `apps/admin/src/hooks/useBuildings.ts` — TanStack Query, selects name/address/status/child counts ordered by name.
- [x] 1.10 Create `apps/admin/src/hooks/useMutateBuilding.ts` — `createBuilding`, `updateBuilding`, `deactivateBuilding` mutations; `onSuccess` invalidates `buildingsKey()` + toast; `onError` calls `mapMutationError`. No optimistic updates.
- [x] 1.11 Create `apps/admin/src/components/buildings/BuildingFormSheet.tsx` — RHF+Zod; fields: name, address; no status field; `building_id`/`created_at`/`id` absent. Sheet stays open on error. Satisfies: Create Building, Edit Building (status absent).
- [x] 1.12 Create `apps/admin/src/components/buildings/BuildingStatusToggle.tsx` — reads cached `useUnits(buildingId)` + `useEquipment(buildingId)` counts; blocks deactivation with counts-in-error dialog when active children > 0; calls `deactivateBuilding` otherwise. Satisfies: Deactivate Building (children guard, ADR Q2).
- [x] 1.13 Create `apps/admin/src/components/buildings/BuildingsTable.tsx` — columns: name, address, status, child counts, edit + deactivate actions; no delete action. Satisfies: Buildings List, No Delete.
- [x] 1.14 Create `apps/admin/src/routes/buildings/BuildingsPage.tsx` — title + "Nuevo edificio" button + `<BuildingsTable>`. Satisfies: Buildings List, Create Building.
- [x] 1.15 Wire route tree in router config: `/` → index redirect; `/buildings` → `BuildingsPage`; `/buildings/:buildingId` → placeholder (renders in PR2). Satisfies: Route Tree.

### PR1 Tests

- [x] 1.16 **RED** `mapMutationError.test.ts` — assert 23505 with `units_one_admin_per_building` detail → Spanish toast text; 23514 immutable-field branch → correct message; 23514 dead-transition → correct message; 23503, 42501, P0001, unknown code each map correctly.
- [x] 1.17 **GREEN** `mapMutationError.test.ts` — implement until all cases pass.
- [x] 1.18 **RED** `useMutateBuilding.test.ts` — happy path create → `invalidateQueries(buildingsKey())` called; error path → `mapMutationError` called; `deactivateBuilding` with active children count passed through.
- [x] 1.19 **GREEN** `useMutateBuilding.test.ts` — implement until passes.
- [x] 1.20 **RED** `BuildingStatusToggle.test.tsx` — renders block dialog when `activeUnits > 0`; calls `deactivateBuilding` when `activeUnits === 0 && activeEquipment === 0`.
- [x] 1.21 **GREEN** `BuildingStatusToggle.test.tsx` — implement until passes.

---

## Phase 2 — PR2: BuildingDetailPage + Units CRUD (→ main after PR1)

- [x] 2.1 Install shadcn primitive for PR2: `tabs` (+ `@radix-ui/react-tabs`) into `apps/admin/src/components/ui/`.
- [x] 2.2 Create `apps/admin/src/routes/buildings/BuildingDetailPage.tsx` — fetches `buildingKey(id)`, renders header (name + status badge) + `<Tabs defaultValue="unidades">`; tab state via `useSearchParams()` (`?tab=unidades|equipos`); Equipos tab content is placeholder until PR3. Satisfies: Route Tree (deep link), Tab state via URL.
- [x] 2.3 Create `apps/admin/src/hooks/useUnits.ts` — TanStack Query keyed by `unitsKey(buildingId)`; selects identifier/name/status/is_administrative ordered by identifier.
- [x] 2.4 Create `apps/admin/src/hooks/useMutateUnit.ts` — `createUnit` (building_id from arg, not form), `updateUnit`, `deactivateUnit`; `onSuccess` invalidates `unitsKey(buildingId)` + toast; `onError` calls `mapMutationError`.
- [x] 2.5 Create `apps/admin/src/components/units/UnitFormSheet.tsx` — RHF+Zod; fields: name/identifier, is_administrative (`<Switch>`); building_id pre-populated, hidden; id/created_at absent from form. Satisfies: Create Unit (building_id not in form), Edit Unit, is_administrative Toggle.
- [x] 2.6 Create `apps/admin/src/components/units/UnitsTable.tsx` — columns: identifier/name, status, is_administrative, edit + deactivate actions; no delete action. Satisfies: Units List, No Delete.
- [x] 2.7 Wire `UnitsTable` + `UnitFormSheet` into BuildingDetailPage Unidades tab. Satisfies: Units List Nested in Building.
- [x] 2.8 Add loading skeleton + 404/error boundary to `BuildingDetailPage`. Satisfies: Design risk "loading/404 handling".

### PR2 Tests

- [x] 2.9 **RED** `useMutateUnit.test.ts` — happy path create → `invalidateQueries(unitsKey(buildingId))`; happy path `deactivateUnit`; error 23505 with `units_one_admin_per_building` constraint → `mapMutationError` branch produces correct Spanish text; immutable-field contract (building_id NOT sent in `updateUnit` payload).
- [x] 2.10 **GREEN** `useMutateUnit.test.ts` — implement until passes.
- [x] 2.11 **RED** `UnitFormSheet.test.tsx` — building_id not rendered in form; is_administrative toggle present; on 23505 toast shown and toggle reverted.
- [x] 2.12 **GREEN** `UnitFormSheet.test.tsx` — implement until passes.

---

## Phase 3 — PR3: Equipment CRUD + Decommission + Replace (→ main after PR2)

- [x] 3.1 Install shadcn primitives for PR3: `select`, `textarea` (+ `@radix-ui/react-select`) into `apps/admin/src/components/ui/`.
- [x] 3.2 Create `apps/admin/src/hooks/useEquipment.ts` — TanStack Query keyed by `equipmentKey(buildingId)`; `.schema('operations')` direct query; selects model/serial_number/status/installed_at.
- [x] 3.3 Create `apps/admin/src/hooks/useDecommissionImpact.ts` — COUNT query on `operations.key_authorizations` filtered by `equipment_id` + `sync_state in {pending_install, pending_removal}` with `{count:'exact',head:true}`; keyed by `decommissionImpactKey(equipmentId)`; only enabled when dialog is open.
- [x] 3.4 Create `apps/admin/src/hooks/useMutateEquipment.ts` — `createEquipment` (building_id from arg, replaces_equipment_id absent from payload), `updateEquipment` (serial_number/building_id/installed_at/replaces_equipment_id NOT sent), `updateStatus`; `onSuccess` invalidates `equipmentKey(buildingId)` + toast; `onError` calls `mapMutationError`.
- [x] 3.5 Create `apps/admin/src/hooks/useReplaceEquipment.ts` — wraps `.schema('operations').rpc('replace_equipment', {old_equipment_id, new_serial_number, new_model})`; `onSuccess` invalidates `equipmentKey(buildingId)` + toast; `onError` calls `mapMutationError` (P0001 substring branch).
- [x] 3.6 Create `apps/admin/src/components/equipment/EquipmentStatusSelect.tsx` — `<Select>` with `active/maintenance/dead`; when `dead` selected fires callback instead of direct save; disabled entirely when current status is `dead`. Satisfies: Equipment Status Transitions (dead read-only guard).
- [x] 3.7 Create `apps/admin/src/components/equipment/DecommissionDialog.tsx` — opens on `dead` selection; calls `useDecommissionImpact(equipmentId)` and shows count; requires non-empty `decommission_reason` (RHF+Zod min-1); on confirm calls `updateStatus({id, status:'dead', decommission_reason})`; on cancel reverts selector; no mutation on cancel. Satisfies: Decommission Impact Preview, Equipment Status Transitions (dialog flow).
- [x] 3.8 Create `apps/admin/src/components/equipment/ReplaceEquipmentDialog.tsx` — separate Dialog (not edit sheet); shows old device details read-only; collects new serial_number + model (RHF+Zod); on confirm calls `useReplaceEquipment`; on error toast only (RPC atomic). Satisfies: Replace Equipment Dialog.
- [x] 3.9 Create `apps/admin/src/components/equipment/EquipmentFormSheet.tsx` — RHF+Zod; create fields: model, serial_number, installed_at (building_id hidden, replaces_equipment_id absent); edit fields: model only — serial_number/building_id/installed_at/replaces_equipment_id rendered as `readonly` `<Input>` and excluded from update payload; `<EquipmentStatusSelect>` embedded; `<DecommissionDialog>` conditionally mounted. Satisfies: Create Equipment, Edit Equipment (immutable read-only), No Physical Delete.
- [x] 3.10 Create `apps/admin/src/components/equipment/EquipmentTable.tsx` — columns: model, serial_number, status, installed_at, edit + "Reemplazar" (open `ReplaceEquipmentDialog`) actions; no delete action. Satisfies: Equipment List, No Physical Delete.
- [x] 3.11 Wire `EquipmentTable` + `EquipmentFormSheet` + `ReplaceEquipmentDialog` into BuildingDetailPage Equipos tab. Satisfies: Equipment List Nested in Building.

### PR3 Tests

- [x] 3.12 **RED** `useMutateEquipment.test.ts` — happy path create → `invalidateQueries(equipmentKey(buildingId))`; immutable-field contract: serial_number/building_id/installed_at/replaces_equipment_id NOT present in `updateEquipment` payload; 23514 immutable branch → correct toast; 23514 dead-transition branch → correct toast; `createEquipment` payload excludes `replaces_equipment_id`.
- [x] 3.13 **GREEN** `useMutateEquipment.test.ts` — implement until passes.
- [x] 3.14 **RED** `useDecommissionImpact.test.ts` — query disabled when `enabled: false`; returns count from COUNT response; happy path count > 0; zero count still resolves.
- [x] 3.15 **GREEN** `useDecommissionImpact.test.ts` — implement until passes.
- [x] 3.16 **RED** `useReplaceEquipment.test.ts` — happy path RPC → `invalidateQueries(equipmentKey(buildingId))`; P0001 error → `mapMutationError` P0001 branch called.
- [x] 3.17 **GREEN** `useReplaceEquipment.test.ts` — implement until passes.
- [x] 3.18 **RED** `DecommissionDialog.test.tsx` — dialog shows impact count from `useDecommissionImpact`; confirm disabled when reason empty; on confirm calls `updateStatus` with correct payload; on cancel no mutation fired and selector reverted.
- [x] 3.19 **GREEN** `DecommissionDialog.test.tsx` — implement until passes.
- [x] 3.20 **RED** `EquipmentFormSheet.test.tsx` — immutable fields (serial_number, building_id, installed_at, replaces_equipment_id) not editable in edit mode; replaces_equipment_id absent from create form; dead-status form renders status read-only.
- [x] 3.21 **GREEN** `EquipmentFormSheet.test.tsx` — implement until passes.

---

## Phase 4 — Pipeline Gate (optional, after all 3 PRs merged)

- [ ] 4.1 Full run: `pnpm --filter admin test` — all suites pass with no skipped cases.
- [ ] 4.2 Manual smoke: navigate `/buildings` → create building → open detail → create unit → toggle is_administrative → create equipment → set maintenance → set dead (decommission dialog) → replace equipment (RPC). Confirm toasts at every step and no duplicate Toaster instances.
- [ ] 4.3 Verify sidebar renders correctly at `md` breakpoint and below (hamburger slide-over visible; no layout overflow).
- [ ] 4.4 Verify no delete action present in Buildings, Units, or Equipment lists/forms.
