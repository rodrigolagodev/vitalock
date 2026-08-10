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

---

# Apply Progress: admin-administrations PR2

**Batch**: PR2 — AdministrationDetailPage + useAdministration + BuildingFormSheet prop + BuildingsTable Link + BuildingDetailPage breadcrumb
**Mode**: Standard
**Status**: done (Phase 3 + Phase 4 PR2 subset + Phase 5 partial)
**Date**: 2026-08-09

## Completed Tasks (PR2)

### Phase 3 — Core Implementation: Administration Detail + Building Wiring
- [x] 3.1 Created `apps/admin/src/hooks/useAdministration.ts` — single-record query `['admin','administration',id]`; fetches `id, company_name, tax_id, address, status` by PK via `.maybeSingle()`; returns null when not found; `enabled: Boolean(id)`
- [x] 3.2 Created (replaced stub) `apps/admin/src/routes/administraciones/AdministrationDetailPage.tsx` — breadcrumb header (company_name, tax_id, address, status badge, "Editar" button opening AdministrationFormSheet); nested BuildingsTable scoped to `administrationId` with isFetching prop; "Nuevo edificio" CTA opening BuildingFormSheet with `administrationId` prop; inline loading/not-found/error states
- [x] 3.3 Extended `apps/admin/src/components/buildings/BuildingFormSheet.tsx` — added optional `administrationId?: string` prop; when provided, hides the Select (`!isEdit && !administrationId`); `useEffect` pre-fills `administration_id` from prop (takes priority over `building?.administration_id`); backward-compatible (existing callers without prop unchanged)
- [x] 3.4 Updated `apps/admin/src/components/buildings/BuildingsTable.tsx` — building name cell now `<Link to={/buildings/${building.id}}>` with `hover:underline`; added optional `isFetching?: boolean` prop with 3 skeleton rows; empty state preserved; existing callers without `isFetching` unaffected (defaults to false)
- [x] 3.5 Updated `apps/admin/src/routes/buildings/BuildingDetailPage.tsx` — added `useAdministration` import + call with `building?.administration_id ?? ''`; breadcrumb shows "Administraciones / <admin name link> / <building name>"; skeleton during admin load; graceful when `administration_id` is null (shows "Sin administración" text); back links updated from `/buildings` to `/administraciones`

### Phase 4 — Tests (PR2 subset)
- [x] 4.9 + 4.10 Created `BuildingFormSheet.test.tsx` — 3 tests: Select present without administrationId, Select absent with administrationId, name field present with administrationId
- [x] 4.11 + 4.12 Created `BuildingsTable.test.tsx` — 4 tests: names are anchor links, link tagName is A, empty state, skeleton rows when isFetching
- [x] (bonus) Created `useAdministration.test.ts` — 4 tests: happy path fetch, null when not found, correct queryKey `['admin','administration',id]`, disabled when id is empty

### Phase 5 — Verification (PR2)
- [x] 5.3 Full Vitest suite: 97/97 pass (17 test files) — all prior 86 pass + 11 new pass

## Files Changed (PR2)

| File | Action | Description |
|------|--------|-------------|
| `apps/admin/src/hooks/useAdministration.ts` | Created | Single admin by id; queryKey `['admin','administration',id]` |
| `apps/admin/src/routes/administraciones/AdministrationDetailPage.tsx` | Replaced stub | Full implementation: header + edit sheet + scoped BuildingsTable + "Nuevo edificio" CTA |
| `apps/admin/src/components/buildings/BuildingFormSheet.tsx` | Modified | Added `administrationId?` prop; hides Select; pre-fills field |
| `apps/admin/src/components/buildings/BuildingsTable.tsx` | Modified | Building name → Link; added `isFetching?` prop with skeleton rows |
| `apps/admin/src/routes/buildings/BuildingDetailPage.tsx` | Modified | Breadcrumb with useAdministration; null-safe; back links → /administraciones |
| `apps/admin/src/hooks/__tests__/useAdministration.test.ts` | Created | 4 tests for hook |
| `apps/admin/src/components/buildings/__tests__/BuildingFormSheet.test.tsx` | Created | 3 tests (Select hide/show + pre-fill) |
| `apps/admin/src/components/buildings/__tests__/BuildingsTable.test.tsx` | Created | 4 tests (Link, empty state, skeleton) |

## Work Unit Evidence (PR2)

| Evidence | Value |
|---|---|
| Focused test command | `pnpm --filter admin exec vitest run --reporter=verbose` |
| Test result | 97/97 passed (17 test files) |
| Typecheck | `pnpm --filter admin typecheck` → clean |
| Lint | `pnpm --filter admin lint` → 0 errors, 4 pre-existing shadcn warnings |
| Build | `pnpm --filter admin build` → clean |
| Runtime harness | Navigate to `/administraciones/:adminId`; buildings scoped; "Nuevo edificio" hides Select; building name link navigates to detail; breadcrumb shows admin name |
| Rollback boundary | Revert 5 modified/replaced + 3 new test files; PR1 base stays intact |

## Deviations from Design

- `BuildingsTable` gained an `isFetching?` prop (defaults false) to support skeleton rendering from `AdministrationDetailPage`; the design mentioned skeleton behavior implicitly, this makes it explicit and backward-compatible.
- `AdministrationDetailPage` fetches `address` from `useAdministration` (in addition to `id, company_name, tax_id, status`) to display in the header. This is a minor extension consistent with the spec's "renders info section" requirement.
- `BuildingDetailPage` back links changed from `/buildings` (now a redirect) to `/administraciones` for consistency with the removed top-level route.

## Remaining Tasks

- [ ] 5.4 Manual smoke-test PR1 slice
- [ ] 5.5 Manual smoke-test PR2 slice
(These are manual verification steps; automated pipeline gates all pass)
