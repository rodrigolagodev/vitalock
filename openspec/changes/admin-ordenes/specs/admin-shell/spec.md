# Delta for Admin Shell

## MODIFIED Requirements

### Requirement: Route Tree

The admin app MUST support the following route structure:

| Path | Page |
|---|---|
| `/` | Redirect to `/administraciones` |
| `/administraciones` | Administrations list + create sheet |
| `/administraciones/:adminId` | Administration detail: info + nested buildings + create building CTA |
| `/buildings` | Redirect to `/administraciones` |
| `/buildings/:buildingId` | Building detail with Unidades and Equipos tabs (breadcrumb links to admin) |
| `/ordenes` | OrdenesPage — list + filters + "Nueva orden" |
| `/ordenes/:ordenId` | OrdenDetailPage — header + items table + preparation |

(Previously: no `/ordenes` or `/ordenes/:ordenId` routes existed)

#### Scenario: Deep link to building detail still works

- GIVEN a user navigates directly to `/buildings/123`
- WHEN the route resolves
- THEN BuildingDetailPage renders with the sidebar visible
- AND the Unidades tab is the default active tab
- AND a breadcrumb linking to the parent administration is visible

#### Scenario: Deep link to administration detail

- GIVEN a user navigates directly to `/administraciones/456`
- WHEN the route resolves
- THEN AdministrationDetailPage renders with the sidebar visible
- AND the nested buildings list scoped to that administration is shown

#### Scenario: Deep link to ordenes list

- GIVEN a user navigates directly to `/ordenes`
- WHEN the route resolves
- THEN OrdenesPage renders with the sidebar visible

#### Scenario: Deep link to order detail

- GIVEN a user navigates directly to `/ordenes/789`
- WHEN the route resolves
- THEN OrdenDetailPage renders for the given order id with the sidebar visible

---

### Requirement: Persistent Sidebar Layout

The admin app MUST render a persistent sidebar on every authenticated route.
The sidebar MUST display navigation sections in a fixed order: Infraestructura
(active), Ordenes (active), Personal (placeholder), Ventas (placeholder),
Tickets (placeholder). Under Infraestructura the active link MUST be
"Administraciones" pointing to `/administraciones`. The Ordenes section MUST
contain an active "Ordenes" NavItem pointing to `/ordenes`. Placeholder sections
MUST be visually present but non-interactive.
(Previously: sidebar had Infraestructura, Personal, Ventas, Tickets sections;
no Ordenes section existed)

#### Scenario: Authenticated user sees sidebar with Administraciones and Ordenes links

- GIVEN a user is authenticated as admin
- WHEN they navigate to any route under the admin app
- THEN the sidebar is rendered and visible
- AND the Infraestructura section shows "Administraciones" as the active link
- AND the Ordenes section shows "Ordenes" linking to `/ordenes`

#### Scenario: Ordenes section is its own top-level section

- GIVEN the sidebar is rendered
- WHEN a user inspects the sidebar sections
- THEN "Ordenes" appears as a separate NavSection (not nested inside Infraestructura or Ventas)

#### Scenario: Placeholder sections are visible but disabled

- GIVEN the sidebar is rendered
- WHEN a user inspects the Personal, Ventas, or Tickets sections
- THEN those sections appear in the sidebar at their reserved positions
- AND they are non-interactive (no click target navigates)

## ADDED Requirements

### Requirement: Query Keys for Ordenes

`queryKeys.ts` MUST export `ordensKey` (list discriminator) and `ordenKey`
(single-item discriminator) following the existing `['admin', 'entity', ...]`
pattern. All ordenes hooks MUST use these keys for cache invalidation.

#### Scenario: List query key invalidates on mutation

- GIVEN an order is created or cancelled
- WHEN the mutation succeeds
- THEN the cache entry keyed by `ordensKey` is invalidated
- AND OrdenesPage refetches automatically

#### Scenario: Detail query key invalidates on item mutation

- GIVEN a key item is configured
- WHEN the mutation succeeds
- THEN the cache entry keyed by `ordenKey(ordenId)` is invalidated
- AND OrdenDetailPage refetches automatically
