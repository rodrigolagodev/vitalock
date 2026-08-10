# Tasks: admin-administrations

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | PR1 ~270–290 lines / PR2 ~210–230 lines |
| 400-line budget risk | PR1 Low · PR2 Low |
| Chained PRs recommended | Yes |
| Suggested split | PR1 (routing + sidebar + hooks + list page) → PR2 (detail page + breadcrumb + BuildingFormSheet prop) |
| Delivery strategy | auto-chain |
| Chain strategy | stacked-to-main |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | Routing + sidebar + query layer + AdministrationsPage + all list-level components | PR1 | `pnpm vitest run --reporter=verbose` inside `apps/admin` | Navigate to `/administraciones` in local dev; verify sidebar link and list render | Revert 8 files: `main.tsx`, `routes/index.tsx`, `Sidebar.tsx`, `queryKeys.ts`, `useAdministrations.ts`, `useBuildings.ts`, `useMutateBuilding.ts`, `useDebounce.ts` + 4 new files |
| 2 | AdministrationDetailPage + useAdministration + BuildingFormSheet prop + BuildingsTable Link + BuildingDetailPage breadcrumb | PR2 | `pnpm vitest run --reporter=verbose` inside `apps/admin` | Navigate to `/administraciones/:id` in local dev; create building; navigate to detail via link | Revert 3 modified files + 3 new files; PR1 base stays intact |

---

## Phase 1 — Foundation: Query Layer + Routing (PR1)

- [x] 1.1 Extend `AdministrationRow` in `apps/admin/src/hooks/useAdministrations.ts` to include `tax_id`, `email`, `phone`, `address`, `notes` fields; change queryKey to `['admin','administrations', status ?? 'all', search ?? '']`; add `{ search?, status? }` params; apply `.or('company_name.ilike.%q%,tax_id.ilike.%q%')` when search is non-empty; keep default `{}` call backward-compatible with `BuildingFormSheet`.
- [x] 1.2 Add `administrationsKey(status, search)` and `administrationKey(id)` overloads to `apps/admin/src/lib/queryKeys.ts`; replace `buildingsKey()` with `buildingsKey(administrationId?)` → `['admin','buildings','all']` (unscoped) and `['admin','buildings', id]` (scoped); add `administrationsKey` and `administrationKey` exports.
- [x] 1.3 Update `apps/admin/src/hooks/useBuildings.ts` to accept optional `administrationId` param; use `buildingsKey(administrationId)` from updated `queryKeys.ts`; apply `.eq('administration_id', administrationId)` when provided.
- [x] 1.4 Update `apps/admin/src/hooks/useMutateBuilding.ts` to invalidate by prefix `['admin','buildings']` (covers both scoped and unscoped keys).
- [x] 1.5 Create `apps/admin/src/hooks/useDebounce.ts` — generic `useDebounce<T>(value: T, delay: number): T` hook, ~10 lines.
- [x] 1.6 Update `apps/admin/src/routes/index.tsx`: add `/administraciones` route (AdministrationsPage), add `/administraciones/:adminId` route (AdministrationDetailPage), change `/` redirect target to `/administraciones`, add `/buildings` catch-all redirect to `/administraciones`.
- [x] 1.7 Update `apps/admin/src/components/layout/Sidebar.tsx`: change Infraestructura nav item from `{ label: 'Edificios', to: '/buildings' }` to `{ label: 'Administraciones', to: '/administraciones' }`.

## Phase 2 — Core Implementation: Administrations List (PR1)

- [x] 2.1 Create `apps/admin/src/hooks/useMutateAdministration.ts` — `create` (insert) and `update` (non-lifecycle fields) mutations; invalidate `['admin','administrations']` prefix; map SQLSTATE 23505 on `administrations_tax_id_key` → friendly Spanish message via `mapMutationError`.
- [x] 2.2 Create `apps/admin/src/components/administrations/AdministrationsTable.tsx` — renders rows with company_name (Link to `/administraciones/:id`), tax_id, status badge, and skeleton rows (3 rows) when `isFetching`; empty-state "No hay administraciones registradas"; no-results-state "No se encontraron resultados para '\<query\>'".
- [x] 2.3 Create `apps/admin/src/components/administrations/AdministrationFormSheet.tsx` — Sheet with fields: company_name (required), tax_id, email, phone, address, notes; no status field; used for both create and edit; calls `useMutateAdministration`.
- [x] 2.4 Create `apps/admin/src/components/administrations/AdministrationStatusToggle.tsx` — mirrors `BuildingStatusToggle`; calls `useBuildings({ administrationId })` to count active buildings; blocks deactivation showing "N edificios activos" in Dialog; no delete action.
- [x] 2.5 Create `apps/admin/src/routes/administrations/AdministrationsPage.tsx` — composes search input (with `useDebounce(300)`), AdministrationsTable, AdministrationFormSheet (create), and AdministrationStatusToggle; passes debounced search to `useAdministrations({ search })`.

## Phase 3 — Core Implementation: Administration Detail + Building Wiring (PR2)

- [ ] 3.1 Create `apps/admin/src/hooks/useAdministration.ts` — single-record query `['admin','administration',id]`; fetches `id, company_name, tax_id, status` by PK; returns null when not found.
- [ ] 3.2 Create `apps/admin/src/routes/administrations/AdministrationDetailPage.tsx` — fetches administration via `useAdministration(adminId)`; renders info section (company_name, tax_id, status), nested `BuildingsTable` scoped to `administrationId`, and "Nuevo edificio" CTA opening `BuildingFormSheet` with `administrationId` prop; inline not-found state when id invalid.
- [ ] 3.3 Extend `apps/admin/src/components/buildings/BuildingFormSheet.tsx` — add optional `administrationId?: string` prop; when provided, pre-fill field and hide administration Select; backward-compatible (existing callers pass nothing).
- [ ] 3.4 Update `apps/admin/src/components/buildings/BuildingsTable.tsx` — render each building name as `<Link to={/buildings/${id}}>` instead of plain text; no other behavior change.
- [ ] 3.5 Update `apps/admin/src/routes/buildings/BuildingDetailPage.tsx` — add breadcrumb that calls `useAdministration(building.administration_id)`; renders "administrationName → building.name" with link to `/administraciones/:adminId`; shows skeleton while resolving; graceful when `administration_id` is null.

## Phase 4 — Tests

- [x] 4.1 RED: write failing test for `useAdministrations` search — assert query string contains `.or('company_name.ilike.%q%,tax_id.ilike.%q%')` when search is non-empty; assert default call (no args) omits the `.or()` filter. File: `apps/admin/src/hooks/__tests__/useAdministrations.test.ts`.
- [x] 4.2 GREEN: run tests; confirm pass after Phase 1 implementation of `useAdministrations`.
- [x] 4.3 RED: write failing test for `useDebounce` — assert returned value does not update until delay elapses (use `vi.useFakeTimers`). File: `apps/admin/src/hooks/__tests__/useDebounce.test.ts`.
- [x] 4.4 GREEN: run tests; confirm pass after Phase 1 implementation of `useDebounce`.
- [x] 4.5 RED: write failing test for `useMutateAdministration` — assert `create` mutation calls supabase insert; assert `update` excludes lifecycle fields; assert 23505 error maps to friendly message. File: `apps/admin/src/hooks/__tests__/useMutateAdministration.test.ts`.
- [x] 4.6 GREEN: run tests; confirm pass after Phase 2 implementation of `useMutateAdministration`.
- [x] 4.7 RED: write failing test for `AdministrationStatusToggle` — assert toggle is disabled when active buildings count > 0; assert dialog shows "N edificios activos"; assert no delete action rendered. File: `apps/admin/src/components/administrations/__tests__/AdministrationStatusToggle.test.tsx`.
- [x] 4.8 GREEN: run tests; confirm pass after Phase 2 implementation of `AdministrationStatusToggle`.
- [ ] 4.9 RED: write failing test for `BuildingFormSheet` with `administrationId` prop — assert Select is not in the document; assert pre-filled hidden field value equals the prop. File: `apps/admin/src/components/buildings/__tests__/BuildingFormSheet.test.tsx` (extend existing file).
- [ ] 4.10 GREEN: run tests; confirm pass after Phase 3 implementation of `BuildingFormSheet` prop.
- [ ] 4.11 RED: write failing test for `BuildingsTable` — assert each building name renders as an `<a>` or `<Link>` with `href` matching `/buildings/:id`. File: `apps/admin/src/components/buildings/__tests__/BuildingsTable.test.tsx`.
- [ ] 4.12 GREEN: run tests; confirm pass after Phase 3 implementation of `BuildingsTable`.
- [x] 4.13 Write test for `useMutateBuilding` prefix invalidation — assert `queryClient.invalidateQueries` called with `['admin','buildings']` (prefix, not exact key). File: `apps/admin/src/hooks/__tests__/useMutateBuilding.test.ts` (extend existing).

## Phase 5 — Cleanup + Verification

- [x] 5.1 Remove `apps/admin/src/routes/buildings/BuildingsPage.tsx` — top-level buildings list page no longer reachable; delete file after confirming PR1 route redirects are in place.
- [x] 5.2 Update `apps/admin/src/main.tsx` if root redirect is configured there (align with `routes/index.tsx` change; one source of truth for redirect).
- [ ] 5.3 Run full Vitest suite `pnpm vitest run` in `apps/admin`; assert zero failures.
- [ ] 5.4 Manual smoke-test PR1 slice: `/` → redirects to `/administraciones`; `/buildings` → redirects to `/administraciones`; sidebar shows "Administraciones"; list renders with skeleton then data; search debounces and filters; create sheet works; edit sheet excludes status; deactivation blocked by active buildings.
- [ ] 5.5 Manual smoke-test PR2 slice: `/administraciones/:adminId` → detail renders; buildings scoped; "Nuevo edificio" CTA hides Select; building name link navigates to `/buildings/:id`; BuildingDetailPage breadcrumb shows admin name linking to `/administraciones/:adminId`; cold-nav breadcrumb resolves.
