# Proposal: Unified Tables — one table pattern across all surfaces

## Intent

The admin app renders 14 table sites that each re-implement the same pattern with drift: 11 lack pagination, several use text action buttons, TareasTable's edit icon has no aria-label, ProductsTable uses a whole-row `role=button` anti-pattern, and page-reset-on-data-change is copy-pasted in 3 tables. One config-driven `DataTable<T>` in `@vitalock/ui` becomes the single source of the pattern.

## Scope

### In Scope
- `DataTable<T>` pattern in `@vitalock/ui` (wrapper, header, skeleton, empty state, pagination + page-reset, first-cell link/dialog/text config, icon-action config); table primitives promoted into the package with `@/components/ui/table` re-export shim.
- Pagination on every surface, incl. OrdenDetailPage inline tables (extracted to `TechnicalItemsTable`, `OrderTareasTable`).
- First-column rule: `<Link>` where a detail route exists; link-styled `<button>` for Keys' dialog; emphasized plain text otherwise. ProductsTable row-click → first-column link.
- Icon-only actions with mandatory Spanish aria-label; consistent icon map; `renderActions` scoped to BuildingStatusToggle + AdministrationStatusToggle.

### Out of Scope
- No new detail routes (incl. `/llaves/:id`); no backend changes; no UI copy changes.
- Future: server-side pagination, column sorting.

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `design-system`: new `DataTable` pattern + promoted table primitives; first-column link rule; icon-only action rule; pagination-on-every-table rule.
- `admin-shell`: unchanged — tables are page content, not shell.

## Approach

Config-driven `DataTable<T>` (O1; full contract sketch in `explore.md` §1). Column 0 is the primary cell (link | dialog button | emphasized text); icon actions get aria-labels by construction; `paginated` defaults true so the footer always renders ("1–N de N", disabled nav on small lists); page-reset-on-data-change ships once. Refactor all 14 render sites (13 surfaces; OrdenDetailPage hosts two inline tables):

| Surface | First cell | Actions (icons) | Pag. |
|---|---|---|---|
| KeysTable | button → KeyDetailDialog (link-styled) | Power (Activar/Dar de baja) | ✅ |
| StaffTable | text | PencilLine, Trash2 | ✅ |
| TareasTable | Link `/tareas/:id` | PencilLine (+aria-label fixed) | ✅ |
| OrdenesTable | Link `/ordenes/:id` | — | ✅ |
| ProductsTable | Link `/stock/:id` (replaces row-click) | dead "Acciones" col removed | ✅ |
| UnitsTable | text | PencilLine, Power | ✅ |
| ParticularTable | text | PencilLine, Trash2 | ✅ |
| BuildingsTable | Link `/buildings/:id` | PencilLine + renderActions → BuildingStatusToggle | ✅ |
| AdministrationsTable | Link `/administraciones/:id` | PencilLine + renderActions → AdministrationStatusToggle | ✅ |
| EquipmentTable | text | PencilLine, RefreshCw | ✅ |
| OrderItemsTable | text | Settings2, Eye, Ban, PackageCheck (gated) | ✅ |
| StockMovementsTable | text | — | ✅ |
| TechnicalItemsTable (new) | text | — | ✅ |
| OrderTareasTable (new) | Link `/tareas/:id` | — | ✅ |

Icon map: Editar→PencilLine; deactivate (staff/particular/key)→Trash2; status toggles (key/unit/building/administration)→Power; Ver detalles→Eye; Configurar→Settings2; Cancelar ítem→Ban; Registrar retiro→PackageCheck; Reemplazar→RefreshCw. Labels keep current Spanish verb prefixes (`Editar a X`, `Cancelar ítem X`) so regex queries survive; variant ghost, destructive icons `text-destructive`; `loading?.(row)` → disabled + pulse.

Test strategy (strict TDD, `pnpm --filter @vitalock/admin test`): new `packages/ui` DataTable suite (skeleton, empty plain/filtered exact strings, first-cell link vs button, aria-labels, show/disabled/loading, pagination slice + reset, renderActions); OrderItemsTable tests rewritten to `getByRole('button', { name: … })`; OrdenesTable + OrdenesTablePagination pass unchanged (regression gate); untested tables gain coverage; StockPage.test.tsx audited for row-click.

## Affected Areas

| Area | Impact | Description |
|---|---|---|
| `packages/ui/src/components/table.tsx` | New | Promoted primitives (row `h-[71px]`) |
| `packages/ui/src/components/patterns/DataTable.tsx` | New | Config-driven pattern |
| `packages/ui/src/index.ts` | Modified | Exports |
| `apps/admin/src/components/ui/table.tsx` | Modified | Re-export shim |
| 11 `apps/admin/src/components/*/*Table.tsx` | Modified | Migrate to DataTable |
| `apps/admin/src/components/ordenes/{TechnicalItemsTable,OrderTareasTable}.tsx` | New | Extracted inline tables |
| `apps/admin/src/routes/ordenes/OrdenDetailPage.tsx` | Modified | Compose the three tables |
| Table test suites | Modified | Rewrite/audit/add |

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Forecast >400 review lines; `single-pr` needs maintainer `size:exception` before apply | High | Flag at sdd-tasks; shim bounds diff; one PR kept |
| OrderItemsTable 19 text-button tests churn | High | aria-labels keep verb prefixes; gating → `show` predicates 1:1 |
| ProductsTable row-click removal breaks StockPage tests | Med | Audit/update; a11y improvement |
| Exact-string empty states break | Low | Pass current Spanish strings verbatim as props |
| `renderActions` bypasses icon rule | Med | Scoped in design: only the two status toggles |

## Rollback Plan

`git revert` of the single PR; the `@/components/ui/table` shim keeps all imports resolving, so revert needs no code fixups. No data migrations.

## Dependencies

- Sibling `atomic-stock-work-resolution` is dormant/planned — no conflict; TareasTable migrated here.
- No new external dependencies.

## Success Criteria

- [ ] All 14 render sites use `DataTable`; zero text action buttons; every icon button has a Spanish aria-label.
- [ ] Every table renders the working pagination footer; page-reset on data change.
- [ ] DataTable suite + per-table tests pass; OrdenesTable and OrdenesTablePagination suites pass unchanged; full admin test command green.
- [ ] ProductsTable `role=button` removed; row navigation is a first-column `<Link>`.
- [ ] UI copy unchanged; lint, typecheck, build green.
