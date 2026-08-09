# Design: admin-infra-crud

**Change**: admin-infra-crud
**Phase**: design
**Date**: 2026-08-09
**Persistence**: openspec + engram (`sdd/admin-infra-crud/design`)

## Executive summary

Ship the admin app's first vertical slice — Buildings, Units, Equipment CRUD — as three chained PRs on top of a persistent sidebar shell. Reuse installer-worklist's exact data-access recipe (TanStack Query hooks per entity, centralized SQLSTATE error map, plain invalidation on success). Lift nothing new to `@vitalock/ui` / `@vitalock/shared` this round; keep everything colocated inside `apps/admin/src`. Deactivate-only lifecycle. Dedicated dialogs for the two side-effectful ops (equipment decommission + `operations.replace_equipment` RPC). Impact preview via a client-side COUNT (no new RPC).

## File layout

```
apps/admin/src/
├── main.tsx                          # providers + Toaster + Router
├── App.tsx                           # AppShell wrapper (sidebar + <Outlet/>)
├── lib/queryKeys.ts
├── hooks/
│   ├── mapMutationError.ts           # admin-flavored SQLSTATE → toast (duplicated, not lifted)
│   ├── useBuildings.ts / useMutateBuilding.ts
│   ├── useUnits.ts / useMutateUnit.ts
│   ├── useEquipment.ts / useMutateEquipment.ts
│   ├── useReplaceEquipment.ts        # RPC wrapper
│   └── useDecommissionImpact.ts      # authorization count
├── components/
│   ├── layout/  AppShell.tsx, Sidebar.tsx, NavSection.tsx
│   ├── ui/…                          # shadcn primitives per-app
│   ├── buildings/                    # Table, FormSheet, StatusToggle
│   ├── units/                        # Table, FormSheet, StatusToggle
│   └── equipment/                    # Table, FormSheet, StatusSelect, DecommissionDialog, ReplaceEquipmentDialog
└── routes/
    ├── index.tsx                     # redirect → /buildings
    └── buildings/
        ├── BuildingsPage.tsx
        └── BuildingDetailPage.tsx    # header + Tabs(Unidades|Equipos)
```

Dependency direction one-way: routes → components → hooks → lib. No hook imports a component.

## Layering

- **Data**: TanStack Query hooks call `supabase` directly. Return typed rows from `@vitalock/supabase` types. Only `onError/onSuccess` do side-effects (toast).
- **Component**: presentational + wired; owns local UI state (dialog open, RHF). No direct `supabase` outside hooks.
- **Layout**: `AppShell` replaces empty `<main>` in existing `App.tsx`. Placed once between `ProtectedRoute` and entity routes. No page owns nav chrome.

## Canonical flow — equipment status → dead

```
User picks 'dead' in EquipmentStatusSelect
  → <DecommissionDialog equipmentId=X />
    → useDecommissionImpact(X)  [COUNT query, cached during dialog]
    → user types reason, confirms
    → useMutateEquipment.updateStatus({id, status:'dead', decommission_reason})
      → supabase.schema('operations').from('equipment').update({...}).eq('id', X)
      → onSuccess: invalidate equipmentKey(buildingId)
      → onError:   toastMutationError(e)  → 23514 → "Transición no permitida"
```

## Integration points

| Boundary | Contract |
|---|---|
| Supabase → buildings/units | direct `public` schema PostgREST |
| Supabase → equipment | `.schema('operations')` direct (avoids PGRST200) |
| Supabase → replace | `.schema('operations').rpc('replace_equipment', {...})` |
| Impact preview | `.schema('operations').from('key_authorizations').select('id',{count:'exact',head:true}).eq('equipment_id',X).in('sync_state',['pending_install','pending_removal'])` |
| Toaster | mounted once in `main.tsx` (parity with installer) |
| Auth | reuses `AuthProvider` + `ProtectedRoute`; no changes |

## Query key registry

```ts
export const buildingsKey = () => ['admin', 'buildings'] as const;
export const buildingKey = (id: string) => ['admin', 'building', id] as const;
export const unitsKey = (buildingId: string) => ['admin', 'units', buildingId] as const;
export const equipmentKey = (buildingId: string) => ['admin', 'equipment', buildingId] as const;
export const decommissionImpactKey = (equipmentId: string) => ['admin', 'decommission-impact', equipmentId] as const;
```

Mutation contract: `mutationFn` throws untouched; `onSuccess` invalidates + `toast.success`; `onError` calls `toastMutationError(err)`. **No optimistic updates** (admin ops low-frequency; DB triggers are truth; matches installer).

## Forms

- RHF + Zod at pinned versions (`@hookform/resolvers ^3.9.0`, `zod 3.23.8`).
- Schemas colocated with the form component — schemas are UI concerns coupled to form fields.
- Submit: `handleSubmit(async v => await mutation.mutateAsync(v))`. Sheet stays open on error (toast surfaces the error), closes on success.

### Form UI conventions

- `<Sheet side="right">` for create + edit of all three entities — keeps table visible, ESC/click-away cancels.
- `<Dialog>` for reason confirmations (decommission) and atomic ops (replace equipment) — modal because destructive-adjacent.
- Never inline table editing.

## ADRs

### ADR Q1 — Decommission impact preview: **client-side COUNT**

- Client-side COUNT via TanStack Query with `{count:'exact',head:true}`, no new RPC.
- Filter `key_authorizations` by `equipment_id + sync_state ∈ {pending_install, pending_removal}` — one indexed column, admin RLS covers it.
- A dedicated RPC would need a migration + `SECURITY DEFINER` decision + testing surface — for a number.

### ADR Q2 — Building deactivation with active children: **BLOCK**

- Block with friendly message listing counts of active children.
- `BuildingStatusToggle` checks `useUnits(buildingId)` + `useEquipment(buildingId)` counts (already cached from BuildingDetail) before flipping.
- If any active children exist, confirm dialog swaps to info dialog with counts + link back to the tabs. No RPC.
- Rejected: cascade (hides intent, no undo); warn-only (users click through).

### ADR Q3 — PR ordering: **confirmed as proposed**

- **PR1**: Toaster wiring + `AppShell` sidebar + `queryKeys.ts` + `mapMutationError.ts` + Buildings CRUD.
- **PR2**: `BuildingDetailPage` scaffold (header + Tabs) + Units CRUD (list, sheet, deactivate, `is_administrative` toggle with 23505 mapping).
- **PR3**: Equipment CRUD (list, sheet with immutable-field read-only, status select, DecommissionDialog with impact preview, ReplaceEquipmentDialog RPC).
- Sequential, not parallel — PR2 introduces `BuildingDetailPage` tab shell that PR3 depends on.

### ADR Q4 — Optimistic mutations: **NO, plain invalidation**

- `invalidateQueries` on success; matches installer.
- Admin ops low-frequency, low-cardinality — optimism buys no perceptual value; rollback for 23505 / 23514 is fiddly; DB is source of truth.

### ADR — Shared-primitive lift decisions

| Primitive | Lift? | Where | Why |
|---|---|---|---|
| `mapMutationError`/`toastMutationError` | no | duplicate in `admin/hooks/` | Admin SQLSTATE table diverges from installer; ~70 lines; coupling worse than duplicating. Revisit at 3rd app. |
| `queryKeys.ts` | no | per-app | Namespaced (`['admin',...]` vs `['worklist',...]`), no reuse. |
| `RejectDialog` | no | copy pattern into local `DecommissionDialog` | Different shape (impact-count + status transition context on top of reason). ~80 lines with local tweaks < parameterizing five render slots. |
| `SelectionToolbar` | no | — | Admin has no batch ops this change. |
| Sidebar/NavSection/AppShell | no | `admin/components/layout/` | Installer is mobile-first PWA, no sidebar. |
| shadcn primitives | no | install per-app | shadcn copy-not-install philosophy. |

Net: `@vitalock/ui` and `packages/shared` gain nothing this change.

## Sidebar shell

- Fixed left column `w-60` at `md+`, hidden below `md`, header hamburger toggles slide-over.
- Header 56px, right-aligned user menu (existing `AuthProvider` supplies email + logout).
- Sections (visual order):
  1. **Infraestructura** (active) — child: `Edificios`
  2. **Personal** (disabled, "Próximamente" Badge)
  3. **Ventas** (disabled)
  4. **Tickets** (disabled)
- `NavSection({label, icon, disabled?, children: NavItem[]})`; `NavItem({label, to})` = `<NavLink>`. Disabled sections render as muted `<div>` + `<Badge>Próximamente</Badge>`.
- No dark-mode toggle in PR1.

## New shadcn primitives per PR (only `button.tsx` exists today)

- **PR1**: sheet, dialog, table, input, label, switch, badge, sonner (+ `@radix-ui/react-dialog`, `@radix-ui/react-switch`, `sonner`)
- **PR2**: tabs (+ `@radix-ui/react-tabs`)
- **PR3**: select, textarea (+ `@radix-ui/react-select`)

## Error mapping (admin flavor)

```ts
switch (err.code) {
  case '23505':
    if (err.details?.includes('units_one_admin_per_building'))
      toast.error('Ya existe una unidad administrativa en este edificio.');
    else toast.error('Ya existe un registro con esos datos.');
    return;
  case '23514':
    if (err.message.includes('equipment') && err.message.includes('immutable'))
      toast.error('No se puede modificar este campo una vez creado el equipo.');
    else if (err.message.includes('equipment.status transitions out of dead'))
      toast.error('Un equipo dado de baja no puede reactivarse.');
    else if (err.message.includes('invalid equipment.status transition'))
      toast.error('Transición de estado no permitida.');
    else toast.error('Validación fallida. Revisá los datos.');
    return;
  case '23503': toast.error('No se puede desactivar: tiene registros activos asociados.'); return;
  case '42501': toast.error('No tenés permiso para esta operación.'); return;
  default: toast.error(`Error ${err.code}. Reintentá.`);
}
```

Network + unknown branches identical to installer.

## Rejected alternatives

- Cross-schema PostgREST embed for equipment: PGRST200 confirmed. Two queries + client join instead.
- New `AdminLayout` route element vs replacing empty `<main>` in existing `App.tsx`: chose in-place.
- Realtime subscription on `key_authorizations` for impact preview vs one COUNT: chose COUNT.
- Tab state local `useState` vs URL: chose URL (`useSearchParams()` → `?tab=unidades|equipos`).

## Risks

- `is_administrative` UX gap — postflight 23505 mapping instead of preflight check. Deferred.
- Cross-app pattern drift — duplicating `mapMutationError` means installer improvements don't auto-apply. Revisit at 3rd app.
- Sidebar responsive polish — slide-over hamburger minimal in PR1; may need tablet iteration.
- Replace-RPC error surface returns generic `P0001` — matched via message substring; brittle but matches installer pattern.
- `BuildingDetailPage` loading/404 handling — PR2 tasks must cover.

## Non-goals

No optimistic mutations. No cascade deactivation. No batch ops. No physical delete. No dark-mode toggle. No lift to `@vitalock/ui` or `packages/shared`. No editing of equipment immutable fields (form renders `readonly`).
