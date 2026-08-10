# Proposal: Admin Administrations

**Change**: admin-administrations
**Phase**: propose
**Date**: 2026-08-09

## Intent

Buildings is the current top-level admin entity, but the real hierarchy is: Administrations own buildings. Today administrations are only a Select inside the building form — no list, no search, no CRUD surface. This forces the admin to work without the primary organizing layer, making it impossible to find all buildings for a given company or manage company-level data. Correct the hierarchy by pivoting `Administraciones` to top-level and nesting buildings inside each administration's detail page.

## Scope

### In Scope

- New `AdministrationsPage`: server-side search (company_name + tax_id), status filter, "Nueva administración" CTA
- New `AdministrationDetailPage`: editable admin info (Sheet) + nested buildings list + "Nuevo edificio" CTA pre-bound to the administration
- New `AdministrationFormSheet`: create and edit an administration record (all nullable fields optional)
- New `AdministrationStatusToggle`: deactivation blocked with count when the administration has active buildings
- Route pivot: `/` redirects to `/administraciones`; `/buildings` route removed (redirect to `/administraciones`)
- Sidebar: "Infraestructura → Administraciones" replaces "Infraestructura → Edificios"
- `BuildingFormSheet`: accept `administrationId` prop — pre-fill + hide the administration Select
- `BuildingsTable`: building name becomes `<Link to="/buildings/:id">`
- `BuildingDetailPage`: breadcrumb fetches administration name via `useAdministration` (cached from list)
- New hooks: `useAdministration`, `useMutateAdministration`, `useDebounce`
- Extended hooks: `useAdministrations` (search + status params), `useBuildings` (administrationId filter)
- Query key discriminator in `queryKeys.ts`: `buildingsKey()` vs `buildingsKey(id)`

### Out of Scope

- Global buildings list route (the old `/buildings` top-level view is removed, not preserved)
- Bulk administration operations
- Argentine CUIT format validation (format not enforced at DB or UI level)
- Physical deletion of administrations or buildings
- Administration-level reporting or aggregates beyond active building count

## Capabilities

### New Capabilities

- `administrations-admin`: CRUD + server-side search for the `public.administrations` table; includes list page, detail page, create/edit Sheet, and deactivation guard

### Modified Capabilities

- `admin-shell`: root redirect target changes from `/buildings` to `/administraciones`; sidebar link updated; route tree expanded with two new administration paths
- `buildings-admin`: buildings list is now nested inside administration detail instead of top-level; `BuildingFormSheet` accepts `administrationId` prop; `BuildingsTable` name becomes a link; `BuildingDetailPage` gains administration breadcrumb

## Approach

Full pivot using the established admin-infra-crud patterns (TanStack Query hooks, Shadcn Sheet for forms, Sonner toasts via `mapMutationError`, plain invalidation). No new DB migrations — `public.administrations` already exists with RLS. The client-side deactivation guard reads `useBuildings({ administrationId })` and blocks the toggle when any active building is found, consistent with how `BuildingStatusToggle` guards against active children.

Search is debounced 300 ms via a generic `useDebounce` hook; the query passes `search` (ILIKE on company_name and tax_id) and `status` params to `useAdministrations`. While `isFetching` is true, three skeleton rows render.

Estimated scope: ~450–550 lines → two chained PRs (PR1: routing + list + hooks; PR2: detail + nested buildings + breadcrumb).

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `apps/admin/src/main.tsx` | Modified | Add administration routes; remove `/buildings` top-level route |
| `apps/admin/src/routes/index.tsx` | Modified | Redirect `/` → `/administraciones` |
| `apps/admin/src/components/layout/Sidebar.tsx` | Modified | Swap Buildings link for Administraciones |
| `apps/admin/src/lib/queryKeys.ts` | Modified | Add administration keys; discriminate building keys by administrationId |
| `apps/admin/src/hooks/useAdministrations.ts` | Modified | Add search and status params |
| `apps/admin/src/hooks/useBuildings.ts` | Modified | Add administrationId filter param |
| `apps/admin/src/components/buildings/BuildingFormSheet.tsx` | Modified | Accept administrationId prop; hide Select when provided |
| `apps/admin/src/components/buildings/BuildingsTable.tsx` | Modified | Building name → Link |
| `apps/admin/src/routes/buildings/BuildingDetailPage.tsx` | Modified | Add breadcrumb with useAdministration lookup |
| `apps/admin/src/hooks/useAdministration.ts` | New | Single administration by id |
| `apps/admin/src/hooks/useMutateAdministration.ts` | New | Create / update / deactivate mutations |
| `apps/admin/src/hooks/useDebounce.ts` | New | Generic 300 ms debounce |
| `apps/admin/src/routes/administraciones/AdministrationsPage.tsx` | New | List + search + CTA |
| `apps/admin/src/routes/administraciones/AdministrationDetailPage.tsx` | New | Info + nested buildings |
| `apps/admin/src/components/administrations/AdministrationsTable.tsx` | New | Table component for administrations list |
| `apps/admin/src/components/administrations/AdministrationFormSheet.tsx` | New | Create / edit Sheet |
| `apps/admin/src/components/administrations/AdministrationStatusToggle.tsx` | New | Deactivation with active-buildings guard |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| `useBuildings` queryKey split breaks existing cache invalidation | Low | Use prefix invalidation `['admin','buildings']`; covers both keyed and unkeyed variants |
| Client-side deactivation guard bypassable via direct API | Low | Acceptable — internal tool; no server-side enforcement added |
| `useAdministration` extra fetch on cold `/buildings/:id` navigation | Low | React Query caches from list load; single stale-while-revalidate hit on first cold nav |
| 400-line budget exceeded per PR | Med | Split into PR1 (routing + list + hooks) and PR2 (detail + nested + breadcrumb); each targets ~260–280 lines |

## Rollback Plan

1. Revert the two PRs (PR2 then PR1).
2. Restore the `/buildings` redirect in `routes/index.tsx` and the Edificios link in `Sidebar.tsx`.
3. Removing the new files (8 new, 0 shared) leaves no orphan code.
4. No DB migrations to reverse.

## Dependencies

- `public.administrations` table with RLS `for all` — already in place (no migration needed)
- `admin-infra-crud` cycle archived — Buildings/Units/Equipment CRUD in production; this change builds on top

## Success Criteria

- [ ] `/administraciones` renders a paginated/searchable list of administrations with status badges
- [ ] Search by company_name and tax_id (debounced, skeleton on fetch) works correctly
- [ ] "Nueva administración" sheet creates a record; list refreshes; success toast shown
- [ ] Administration edit sheet updates non-lifecycle fields; success toast shown
- [ ] Deactivating an administration with active buildings is blocked with the active building count displayed
- [ ] Administration detail page shows company info and a nested buildings table scoped to that administration
- [ ] "Nuevo edificio" from detail page pre-fills and hides the administration Select
- [ ] Building names in the nested table link to `/buildings/:id`
- [ ] `BuildingDetailPage` breadcrumb shows the administration name (fetched via `useAdministration`)
- [ ] Root `/` and old `/buildings` both redirect to `/administraciones`
- [ ] Sidebar link is "Administraciones" under Infraestructura
- [ ] No TypeScript errors; all existing tests pass
