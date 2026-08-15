# Tasks: Unified Tables (DataTable)

> **Delivery note (2026-08-14)**: User chose **"Un solo PR"** (delivery_strategy `single-pr`) and accepted a maintainer **`size:exception`**; the >400-line forecast is absorbed into ONE PR under the 800-line review budget. Chain strategy: `size-exception` (no chaining). Strict TDD active: `pnpm --filter @vitalock/admin test`; typecheck `pnpm typecheck`; lint `pnpm lint`. UI copy stays Spanish (aria-labels, empty states verbatim). Threat matrix N/A (design); no RED matrix tasks beyond TDD pairs.

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~1,500–1,950 (additions + deletions, incl. tests) |
| 400-line budget risk | High |
| Chained PRs recommended | No |
| Suggested split | Single PR (work-unit commits) |
| Delivery strategy | single-pr |
| Chain strategy | size-exception |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: High

### Suggested Work Units (→ one PR, one conventional commit each)

| Unit | Goal | Commit | Focused test command | Runtime harness | Rollback boundary |
|------|------|--------|----------------------|-----------------|-------------------|
| W1 | Primitives promotion + shim | `refactor(ui): promote table primitives to @vitalock/ui behind admin shim` | `pnpm typecheck && pnpm --filter @vitalock/admin test` | `pnpm dev` admin; all tables render via shim | Revert W1 commit → old imports resolve |
| W2 | DataTable<T> + suite | `feat(ui): add config-driven DataTable pattern and tests` | `pnpm --filter @vitalock/ui test` | N/A — pattern unit; runtime proven in W3+ | Revert W2 commit |
| W3 | OrderItemsTable migration | `refactor(admin): migrate OrderItemsTable to DataTable with aria-label actions` | `pnpm --filter @vitalock/admin test` | `pnpm dev`; /ordenes/:id key-item actions gating | Revert W3 commit |
| W4 | Toggle tables | `refactor(admin): migrate Buildings/Administrations tables and status toggles` | `pnpm --filter @vitalock/admin test` | `pnpm dev`; /buildings, /administraciones toggles | Revert W4 commit |
| W5 | Simple list tables (5) | `refactor(admin): migrate list tables to DataTable` | `pnpm --filter @vitalock/admin test` | `pnpm dev`; /ordenes /stock /personal /tareas /particulares | Revert W5 commit |
| W6 | Nested tables (4) | `refactor(admin): migrate nested tables to DataTable` | `pnpm --filter @vitalock/admin test` | `pnpm dev`; /buildings/:id, /stock/:id nested tables | Revert W6 commit |
| W7 | OrdenDetailPage extraction | `refactor(admin): extract OrdenDetailPage inline tables into DataTable components` | `pnpm --filter @vitalock/admin test` | `pnpm dev`; /ordenes/:id three paginated tables | Revert W7 commit |
| W8 | Pipeline gate + docs | `chore(admin): final pipeline gate and docs note` | `pnpm typecheck && pnpm lint && pnpm test` | `pnpm dev` full surface spot-check | Revert W8 commit |

## Icon Mapping (final)

| Action | Icon | aria-label | Destructive |
|--------|------|-----------|-------------|
| Editar | PencilLine | `Editar a {nombre}` | no |
| Dar de baja (staff/particular/key) | Trash2 | `Dar de baja a {nombre}` | yes |
| Ver detalles | Eye | `Ver detalles de {item}` | no |
| Configurar | Settings2 | `Configurar {item}` | no |
| Cancelar ítem | Ban | `Cancelar ítem {item}` | yes |
| Registrar retiro | PackageCheck | `Registrar retiro de {item}` | no |
| Activar/Dar de baja (key status) | Power | `Activar {nombre}` / `Dar de baja a {nombre}` | when deactivating |
| Desactivar (unit) | Power | `Desactivar {nombre}` | when deactivating |
| Desactivar (building/admin toggle) | Power | `Desactivar {nombre}` | when deactivating |
| Reemplazar (equipment) | RefreshCw | `Reemplazar {item}` | no |

## W1 · Primitives promotion + shim (~140)

- [ ] T-01 Promote table primitives (Table/TableBody/TableCell/TableHead/TableHeader/TableRow, row `h-[71px]`) into `packages/ui/src/components/table.tsx`; `cn` → `../lib/utils`; export from `packages/ui/src/index.ts` · Files: `packages/ui/src/components/table.tsx`, `packages/ui/src/index.ts` · Verify: `pnpm --filter @vitalock/ui test` + `pnpm typecheck` · ~130
- [ ] T-02 Rewrite `apps/admin/src/components/ui/table.tsx` as re-export shim of `@vitalock/ui` (precedent `@/components/ui/button`) · Verify: `pnpm --filter @vitalock/admin test` existing suites + `pnpm typecheck` · ~10

## W2 · DataTable<T> + suite (~470)

- [ ] T-03 Add `react-router-dom ^6.27.0` to `packages/ui/package.json` (D2; archive-D3 precedent) · Verify: `pnpm install`, `pnpm typecheck` · ~1
- [ ] T-04 RED: write `packages/ui/src/components/patterns/__tests__/DataTable.test.tsx` (MemoryRouter): skeleton 3 pulse rows + no links; empty plain vs filtered exact strings; first-cell `<Link>` href / `<button>` (Keys mode) / emphasized text; icon actions render aria-labels, actions column hidden when none, `show`/`disabled`/`loading` (disabled + pulse), keyboard focus; pagination slice + footer "1–N de N" + page-reset on `rows` change; `renderActions` escape hatch · Verify: `pnpm --filter @vitalock/ui test` fails · ~260
- [ ] T-05 GREEN: implement `packages/ui/src/components/patterns/DataTable.tsx` per design contract: wrapper `overflow-hidden rounded-[12px] border bg-card`; internal page/pageSize + reset effect on `[rows]`; `getPageSlice` + `PaginationFooter`; ghost `size="icon"` actions; `loading` → disabled + `animate-pulse`; `actionsHeaderLabel` default "Acciones" · Verify: ui suite passes · ~200
- [ ] T-06 Export `DataTable` + types from `packages/ui/src/index.ts` · Verify: `pnpm typecheck` · ~5

## W3 · OrderItemsTable migration (~230)

- [ ] T-07 RED: rewrite `OrderItemsTable.test.tsx` action queries → `getByRole('button', { name: /configurar/i })` etc. (17 tests; aria-label verb prefixes keep `/cancelar ítem/i`, `/registrar retiro/i` matching); gating maps 1:1 to predicates: Configurar = key + pending + confirmed/in_progress, Cancelar = pending (`disabled` while pending), Ver detalles = `produced_key_id`, Registrar retiro = `canRegisterPickup` · Verify: admin test fails on missing icons · ~120
- [ ] T-08 GREEN: migrate `OrderItemsTable.tsx` to DataTable: first cell Tipo text; actions Settings2/Eye/Ban/PackageCheck with Spanish labels; inline colSpan empty row → dashed box; skeleton + pagination added · Verify: `pnpm --filter @vitalock/admin test` (17 pass) · ~110

## W4 · Toggle tables (~210)

- [x] T-09 RED: update `BuildingStatusToggle.test.tsx` + `AdministrationStatusToggle.test.tsx`: trigger `size="icon"` Power, aria-label `Desactivar {nombre}`, null for inactive rows; confirm-button lookup stays unique · Verify: admin test fails · ~40
- [x] T-10 GREEN: migrate `BuildingsTable.tsx`: Link `/buildings/:id`; PencilLine + `renderActions` → BuildingStatusToggle; pagination added · Verify: `BuildingsTable.test.tsx` (4, link/empty/skeleton survive) · ~80
- [x] T-11 GREEN: update both toggles in `components/buildings/BuildingStatusToggle.tsx` + `components/administrations/AdministrationStatusToggle.tsx`; keep dialog + dependency-check logic intact · Verify: toggle suites pass · ~40
- [x] T-12 GREEN: migrate `AdministrationsTable.tsx`: Link `/administraciones/:id`; PencilLine + `renderActions` → AdministrationStatusToggle; pagination kept · Verify: admin test · ~50

## W5 · Simple list tables (~360)

- [x] T-13 Migrate `OrdenesTable.tsx` (Link `/ordenes/:id`, no actions) — `OrdenesTable.test.tsx` (8) + `OrdenesTablePagination.test.tsx` (4) must pass UNCHANGED (regression gate) · Verify: admin test · ~50
- [x] T-14 Migrate `ProductsTable.tsx`: first-cell `<Link>` `/stock/:id` replaces whole-row `role=button`; remove dead "Acciones" column; pagination kept · RED/audit: `routes/stock/__tests__/StockPage.test.tsx` (1) — switch row-click to first-column link if present · Verify: admin test · ~80
- [x] T-15 Migrate `StaffTable.tsx`: emphasized text first cell; PencilLine + Trash2 (keep existing aria-labels); `hasFilters`/`onEdit` stay; pagination added · New: `StaffTable.test.tsx` (rows, edit aria-label, deactivate flow, pagination) · ~80
- [x] T-16 Migrate `TareasTable.tsx`: Link `/tareas/:id`; PencilLine aria-label `Editar a {nombre}` FIXED (was missing); normalize Button import; `hasFilters`/`onEdit` stay; pagination added · New: `TareasTable.test.tsx` · ~80
- [x] T-17 Migrate `ParticularTable.tsx`: text first cell; PencilLine + Trash2; aria-label keeps `/editar/i` so 7 existing tests survive; pagination added; skeleton/empty strings verbatim · Verify: `ParticularTable.test.tsx` (7) · ~70

## W6 · Nested tables (~260)

- [x] T-18 Migrate `KeysTable.tsx`: first-cell `<button>` → KeyDetailDialog via `onFirstCellClick` (link-styled); Power `Activar`/`Dar de baja a` → KeyStatusChangeDialog; `isFetching` stays; pagination added · New: `KeysTable.test.tsx` (first cell opens dialog, Power label varies by state) · ~80
- [x] T-19 Migrate `UnitsTable.tsx`: text first cell; PencilLine (edit sheet) + Power `Desactivar`; skeleton + dashed empty ADDED (spec scenario); pagination added · New: `UnitsTable.test.tsx` · ~70
- [x] T-20 Migrate `EquipmentTable.tsx`: text first cell; PencilLine + RefreshCw `Reemplazar` (ReplaceEquipmentDialog); skeleton + empty ADDED; pagination added · New: `EquipmentTable.test.tsx` · ~60
- [x] T-21 Migrate `StockMovementsTable.tsx`: text (Fecha) first cell; no actions; pagination added · New: `StockMovementsTable.test.tsx` · ~50

## W7 · OrdenDetailPage extraction (~210)

- [x] T-22 RED: update `routes/ordenes/__tests__/OrdenDetailPage.test.tsx` for three-table composition · Verify: admin test fails · ~30
- [x] T-23 Create `components/ordenes/TechnicalItemsTable.tsx` (DataTable; Tipo/Descripción/Cantidad; text first cell; paginated; skeleton/empty) + test · ~70
- [x] T-24 Create `components/ordenes/OrderTareasTable.tsx` (DataTable; N.º/Categoría/Descripción/Estado; Link `/tareas/:id`; paginated) + test · ~70
- [x] T-25 Refactor `routes/ordenes/OrdenDetailPage.tsx` to compose OrderItemsTable + TechnicalItemsTable + OrderTareasTable; delete inline `Table` markup + orphaned `CATEGORY_LABELS`/`TareaStatusBadge` imports · ~40

## W8 · Pipeline gate + docs (~50)

- [x] T-26 Full gate: `pnpm typecheck && pnpm lint && pnpm --filter @vitalock/admin test && pnpm --filter @vitalock/ui test`; grep tables for text action buttons, `role=button` rows, inline `Table` markup → clean · ~40
- [x] T-27 Record archive-D3 ratification note for `react-router-dom` in `packages/ui` (design.md Open Questions / archive) · ~10

## Test Churn Notes

- **OrderItemsTable**: 17 tests (correction: not 19); name-based queries survive icon conversion via verb-prefix aria-labels; gating predicates 1:1.
- **StockPage.test.tsx** (1 test): ProductsTable row-click removal risk — audit and switch to first-column link.
- **Toggle triggers**: name becomes `Desactivar {nombre}`; confirm-button lookup stays unique.
- **Untouched suites** (regression gates): OrdenesTable (8), OrdenesTablePagination (4).
