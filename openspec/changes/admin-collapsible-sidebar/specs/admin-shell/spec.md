# Delta for Admin Shell

## MODIFIED Requirements

### Requirement: Persistent Sidebar Layout

The admin app MUST render a persistent sidebar on every authenticated route. The sidebar MUST support two width states: expanded (240px, icons + labels) and collapsed (64px, icons only). A toggle button at the bottom MUST control the state, and `Ctrl+\` MUST toggle from anywhere in the admin app. Collapsed state MUST hide: nav labels, badge pills, section group labels, and user menu text (avatar-only). `localStorage("vitalock-sidebar-collapsed")` MUST persist the preference. `aria-pressed` on the toggle, `aria-expanded` on the sidebar, and `aria-label` on the toggle button MUST be present. `motion-reduce:transition-none` MUST disable the width transition for reduced-motion users. The sidebar MUST display navigation grouped under section labels in a fixed order: Infraestructura (active), Ordenes (active), Personal (placeholder), Ventas (placeholder), Tickets (placeholder). Under Infraestructura the active link MUST be "Administraciones" pointing to `/administraciones`. The Ordenes section MUST contain an active "Ordenes" NavItem pointing to `/ordenes`. Placeholder sections MUST be visually present but non-interactive. The sidebar MUST render a brand header (logo + wordmark) above the navigation, each section MUST render its label above its items, and nav items MAY render a badge pill (e.g., a count) without changing navigation behavior.
(Previously: flat sidebar at fixed 240px with section labels, no collapsed state, no toggle, no keyboard shortcut)

#### Scenario: Expanded sidebar shows icons + labels

- GIVEN the sidebar is in expanded state (default)
- WHEN the sidebar renders
- THEN its width is 240px
- AND nav item labels, badge pills, and section group labels are visible

#### Scenario: Collapsed sidebar shows icons only

- GIVEN the sidebar is in collapsed state
- WHEN the sidebar renders
- THEN its width is 64px
- AND nav item labels and badge pills are hidden
- AND section group labels are hidden
- AND each nav icon is wrapped in a Tooltip showing its label on hover

#### Scenario: Toggle button controls sidebar state

- GIVEN the sidebar is rendered
- WHEN the user clicks the toggle button at the bottom of the sidebar
- THEN the sidebar transitions between 240px and 64px
- AND the chevron icon rotates to indicate direction

#### Scenario: Collapsed user menu shows avatar only

- GIVEN the sidebar is in collapsed state
- WHEN the UserMenu renders
- THEN only the avatar is visible (no name or email text)

#### Scenario: Keyboard shortcut toggles sidebar

- GIVEN the admin app is focused
- WHEN the user presses Ctrl+\
- THEN the sidebar toggles between expanded and collapsed
- AND the state persists across page reloads via localStorage

#### Scenario: Accessibility attributes present

- GIVEN the sidebar renders in either state
- WHEN a screen reader inspects the sidebar
- THEN the sidebar has `aria-expanded` matching its state
- AND the toggle button has `aria-pressed` and `aria-label="Toggle sidebar"`

#### Scenario: Reduced motion disables transition

- GIVEN the user has `prefers-reduced-motion: reduce`
- WHEN the sidebar state changes
- THEN the width transition is disabled (instant toggle)

#### Scenario: Authenticated user sees sidebar with Administraciones and Ordenes links

- GIVEN a user is authenticated as admin
- WHEN they navigate to any route under the admin app
- THEN the sidebar is rendered and visible
- AND the Infraestructura section shows "Administraciones" as the active link
- AND the Ordenes section shows "Ordenes" linking to `/ordenes`

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

---

## ADDED Requirements

### Requirement: useSidebarCollapsed Hook

The `useSidebarCollapsed` hook MUST return `[collapsed: boolean, toggle: () => void]`. It MUST read from and write to `localStorage("vitalock-sidebar-collapsed")` as a boolean. It MUST catch localStorage errors silently and default to expanded. It MUST register a global `Ctrl+\` keyboard shortcut that calls toggle. The hook MUST be consumed in `AppShell.tsx` and passed to the `Sidebar` component.

#### Scenario: Default state is expanded

- GIVEN the user has no localStorage entry
- WHEN the hook initializes
- THEN `collapsed` is `false`

#### Scenario: State persists across reloads

- GIVEN the user toggles the sidebar to collapsed
- WHEN the page reloads
- THEN `collapsed` is `true` on initialization

#### Scenario: localStorage unavailable defaults to expanded

- GIVEN localStorage throws an error (e.g., SSR, quota exceeded)
- WHEN the hook initializes
- THEN `collapsed` is `false` and no error is thrown

#### Scenario: Keyboard shortcut works from anywhere

- GIVEN the admin app is focused
- WHEN the user presses Ctrl+\
- THEN `collapsed` toggles to its opposite value

---

## REMOVED Requirements

(None)

## RENAMED Requirements

(None)
