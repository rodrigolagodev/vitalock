# Delta for installer-shell

**Change**: installer-mobile-hig
**Date**: 2026-10-05

Phase F3 of the UI audit. New capability: the installer app shell. The installer is a phone PWA with three destinations (Inicio, Tareas, Historial); navigation is a bottom TabBar at every viewport width, the top bar carries the logo and UserMenu, and PWA chrome (viewport, safe areas, icons, meta, toasts, connectivity) is handled once at the shell. The admin app is not touched. All UI copy stays Spanish. Class names (`pb-safe-b`, `pt-safe-t`, `text-large-title`) refer to F0/F3 preset tokens; the `TabBar` component is specified in the `design-system` delta.

## ADDED Requirements

### Requirement: Installer Shell Layout

The installer MUST render every authenticated route inside one shell composed of, in order: a top bar (app logo and `UserMenu`), a scrollable main area, and the `TabBar`. The shell MUST NOT render the admin `Sidebar`, a `MobileSidebar`, an `InstallerNav` or a hamburger/floating menu button. The shell MUST be the same at every viewport width; there is no breakpoint at which a sidebar replaces the TabBar. Main-area content MUST NOT be hidden behind the top bar or the TabBar (the main area reserves the space they occupy, including safe areas).

#### Scenario: Shell renders top bar, main area and tab bar

- GIVEN an authenticated installer opens `/`
- WHEN the shell renders
- THEN a top bar containing the logo and the UserMenu trigger is present
- AND a `navigation` landmark (the TabBar) is present
- AND the routed page content renders between them

#### Scenario: No sidebar or hamburger remains

- GIVEN the installer shell renders at any viewport width
- WHEN the document is queried for a "Abrir menú" button and a `Sidebar`
- THEN neither exists
- AND `rg 'MobileSidebar|InstallerNav' apps/installer` returns nothing

#### Scenario: Same shell on wide viewports

- GIVEN the viewport is 1280px wide
- WHEN the shell renders
- THEN the TabBar is still rendered and no sidebar is rendered
- AND the TabBar is horizontally centred with a maximum width (it does not stretch across the full viewport)

#### Scenario: Content is not covered by the tab bar

- GIVEN a routed page taller than the viewport
- WHEN the user scrolls to the end of the main area
- THEN the last element is fully visible above the TabBar

### Requirement: Tab Navigation

The shell MUST render a `TabBar` with exactly three tabs, in this order: "Inicio" (`/`), "Tareas" (`/tareas`), "Historial" (`/historial`). The tab whose route matches the current location (including nested routes such as a task detail under Tareas) MUST be the active tab and expose `aria-current="page"`. Activating a tab MUST navigate to its route.

#### Scenario: Three tabs in order

- GIVEN the shell renders
- WHEN the TabBar links are queried
- THEN there are exactly three, named "Inicio", "Tareas" and "Historial" in that order

#### Scenario: Active tab reflects the route

- GIVEN the location is `/tareas`
- WHEN the shell renders
- THEN the "Tareas" tab has `aria-current="page"`
- AND "Inicio" and "Historial" do not

#### Scenario: Nested route keeps its parent tab active

- GIVEN the location is a task detail route that belongs to Tareas
- WHEN the shell renders
- THEN the "Tareas" tab has `aria-current="page"`

#### Scenario: Tapping a tab navigates

- GIVEN the location is `/`
- WHEN the user clicks the "Historial" tab
- THEN the location becomes `/historial`
- AND the Historial page renders and its tab is active

### Requirement: Top Bar with UserMenu

The top bar MUST show the app logo and the `UserMenu`. Logout MUST be reachable from the UserMenu in the top bar; there MUST be no fourth "Perfil" tab. The UserMenu trigger MUST be at least 44px in both axes and keep its Spanish accessible name and visible focus ring. The top bar MUST respect the top safe area (`pt-safe-t`).

#### Scenario: Logout is reachable from the top bar

- GIVEN an authenticated installer and the shell rendered
- WHEN the user opens the UserMenu in the top bar and chooses the sign-out item
- THEN the sign-out handler is called once

#### Scenario: No profile tab

- GIVEN the shell renders
- WHEN the TabBar links are queried
- THEN no tab named "Perfil" exists

#### Scenario: Top bar clears the notch

- GIVEN the shell renders
- WHEN the top bar class list is inspected
- THEN it includes the `pt-safe-t` utility

### Requirement: Large Titles

The Inicio, Tareas and Historial pages MUST render their page title as a heading with the `text-large-title` class. Collapsing the title on scroll is out of scope.

#### Scenario: Each tab page has a large title

- GIVEN the Inicio, Tareas and Historial pages are rendered one by one
- WHEN each page's level-1 heading is inspected
- THEN its class list includes `text-large-title`

### Requirement: Viewport and Safe Areas

`apps/installer/index.html` MUST declare `viewport-fit=cover` in its viewport meta. The shell MUST apply safe-area insets so that no content or control sits under the notch, the Dynamic Island or the home indicator: the top bar uses `pt-safe-t`, the TabBar uses bottom safe-area padding (`pb-safe-b`), and any sticky bottom element (see `installer-ticket-detail`) accounts for the bottom inset.

#### Scenario: Viewport covers the screen

- GIVEN `apps/installer/index.html` is read as text by a test
- WHEN the viewport meta is located
- THEN its content includes `viewport-fit=cover`

#### Scenario: Bottom inset is applied to the tab bar

- GIVEN the TabBar renders
- WHEN its class list is inspected
- THEN it includes `pb-safe-b`

### Requirement: PWA Icons and Meta

`apps/installer/index.html` MUST declare an apple-touch-icon pointing at a committed PNG, `apple-mobile-web-app-capable`, `apple-mobile-web-app-title` and `apple-mobile-web-app-status-bar-style`. The web manifest MUST declare separate icon entries for purpose `any` and purpose `maskable`; no entry MAY use the combined purpose `any maskable`. The referenced PNG files MUST exist under the installer `public/` directory. Icon generation MUST NOT add a runtime or dev dependency to the repo.

#### Scenario: Apple meta and touch icon are declared

- GIVEN `apps/installer/index.html` is read as text by a test
- WHEN it is searched for the Apple tags
- THEN a `link rel="apple-touch-icon"` and the three `apple-mobile-web-app-*` meta tags are present
- AND the touch icon `href` resolves to a file that exists in `apps/installer/public/`

#### Scenario: Manifest separates any and maskable

- GIVEN the installer PWA manifest is parsed by a test
- WHEN its `icons` entries are read
- THEN at least one entry has `purpose` `any` and at least one has `purpose` `maskable`
- AND no entry has a `purpose` containing both words
- AND every `src` resolves to an existing file

#### Scenario: No new dependency

- GIVEN `package.json` files are compared with the base branch
- WHEN dependencies and devDependencies are diffed
- THEN no package is added

### Requirement: Shell-level Connectivity Banner

`ConnectivityBanner` MUST be mounted once in the shell (visible on every installer route, including task detail) and MUST NOT be mounted by individual pages. While `navigator.onLine === false` it MUST be visible, MUST state that the data may be out of date, and MUST NOT block interaction with the rest of the UI. When the browser fires `online` it MUST disappear.

#### Scenario: Banner shows on task detail when offline

- GIVEN `navigator.onLine` is false
- WHEN the shell renders a task detail route
- THEN the connectivity banner is visible

#### Scenario: Banner shows on every tab page

- GIVEN `navigator.onLine` is false
- WHEN Inicio, Tareas and Historial each render in the shell
- THEN the banner is visible in each

#### Scenario: Banner is mounted once

- GIVEN the installer sources are searched
- WHEN `ConnectivityBanner` usages are listed
- THEN the only mount is in the shell; no route component renders it

#### Scenario: Banner clears when connectivity returns

- GIVEN the banner is visible
- WHEN the window dispatches an `online` event
- THEN the banner is no longer in the document

#### Scenario: Banner does not block the UI

- GIVEN the banner is visible
- WHEN the user taps a tab
- THEN navigation proceeds

### Requirement: Toast Placement

The installer Toaster MUST be offset so toasts render above the TabBar and the bottom safe area; a toast MUST NOT overlap the TabBar or the home indicator.

#### Scenario: Toaster is offset above the tab bar

- GIVEN the installer root renders the Toaster
- WHEN its offset/position configuration is inspected
- THEN the bottom offset is at least the TabBar height (49px) plus the safe-area inset
