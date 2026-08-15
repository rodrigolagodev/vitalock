# Design: Unified Tables (DataTable)

## Technical Approach

Introduce a generic `DataTable<T>` in `@vitalock/ui` (`packages/ui/src/components/patterns/DataTable.tsx`) owning row rendering, skeleton/empty states, icon-only actions, and pagination. Promote the shadcn table primitives from `apps/admin/src/components/ui/table.tsx` into `packages/ui` behind a re-export shim, then migrate all 14 render sites (12 table components + 2 inline in `OrdenDetailPage.tsx`). Meets the 9 ADDED `design-system` spec requirements and the proposal's consistency rules. No backend changes; no new routes.

## Architecture Decisions

### D1 — Where DataTable lives
| Option | Tradeoff | Decision |
|---|---|---|
| A: packages/ui pattern | relocation per archive D3 precedent; one home | **A** |
| B: admin-local | pattern escapes design system; infra duplicated | reject |

### D2 — First-cell navigation
| Option | Tradeoff | Decision |
|---|---|---|
| A: add `react-router-dom@^6.27.0` to packages/ui, import `Link` | same version admin ships; pnpm dedupes; D3 precedent | **A** |
| B: native `<a href>` | breaks SPA navigation | reject |
| C: `linkComponent` prop | unneeded API surface | reject |

### D3 — Pagination state
| Option | Tradeoff | Decision |
|---|---|---|
| A: internal page/pageSize + reset effect on `[rows]` | mirrors Ordenes/Administrations/ProductsTable; zero boilerplate | **A** |
| B: controlled props | boilerplate, no consumers | reject |

### D4 — Action model
| Option | Tradeoff | Decision |
|---|---|---|
| A: `actions[]` + `renderActions(row)` | uniform icon buttons; compound toggles (Building/AdministrationStatusToggle) via renderActions | **A** |
| B: render prop only | loses uniformity + a11y discipline | reject |

### D5 — TableRow `h-[71px]`
| Option | Tradeoff | Decision |
|---|---|---|
| A: keep hardcoded in promoted primitive | zero visual drift; all tables built around it | **A** (theming deferred) |
| B: remove/parametrize | flexible, churns every row height | reject |

### D6 — First-cell rendering
| Option | Tradeoff | Decision |
|---|---|---|
| A: `firstCell: 'link' \| 'button' \| 'text'` | per-row interactive element; fixes a11y; meets first-column rule | **A** |
| B: row-level onClick | `role=button` anti-pattern (ProductsTable) | reject |

## Data Flow

```
page hook → rows: T[] ──► DataTable<T>
    internal page/pageSize, reset on [rows]
    isFetching → 3-row pulse skeleton (cells h-4 w-24)
    empty rows → dashed empty state (filteredEmptyMessage if hasFilters)
    else getPageSlice(rows, page, pageSize):
        first cell: Link | button | emphasized text
        other cells: column render
        actions cell: icon buttons | renderActions
    PaginationFooter (only when rows exist)
```

## File Changes

| File | Action | Description |
|---|---|---|
| `packages/ui/src/components/table.tsx` | Create | Promoted primitives; `cn`→`../lib/utils`; keeps `h-[71px]` |
| `apps/admin/src/components/ui/table.tsx` | Modify | Shim re-exporting table set from `@vitalock/ui` |
| `packages/ui/src/components/patterns/DataTable.tsx` | Create | Generic pattern (contract below) |
| `packages/ui/src/index.ts` | Modify | Export `DataTable` + types |
| `packages/ui/package.json` | Modify | Add `react-router-dom ^6.27.0` (D2) |
| `packages/ui/src/components/patterns/__tests__/DataTable.test.tsx` | Create | Pattern unit suite |
| 12 tables under `apps/admin/src/components/{ordenes,buildings,administrations,keys,personal,tareas,stock,units,particulares,equipment}` | Modify | Migrate to DataTable; drop ProductsTable row `role=button`; normalize TareasTable Button import |
| `apps/admin/src/components/ordenes/{TechnicalItemsTable,OrderTareasTable}.tsx` | Create | Extracted from OrdenDetailPage (3/4 cols; tareas link `/tareas/:id`) |
| `apps/admin/src/routes/ordenes/OrdenDetailPage.tsx` | Modify | Use extracted tables |
| Affected admin `__tests__` | Modify | aria-label query updates |

Wiring: toggles keep null-when-inactive semantics via `renderActions`; OrderItems predicates unchanged (Configurar = key+pending+confirmed/in_progress; Registrar retiro = canRegisterPickup; Cancelar = pending, `disabled` while pending; Ver detalles = produced_key_id).

## Interfaces / Contracts

```tsx
// label = Spanish aria-label, verb-first ("Editar a {nombre}"); className e.g. text-destructive
interface DataTableColumn<T> { header: string; cell: (row: T) => React.ReactNode; className?: string; headerClassName?: string; }
interface DataTableAction<T> {
  icon: LucideIcon; label: string | ((row: T) => string);
  onClick: (row: T) => void; show?: (row: T) => boolean;
  disabled?: (row: T) => boolean; loading?: (row: T) => boolean; // disabled + pulse
  className?: string | ((row: T) => string);
}
interface DataTableProps<T> {
  rows: T[]; isFetching?: boolean; columns: DataTableColumn<T>[];
  rowKey: (row: T) => string;
  firstCell?: 'link' | 'button' | 'text';
  getRowHref?: (row: T) => string; onFirstCellClick?: (row: T) => void;
  actions?: DataTableAction<T>[]; renderActions?: (row: T) => React.ReactNode;
  actionsHeaderLabel?: string; // default "Acciones"
  emptyMessage?: string; filteredEmptyMessage?: string; hasFilters?: boolean;
  paginated?: boolean; // default true
}
```

Actions column hidden when no `actions` and no `renderActions`. All action buttons `variant="ghost"` `size="icon"`. Icons: Editar→PencilLine, Dar de baja→Trash2 (destructive), Ver detalles→Eye, Configurar→Settings2, Cancelar ítem→Ban (destructive), Registrar retiro→PackageCheck, Activar/Dar de baja→Power (destructive when deactivating), Reemplazar→RefreshCw.

## Testing Strategy

| Layer | What | Approach |
|---|---|---|
| packages/ui unit | render modes, skeleton, empty variants, pagination math + reset, actions hidden-when-none, aria-labels, keyboard | new suite, MemoryRouter; `pnpm --filter @vitalock/ui test` |
| admin regression | OrdenesTable + pagination, BuildingsTable, ParticularTable, toggle triggers, OrderItemsTable | pass with minimal edits; `pnpm --filter @vitalock/admin test` |

Correction to proposal: OrderItemsTable has **17** tests (not 19); name-based queries (`/configurar/i`, `/cancelar ítem/i`) survive icon-only migration (~0–2 edits). StockPage (1 test) untouched. Toggle triggers: name becomes `Desactivar {nombre}`; confirm-button lookup stays unique.

## Threat Matrix

N/A — no routing, shell, subprocess, VCS/PR automation, executable-file classification, or process-integration boundary (react-router `<Link>` is client-side navigation).

## Migration / Rollout

Order: primitives+shim → DataTable+suite → gated tables (Ordenes, Buildings, Particular, OrderItems, toggles) → remaining tables → extract OrdenDetailPage tables. No data migration, no feature flags.

Risks: >400 changed lines forecast → maintainer `size:exception` before tasks (review budget 800); predicates guarded by regression tests; `react-router-dom` in packages/ui warrants the archive-D3 ratification note.

## Open Questions

- None blocking. Correction logged: OrderItemsTable has 17 tests (proposal: 19).
