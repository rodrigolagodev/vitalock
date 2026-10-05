# Delta for design-system

**Change**: installer-mobile-hig
**Date**: 2026-10-05

Phase F3 of the UI audit. Purely ADDED requirements; it touches none of the requirements that F0 (`ui-foundations-hig`) and F1 (`ui-components-hig`) modify ("Shared Design Tokens", "Light-first Sizing Language", "Pattern Components", "StatCard"), so archive order F0, F1, F3 loses nothing. It relies on F0 tokens (`rounded-sheet` 16px radius, 250ms motion, elevation level 3, reduced-motion rule, "Cerrar" close name) and on F1's `FormField` and `ErrorState` `onRetry`. The "No New Dependencies" requirement continues to apply: nothing here adds a package. All UI copy stays Spanish.

## ADDED Requirements

### Requirement: TabBar

`packages/ui` MUST provide a `TabBar` component, exported from the package, covered by a Vitest test (strict_tdd). It renders a `nav` landmark containing one link per item (icon plus visible label). Its content height is 49px, plus bottom safe-area padding via `pb-safe`. The active item MUST use the primary tint, MUST keep its text label visible and MUST expose `aria-current="page"`; inactive items MUST NOT set `aria-current`. Each item MUST have a touch target of at least 44px in both axes. The bar MUST use a translucent surface (backdrop blur) with a top hairline border and MUST show a visible focus ring (`--ring`) on keyboard focus. The component MUST be router-agnostic: the active state is determined from a prop or from the link primitive supplied by the app, not by importing the app's router. Controlled by `prefers-reduced-motion` through the global rule only.

#### Scenario: Renders one link per item with label

- GIVEN a TabBar renders with three items
- WHEN its links are queried
- THEN there are three links, each with an icon and a visible text label

#### Scenario: Active item exposes aria-current and tint

- GIVEN a TabBar renders with the second item active
- WHEN the second link is inspected
- THEN it has `aria-current="page"` and a class list including the primary tint (`text-primary`)
- AND the other links have no `aria-current` attribute and do not include `text-primary`

#### Scenario: Safe-area padding is applied

- GIVEN a TabBar renders
- WHEN the `nav` class list is inspected
- THEN it includes `pb-safe`
- AND the item row height class resolves to 49px

#### Scenario: Touch target floor

- GIVEN a TabBar renders
- WHEN each item's class list is inspected
- THEN each item is at least 44px in both axes (a `min-h` / `h-` token of at least 44px and a full-width flex share)

#### Scenario: Keyboard focus is visible

- GIVEN a TabBar renders
- WHEN a link's class list is inspected
- THEN it includes a `focus-visible` ring utility bound to the ring token

#### Scenario: Active state comes from the app

- GIVEN `packages/ui` TabBar sources are searched
- WHEN imports are listed
- THEN no router package is imported by `packages/ui`

### Requirement: Safe-area Utilities

The Tailwind preset in `packages/ui` MUST expose utilities `safe-t`, `safe-b` and `pb-safe`, resolving to `env(safe-area-inset-top)`, `env(safe-area-inset-bottom)` and bottom padding of `env(safe-area-inset-bottom)` respectively, each with a `0px` fallback so they are inert where no inset exists. Both apps consume them from the preset; no app MAY define its own copy. Existing utilities MUST be unaffected.

#### Scenario: Utilities are present in the preset

- GIVEN the Tailwind preset is imported in a test
- WHEN the safe-area utilities/plugins are resolved
- THEN `safe-t`, `safe-b` and `pb-safe` each map to the matching `env(safe-area-inset-*)` value with a `0px` fallback

#### Scenario: Installer consumes the preset utilities

- GIVEN `apps/installer/tailwind.config.js` and installer sources are read
- WHEN safe-area definitions are searched
- THEN no per-app definition of the three utilities exists

#### Scenario: Existing utilities keep working

- GIVEN the primitives test suite runs after the utilities are added
- WHEN it completes
- THEN no existing component class assertion changes

### Requirement: Bottom Sheet Presentation

`Sheet` (the `packages/ui` primitive) MUST support a bottom presentation (a `side="bottom"` variant, or an equivalent documented prop). In the bottom presentation the panel MUST: anchor to the bottom edge; have `rounded-sheet` top corners only; render a grabber (a centred, decorative, `aria-hidden` bar at the top of the panel); respect the bottom safe area (`pb-safe`); cap its height so the scrim stays visible; scroll its own content when it overflows; render over a dark scrim; and animate with the 250ms ease-out motion token (suppressed by the global reduced-motion rule). The close control keeps the accessible name "Cerrar". Existing `Sheet` sides and callers MUST be unchanged.

#### Scenario: Bottom variant has rounded top corners and grabber

- GIVEN an open Sheet with the bottom presentation
- WHEN the panel class list and content are inspected
- THEN the panel includes `rounded-sheet` top-corner classes and `pb-safe`
- AND an `aria-hidden` grabber element is present

#### Scenario: Bottom variant anchors to the bottom

- GIVEN an open Sheet with the bottom presentation
- WHEN the panel class list is inspected
- THEN it is anchored with `bottom-0` and full width, with a maximum height class that is less than the full viewport

#### Scenario: Close control is named in Spanish

- GIVEN an open bottom Sheet
- WHEN the test queries `getByRole('button', { name: 'Cerrar' })`
- THEN exactly one close button is found and activating it closes the sheet

#### Scenario: Existing sides are unchanged

- GIVEN existing Sheet usages with `side="left"` or `side="right"`
- WHEN the Sheet suite runs
- THEN every pre-existing assertion passes unchanged
