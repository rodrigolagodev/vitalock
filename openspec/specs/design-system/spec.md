# Design System Specification

**Change**: ui-visual-language
**Date**: 2026-08-13

## Purpose

Shared visual language for the Vitalock admin and installer apps aligned to the Figma CRM dashboard reference: one token source (LIGHT-first — 7 of 8 reference frames are light — with dark as an opt-out adaptation), shared primitives, and pattern components. `tareas/*` UI is excluded (sibling `atomic-stock-work-resolution`). No new dependencies; UI copy stays Spanish; existing role/text/href-based tests MUST keep passing.

## Requirements

### Requirement: Shared Design Tokens

`packages/ui/globals.css` MUST define the shared palettes with the LIGHT-first tokens measured from the Figma reference (D2). The light palette MUST use primary `#5d5fef` (`239.2 82% 65.1%`) driving `--primary` and `--ring`, nav active `#7364ff` (`245.8 100% 69.6%`) driving `--accent`, content background `#f5f5fa` (`240 33.3% 97.1%`), border `#e2e8f0` (`214.3 31.8% 91.4%`), white card, foreground `#1e293b`, table head `#f8fafc`, and muted-foreground `#a9b0ba`. `--popover`/`--popover-foreground` MUST be defined and the `.dark` block MUST be filled as an opt-out adaptation derived from the same accent family (D12). Both apps MUST consume the shared tokens and MUST NOT keep per-app palettes.

#### Scenario: Dark mode toggle persists

- GIVEN a user toggles dark mode
- WHEN the page reloads
- THEN `.dark` applies with the adapted palette and the choice persists

#### Scenario: Primary surfaces use the light-first accent

- GIVEN a primary Button renders in light mode
- THEN its background uses primary `#5d5fef` (`239.2 82% 65.1%`)

### Requirement: Shared Primitives

The seven shared primitives (badge, button, checkbox, dialog, input, switch, textarea) MUST be provided by `packages/ui` and imported by both apps. Per-app copies MUST be removed, preserving roles, variants, and Spanish labels. Both login pages MUST use the shared Input (D7).

#### Scenario: No per-app primitive copies remain

- GIVEN both apps render the shared primitives
- WHEN imports resolve
- THEN all come from `@vitalock/ui` and no `components/ui` copies remain

### Requirement: Light-first Sizing Language

Shared controls MUST match the Figma light-first scale (D11, D10): Button `h-[52px] rounded-[9px]`; status pills `rounded-[20px]` with per-status tinted backgrounds; list and detail tables rendered inside a white card `rounded-[12px]` with TableHead `#f8fafc`/`bg-muted/50`.

#### Scenario: Buttons and status pills render at reference scale

- GIVEN a page renders primary buttons and status pills
- WHEN the controls render
- THEN buttons are 52px tall with `rounded-[9px]` and pills use the tinted `rounded-[20px]` surface

#### Scenario: Tables render inside a card surface

- GIVEN a list or detail table renders
- WHEN the table is visible
- THEN it sits inside a white card `rounded-[12px]` with the reference table-head background

### Requirement: Pattern Components

`packages/ui` MUST provide SidebarGroup, SectionHeading, SearchInput, and Topbar as reusable components, each covered by a Vitest test (strict_tdd).

#### Scenario: Pattern suite passes

- GIVEN pattern components are implemented
- WHEN `pnpm test` runs
- THEN each has at least one passing test

### Requirement: StatCard

StatCard MUST render an icon chip, a KPI value, and a Spanish label. On loading or empty data it MUST render a neutral placeholder (e.g., "—") without crashing.

#### Scenario: Empty dataset renders placeholder

- GIVEN a page loads no rows
- WHEN StatCard renders with empty data
- THEN the card shows the label and a neutral placeholder value

### Requirement: PaginationFooter

PaginationFooter MUST render the reference footer: a "1-10 of 30" summary, rows-per-page selector, and prev/next buttons. It MUST page client-side over the page's already-loaded rows — no server queries. Prev MUST be disabled on the first page; next on the last.

#### Scenario: Boundary pages disable navigation

- GIVEN a table with 25 rows at 10 per page
- WHEN the first page renders
- THEN prev is disabled, the summary reads "1-10 of 25"
- AND on the third page next is disabled

### Requirement: Stat Cards and Pagination on List Pages

List pages MUST adopt StatCards aggregating client-side over existing hooks (no new queries) and PaginationFooter on their tables:

| Page | StatCards |
|---|---|
| `/administraciones` | Total; Activas (`status = 'active'`) |
| `/ordenes` | Total; En proceso; Listo para retirar |
| `/stock` | Total; Stock bajo (`stock_disponible <= 5`) |

#### Scenario: Stock KPIs aggregate from loaded products

- GIVEN `/stock` loads 3 products, one with `stock_disponible = 2`
- WHEN the page renders
- THEN StatCards show Total 3 and Stock bajo 1

### Requirement: Topbar Search Placeholder

The topbar search field MUST render as a visual placeholder matching the reference and MUST NOT execute searches or navigate. It SHOULD use the SearchInput pattern; wiring live search MAY be deferred.

#### Scenario: Placeholder does not trigger queries

- GIVEN a user types in the topbar search field
- WHEN the field receives input
- THEN no query fires and no navigation occurs

### Requirement: Login Pages on Shared Input

Both login pages MUST replace raw `<input>` elements with the shared Input primitive. Labels, placeholders, and Spanish copy MUST remain unchanged.

#### Scenario: Login form renders shared Input

- GIVEN a user opens either app's login page
- WHEN the form renders
- THEN every text field is the shared Input with labels preserved

### Requirement: No New Dependencies

This change MUST NOT add runtime dependencies. Date pickers and charts MUST NOT be introduced; stat cards and pagination MUST use existing primitives and hooks.

#### Scenario: Dependency manifest unchanged

- GIVEN the change is complete
- WHEN package manifests are inspected
- THEN no new runtime dependency entries exist
