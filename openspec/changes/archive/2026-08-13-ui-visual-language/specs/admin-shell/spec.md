# Delta for Admin Shell

**Change**: ui-visual-language
**Date**: 2026-08-13

## MODIFIED Requirements

### Requirement: Persistent Sidebar Layout

The admin app MUST render a persistent sidebar on every authenticated route. The sidebar MUST display navigation grouped under section labels in a fixed order: Infraestructura (active), Ordenes (active), Personal (placeholder), Ventas (placeholder), Tickets (placeholder). Under Infraestructura the active link MUST be "Administraciones" pointing to `/administraciones`. The Ordenes section MUST contain an active "Ordenes" NavItem pointing to `/ordenes`. Placeholder sections MUST be visually present but non-interactive. The sidebar MUST render a brand header (logo + wordmark) above the navigation, each section MUST render its label above its items, and nav items MAY render a badge pill (e.g., a count) without changing navigation behavior.
(Previously: flat sidebar with Infraestructura, Personal, Ventas, Tickets sections; no Ordenes section; no brand header, section labels, or badges)

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

#### Scenario: Brand header above the navigation

- GIVEN the sidebar is rendered
- WHEN a user inspects the top of the sidebar
- THEN a logo and wordmark identifying the product render above the nav
- AND the nav groups follow below

#### Scenario: Section labels and badge pills render

- GIVEN the sidebar is rendered
- WHEN a user inspects a navigation group
- THEN a section label renders above its items
- AND badge pills render on items that carry counts

## ADDED Requirements

### Requirement: Topbar Layout

Every authenticated admin route MUST render a topbar above the page content containing a search field, a notification bell, an avatar, and a divider, per the reference. The topbar MUST be `h-[100px] bg-white` and scoped over the content area (rendered inside the content column, NOT spanning above the sidebar); the search field MUST be `w-[372px] h-12 rounded-[8px] bg-[#f5f5fa]`. The dark-mode toggle MUST remain available and the sign-out control MUST remain reachable.

#### Scenario: Topbar renders reference elements

- GIVEN an authenticated admin opens any admin route
- WHEN the layout renders
- THEN the topbar shows the search field, bell, avatar, and divider

#### Scenario: Theme toggle and sign-out stay available

- GIVEN the topbar is rendered
- WHEN a user inspects its controls
- THEN the dark-mode Switch and the sign-out action are present and functional

### Requirement: PageHeader Sizing

PageHeader MUST render breadcrumbs and the page title at the reference scale: title `text-[32px] font-bold leading-[40px]` in `#1e293b` (D9 — corrected from the earlier 40px diagnosis) and breadcrumb `text-[14px]` in `#4d515a` with chevron-right separators between segments. The breadcrumb nav (`aria-label="Breadcrumb"`) and the `h1` heading MUST be preserved.

#### Scenario: Header renders at reference scale

- GIVEN a page uses PageHeader with breadcrumbs
- WHEN the header renders
- THEN a breadcrumb nav and an `h1` title are visible at the reference sizes

#### Scenario: Existing PageHeader roles survive

- GIVEN the sizing change is applied
- WHEN PageHeader renders
- THEN the `aria-label="Breadcrumb"` nav and `h1` roles are unchanged
- AND existing PageHeader tests pass
