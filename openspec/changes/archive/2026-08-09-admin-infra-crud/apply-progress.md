# Apply Progress: admin-infra-crud

**Batch**: PR1 — Shell + Buildings CRUD
**Mode**: Standard (no strict TDD; tests written alongside implementation)
**Date**: 2026-08-09
**Chain strategy**: stacked-to-main
**PR target**: main

---

## Completed Tasks (PR1 scope — tasks 1.1 → 1.21)

- [x] 1.1 Installed shadcn primitives: `sheet`, `dialog`, `table`, `input`, `label`, `switch`, `badge` + Sonner, lucide-react, radix dialog/switch/label into admin
- [x] 1.2 Mounted `<Toaster richColors position="bottom-center" />` in `apps/admin/src/main.tsx` (sole instance, from 'sonner' directly — no shadcn wrapper / no ThemeProvider)
- [x] 1.3 Created `apps/admin/src/lib/queryKeys.ts` with all five key factories
- [x] 1.4 Created `apps/admin/src/hooks/mapMutationError.ts` with admin-flavored SQLSTATE→toast (23505/23514/23503/42501/P0001/network/default)
- [x] 1.5 Created `NavSection.tsx` + `NavItem.tsx` in `components/layout/`
- [x] 1.6 Created `Sidebar.tsx` — `w-60` fixed at `md+`, hamburger slide-over on mobile; four sections
- [x] 1.7 Created `AppShell.tsx` — 56px header + Sidebar + Outlet; `App.tsx` replaced to use AppShell
- [x] 1.8 Updated `routes/index.tsx` → `<Navigate to="/buildings" replace />`
- [x] 1.9 Created `hooks/useBuildings.ts` — TanStack Query with child counts (active units + active equipment per building)
- [x] 1.10 Created `hooks/useMutateBuilding.ts` — createBuilding/updateBuilding/deactivateBuilding; plain invalidation; toastMutationError on error
- [x] 1.11 Created `components/buildings/BuildingFormSheet.tsx` — RHF+Zod, name+address only, no status field, sheet stays open on error
- [x] 1.12 Created `components/buildings/BuildingStatusToggle.tsx` — checks useUnits+useEquipment active counts; blocks with info dialog when children exist; calls deactivateBuilding otherwise
- [x] 1.13 Created `components/buildings/BuildingsTable.tsx` — name/address/status/unit count/equipment count columns; edit+deactivate actions; no delete action
- [x] 1.14 Created `routes/buildings/BuildingsPage.tsx` — title + "Nuevo edificio" button + BuildingsTable
- [x] 1.15 Wired route tree in `main.tsx`: `/` → Navigate; `/buildings` → BuildingsPage; `/buildings/:buildingId` → placeholder div
- [x] 1.16 Wrote `mapMutationError.test.ts` (15 test cases covering all SQLSTATE branches + network + generic)
- [x] 1.17 All mapMutationError tests pass
- [x] 1.18 Wrote `useMutateBuilding.test.ts` (4 test cases: create happy, create error, deactivate happy, deactivate 23503)
- [x] 1.19 All useMutateBuilding tests pass
- [x] 1.20 Wrote `BuildingStatusToggle.test.tsx` (5 test cases: inactive renders nothing, active renders button, blocks with unit count, blocks with equipment count, calls deactivate when no children)
- [x] 1.21 All BuildingStatusToggle tests pass

---

## Files Changed

| File | Action | Notes |
|---|---|---|
| `apps/admin/vite.config.ts` | Modified | Added test block (jsdom, globals, setupFiles) |
| `apps/admin/src/test/setup.ts` | Created | @testing-library/jest-dom + afterEach cleanup |
| `apps/admin/src/main.tsx` | Modified | Added Toaster, Navigate, BuildingsPage route, placeholder /buildings/:buildingId |
| `apps/admin/src/App.tsx` | Modified | Now renders `<AppShell />` instead of bare `<main>` |
| `apps/admin/src/routes/index.tsx` | Modified | Navigate to /buildings replace |
| `apps/admin/src/lib/queryKeys.ts` | Created | Five key factories under 'admin' namespace |
| `apps/admin/src/hooks/mapMutationError.ts` | Created | Admin-flavored SQLSTATE→toast (6 code branches + network + default) |
| `apps/admin/src/hooks/useBuildings.ts` | Created | TanStack Query, active child counts |
| `apps/admin/src/hooks/useMutateBuilding.ts` | Created | 3 mutations, plain invalidation |
| `apps/admin/src/hooks/useUnits.ts` | Created | TanStack Query for units (needed by BuildingStatusToggle) |
| `apps/admin/src/hooks/useEquipment.ts` | Created | TanStack Query for equipment via .schema('operations') |
| `apps/admin/src/components/layout/NavItem.tsx` | Created | NavLink-based nav item |
| `apps/admin/src/components/layout/NavSection.tsx` | Created | Section label + disabled "Próximamente" badge |
| `apps/admin/src/components/layout/Sidebar.tsx` | Created | w-60 fixed desktop + hamburger mobile slide-over |
| `apps/admin/src/components/layout/AppShell.tsx` | Created | 56px header + Sidebar + Outlet |
| `apps/admin/src/components/ui/badge.tsx` | Created | shadcn Badge |
| `apps/admin/src/components/ui/dialog.tsx` | Created | shadcn Dialog |
| `apps/admin/src/components/ui/input.tsx` | Created | shadcn Input |
| `apps/admin/src/components/ui/label.tsx` | Created | shadcn Label |
| `apps/admin/src/components/ui/switch.tsx` | Created | shadcn Switch |
| `apps/admin/src/components/ui/sheet.tsx` | Created | shadcn Sheet (uses @radix-ui/react-dialog) |
| `apps/admin/src/components/ui/table.tsx` | Created | shadcn Table |
| `apps/admin/src/components/buildings/BuildingFormSheet.tsx` | Created | RHF+Zod, name+address, no status |
| `apps/admin/src/components/buildings/BuildingStatusToggle.tsx` | Created | Children guard + confirm/block dialog |
| `apps/admin/src/components/buildings/BuildingsTable.tsx` | Created | Full table + empty state |
| `apps/admin/src/routes/buildings/BuildingsPage.tsx` | Created | List page with create trigger |
| `apps/admin/src/hooks/__tests__/mapMutationError.test.ts` | Created | 15 tests |
| `apps/admin/src/hooks/__tests__/useMutateBuilding.test.ts` | Created | 4 tests |
| `apps/admin/src/components/buildings/__tests__/BuildingStatusToggle.test.tsx` | Created | 5 tests |

---

## Work Unit Evidence

| Evidence | Value |
|---|---|
| Focused test command | `pnpm --filter admin test` |
| Test result | 3 suites / 24 tests PASSED |
| Typecheck | `pnpm --filter admin typecheck` → clean (0 errors) |
| Lint | `pnpm --filter admin lint` → 0 errors (4 pre-existing react-refresh warnings in shadcn files) |
| Build | `pnpm --filter admin build` → clean ✓ |
| Runtime harness | `pnpm --filter admin dev` → navigate /buildings (requires local Supabase) |
| Rollback boundary | Revert `main.tsx`, `App.tsx`, `routes/index.tsx`, `components/layout/`, `components/buildings/`, `components/ui/{badge,dialog,input,label,switch,sheet,table}.tsx`, `hooks/useBuildings*`, `hooks/useMutateBuilding*`, `hooks/useUnits.ts`, `hooks/useEquipment.ts`, `lib/queryKeys.ts`, `routes/buildings/BuildingsPage.tsx`, `test/setup.ts`, `vite.config.ts` test block |

---

## Deviations from Design

1. **useUnits and useEquipment created in PR1** — design placed them in PR2/PR3 respectively, but `BuildingStatusToggle` (PR1 scope) requires both for the children guard. Created minimal versions sufficient for count queries.
2. **administration_id in CreateBuildingInput** — buildings table requires `administration_id` as non-null FK. The form exposes it as a prop parameter (not a user-visible field), defaulting to empty string. In production this would come from the admin's session/profile. Design deferred this detail; tracked as a risk.
3. **units.number not units.identifier** — DB column is `number`, not `identifier`. Used `number` as the identifier field throughout. Tasks called it "identifier/name" — mapped to the actual column name.

---

---

## Completed Tasks (PR2 scope — tasks 2.1 → 2.12)

**Batch**: PR2 — BuildingDetailPage + Units CRUD
**Date**: 2026-08-09

- [x] 2.1 Installed `@radix-ui/react-tabs` via pnpm; created `apps/admin/src/components/ui/tabs.tsx` (standard shadcn Tabs primitive)
- [x] 2.2 Created `apps/admin/src/routes/buildings/BuildingDetailPage.tsx` — fetches via `useBuilding(id)`; header with building name + status badge; `<Tabs>` with `useSearchParams()` for `?tab=unidades|equipos`; Equipos tab is placeholder; wired into router replacing PR1 placeholder div
- [x] 2.3 `useUnits.ts` already existed from PR1 (created for BuildingStatusToggle). Selects `id/number/status/is_administrative/building_id` ordered by `number`. No changes needed.
- [x] 2.4 Created `apps/admin/src/hooks/useMutateUnit.ts` — `createUnit` (building_id from arg), `updateUnit` (building_id NOT in payload), `deactivateUnit`; `onSuccess` invalidates `unitsKey(buildingId)` + toast; `onError` calls `toastMutationError`
- [x] 2.5 Created `apps/admin/src/components/units/UnitFormSheet.tsx` — RHF+Zod; fields: number + is_administrative (Switch); building_id pre-populated from prop, hidden; id/created_at absent
- [x] 2.6 Created `apps/admin/src/components/units/UnitsTable.tsx` — columns: number/status/is_administrative/actions; edit + deactivate; no delete action
- [x] 2.7 Wired `UnitsTable` + `UnitFormSheet` into BuildingDetailPage Unidades tab
- [x] 2.8 Loading skeleton + 404/null error boundary in `BuildingDetailPage`; also created `apps/admin/src/hooks/useBuilding.ts` for single building fetch via `maybeSingle()`
- [x] 2.9 Wrote `useMutateUnit.test.ts` (RED phase) — 4 cases: create happy → invalidates unitsKey; deactivate happy → invalidates unitsKey; 23505 error → toastMutationError called; updateUnit payload excludes building_id
- [x] 2.10 All `useMutateUnit.test.ts` tests pass (GREEN)
- [x] 2.11 Wrote `UnitFormSheet.test.tsx` (RED phase) — 4 cases: building_id not in DOM; is_administrative toggle present; create submits with building_id from prop; edit calls updateUnit without building_id
- [x] 2.12 All `UnitFormSheet.test.tsx` tests pass (GREEN); added ResizeObserver + matchMedia polyfills to `src/test/setup.ts`

---

## Files Changed (PR2)

| File | Action | Notes |
|---|---|---|
| `apps/admin/src/test/setup.ts` | Modified | Added ResizeObserver + matchMedia polyfills for jsdom |
| `apps/admin/src/main.tsx` | Modified | Import + wire BuildingDetailPage replacing PR1 placeholder |
| `apps/admin/src/hooks/useBuilding.ts` | Created | Single building fetch via maybeSingle() |
| `apps/admin/src/hooks/useMutateUnit.ts` | Created | createUnit/updateUnit/deactivateUnit; plain invalidation |
| `apps/admin/src/components/ui/tabs.tsx` | Created | shadcn Tabs primitive |
| `apps/admin/src/components/units/UnitFormSheet.tsx` | Created | RHF+Zod, number+is_administrative, building_id from prop |
| `apps/admin/src/components/units/UnitsTable.tsx` | Created | Full table + empty state; no delete action |
| `apps/admin/src/routes/buildings/BuildingDetailPage.tsx` | Created | Header + Tabs; URL-driven tab state; loading skeleton + 404 |
| `apps/admin/src/hooks/__tests__/useMutateUnit.test.ts` | Created | 4 tests |
| `apps/admin/src/components/units/__tests__/UnitFormSheet.test.tsx` | Created | 4 tests |

---

## Work Unit Evidence (PR2)

| Evidence | Value |
|---|---|
| Focused test command | `pnpm --filter admin test` |
| Test result | 5 suites / 32 tests PASSED (24 PR1 + 8 PR2) |
| Typecheck | `pnpm --filter admin typecheck` → clean (0 errors) |
| Lint | `pnpm --filter admin lint` → 0 errors (4 pre-existing react-refresh warnings) |
| Build | `pnpm --filter admin build` → clean |
| Runtime harness | `pnpm --filter admin dev` → navigate /buildings/:id?tab=unidades |
| Rollback boundary | Revert `routes/buildings/BuildingDetailPage.tsx`, `components/units/`, `hooks/useBuilding.ts`, `hooks/useMutateUnit.ts`, `components/ui/tabs.tsx`, `main.tsx` BuildingDetailPage import+route, `test/setup.ts` polyfills |

---

## Deviations from Design (PR2)

1. **useUnits already existed** — PR1 created it for BuildingStatusToggle; no changes needed (task 2.3 was a no-op).
2. **useBuilding created** — design showed `buildingKey` in queryKeys.ts but didn't spell out a `useBuilding` hook separately. Created it as a minimal single-row query using `maybeSingle()` to handle 404 cleanly.
3. **units.number column** — confirmed from PR1: DB column is `number`, not `identifier`. Carried forward consistently.
4. **ResizeObserver polyfill added to setup.ts** — jsdom doesn't include ResizeObserver; needed for `@radix-ui/react-switch` inside Sheet (UnitFormSheet tests). This also retroactively fixes the same gap for any future tests rendering Switch inside Sheet.

---

---

## Completed Tasks (PR3 scope — tasks 3.1 → 3.21)

**Batch**: PR3 — Equipment CRUD + Decommission + Replace
**Date**: 2026-08-09

- [x] 3.1 Created `apps/admin/src/components/ui/textarea.tsx` (standard shadcn Textarea wrapper); `select.tsx` was already installed from prior PR. No new radix peer needed for textarea.
- [x] 3.2 `useEquipment.ts` already existed from PR1 (created for BuildingStatusToggle). No changes needed.
- [x] 3.3 Created `apps/admin/src/hooks/useDecommissionImpact.ts` — COUNT query on `operations.key_authorizations` filtered by `equipment_id + sync_state in {pending_install, pending_removal}`; `{count:'exact',head:true}`; only enabled when dialog is open.
- [x] 3.4 Created `apps/admin/src/hooks/useMutateEquipment.ts` — `createEquipment` (building_id from arg, replaces_equipment_id absent from payload), `updateEquipment` (serial_number/building_id/installed_at/replaces_equipment_id NOT in payload — enforced by type and destructure), `updateStatus`; plain invalidation + toast; toastMutationError on error.
- [x] 3.5 Created `apps/admin/src/hooks/useReplaceEquipment.ts` — wraps `.schema('operations').rpc('replace_equipment', {p_old_equipment_id, p_new_serial_number, p_new_model, p_new_description})`; invalidates equipmentKey + toast; toastMutationError on error.
- [x] 3.6 Created `apps/admin/src/components/equipment/EquipmentStatusSelect.tsx` — `<Select>` with active/maintenance/dead; dead fires onDeadSelected callback instead of onChange; fully disabled when current status is dead.
- [x] 3.7 Created `apps/admin/src/components/equipment/DecommissionDialog.tsx` — opens on dead selection; calls useDecommissionImpact(equipmentId, open); shows count; requires non-empty decommission_reason (RHF+Zod min-1); on confirm calls onConfirm callback; on cancel calls onOpenChange(false).
- [x] 3.8 Created `apps/admin/src/components/equipment/ReplaceEquipmentDialog.tsx` — Dialog (not sheet); shows old device details read-only; collects new_serial_number + new_model (RHF+Zod); on confirm calls useReplaceEquipment.replaceEquipment.mutateAsync; toast on error.
- [x] 3.9 Created `apps/admin/src/components/equipment/EquipmentFormSheet.tsx` — create fields: model/serial_number/installed_at (building_id hidden prop, replaces_equipment_id absent); edit fields: model editable, serial_number/building_id/installed_at rendered as readOnly Input with data-immutable attr; EquipmentStatusSelect embedded; DecommissionDialog conditionally mounted; dead status disables save.
- [x] 3.10 Created `apps/admin/src/components/equipment/EquipmentTable.tsx` — columns: model/serial_number/status/installed_at/actions; edit + "Reemplazar" (opens ReplaceEquipmentDialog) actions; no delete action; dead equipment hides Reemplazar button.
- [x] 3.11 Wired `EquipmentTable` + `EquipmentFormSheet` + `useEquipment` into BuildingDetailPage Equipos tab; replaced placeholder div with full equipment tab content.
- [x] 3.12 Wrote `useMutateEquipment.test.ts` (RED phase) — 6 cases covering create happy, create payload excludes replaces_equipment_id, updateEquipment payload excludes all 4 immutable fields, 23514 immutable branch, updateStatus with decommission_reason, 23514 dead-transition branch.
- [x] 3.13 All `useMutateEquipment.test.ts` tests pass (GREEN).
- [x] 3.14 Wrote `useDecommissionImpact.test.ts` (RED phase) — 5 cases: disabled returns idle, count 3, count 0, count null fallback, error, plus schema/filter verification.
- [x] 3.15 All `useDecommissionImpact.test.ts` tests pass (GREEN).
- [x] 3.16 Wrote `useReplaceEquipment.test.ts` (RED phase) — 3 cases: happy path → invalidates + toast; RPC called with p_-prefixed params; P0001 → toastMutationError.
- [x] 3.17 All `useReplaceEquipment.test.ts` tests pass (GREEN).
- [x] 3.18 Wrote `DecommissionDialog.test.tsx` (RED phase) — 6 cases: shows impact count; singular label; loading state; confirm with payload; Zod blocks empty reason; cancel → no mutation.
- [x] 3.19 All `DecommissionDialog.test.tsx` tests pass (GREEN).
- [x] 3.20 Wrote `EquipmentFormSheet.test.tsx` (RED phase) — 10 cases: create renders model/serial/installed fields; replaces_equipment_id absent from create; building_id not in DOM; edit model editable; serial_number readonly; installed_at readonly; building_id readonly; replaces_equipment_id not editable in edit; dead submit disabled; dead shows status label.
- [x] 3.21 All `EquipmentFormSheet.test.tsx` tests pass (GREEN).

---

## Files Changed (PR3)

| File | Action | Notes |
|---|---|---|
| `apps/admin/src/components/ui/textarea.tsx` | Created | shadcn Textarea primitive (no radix peer) |
| `apps/admin/src/hooks/useDecommissionImpact.ts` | Created | COUNT query, enabled gate |
| `apps/admin/src/hooks/useMutateEquipment.ts` | Created | create/update/updateStatus; immutable exclusion by type |
| `apps/admin/src/hooks/useReplaceEquipment.ts` | Created | RPC wrapper with p_-prefixed params |
| `apps/admin/src/components/equipment/EquipmentStatusSelect.tsx` | Created | Dead-terminal guard; onDeadSelected callback |
| `apps/admin/src/components/equipment/DecommissionDialog.tsx` | Created | Impact preview + reason form |
| `apps/admin/src/components/equipment/ReplaceEquipmentDialog.tsx` | Created | RPC dialog; old device read-only display |
| `apps/admin/src/components/equipment/EquipmentFormSheet.tsx` | Created | Create+edit; immutable fields readOnly; DecommissionDialog mounted |
| `apps/admin/src/components/equipment/EquipmentTable.tsx` | Created | Full table + empty state; no delete |
| `apps/admin/src/routes/buildings/BuildingDetailPage.tsx` | Modified | Equipos tab wired with real components |
| `apps/admin/src/hooks/__tests__/useMutateEquipment.test.ts` | Created | 6 tests |
| `apps/admin/src/hooks/__tests__/useDecommissionImpact.test.ts` | Created | 6 tests |
| `apps/admin/src/hooks/__tests__/useReplaceEquipment.test.ts` | Created | 3 tests |
| `apps/admin/src/components/equipment/__tests__/DecommissionDialog.test.tsx` | Created | 6 tests |
| `apps/admin/src/components/equipment/__tests__/EquipmentFormSheet.test.tsx` | Created | 10 tests |

---

## Work Unit Evidence (PR3)

| Evidence | Value |
|---|---|
| Focused test command | `pnpm --filter admin test` |
| Test result | 10 suites / 63 tests PASSED (32 PR1+PR2 + 31 PR3) |
| Typecheck | `pnpm --filter admin typecheck` → clean (0 errors) |
| Lint | `pnpm --filter admin lint` → 0 errors (4 pre-existing react-refresh warnings) |
| Build | `pnpm --filter admin build` → clean |
| Runtime harness | `pnpm --filter admin dev` → navigate /buildings/:id?tab=equipos |
| Rollback boundary | Revert `components/equipment/`, `hooks/useMutateEquipment.ts`, `hooks/useReplaceEquipment.ts`, `hooks/useDecommissionImpact.ts`, `components/ui/textarea.tsx`, `routes/buildings/BuildingDetailPage.tsx` Equipos tab changes |

---

## Deviations from Design (PR3)

1. **RPC params use p_ prefix** — database.types.ts defines `replace_equipment` with `p_old_equipment_id`, `p_new_serial_number`, `p_new_model`, `p_new_description` (not `old_equipment_id` etc.). `p_new_description` is required by the RPC type; passed as empty string since the form collects model but not a separate description. `ReplaceEquipmentInput` interface uses unprefixed names for the hook's public API; the translation happens inside `useReplaceEquipment`.
2. **equipment.description required on insert** — the DB Insert type requires `description: string` (non-nullable). Passed as empty string `''` in `createEquipment` since the spec/form doesn't include a description field. This is a DB schema detail not surfaced in the design.
3. **EquipmentStatusSelect in EquipmentFormSheet** — status transitions on edit are tracked as local state; non-dead status changes (active↔maintenance) are applied when the form submits via updateEquipment payload, not via immediate updateStatus call. This keeps the save-on-submit UX consistent with other forms. The updateStatus path is only triggered via DecommissionDialog confirm.
4. **useEquipment was already complete** — task 3.2 was a no-op (useEquipment already existed from PR1, complete with .schema('operations') and all required fields).

---

## Remaining Tasks

Phase 4 (tasks 4.1–4.4) are manual gate/smoke tasks. All implementation tasks complete.
