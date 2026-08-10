# Apply Progress: admin-administrations PR1

**Batch**: PR1 — routing + sidebar + query layer + AdministrationsPage + all list-level components
**Mode**: Standard
**Status**: done (Phase 1 + Phase 2 + Phase 4 partial + Phase 5 partial)
**Date**: 2026-08-09

## Completed Tasks

### Phase 1 — Foundation: Query Layer + Routing
- [x] 1.1 Extended `useAdministrations` with `tax_id, email, phone, address, notes` fields; new `{search?, status?}` params; `.or()` ILIKE filter; queryKey uses `administrationsKey(status, search)`
- [x] 1.2 Added `administrationsKey`, `administrationKey`, discriminated `buildingsKey(administrationId?)` to `queryKeys.ts`
- [x] 1.3 Updated `useBuildings` with optional `administrationId` param + `.eq()` filter; uses `buildingsKey(administrationId)`
- [x] 1.4 Updated `useMutateBuilding` to invalidate via prefix `['admin','buildings']`
- [x] 1.5 Created `useDebounce.ts` — generic `useDebounce<T>(value, delay)` hook
- [x] 1.6 Updated `main.tsx` with `/administraciones`, `/administraciones/:adminId`, `/buildings` redirect, index → `/administraciones`; updated `routes/index.tsx` to redirect to `/administraciones`
- [x] 1.7 Updated `Sidebar.tsx`: "Edificios" → "Administraciones" at `/administraciones`

### Phase 2 — Core Implementation: Administrations List
- [x] 2.1 Created `useMutateAdministration.ts` with create/update/deactivate mutations; invalidates `['admin','administrations']` prefix; 23505 `administrations_tax_id_key` → "Ya existe una administración con ese CUIT/CUIL." (via extended `mapMutationError`)
- [x] 2.2 Created `AdministrationsTable.tsx` — company_name Link to `/administraciones/:id`, tax_id, status badge; 3 skeleton rows when isFetching; empty-state and no-results-state
- [x] 2.3 Created `AdministrationFormSheet.tsx` — company_name (required), tax_id, email, phone, address, notes; no status field; create + edit via `useMutateAdministration`
- [x] 2.4 Created `AdministrationStatusToggle.tsx` — mirrors BuildingStatusToggle; `useBuildings({administrationId})` to count active buildings; shows "N edificios activos" dialog; no delete
- [x] 2.5 Created `routes/administraciones/AdministrationsPage.tsx` — search input + useDebounce(300) + AdministrationsTable + AdministrationFormSheet

### Phase 4 — Tests (PR1 subset)
- [x] 4.1 + 4.2 `useAdministrations.test.ts` — 5 tests: default no-args, backward compat, search .or(), trim whitespace, empty search
- [x] 4.3 + 4.4 `useDebounce.test.ts` — 5 tests: initial value, no update before delay, update after delay, timer reset, number type
- [x] 4.5 + 4.6 `useMutateAdministration.test.ts` — 5 tests: create happy path, 23505 duplicate, update excludes lifecycle fields, update invalidates, deactivate happy path
- [x] 4.7 + 4.8 `AdministrationStatusToggle.test.tsx` — 7 tests: inactive renders nothing, active shows button, blocks with 2 buildings, blocks with 1 building, Entendido only (no delete), allows deactivation with 0 active, ignores inactive buildings
- [x] 4.13 `useMutateBuilding.test.ts` (extended) — added prefix invalidation assertion + updated existing assertions to use `['admin','buildings']` prefix

### Phase 5 — Cleanup (PR1)
- [x] 5.1 Deleted `routes/buildings/BuildingsPage.tsx`
- [x] 5.2 Updated `main.tsx` to use `/administraciones` routes (one source of truth)

## Files Changed

| File | Action | Description |
|------|--------|-------------|
| `apps/admin/src/lib/queryKeys.ts` | Modified | Added `administrationsKey`, `administrationKey`; discriminated `buildingsKey(administrationId?)` |
| `apps/admin/src/hooks/useAdministrations.ts` | Modified | Extended with search/status params, .or() ILIKE, new fields, new queryKey |
| `apps/admin/src/hooks/useBuildings.ts` | Modified | Added `administrationId?` filter, updated queryKey |
| `apps/admin/src/hooks/useMutateBuilding.ts` | Modified | Prefix invalidation `['admin','buildings']`; removed unused import |
| `apps/admin/src/hooks/mapMutationError.ts` | Modified | Added `administrations_tax_id_key` case to 23505 handler |
| `apps/admin/src/hooks/useDebounce.ts` | Created | Generic `useDebounce<T>` hook |
| `apps/admin/src/hooks/useMutateAdministration.ts` | Created | create/update/deactivate with invalidation + error handling |
| `apps/admin/src/main.tsx` | Modified | Administraciones routes; /buildings redirect; index → /administraciones |
| `apps/admin/src/routes/index.tsx` | Modified | Navigate to /administraciones |
| `apps/admin/src/routes/buildings/BuildingsPage.tsx` | Deleted | No longer needed; /buildings → redirect |
| `apps/admin/src/routes/administraciones/AdministrationsPage.tsx` | Created | Main list page with search + debounce |
| `apps/admin/src/routes/administraciones/AdministrationDetailPage.tsx` | Created | PR2 stub (returns null) |
| `apps/admin/src/components/layout/Sidebar.tsx` | Modified | Edificios → Administraciones link |
| `apps/admin/src/components/administrations/AdministrationsTable.tsx` | Created | Table with skeleton, empty state, no-results state |
| `apps/admin/src/components/administrations/AdministrationFormSheet.tsx` | Created | Create/edit sheet; 6 fields; no status |
| `apps/admin/src/components/administrations/AdministrationStatusToggle.tsx` | Created | Deactivation guard with active building count |
| `apps/admin/src/hooks/__tests__/useAdministrations.test.ts` | Created | 5 tests |
| `apps/admin/src/hooks/__tests__/useDebounce.test.ts` | Created | 5 tests |
| `apps/admin/src/hooks/__tests__/useMutateAdministration.test.ts` | Created | 5 tests |
| `apps/admin/src/components/administrations/__tests__/AdministrationStatusToggle.test.tsx` | Created | 7 tests |
| `apps/admin/src/hooks/__tests__/useMutateBuilding.test.ts` | Modified | Updated to use prefix assertions + added 4.13 test |

## Work Unit Evidence

| Evidence | Value |
|---|---|
| Focused test command | `pnpm --filter admin exec vitest run` |
| Test result | 86/86 passed (14 test files) |
| Typecheck | `pnpm --filter admin typecheck` → clean |
| Lint | `pnpm --filter admin lint` → 0 errors, 4 pre-existing shadcn warnings |
| Build | `pnpm --filter admin build` → clean |
| Runtime harness | Navigate to `/administraciones` in local dev; sidebar shows "Administraciones"; search debounces; list renders; create/edit sheets work |
| Rollback boundary | Revert 8 modified + 9 new files (all listed above); PR1 is autonomous |

## Bug Found and Fixed

**What**: The initial `useAdministrations` hook applied `.order()` before conditional `.or()`. When search was provided, the chain was `select().order().or()` — calling `.or()` on a resolved Promise returned `undefined`, causing the query to fail silently.

**Fix**: Reordered to `select() → [eq?] → [or?] → order()` so `.order()` is always the terminal step.

## Deviations from Design

- `AdministrationDetailPage` is a PR2 stub returning `null` (as intended — design defers detail to PR2)
- `mapMutationError.ts` was extended with the 23505 administration case (design specified this as an addition to the function, consistent with the existing pattern)
- Route tree is in `main.tsx` only (design mentioned both `main.tsx` and `routes/index.tsx`; `routes/index.tsx` is preserved as a redirect component but the route tree lives in `main.tsx` per existing pattern)

## Remaining Tasks (PR2)

- [ ] 3.1 `useAdministration.ts` — single by id
- [ ] 3.2 `AdministrationDetailPage.tsx` — full implementation
- [ ] 3.3 `BuildingFormSheet.tsx` — `administrationId?` prop
- [ ] 3.4 `BuildingsTable.tsx` — building name as Link
- [ ] 3.5 `BuildingDetailPage.tsx` — breadcrumb via useAdministration
- [ ] 4.9-4.12 BuildingFormSheet and BuildingsTable tests
- [ ] 5.3-5.5 Full verification + smoke tests
