# Admin Shell Specification

## Purpose

Persistent sidebar layout for the admin app. Hosts the navigation shell that all admin modules live inside, with stable slot positions for future sections (Personal, Ventas, Tickets). Also owns the Sonner Toaster mount required by all mutation feedback.

## Requirements

### Requirement: Persistent Sidebar Layout

The admin app MUST render a persistent sidebar on every authenticated route. The sidebar MUST display navigation sections in a fixed order: Infraestructura (active), Personal (placeholder), Ventas (placeholder), Tickets (placeholder). Placeholder sections MUST be visually present but non-interactive, so their positions are stable when those modules land.

#### Scenario: Authenticated user sees sidebar on all routes

- GIVEN a user is authenticated as admin
- WHEN they navigate to any route under the admin app
- THEN the sidebar is rendered and visible
- AND the active section (Infraestructura) link is highlighted

#### Scenario: Placeholder sections are visible but disabled

- GIVEN the sidebar is rendered
- WHEN a user inspects the Personal, Ventas, or Tickets sections
- THEN those sections appear in the sidebar at their reserved positions
- AND they are non-interactive (no click target navigates)

---

### Requirement: Root Route Redirect

The admin app root (`/`) MUST redirect to `/buildings` immediately without rendering any content at the root path.

#### Scenario: Root redirect on load

- GIVEN a user navigates to the admin app root `/`
- WHEN the route resolves
- THEN the browser is redirected to `/buildings`
- AND no blank or placeholder page is displayed

---

### Requirement: Sonner Toaster Mount

The admin app MUST mount a single `<Toaster>` (Sonner) at the application root (`main.tsx`) so that any route can trigger toast notifications without a per-route mount. This MUST be the sole Toaster instance in the app.

#### Scenario: Toast appears from a mutation in any route

- GIVEN the Toaster is mounted at app root
- WHEN a mutation inside any route triggers a toast notification
- THEN the toast is displayed to the user
- AND no duplicate toasts appear from a second Toaster instance

#### Scenario: Error toast from mapMutationError

- GIVEN a mutation fails with a known SQLSTATE or RPC error
- WHEN `mapMutationError` produces a `{ title, description }` payload
- THEN a destructive toast with that title and description is shown via Sonner
- AND the toast is dismissible

---

### Requirement: Route Tree

The admin app MUST support the following route structure without additional layout rewrites when units and equipment tabs are added:

| Path | Page |
|---|---|
| `/` | Redirect to `/buildings` |
| `/buildings` | Buildings list + create sheet |
| `/buildings/:buildingId` | Building detail with Unidades and Equipos tabs |

#### Scenario: Deep link to building detail

- GIVEN a user navigates directly to `/buildings/123`
- WHEN the route resolves
- THEN BuildingDetailPage renders with the sidebar visible
- AND the Unidades tab is the default active tab
