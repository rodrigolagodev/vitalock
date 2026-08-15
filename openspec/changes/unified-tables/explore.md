# Explore: unified-tables

## Context

User requirement (change intent):

1. All tables in the site follow the same layout, pattern, and elements (full-site consistency).
2. First column cell of each row acts as a link.
3. Row actions are icon buttons ONLY, never text.
4. Every table has a footer with a WORKING paginator.

Stack: React 18 + TS 5.6 + Vite (apps/admin), shadcn/ui primitives, TanStack Query 5, `@vitalock/ui` shared package (Badge, StatusBadge, Button, PaginationFooter, DEFAULT_PAGE_SIZE, getPageSlice, ROWS_PER_PAGE_OPTIONS), lucide-react available in both packages. UI copy stays Spanish. Strict TDD: `pnpm --filter @vitalock/admin test`.

This exploration verifies the inventory and resolves: shared DataTable contract, first-column link rule, icon-only actions, pagination rule, skeleton/empty states, OrdenDetailPage inline tables, accessibility, and test impact.

## Findings

### Route inventory (verified, `apps/admin/src/main.tsx`)

| Entity | List route | Detail route exists |
|---|---|---|
| Administraciones | `/administraciones` | ✅ `/administraciones/:adminId` |
| Buildings | via detail | ✅ `/buildings/:buildingId` |
| Órdenes | `/ordenes` | ✅ `/ordenes/:ordenId` (+ `/editar`) |
| Tareas | `/tareas` | ✅ `/tareas/:tareaId` |
| Stock products | `/stock` | ✅ `/stock/:productId` |
| Keys | inside BuildingDetailPage | ❌ no `/llaves/:id` — first cell is a `<button>` opening `KeyDetailDialog` |
| Staff (personal) | `/personal` | ❌ none |
| Particulares | `/particulares` | ❌ none |
| Units | inside BuildingDetailPage | ❌ none |
| Equipment | inside BuildingDetailPage | ❌ none |
| Stock movements | inside StockDetailPage | ❌ none |

### Verified inventory of all table surfaces

All 12 component files + 2 inline tables in `OrdenDetailPage.tsx` (technical items, tareas) = 14 render sites. The wrapper `overflow-hidden rounded-[12px] border bg-card` is duplicated in every one of them. 11 of 12 components define a private `SkeletonRow` (3 pulse rows). 10 of 12 define the dashed-box empty state (missing: UnitsTable, EquipmentTable, OrderItemsTable — inline colSpan row; OrdenDetailPage inline tables — plain `<p>`).

| Component | First column | Actions | Pagination | Skeleton |
|---|---|---|---|---|
| keys/KeysTable | `<button>` → KeyDetailDialog | text "Dar de baja"/"Activar" | none | ✅ |
| personal/StaffTable | plain text | icon PencilLine+Trash2 (aria-labels ✅) | none | ✅ |
| tareas/TareasTable | Link `/tareas/:id` | icon PencilLine (NO aria-label ⚠️) | none | ✅ |
| ordenes/OrdenesTable | Link `/ordenes/:id` | none | PaginationFooter ✅ + page-reset | ✅ |
| stock/ProductsTable | whole-row `role=button` click → `/stock/:id` | dead empty "Acciones" header | PaginationFooter ✅ + page-reset | ✅ |
| units/UnitsTable | plain text | text "Editar" + "Desactivar" | none | ❌ |
| particulares/ParticularTable | plain text | icon PencilLine+Trash2 (aria-labels ✅) | none | ✅ |
| buildings/BuildingsTable | Link `/buildings/:id` | text "Editar" + BuildingStatusToggle "Desactivar" | none | ✅ |
| administrations/AdministrationsTable | Link `/administraciones/:id` | text "Editar" + AdministrationStatusToggle | PaginationFooter ✅ + page-reset | ✅ |
| equipment/EquipmentTable | plain text | text "Editar" + "Reemplazar" | none | ❌ |
| ordenes/OrderItemsTable | plain text (Tipo) | text "Configurar"/"Ver detalles"/"Cancelar ítem"/"Registrar retiro" | none | ❌ (inline colSpan empty) |
| stock/StockMovementsTable | plain text (Fecha) | none | none | ✅ |
| routes/ordenes/OrdenDetailPage | 2 inline tables: technical items (3 cols); tareas (Link `/tareas/:id`, 4 cols) | none | none | ❌ (page-level only) |

### Shared-pattern observations

- `@vitalock/ui` does NOT export table primitives. All tables import `Table/TableBody/TableCell/TableHead/TableHeader/TableRow` from `apps/admin/src/components/ui/table.tsx` (shadcn primitive, `TableRow` hardcodes `h-[71px]`). That primitive is consumed by exactly the 13 files above — clean blast radius for a promotion.
- `PaginationFooter` (packages/ui) already: Spanish labels, "Filas por página" select (10/20/50), "start–end de total", prev/next with aria-labels. `getPageSlice` + `DEFAULT_PAGE_SIZE` already exported. Page-reset-on-data-change effect (`useEffect` → setPage(1), setPageSize(DEFAULT_PAGE_SIZE)) is a 3x-duplicated pattern (Ordenes/Products/Administrations).
- `Button` in @vitalock/ui: `size="icon"` = 52px; `asChild` supported. Icon-button precedent already exists in StaffTable/ParticularTable/TareasTable (PencilLine/Trash2). TareasTable's edit icon lacks aria-label; `@/components/ui/button` is a re-export shim of @vitalock/ui (precedent for shims).
- lucide-react is a dependency of both packages.

### Existing tests (impact surface)

- `OrdenesTable.test.tsx` (8 tests): skeleton (`.animate-pulse`), empty states (exact strings), link hrefs `/ordenes/:id`, badges, item counts, client labels.
- `OrdenesTablePagination.test.tsx` (4 tests): "1–10 de 25", row counts, paging, page-size change, reset-on-data-change (`combobox` value '10'). All behavior comes from PaginationFooter — must survive unchanged.
- `OrderItemsTable.test.tsx` (19 tests): queries action buttons by text regex (`/cancelar ítem/i`, `/registrar retiro/i`), plus extensive visibility gating (Configurar in confirmed/in_progress, pickup rules).
- `ParticularTable.test.tsx` (7 tests): rows, skeleton, empty states, deactivate dialog flow, "Editar" button only when `onEdit`.
- `BuildingsTable.test.tsx` (4 tests): link hrefs `/buildings/:id`, anchor tagName 'A', empty, skeleton.
- No tests: KeysTable, StaffTable, TareasTable, UnitsTable, EquipmentTable, StockMovementsTable, AdministrationsTable, ProductsTable. `StockPage.test.tsx` exists — may click rows (whole-row role=button) → must audit.

## Options considered

### O1. Config-driven `DataTable` in `@vitalock/ui` (recommended)

Columns config (header + render + alignment), first-column link/action config, icon-action config array, skeleton/empty/pagination built in.

- Pros: single source of the pattern (wrapper, row height, skeleton, empty, pagination, page-reset); kills 14x duplication; icon buttons get aria-label by construction; per-table wiring preserved via columns/actions/href + `renderActions` escape hatch for compound toggles; config > children for the repeated parts.
- Cons: new abstraction; first-column wrapping rule must be documented; move of table primitives into @vitalock/ui touches 13 imports (mitigate with re-export shim).
- Effort: High (but it is the bulk of the change).

### O2. Children-based composition (primitives + shared building blocks only)

Shared `TableSkeleton`, `TableEmptyState`, `useTablePagination` hook; each table keeps its own markup.

- Pros: least magic; no wrapping rules; smallest conceptual shift.
- Cons: every table still assembles wrapper/header/actions by hand → pattern consistency depends on discipline; "single source of the pattern" requirement not really met; pagination wiring repeated 13x.
- Effort: Medium.

### O3. Headless render-prop DataTable

Rows render via callback with injected state.

- Pros: maximum flexibility.
- Cons: more boilerplate than O1 for the 95% case; worse for code review; overkill for this codebase.
- Effort: Medium/High.

## Recommended approach

### 1. Shared `DataTable<T>` in `@vitalock/ui` (O1)

Promote the shadcn table primitives into `packages/ui/src/components/table.tsx` (row height `h-[71px]` moves with them; keep `@/components/ui/table` as a re-export shim to avoid unrelated churn) and add `packages/ui/src/components/patterns/DataTable.tsx`, exported from `packages/ui/src/index.ts`.

```tsx
// Contract sketch (design phase will finalize)
export interface DataTableColumn<T> {
  key: string;
  header: string;                       // Spanish label
  className?: string;                   // alignment, e.g. "text-right"
  skeleton?: string;                    // pulse width override, default "h-4 w-24"
  render: (row: T) => ReactNode;        // cell content
  cellClassName?: (row: T) => string;   // row-conditional styling (e.g. low-stock red)
}

export interface DataTableAction<T> {
  key: string;
  icon: LucideIcon;
  label: (row: T) => string;            // REQUIRED aria-label, Spanish, keeps current verb prefix
  variant?: 'ghost' | 'outline' | 'destructive';
  className?: string;                   // e.g. "text-destructive" on the icon
  show?: (row: T) => boolean;
  disabled?: (row: T) => boolean;
  loading?: (row: T) => boolean;        // disables + pulses icon while a mutation is pending
  onClick: (row: T) => void;
}

export interface DataTableProps<T> {
  rows: T[];
  columns: DataTableColumn<T>[];        // column[0] is the primary cell (first-column rule)
  rowKey: (row: T) => string;
  isFetching?: boolean;
  hasFilters?: boolean;
  getRowHref?: (row: T) => string;      // column[0] renders <Link> (font-medium hover:underline)
  onFirstCellClick?: (row: T) => void;  // column[0] renders <button> styled as a link (Keys dialog)
  emptyMessage: string;                 // dashed box, keeps exact current strings
  emptyHint?: string;
  filteredEmptyMessage?: string;
  paginated?: boolean;                  // default true → footer always rendered
  actions?: DataTableAction<T>[];       // icon actions column (hidden when empty)
  renderActions?: (row: T) => ReactNode; // escape hatch for compound components (status toggles)
}
```

Built-in behavior: wrapper `overflow-hidden rounded-[12px] border bg-card`; 3-row pulse skeleton when `isFetching`; dashed empty state (plain vs filtered variants); internal `page/pageSize` state + `getPageSlice` + `PaginationFooter` + page-reset effect on `rows` change (the existing 3-table pattern, now in one place).

### 2. First-column rule (one consistent rule)

> **The first cell is the row's primary entry point. It renders as (a) a `<Link>` (font-medium, hover:underline) when the entity has a detail route; (b) a `<button>` styled identically when the primary action is a modal (Keys → KeyDetailDialog); (c) emphasized plain text (`font-medium`) when neither exists. `DataTable` enforces the same visual treatment for all three.**

- Links (keep): ordenes, tareas, buildings, administraciones, stock products. TareasTable already links `/tareas/:id`.
- Dialog trigger (keep, restyled): keys — no `/llaves/:id` route exists; creating one is scope growth and the dialog IS the detail view. Keep `<button>` (it already is one); DataTable's `onFirstCellClick` renders it with link styling.
- Plain emphasized text (new explicit rule): staff, particulares, units, equipment, stock movements have NO navigation target (units/equipment/movements are already INSIDE their entity's detail page — linking to themselves is meaningless). Forcing fake links to nonexistent pages is worse than a documented non-link case.
- Fix ProductsTable anti-pattern: replace whole-row `role=button` click with a first-column `<Link>` to `/stock/:id`.

### 3. Icon-only actions (uniform mapping)

| Action | Icon | Notes |
|---|---|---|
| Editar | PencilLine | already used |
| Dar de baja / deactivate (staff, particular, key) | Trash2 | already used (dialog-confirmed deletes) |
| Ver detalles (key item) | Eye | |
| Configurar (key item) | Settings2 | |
| Cancelar ítem | Ban | |
| Registrar retiro | PackageCheck | |
| Activar / Dar de baja (key status) | Power | one toggle icon, label varies by state |
| Desactivar (unit) | Power | |
| Reemplazar (equipment) | RefreshCw | |
| Desactivar (building / administration) | Power | compound toggles — see below |

Conventions:
- **Every icon button gets `aria-label`** = Spanish verb phrase preserving the current first word so existing regex queries survive where possible: `Editar a X`, `Dar de baja a X`, `Cancelar ítem X`, `Registrar retiro de X`, `Desactivar X`, `Reemplazar X`, `Ver detalles de X`, `Configurar X`. TareasTable's missing aria-label is fixed by construction (DataTable requires `label()`).
- Variant: `ghost` for all row actions; destructive actions color the icon `text-destructive`; positive/neutral actions plain. `size="icon"` (existing 52px token — already used by Staff/Particular/Tareas).
- Loading: `loading?.(row)` → `disabled` + `animate-pulse` on the icon (replaces the current `disabled={mutation.isPending}` pattern).
- Compound toggles (BuildingStatusToggle / AdministrationStatusToggle): keep their dialog + dependency-check logic intact; change their trigger `Button` to `size="icon"` + `Power` + aria-label `Desactivar X`, and register them via the `renderActions` escape hatch (they must stay conditional — they return null for inactive rows — so they are not plain `DataTableAction` entries). KeysTable's status change dialog stays wired via a `DataTableAction` (Power, label switches `Activar`/`Dar de baja`).
- OrderItemsTable gating logic (canConfigure/canPickup/canViewDetails/isPending) moves into `show`/`disabled` predicates — behavior unchanged.

### 4. Pagination rule

> **Every `DataTable` instance renders the footer — no opt-out.** `paginated` defaults `true`; the footer shows "1–N de N" with disabled nav for small lists (harmless, uniform, and satisfies "every table has a footer with a working paginator"). Page-reset-on-data-change ships in DataTable once.

Applies to ALL surfaces: the 11 component tables (including nested Units/Equipment/Keys inside BuildingDetailPage, and StockMovements inside StockDetailPage — all can grow past 10) AND the two OrdenDetailPage inline tables (technical items, tareas). Staff/Tareas/Particulares are unbounded — pagination needed there (currently none).

### 5. Skeleton + empty states

DataTable renders the 3-row pulse skeleton and the dashed-box empty state (plain + filtered variants) for every surface, using the EXACT current Spanish strings (empty message + hint) passed via props, so existing string-assertion tests keep passing. UnitsTable, EquipmentTable, OrderItemsTable, and the two OrdenDetailPage inline tables get skeleton + empty for the first time; OrderItemsTable's inline colSpan empty row is replaced by the standard dashed box.

### 6. OrdenDetailPage inline tables

`OrderItemsTable` is already used for keys orders — do NOT duplicate it. Extract the two inline tables into components using DataTable (minimum refactor):
- `components/ordenes/TechnicalItemsTable.tsx` — 3 cols (Tipo/Descripción/Cantidad), no first-cell link (no target), paginated, skeleton/empty.
- `components/ordenes/OrderTareasTable.tsx` — 4 cols (N.º/Categoría/Descripción/Estado), first cell Link `/tareas/:id`, paginated, skeleton/empty.
- `OrdenDetailPage` keeps its page-level loading/error states and composes the three components; delete its inline `Table` markup (and its now-unused `CATEGORY_LABELS`/`TareaStatusBadge` imports if orphaned).

### 7. Accessibility

- aria-labels on all icon buttons (DataTable-required); TareasTable gap fixed.
- First-column links are native `<Link>`s; Keys keeps a real `<button>` (semantically correct — no navigation exists).
- ProductsTable: removing whole-row `role=button` fixes the row-as-button anti-pattern; navigation becomes a proper link.
- `PaginationFooter` already has labeled prev/next + select.

### 8. Per-table decision table

| Component | First cell | Actions (icons) | Paginated | Notes |
|---|---|---|---|---|
| KeysTable | button → KeyDetailDialog (styled as link) | Power (Activar/Dar de baja, dialog) | ✅ | isFetching prop stays |
| StaffTable | plain text (emphasized) | PencilLine (edit), Trash2 (deactivate dialog) | ✅ | hasFilters/onEdit stay |
| TareasTable | Link `/tareas/:id` | PencilLine (edit) + aria-label fixed | ✅ | hasFilters/onEdit stay |
| OrdenesTable | Link `/ordenes/:id` | none | ✅ (keep) | behavior identical |
| ProductsTable | Link `/stock/:id` (replaces row-click) | remove dead "Acciones" column | ✅ (keep) | row role=button removed |
| UnitsTable | plain text | PencilLine (edit sheet), Power (deactivate) | ✅ | skeleton+empty added |
| ParticularTable | plain text | PencilLine, Trash2 | ✅ | tests carry over |
| BuildingsTable | Link `/buildings/:id` | PencilLine, Power (renderActions → BuildingStatusToggle) | ✅ | |
| AdministrationsTable | Link `/administraciones/:id` | PencilLine, Power (renderActions → AdministrationStatusToggle) | ✅ (keep) | |
| EquipmentTable | plain text | PencilLine, RefreshCw (replace dialog) | ✅ | skeleton+empty added |
| OrderItemsTable | plain text (Tipo) | Settings2, Eye, Ban, PackageCheck (gated) | ✅ | 19 tests rewritten to aria-label names |
| StockMovementsTable | plain text (Fecha) | none | ✅ | |
| OrdenDetailPage → TechnicalItemsTable | plain text | none | ✅ | new component |
| OrdenDetailPage → OrderTareasTable | Link `/tareas/:id` | none | ✅ | new component |

### Test impact

Existing tests needing updates:
- `OrderItemsTable.test.tsx` — highest churn: icon conversion breaks text queries; rewrite action assertions to `getByRole('button', { name: /cancelar ítem/i })` etc. against the new aria-labels (label prefixes preserve the phrases). Visibility-gating tests (19) port directly to `show` predicates.
- `ParticularTable.test.tsx` — likely survives if aria-label "Editar a X" keeps the `/editar/i` match; verify.
- `BuildingsTable.test.tsx` — link/empty/skeleton tests survive (exact strings + `<A>` preserved by DataTable link rendering); the toggle moves to renderActions — no direct test on it.
- `OrdenesTable.test.tsx`, `OrdenesTablePagination.test.tsx` — must pass unchanged (same footer, same row structure, same strings); regression gate for the DataTable refactor.
- `StockPage.test.tsx` — audit: may click whole rows; switch to clicking the first-column link.
- Untested tables (Keys/Staff/Tareas/Units/Equipment/StockMovements/Administrations/Products) gain coverage with the refactor.

New tests (strict TDD, written with implementation):
- `packages/ui` DataTable suite: skeleton render (3 pulse rows, no links), empty (plain + filtered, exact copy), first-column `<Link>` href, first-column `<button>` (Keys mode) with link styling, action icons render with aria-labels, action `show`/`disabled`/`loading`, actions column hidden when none, pagination slice + footer text + page-reset on data change, `renderActions` escape hatch.
- Per-table: KeysTable first-cell opens KeyDetailDialog; BuildingsTable renders BuildingStatusToggle via renderActions; OrderItemsTable action gating preserved; OrdenDetailPage composes the three item/tarea tables.

## Open questions for the user (3)

1. **First-column rule for Keys (and no-detail entities).** Recommended: keep the dialog-trigger `<button>` styled as a link for keys (no `/llaves/:id` route; creating one is scope growth), and keep emphasized plain text for staff/particulares/units/equipment/stock movements (no target exists — units/equipment/movements are already inside their entity's detail page). Alternative: create `/llaves/:id` and/or detail pages for the others (significant scope increase). Confirm the recommended rule?
2. **Inline tables in OrdenDetailPage (technical items + tareas): include them in the paginated uniform pattern?** Recommended: yes — "every table" includes them; pagination is free and uniform (footer renders "1–N de N" with disabled nav for small lists). Alternative: leave them as unpaginated mini-tables (breaks requirement 4).
3. **Icon semantics:** OK with Power for all activate/deactivate toggles (including compound building/administration toggles), Ban for "Cancelar ítem" (vs XCircle), Settings2 for "Configurar", PackageCheck for "Registrar retiro", RefreshCw for "Reemplazar"? Any preferred alternatives?

## Risks

- **Change size vs review budget (config `review_budget_lines: 800`):** 14 render sites + new DataTable + primitive promotion + test rewrites will exceed 800 lines. `sdd-tasks` must forecast and recommend chained PRs (delivery_strategy: ask-on-risk) — e.g. slice 1: DataTable + primitives + tests; slice 2: migrate paginated tables; slice 3: actions/first-cell migrations; slice 4: OrderDetail + inline tables.
- **OrderItemsTable test churn:** 19 tests query text buttons; icon conversion is the riskiest behavioral change. Mitigation: aria-labels keep the current verb prefixes; gating logic maps 1:1 to `show` predicates.
- **Primitive promotion blast radius:** moving `table.tsx` to @vitalock/ui touches 13 import sites; keep the `@/components/ui/table` re-export shim (precedent: `@/components/ui/button`) to bound the diff.
- **ProductsTable row-click removal** may break `StockPage.test.tsx` and changes a11y semantics (improvement) — flag in tasks/verify.
- **Exact-string empty states:** keep current Spanish messages verbatim in DataTable props or string-assertion tests (Ordenes/Staff/Particular/Buildings/Keys) will fail.
- **Compound toggles via `renderActions`:** the escape hatch could be abused to bypass the icon rule — scope it in design (only documented for the two status toggles).

## Ready for Proposal

Yes. The orchestrator should confirm the 3 open questions with the user (Keys first-cell behavior, inline-table pagination, icon semantics), then proceed to `sdd-propose` with the recommended approach above.
