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

## Remaining Tasks (PR3)

Phase 3 (tasks 3.1–3.21) is untouched. PR3 scope next.
