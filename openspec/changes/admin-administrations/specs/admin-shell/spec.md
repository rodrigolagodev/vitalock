# Delta for Admin Shell

## MODIFIED Requirements

### Requirement: Root Route Redirect

The admin app root (`/`) MUST redirect to `/administraciones` immediately without rendering any content at the root path. The old `/buildings` top-level route MUST also redirect to `/administraciones`.
(Previously: root redirected to `/buildings`; no `/buildings` redirect existed)

#### Scenario: Root redirect on load

- GIVEN a user navigates to the admin app root `/`
- WHEN the route resolves
- THEN the browser is redirected to `/administraciones`
- AND no blank or placeholder page is displayed

#### Scenario: /buildings redirects to /administraciones

- GIVEN a user navigates to `/buildings`
- WHEN the route resolves
- THEN the browser is redirected to `/administraciones`
- AND no buildings list page is rendered

---

### Requirement: Route Tree

The admin app MUST support the following route structure:

| Path | Page |
|---|---|
| `/` | Redirect to `/administraciones` |
| `/administraciones` | Administrations list + create sheet |
| `/administraciones/:adminId` | Administration detail: info + nested buildings + create building CTA |
| `/buildings` | Redirect to `/administraciones` |
| `/buildings/:buildingId` | Building detail with Unidades and Equipos tabs (breadcrumb links to admin) |

(Previously: routes were `/` → `/buildings`, `/buildings`, `/buildings/:buildingId`; no administration routes existed)

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

---

### Requirement: Persistent Sidebar Layout

The admin app MUST render a persistent sidebar on every authenticated route. The sidebar MUST display navigation sections in a fixed order: Infraestructura (active), Personal (placeholder), Ventas (placeholder), Tickets (placeholder). Under Infraestructura the active link MUST be "Administraciones" pointing to `/administraciones`. Placeholder sections MUST be visually present but non-interactive.
(Previously: the active Infraestructura link was "Edificios" pointing to `/buildings`)

#### Scenario: Authenticated user sees sidebar with Administraciones link

- GIVEN a user is authenticated as admin
- WHEN they navigate to any route under the admin app
- THEN the sidebar is rendered and visible
- AND the Infraestructura section shows "Administraciones" as the active link

#### Scenario: Placeholder sections are visible but disabled

- GIVEN the sidebar is rendered
- WHEN a user inspects the Personal, Ventas, or Tickets sections
- THEN those sections appear in the sidebar at their reserved positions
- AND they are non-interactive (no click target navigates)
