# Design: admin-administrations

**Change**: admin-administrations
**Phase**: design
**Date**: 2026-08-09
**Persistence**: openspec + engram (`sdd/admin-administrations/design`)

## Technical Approach

Pivot the admin app hierarchy so `Administraciones` is the top-level entity. Extend the established admin-infra-crud patterns verbatim: TanStack Query hooks per entity, Shadcn Sheet for forms, Sonner toasts via `toastMutationError`, plain invalidation, deactivate-only lifecycle. No new packages, no DB migrations. Two chained PRs split at the 400-line budget.

## Architecture Decisions

### ADR 1 — Search query shape: single `.or()` with ILIKE

| Option | Tradeoff | Decision |
|---|---|---|
| `.or('company_name.ilike.%q%,tax_id.ilike.%q%')` | One PostgREST call; OR logic server-side | **CHOSEN** |
| Two separate `.ilike()` chained calls | PostgREST chains them with AND, wrong semantics | Rejected |
| `.filter()` raw query string | Less type-safe, same wire cost | Rejected |

**Rationale**: PostgREST `.or()` with two comma-separated ILIKE clauses maps to `WHERE company_name ILIKE '%q%' OR tax_id ILIKE '%q%'` — the exact OR semantics required. Chaining two `.ilike()` calls produces AND, which would break tax_id-only matches. Single call.

### ADR 2 — `useDebounce` location: `apps/admin/src/hooks/useDebounce.ts`

| Option | Tradeoff | Decision |
|---|---|---|
| Colocated in `apps/admin/src/hooks/` | Follows prior ADR: no lift until 3rd app | **CHOSEN** |
| Lift to `packages/shared` | Only 2 apps; coupling overhead > duplication cost | Rejected |

**Rationale**: Prior admin-infra-crud ADR established "no lifts until 3rd app." `useDebounce` is ~10 lines. Installer doesn't need it yet. Colocate.

### ADR 3 — `useAdministrations` signature and backward compatibility

```ts
// NEW signature — default preserves existing BuildingFormSheet call site
function useAdministrations({ search, status }: { search?: string; status?: string } = {})

// queryKey discriminates on all params
const administrationsKey = (status?: string, search?: string) =>
  ['admin', 'administrations', status ?? 'all', search ?? ''] as const;
```

The existing `BuildingFormSheet` calls `useAdministrations()` with no args. Default `{}` means `status` is `undefined` — this changes the prior implicit filter `eq('status','active')`. Resolution: keep default `status = 'active'` for `BuildingFormSheet` compatibility by making the queryFn apply `.eq('status', status)` only when `status` is defined and not `'all'`. `AdministrationsPage` passes `status` explicitly (e.g., `'active'` or `undefined` for all-statuses). The `administrationsKey` encodes both params so React Query caches them separately.

**Rationale**: Zero call-site changes at `BuildingFormSheet`. `AdministrationsPage` gets full control via params.

### ADR 4 — `useBuildings` queryKey split and invalidation

```ts
// OLD
const buildingsKey = () => ['admin', 'buildings'] as const;

// NEW
const buildingsKey = (administrationId?: string) =>
  administrationId
    ? ['admin', 'buildings', administrationId]
    : ['admin', 'buildings', 'all'] as const;
```

Prefix invalidation `queryClient.invalidateQueries({ queryKey: ['admin', 'buildings'] })` covers all variants. Existing `useMutateBuilding` invalidation already uses `buildingsKey()` — update it to use the prefix `['admin','buildings']` directly so it covers both scoped and unscoped caches.

**Rationale**: Avoids stale scoped cache after a building is created from `AdministrationDetailPage`. Prefix invalidation is the TanStack Query canonical pattern; no refactoring of individual call sites required.

### ADR 5 — `BuildingFormSheet` `administrationId` prop

```ts
interface BuildingFormSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  building?: Pick<BuildingRow, 'id' | 'name' | 'address' | 'administration_id'> | null;
  administrationId?: string;   // NEW — optional; when present: hides Select, pre-fills field
}
```

When `administrationId` is provided:
- The administration `<Select>` is not rendered.
- `reset()` populates `administration_id` from `administrationId` prop (not from `building`).
- The Zod schema remains unchanged (`administration_id: z.string().uuid()`).
- `useAdministrations()` is still called (for the edit path's select) but hidden when `administrationId` is set.

**Rationale**: Backward-compatible — existing `BuildingsPage` and `BuildingsTable` do not pass `administrationId` so behavior is identical. `AdministrationDetailPage` passes it and gets a pre-filled, hidden Select.

### ADR 6 — `AdministrationStatusToggle` deactivation guard pattern

Mirror `BuildingStatusToggle` exactly:
- Read `useBuildings({ administrationId: administration.id })` — scoped buildings for this admin.
- Count `activeBuildings = buildings.filter(b => b.status === 'active').length`.
- Open a `<Dialog>`: if `activeBuildings > 0` → info dialog with count + "Entendido"; else → confirm dialog → `deactivateAdministration.mutateAsync`.

**Rationale**: Consistent UX with building deactivation guard. Client-side only (DB does not enforce; acceptable for internal tool).

### ADR 7 — `useAdministration` hook (single by id)

```ts
const administrationKey = (id: string) => ['admin', 'administration', id] as const;

function useAdministration(id: string) {
  return useQuery({
    queryKey: administrationKey(id),
    queryFn: async () => { /* select id, company_name, status from administrations where id = id */ },
    enabled: Boolean(id),
  });
}
```

Used by `BuildingDetailPage` breadcrumb. On warm navigation (from list → detail), React Query resolves from the `administrationsKey` list cache via `initialData` — NOT implemented as `initialData` (avoids coupling); instead, a stale-while-revalidate single-row fetch fires on first cold nav and is fast (indexed PK lookup).

**Rationale**: Separate key avoids entangling detail with list invalidation. Cold navigation produces at most one extra network call; cached hits resolve instantly.

### ADR 8 — PR ordering: confirm PR1 → PR2 as proposed

| PR | Scope | Lines estimate |
|---|---|---|
| PR1 | Routing pivot + sidebar + `queryKeys.ts` + `useAdministrations`/`useBuildings` (extended) + `useDebounce` + `AdministrationsPage` + `AdministrationsTable` + `AdministrationFormSheet` + `AdministrationStatusToggle` + `useMutateAdministration` | ~260–280 |
| PR2 | `AdministrationDetailPage` + `useAdministration` + `BuildingFormSheet` (administrationId prop) + `BuildingsTable` (name→Link) + `BuildingDetailPage` (breadcrumb) | ~200–230 |

PR2 depends on PR1 for the route tree and `administrationKey`. Sequential is correct.

### ADR 9 — Router edge cases

| Case | Handling |
|---|---|
| `/administraciones/:adminId` with invalid/missing id | `AdministrationDetailPage` calls `useAdministration(id)`; on `data === null` renders not-found inline (same pattern as `BuildingDetailPage` — see existing `isError \|\| building == null` branch) |
| `/buildings/:buildingId` cold nav | `BuildingDetailPage` already handles loading/error states; breadcrumb renders loading skeleton (`w-32 h-4 animate-pulse`) while `useAdministration` resolves |
| `/buildings` (removed top-level route) | `<Route path="buildings" element={<Navigate to="/administraciones" replace />} />` in `main.tsx` |

## Data Flow

```
AdministrationsPage
  searchInput ──[300ms debounce]──► useAdministrations({ search, status })
                                        └── supabase .or('company_name.ilike,tax_id.ilike')
                                        └── queryKey: ['admin','administrations', status, search]
  AdministrationsTable ◄── data
  AdministrationFormSheet ──► useMutateAdministration.createAdministration
                                   └── onSuccess: invalidate ['admin','administrations',...]
  AdministrationStatusToggle
    └── useBuildings({ administrationId })
         └── queryKey: ['admin','buildings', administrationId]
         └── if activeBuildings > 0 → block Dialog
         └── else → useMutateAdministration.deactivateAdministration

AdministrationDetailPage (/administraciones/:adminId)
  useAdministration(adminId) ──► header info + edit Sheet
  useBuildings({ administrationId: adminId }) ──► BuildingsTable (name as Link)
  BuildingFormSheet(administrationId=adminId) ──► hides Select, pre-fills

BuildingDetailPage (/buildings/:buildingId)
  useBuilding(buildingId) ──► header
  useAdministration(building.administration_id) ──► breadcrumb
  breadcrumb: Link to /administraciones/:adminId
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `apps/admin/src/main.tsx` | Modify | Add `/administraciones` + `/administraciones/:adminId` routes; `/buildings` top-level → Navigate; index → `/administraciones` |
| `apps/admin/src/routes/index.tsx` | Modify | `<Navigate to="/administraciones" replace />` |
| `apps/admin/src/components/layout/Sidebar.tsx` | Modify | Swap "Edificios" link → "Administraciones" to `/administraciones` |
| `apps/admin/src/lib/queryKeys.ts` | Modify | Add `administrationsKey`, `administrationKey`; discriminate `buildingsKey(administrationId?)` |
| `apps/admin/src/hooks/useAdministrations.ts` | Modify | Add `{ search?, status? }` params; ILIKE `.or()` query; new queryKey |
| `apps/admin/src/hooks/useBuildings.ts` | Modify | Add `administrationId?` filter; update queryKey to include discriminator |
| `apps/admin/src/hooks/useMutateBuilding.ts` | Modify | Update `invalidateQueries` to prefix `['admin','buildings']` |
| `apps/admin/src/components/buildings/BuildingFormSheet.tsx` | Modify | Add `administrationId?` prop; hide Select + pre-fill when provided |
| `apps/admin/src/components/buildings/BuildingsTable.tsx` | Modify | Building name cell → `<Link to={/buildings/${b.id}}>` |
| `apps/admin/src/routes/buildings/BuildingDetailPage.tsx` | Modify | Add breadcrumb via `useAdministration`; update "back" link logic |
| `apps/admin/src/hooks/useAdministration.ts` | Create | Single administration by id; `administrationKey(id)` |
| `apps/admin/src/hooks/useMutateAdministration.ts` | Create | `createAdministration`, `updateAdministration`, `deactivateAdministration`; invalidate `administrationsKey` prefix |
| `apps/admin/src/hooks/useDebounce.ts` | Create | Generic `useDebounce<T>(value, delay)` with `useEffect` + `useState` |
| `apps/admin/src/routes/administraciones/AdministrationsPage.tsx` | Create | Search input + status filter + table + "Nueva administración" CTA |
| `apps/admin/src/routes/administraciones/AdministrationDetailPage.tsx` | Create | Admin info header + edit Sheet + scoped BuildingsTable + "Nuevo edificio" CTA |
| `apps/admin/src/components/administrations/AdministrationsTable.tsx` | Create | Table: company_name, tax_id, status badge, edit + toggle actions |
| `apps/admin/src/components/administrations/AdministrationFormSheet.tsx` | Create | Create/edit Sheet; fields: company_name (required), tax_id, email, phone, address, notes; RHF + Zod |
| `apps/admin/src/components/administrations/AdministrationStatusToggle.tsx` | Create | Deactivation guard; mirrors BuildingStatusToggle with `useBuildings({ administrationId })` count |

Total: 8 new files, 9 modified files.

## Interfaces / Contracts

```ts
// queryKeys.ts additions
export const administrationsKey = (status?: string, search?: string) =>
  ['admin', 'administrations', status ?? 'all', search ?? ''] as const;
export const administrationKey = (id: string) =>
  ['admin', 'administration', id] as const;
export const buildingsKey = (administrationId?: string) =>
  administrationId
    ? ['admin', 'buildings', administrationId]
    : ['admin', 'buildings', 'all'] as const;

// useAdministrations.ts — extended row type
export interface AdministrationRow {
  id: string;
  company_name: string;
  tax_id: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  status: string;
  notes: string | null;
}

// useAdministrations params
function useAdministrations({ search, status }: { search?: string; status?: string } = {})

// useBuildings params — administrationId optional
function useBuildings({ administrationId }: { administrationId?: string } = {})

// BuildingFormSheet — new prop
interface BuildingFormSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  building?: Pick<BuildingRow, 'id' | 'name' | 'address' | 'administration_id'> | null;
  administrationId?: string;
}

// useMutateAdministration
interface CreateAdministrationInput { company_name: string; tax_id?: string | null; email?: string | null; phone?: string | null; address?: string | null; notes?: string | null; }
interface UpdateAdministrationInput extends Partial<Omit<CreateAdministrationInput, never>> { id: string; }
interface DeactivateAdministrationInput { id: string; }
```

## Error mapping additions (admin `mapMutationError`)

For administration 23505 (duplicate `tax_id`):
```ts
case '23505':
  if (err.details?.includes('administrations_tax_id_key') || err.details?.includes('tax_id')) {
    toast.error('Ya existe una administración con ese CUIT/CUIL.');
  } else { /* existing generic */ }
```

No new SQLSTATE codes needed beyond existing set.

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | `useDebounce` — value updates only after delay | `renderHook` + `vi.useFakeTimers` |
| Unit | `administrationsKey` / `buildingsKey` discriminator shape | plain assertions |
| Unit | `AdministrationStatusToggle` — block vs confirm branch | `render` with mocked `useBuildings` returning active/inactive buildings |
| Unit | `BuildingFormSheet` with `administrationId` prop — Select hidden, field pre-filled | `render` + `screen.queryByRole('combobox')` |
| Integration | `useAdministrations` with search — `.or()` query fired after debounce | MSW intercept or Supabase mock |
| E2E | Not added this change (no E2E suite in place yet) | — |

## Threat Matrix

N/A — no routing framework changes, no shell commands, no subprocess integration, no VCS/PR automation, no executable-file classification, and no process-integration boundary. React Router `<Navigate>` and route additions are client-side declarative redirects, not server-side routing changes.

## Migration / Rollout

No data migration. No feature flags. Rollback: revert PR2, then PR1; restore `/buildings` redirect and "Edificios" sidebar link. No orphan DB objects.

## Open Questions

- None. All user decisions have been baked in per the design brief.
