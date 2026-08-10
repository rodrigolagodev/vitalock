# Exploration: admin-administrations

**Change**: admin-administrations
**Phase**: explore
**Date**: 2026-08-09
**Persistence**: openspec + engram (`sdd/admin-administrations/explore`)

## Summary

Pivot the admin app so Administraciones is the top-level entity. Today (post admin-infra-crud archive) Buildings is top-level and administrations are only a Select in the building form. Correct hierarchy:

```
Administraciones (list + server-side search + CTA)
  └── Detail: admin info editable + buildings list nested
       └── Building detail: units + equipment (already exists)
```

## DB — `public.administrations`

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | gen_random_uuid() |
| company_name | text NOT NULL | |
| tax_id | text UNIQUE nullable | Argentine CUIT, format not enforced |
| email | text nullable | |
| phone | text nullable | |
| address | text nullable | |
| status | text NOT NULL | CHECK IN ('active','inactive'), default 'active' |
| notes | text nullable | |
| created_at / updated_at | timestamptz | trigger-maintained |

- RLS: admin has FOR ALL.
- Soft-delete via `status='inactive'`; physical DELETE blocked by FK RESTRICT from `buildings.administration_id`.
- **DB does NOT block** setting `status='inactive'` when active buildings exist. Guard must be client-side.

No migrations needed for this change.

## Recommended approach — full pivot (Administraciones primary)

- `/administraciones` replaces `/buildings` as the home route
- Sidebar: "Infraestructura → Administraciones" (Edificios queda accesible desde detail)
- New: AdministrationsPage (list + search + CTA), AdministrationDetailPage (info + nested buildings)
- Reuse: useAdministrations (extend with search/status params), useBuildings (add administrationId filter), BuildingFormSheet (add administrationId prop that hides Select), BuildingsTable, BuildingStatusToggle

## Affected files

**New (8)**:
- `hooks/useAdministration.ts` (single by id)
- `hooks/useMutateAdministration.ts` (create/update/deactivate)
- `hooks/useDebounce.ts` (generic 300ms)
- `routes/administraciones/AdministrationsPage.tsx`
- `routes/administraciones/AdministrationDetailPage.tsx`
- `components/administrations/AdministrationsTable.tsx`
- `components/administrations/AdministrationFormSheet.tsx`
- `components/administrations/AdministrationStatusToggle.tsx`

**Modified (9)**:
- `main.tsx` (routes)
- `routes/index.tsx` (redirect target)
- `components/layout/Sidebar.tsx`
- `lib/queryKeys.ts` (administration keys + buildings key discriminator)
- `hooks/useAdministrations.ts` (search/status params)
- `hooks/useBuildings.ts` (administrationId filter param)
- `components/buildings/BuildingFormSheet.tsx` (administrationId prop hides Select)
- `components/buildings/BuildingsTable.tsx` (name → Link)
- `routes/buildings/BuildingDetailPage.tsx` (breadcrumb)

## Design decisions embedded

- Search: parameterize `useAdministrations({ search?, status? })`. Default preserves current behavior (`status: 'active'`).
- Debounce: custom 10-line `useDebounce` hook, 300ms; while `isFetching`, render 3 skeleton rows.
- Deactivation guard: `AdministrationStatusToggle` reads `useBuildings({ administrationId })`, blocks if any active building exists. Same pattern as `BuildingStatusToggle`.
- `BuildingFormSheet.administrationId` prop: when provided, pre-fill + hide Select; backward-compatible.
- `BuildingsTable` name → `<Link to="/buildings/:id">`.
- `BuildingDetailPage` breadcrumb: fetch admin name via new `useAdministration` hook, cached from list.

## Risks

1. **`useBuildings` queryKey split**: `buildingsKey()` → `['admin','buildings','all']`; `buildingsKey(id)` → `['admin','buildings',id]`. Prefix invalidation covers both.
2. **Budget**: ~450-550 lines → likely 2 chained PRs (PR1 routing + list + hooks, PR2 detail + nested + breadcrumb).
3. **Client-side deactivation guard**: bypassable via direct API — acceptable for internal tool.
4. **BuildingDetailPage extra fetch**: `useAdministration` on cold nav to `/buildings/:id` — cached after list load.

## Pending user decisions

- Q1: `/buildings` top-level fate — remove/redirect vs keep as global list with admin column?
- Q2: Search fields — company_name only vs company_name + tax_id (rec: both)
- Q3: Deactivate admin with active buildings — BLOCK vs cascade (rec: BLOCK, consistent)
- Q4: Detail edit UX — Sheet vs inline (rec: Sheet, consistent)
- Q5: Building breadcrumb — fetch admin name vs generic (rec: fetch)
