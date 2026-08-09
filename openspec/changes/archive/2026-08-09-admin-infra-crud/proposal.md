# Proposal: admin-infra-crud

**Change**: admin-infra-crud
**Phase**: propose
**Date**: 2026-08-09
**Persistence**: openspec + engram (`sdd/admin-infra-crud/proposal`)

## Intent

### Problem
The admin app has session/auth wired but no substantive content — only a placeholder route. Admins cannot manage the physical infrastructure (buildings, units, equipment) that the rest of the platform depends on. Every downstream flow (installer worklist, key authorizations, tickets) presumes these entities already exist and are correctly wired; today they can only be created via SQL or Supabase Studio.

### Why now
`installer-worklist` shipped and is now the installer's daily driver. It reads `key_authorizations` scoped to buildings and equipment. Without an admin surface for the underlying infrastructure, seeding is manual, mistakes are unrecoverable through the UI (equipment has immutable fields + trigger-enforced invariants), and onboarding a new building is a DBA task. This is the smallest possible admin slice that unlocks self-service operations.

### Success
- An admin can create a building, add units to it, and register equipment against it — end to end, through the UI, without touching SQL.
- An admin can deactivate a unit or decommission a piece of equipment safely (respecting `ON DELETE RESTRICT` and the "dead is terminal" trigger).
- An admin can replace a broken lock atomically via `operations.replace_equipment()`, with pending authorizations migrated correctly to the replacement device.
- The admin app has a real navigation shell (persistent sidebar) ready to host future modules (Personal, Ventas, Tickets) without another layout rewrite.

## Scope

### In-scope
- **Nav shell**: persistent sidebar layout with slots reserved for Personal / Ventas / Tickets (only Infra populated in this change).
- **Buildings CRUD**: list, create, edit, deactivate (status flip; no physical delete).
- **Units CRUD**: nested under building detail, tab "Unidades". Create/edit/deactivate. `is_administrative` toggle allowed post-creation with friendly 23505 mapping.
- **Equipment CRUD**: nested under building detail, tab "Equipos". Create/edit non-immutable fields, status transitions (active/maintenance/dead) with inline `decommission_reason` dialog when selecting "dead".
- **Equipment replacement**: dedicated dialog invoking `operations.replace_equipment()` RPC.
- **Error UX plumbing**: wire `sonner` Toaster in `main.tsx`; central `mapMutationError` helper for PGRST200 / 23505 / 23514 / RPC failures.
- **Data layer**: TanStack Query hooks per entity with query keys registry; direct `.schema('operations')` queries where needed.
- **Chained delivery**: PR1 layout+buildings, PR2 units, PR3 equipment+replace dialog (each ≤ 400 line review budget).

### Out-of-scope
- Personal, Ventas, Tickets modules (sidebar slots only, no routes).
- Cross-building bulk operations, CSV import/export, audit-log UI.
- Physical delete flows (blocked by DB `ON DELETE RESTRICT`; deactivate is the only lifecycle exit).
- Editing equipment immutable fields (`serial_number`, `building_id`, `installed_at`, `replaces_equipment_id`) — form UI enforces read-only.
- Managing `key_authorizations` directly from admin (installer-worklist owns that surface; admin only sees impact counts when decommissioning).
- Role/permission management beyond the existing `for all` admin RLS policy.
- Migrations — schema is ready as-is per exploration.

## Approach

### Nav shell first, entities nested inside
Persistent `SidebarLayout` in `apps/admin/src/components/layout/` with a `NavSection` component. Only "Infraestructura" section is populated; other sections render as disabled placeholders so their positions are stable when they land. Route tree:

```
/                            → redirect to /buildings
/buildings                   list + "Nuevo edificio" Sheet
/buildings/:buildingId       header + Tabs (Unidades | Equipos)
```

Buildings are the organizing lens: units and equipment always resolve from a building context, matching the DB's FK layout and the mental model admins already have ("I need to add a unit to *this* building").

### Deactivate-only lifecycle
No Delete button anywhere. Status is the single lifecycle field. This aligns with `ON DELETE RESTRICT` (a physical delete would fail the moment children exist anyway), removes a whole class of destructive-action UX (confirm dialogs, impact preview, undo), and matches how the domain actually works — a dead lock is not gone, it's decommissioned and its history stays queryable.

### Equipment status: single select + inline dead dialog
One `<Select>` with `active | maintenance | dead`. Choosing `dead` opens an inline dialog requiring `decommission_reason` (mandatory) before commit — because the DB trigger auto-closes `key_authorizations` on dead, which impacts the installer worklist in real time. The dialog surfaces the impact count ("N autorizaciones se cerrarán") so admins understand the cascade before confirming.

### Equipment replacement: dedicated dialog via RPC
Replacement is atomic and non-trivial (new equipment inserted with `replaces_equipment_id`, old marked dead, installed authorizations migrated to `pending_install` on the new device). This is one RPC call — `operations.replace_equipment()` — behind one purpose-built dialog. Not part of the edit form.

### Error mapping as a shared concern
One `mapMutationError(error): { title, description }` helper catches known SQLSTATEs and turns them into human strings in Spanish:
- `23505` on `units.is_administrative` → "Ya existe una unidad administrativa en este edificio."
- `23514` on equipment triggers → "No se puede modificar este campo una vez creado el equipo."
- `PGRST200` → surfaces as a code smell (should never reach the user; we sidestep by using `.schema('operations')` directly).

### Chained delivery to respect review budget
Three entities + nav shell overflow the 400-line budget. Split into three PRs, each individually shippable:
1. **PR1**: sidebar layout + Toaster wiring + Buildings CRUD.
2. **PR2**: Units tab inside BuildingDetail.
3. **PR3**: Equipment tab + replace dialog.

Reuses the pattern that worked in `installer-worklist` (hooks colocated per entity, query keys registry, mutation helpers).

## Rationale for key choices

| Decision | Alternative rejected | Reason |
|---|---|---|
| Persistent sidebar | Top navbar only | Admin has 4+ planned modules; sidebar scales, navbar doesn't. |
| Deactivate-only | Delete with cascade confirm | DB blocks physical delete anyway; deactivate matches domain semantics. |
| Nested routes under `/buildings/:id` | Flat top-level `/units`, `/equipment` | Building context is intrinsic; flat routes force redundant filters. |
| Dedicated replace dialog | Field on equipment edit form | RPC is atomic and side-effectful; deserves its own confirmed intent. |
| Chained PRs | Single mega-PR | 400-line review budget + independent shippability. |
| Sonner via `main.tsx` | Per-route toasters | Consistent with `installer-worklist`; one Toaster serves the whole app. |

## Risks & open questions

- **Equipment decommission impact preview** — need a fast query to count affected `key_authorizations` before showing the dead dialog. Spec/design phase will decide: client-side count vs. dedicated RPC.
- **Optimistic updates vs. invalidation** — installer-worklist chose plain invalidation. Same default here unless a specific interaction demands optimism.
- **Building deactivation cascading UX** — deactivating a building with active units/equipment: block? warn? cascade? Spec phase decides; leaning toward "block with clear message listing active children".
- **PR ordering commit** — PR1 must ship before PR2 starts (units depend on buildings existing); PR2 and PR3 could parallelize if reviewer bandwidth allows, but sequential is safer.

## Next phases
- `sdd-spec` — write formal specs for buildings-admin, units-admin, equipment-admin capabilities (WHAT).
- `sdd-design` — technical design (HOW): hook shapes, form schemas, RPC integration, decommission impact query, chained-PR boundaries.
