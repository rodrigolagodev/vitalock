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

### Requirement: DataTable Pattern Component

`packages/ui` MUST provide a config-driven `DataTable<T>` as the single table pattern for the admin app. It MUST render the wrapper (`overflow-hidden rounded-[12px] border bg-card`), table header, a 3-row pulse skeleton when `isFetching`, a dashed-box empty state (plain `emptyMessage` vs `filteredEmptyMessage` variants), and an icon-actions column hidden when no actions are configured.

#### Scenario: Skeleton renders while fetching

- GIVEN a DataTable with `isFetching` true and no rows
- WHEN the table renders
- THEN three pulse skeleton rows show and no links render

#### Scenario: Empty state distinguishes no records from no results

- GIVEN a DataTable with zero rows
- WHEN `hasFilters` is false and then true
- THEN `emptyMessage` shows first, then `filteredEmptyMessage`

### Requirement: Table Primitives Promotion with Shim

The table primitives (Table, TableBody, TableCell, TableHead, TableHeader, TableRow with row height `h-[71px]`) MUST be provided by `packages/ui` and exported from `@vitalock/ui`. `apps/admin/src/components/ui/table.tsx` MUST remain as a re-export shim so existing imports resolve unchanged.

#### Scenario: Existing imports resolve through the shim

- GIVEN the primitives move into `@vitalock/ui`
- WHEN admin components import from `@/components/ui/table`
- THEN the shim re-exports the promoted primitives and rendering is unchanged

### Requirement: First-Column Rule

Column 0 of every DataTable MUST be the row's primary entry point: (a) a native `<Link>` (`font-medium text-foreground hover:underline`) when a detail route exists (ordenes, tareas, buildings, administraciones, stock); (b) a `<button>` styled identically when the primary action is a dialog (Keys → KeyDetailDialog; no `/llaves/:id` route exists); (c) emphasized plain text (`font-medium`) for entities with no navigation target (staff, particulares, equipment, movements). The first-cell link/button MUST use the foreground (text) color, not the primary color. No table MUST render a whole-row click target or `role=button`; ProductsTable row-click MUST be removed and replaced by a first-column link.

#### Scenario: First-column link navigates to detail

- GIVEN a row with `getRowHref` set
- WHEN the admin clicks the first cell
- THEN the browser navigates to the entity's detail route

#### Scenario: Keys first cell opens the dialog instead of navigating

- GIVEN a keys row with `onFirstCellClick`
- WHEN the admin clicks the first cell
- THEN KeyDetailDialog opens and no navigation occurs

#### Scenario: Products row click no longer navigates

- GIVEN a products row rendered by DataTable
- WHEN the admin clicks anywhere on the row
- THEN nothing happens; only the first-column link navigates to `/stock/:id`

### Requirement: Icon-Only Row Actions

All row actions MUST be icon-only buttons (`size="icon"`, ghost variant; destructive icons `text-destructive`), each with a Spanish aria-label preserving the current verb prefix (`Editar a X`, `Dar de baja a X`, `Cancelar ítem X`, `Registrar retiro de X`, `Desactivar X`, `Reemplazar X`, `Ver detalles de X`, `Configurar X`). No table MUST render text action buttons. TareasTable's previously missing aria-label MUST be fixed by construction (`Editar a {nombre}`). `loading?.(row)` MUST disable the button and pulse the icon.

#### Scenario: Icon action renders with Spanish aria-label

- GIVEN a row with a configured action
- WHEN the actions column renders
- THEN a single icon button appears with the Spanish aria-label and no visible text

### Requirement: Pagination on Every Table

Every DataTable instance MUST render the pagination footer (`paginated` defaults true): "start–end de total", rows-per-page select, prev/next with aria-labels; prev disabled on the first page, next on the last; small lists still render the footer with disabled navigation. Page-reset on data change MUST be built in: when `rows` change (filter/search), page resets to 1 and page size to DEFAULT_PAGE_SIZE.

#### Scenario: Page resets when the filter changes

- GIVEN a table with 25 rows on page 3 with an active filter
- WHEN the filter changes the row set
- THEN the page resets to 1 and the page size resets to the default

### Requirement: renderActions Escape Hatch

`renderActions` MUST be used only for the compound status toggles BuildingStatusToggle and AdministrationStatusToggle. Both MUST render `size="icon"` Power buttons with aria-label `Desactivar {nombre}` and MUST return null for inactive rows. All other actions MUST use the `actions` config.

#### Scenario: BuildingsTable renders the toggle via renderActions

- GIVEN an active building row
- WHEN the actions cell renders
- THEN BuildingStatusToggle appears as an icon-only Power button with aria-label

### Requirement: Per-Table Render Contracts

All 13 render sites MUST adopt DataTable with these contracts, and every one MUST be paginated:

| Table | First cell | Actions (icons) |
|---|---|---|
| KeysTable | button → KeyDetailDialog | Power (Activar/Dar de baja) |
| StaffTable | text | PencilLine, Trash2 |
| TareasTable | Link `/tareas/:id` | PencilLine |
| OrdenesTable | Link `/ordenes/:id` | — |
| ProductsTable | Link `/stock/:id` | — (dead "Acciones" column removed) |
| ParticularTable | text | PencilLine, Trash2 |
| BuildingsTable | Link `/buildings/:id` | PencilLine + BuildingStatusToggle |
| AdministrationsTable | Link `/administraciones/:id` | PencilLine + AdministrationStatusToggle |
| EquipmentTable | text | PencilLine, RefreshCw |
| OrderItemsTable | text (Tipo) | Settings2, Eye, Ban, PackageCheck |
| StockMovementsTable | text (Fecha) | — |
| TechnicalItemsTable (new) | text | — |
| OrderTareasTable (new) | Link `/tareas/:id` | — |

OrdenDetailPage MUST compose OrderItemsTable, TechnicalItemsTable (Tipo/Descripción/Cantidad), and OrderTareasTable (N.º/Categoría/Descripción/Estado) and MUST NOT render inline table markup.

#### Scenario: OrderItems actions are visibility-gated

- GIVEN a key item with status `pending`
- WHEN the row renders
- THEN Configurar (Settings2) and Cancelar ítem (Ban) show
- AND once the item is `configured`, both hide
- AND Ver detalles (Eye) and Registrar retiro (PackageCheck) follow the current pickup rules

### Requirement: Accessibility

First-column links MUST be native anchors reachable by keyboard; the Keys dialog trigger MUST remain a real `<button>`; no row MUST be an interactive element. Icon buttons MUST be reachable and operable by keyboard and MUST expose their Spanish aria-labels to assistive technology.

#### Scenario: Keyboard focus reaches row actions

- GIVEN a row with icon actions
- WHEN the admin tabs through the row
- THEN each action button receives focus in order and activates on Enter

### Requirement: Consistency

Every render site MUST use DataTable; no table MUST render custom wrapper markup outside the pattern. Skeleton and empty-state strings MUST be preserved verbatim where they exist (Ordenes, Staff, Particular, Buildings, Keys). Equipment, OrderItems, and the OrdenDetailPage inline tables MUST gain the standard skeleton and dashed empty state for the first time (OrderItems' inline colSpan empty row is replaced by the dashed box).
