# Delta for Design System

## ADDED Requirements

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

Column 0 of every DataTable MUST be the row's primary entry point: (a) a native `<Link>` (`font-medium hover:underline`) when a detail route exists (ordenes, tareas, buildings, administraciones, stock); (b) a `<button>` styled identically when the primary action is a dialog (Keys → KeyDetailDialog; no `/llaves/:id` route exists); (c) emphasized plain text (`font-medium`) for entities with no navigation target (staff, particulares, units, equipment, movements). No table MUST render a whole-row click target or `role=button`; ProductsTable row-click MUST be removed and replaced by a first-column link.

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

All 14 render sites MUST adopt DataTable with these contracts, and every one MUST be paginated:

| Table | First cell | Actions (icons) |
|---|---|---|
| KeysTable | button → KeyDetailDialog | Power (Activar/Dar de baja) |
| StaffTable | text | PencilLine, Trash2 |
| TareasTable | Link `/tareas/:id` | PencilLine |
| OrdenesTable | Link `/ordenes/:id` | — |
| ProductsTable | Link `/stock/:id` | — (dead "Acciones" column removed) |
| UnitsTable | text | PencilLine, Power |
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

Every render site MUST use DataTable; no table MUST render custom wrapper markup outside the pattern. Skeleton and empty-state strings MUST be preserved verbatim where they exist (Ordenes, Staff, Particular, Buildings, Keys). Units, Equipment, OrderItems, and the OrdenDetailPage inline tables MUST gain the standard skeleton and dashed empty state for the first time (OrderItems' inline colSpan empty row is replaced by the dashed box).

#### Scenario: UnitsTable gains skeleton and empty state

- GIVEN UnitsTable with no rows or while loading
- WHEN it renders
- THEN it shows the standard dashed empty state or 3-row pulse skeleton
