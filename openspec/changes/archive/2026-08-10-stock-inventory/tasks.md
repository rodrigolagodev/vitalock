# Tasks: stock-inventory

**Change**: stock-inventory
**Date**: 2026-08-10
**Delivery**: single-pr (800-line budget, `size:exception` pre-authorized)
**Spec ref**: sdd/stock-inventory/spec (obs #84)
**Design ref**: sdd/stock-inventory/design (obs #83)

---

## Review Workload Forecast

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: n/a — single-pr is an architectural constraint, not a preference (splitting leaves DB in intermediate state where `products` exists but counter-maintenance trigger cannot route into it)
400-line budget risk: High
800-line budget risk: High

Estimated changed lines: 1 200–1 600 (11 migrations × ~40 avg + 12 TS/TSX files × ~60 avg + seed additions)
Delivery strategy: single-pr (cached from preflight) + `size:exception` if budget exceeded

---

## Group 1 — DB Migrations (sequential, each depends on prior)

> All files live in `supabase/migrations/`. Migrations `20260811000028`–`000031` are DONE (applied locally). NOTE: `particulares` change consumed `000032`–`000036`, so this series resumes at `20260811000037`.

- [x] T-01 · Migration: create `public.products` table — `supabase/migrations/20260811000028_create_products_table.sql` (DONE, applied)
- [x] T-02 · Migration: create `public.stock_movements` table — `supabase/migrations/20260811000029_create_stock_movements_table.sql` (DONE, applied)
- [x] T-03 · Migration: stock counters maintenance trigger — `supabase/migrations/20260811000030_stock_counters_maintenance.sql` (DONE, applied)
- [x] T-04 · Migration: `order_items.product_id` nullable FK — `supabase/migrations/20260811000031_order_items_add_product_id.sql` (DONE, applied)
- [x] T-05 · Migration: expand `support.tickets.category` CHECK — `supabase/migrations/20260811000037_expand_tickets_category.sql` (drop old CHECK, add key_configuration|key_installation|equipment_installation; existing rows pass)
- [x] T-06 · Migration: extend `order_items_create_tarea` trigger — `supabase/migrations/20260811000038_extend_order_items_create_tarea.sql` (key+product_id→key_configuration ticket+reserva; equipment+product_id→equipment_installation ticket+reserva; product_id NULL skips; partial UNIQUE reserva holds idempotency)
- [x] T-07 · Migration: ticket resolution chain + equipment stock side-effect — `supabase/migrations/20260811000039_ticket_chain_and_stock_resolution.sql` (AFTER UPDATE on tickets: resolved+key_configuration→key_installation; equipment_installation NOT chained by trigger; cancel does not chain)
- [x] T-08 · Migration: extend `configure_key_order_item` RPC — `supabase/migrations/20260811000040_extend_configure_key_order_item_rpc.sql` (signature unchanged; product_id IS NOT NULL→egreso_grabacion+liberacion_reserva+resolve key_configuration ticket; idempotent; also fixes pre-existing SQLSTATE 42703 on dropped `rfid_keys.key_type`)
- [x] T-09 · Migration: `resolve_equipment_installation` RPC (NEW) — `supabase/migrations/20260811000041_create_resolve_equipment_installation_rpc.sql` (SECURITY DEFINER; equipment row+egreso_instalacion+liberacion_reserva+resolve ticket; product_id NULL→no stock)
- [x] T-10 · Migration: stock admin RPCs — `supabase/migrations/20260811000042_stock_admin_rpcs.sql` (create_stock_movement manual types only; create_product_with_initial_stock atomically inserts product+compra; SECURITY DEFINER mirroring change_key_status)
- [x] T-11 · Migration: RLS policies for `products` and `stock_movements` — `supabase/migrations/20260811000043_stock_rls_policies.sql` (admin SELECT+INSERT+UPDATE via identity.is_admin(); installer/anon no access)
- [x] T-12 · Regenerate Supabase TypeScript types — `packages/supabase/src/database.types.ts` via `npm run gen:types` after local reset (products + stock_movements + new RPC signatures)
- [x] T-13 · Seed: sample products + initial compra movements — `supabase/seed.sql` (rfid_key product + equipment product; compra with unit_cost; stock_total non-zero; idempotent ON CONFLICT)
- [x] T-38 · Migration: cancel order releases pending reservations — `supabase/migrations/20260811000044_cancel_order_releases_reservations.sql` (AFTER UPDATE OF status on `orders`; on transition INTO `cancelled`, emit `liberacion_reserva` for every `reserva` movement with no paired definitive egreso — pending only; already-consumed reservations are NOT re-released; gates scenario in `specs/sales-orders/spec.md`) — DONE, applied, smoke-validated

## Group 2 — TS Type Coordination (parallel after T-12; must land same PR as T-05)

- [x] T-14 · Widen `TareaRow.category` union — `apps/admin/src/hooks/useTareas.ts` (add key_configuration|key_installation|equipment_installation)
- [x] T-15 · Widen `CreateTareaInput.category` — `apps/admin/src/hooks/useMutateTarea.ts`
- [x] T-16 · Widen `CATEGORY_LABELS` — `apps/admin/src/components/tareas/TareaFormSheet.tsx` (key_configuration: 'Configuración de llave', key_installation: 'Instalación de llave', equipment_installation: 'Instalación de equipo')
- [x] T-17 · Add domain types — `apps/admin/src/types/stock.ts` (NEW: ProductCategory, MovementType 9-union, ProductRow, StockMovementRow with staff_name/ticket_number)

## Group 3 — Query Key Hierarchy

- [x] T-18 · Extend `queryKeys.ts` — `apps/admin/src/lib/queryKeys.ts` (productsKey(category?, search?), productKey(id), stockMovementsKey(productId))

## Group 4 — Hooks

- [x] T-19 · `useProducts.ts` (NEW) — list + eq category + client search; uses productsKey
- [x] T-20 · `useProduct.ts` (NEW) — single by id; uses productKey(id)
- [x] T-21 · `useMutateProduct.ts` (NEW) — updateProduct; invalidate productKey+productsKey; toastMutationError
- [x] T-22 · `useStockMovements.ts` (NEW) — flat select + batch staff/ticket lookups per useTareas.ts:140-148 pattern; NEVER PostgREST cross-schema embed (PGRST200)
- [x] T-23 · `useMutateStockMovement.ts` (NEW) — createMovement (RPC) + createProductWithStock (RPC); actor_staff_id from useAuthContext; invalidate productsKey+stockMovementsKey

## Group 5 — Components

- [x] T-24 · `ProductFormFields.tsx` (NEW) — shared controlled name/category/cost_price inputs
- [x] T-25 · `ProductsTable.tsx` (NEW) — list table with disponible computed column + warning color when < 0
- [x] T-26 · `StockMovementsTable.tsx` (NEW) — signed qty display, ticket/order reference, created_by resolved name
- [x] T-27 · `CargarProductoSheet.tsx` (NEW) — discriminated-union Zod schema; existing/new mode toggle; 23505 surfaced inline

## Group 6 — Routes

- [x] T-28 · `routes/stock/StockPage.tsx` (NEW) — PageHeader "Stock", Cargar producto button, category pills, debounced search, ProductsTable, CargarProductoSheet
- [x] T-29 · `routes/stock/StockDetailPage.tsx` (NEW) — edit form pre-populated via useProduct; StockMovementsTable; type/date filters; back link

## Group 7 — Wiring

- [x] T-30 · Register routes in `main.tsx` — `<Route path="stock" ...>` + `<Route path="stock/:productId" ...>`
- [x] T-31 · Add Stock section to `Sidebar.tsx` — NavSection "Inventario" (Package icon) + NavItem "Stock" to="/stock" after Tareas

## Group 8 — Integration Verification (manual smoke tests)

- [x] T-32 · Smoke test: `key` order item with `product_id` → reserva movement + key_configuration ticket + stock_reservado increment — DONE via `/tmp/opencode/stock-flow-test.sql` (ORD-2026-000001: 2 reservas, 2 tickets, stock_reservado 1 each)
- [x] T-33 · Smoke test: resolve `key_configuration` via UI → egreso_grabacion + liberacion_reserva + rfid_keys row + key_installation ticket + stock_total decrement — DONE via `/tmp/opencode/stock-flow-test.sql` (RFID-FLOW-001 active, key_configuration resolved → key_installation open; equipment_installation resolved; egreso+liberacion per product)
- [x] T-34 · Smoke test: cancel order → liberacion_reserva emitted + stock_reservado restored — DONE via `/tmp/opencode/stock-cancel-test.sql` (Case A: pending reserva released, stock_reservado 1→0; Case B: consumed reserva NOT re-released)

## Group 9 — Unit Tests

- [x] T-35 · Unit tests: `useProducts` + `useProduct` — `apps/admin/src/hooks/__tests__/useProducts.test.ts` (mirror useAdministrations.test.ts)
- [x] T-36 · Unit tests: `useMutateStockMovement` — `apps/admin/src/hooks/__tests__/useMutateStockMovement.test.ts` (mockRpc pattern from useMutateOrderItem.test.ts)
- [x] T-37 · Unit tests: `useStockMovements` — `apps/admin/src/hooks/__tests__/useStockMovements.test.ts` (batch lookup merge; empty IDs → no batch call)

---

## Dependency Graph Summary

```
T-01 ──> T-02 ──> T-03 ──> T-06 ──> T-07 ──> T-08
     └──> T-04 ──> T-06         └──> T-09
     └──> T-11
T-02 ──> T-11
T-01..T-11 ──> T-12 ──> T-13
T-05 ──> T-06
T-03 ──> T-10

T-12 ──> T-14, T-15, T-16, T-17  (parallel)
T-18 is independent

T-17+T-18 ──> T-19, T-20, T-21 (parallel)
T-17+T-18+T-02 ──> T-22
T-17+T-18+T-10 ──> T-23

T-23+T-24+T-19 ──> T-27
T-19+T-25+T-27 ──> T-28
T-20+T-21+T-22+T-24+T-26 ──> T-29

T-28+T-29 ──> T-30 ──> T-31

T-32 ──> T-33, T-34  (manual, sequential)
T-35, T-36, T-37  (parallel, independent of manual tests)
T-38 ──> T-34  (cancel-release migration gates the cancel smoke test)
```

## Task Count Summary

| Group | Tasks | Parallelism |
|-------|-------|-------------|
| 1 — DB Migrations | T-01…T-11 (11) | Sequential (FK deps); T-01…T-04 done |
| 1 — Type regen + seed | T-12…T-13 (2) | T-12 unblocks T-13 |
| 2 — TS type coordination | T-14…T-17 (4) | All 4 parallel after T-12 |
| 3 — Query keys | T-18 (1) | Independent |
| 4 — Hooks | T-19…T-23 (5) | T-19/T-20/T-21 parallel; T-22/T-23 parallel |
| 5 — Components | T-24…T-27 (4) | T-24/T-25/T-26 parallel; T-27 waits |
| 6 — Routes | T-28…T-29 (2) | T-28 before T-29 |
| 7 — Wiring | T-30…T-31 (2) | T-30 before T-31 |
| 8 — Integration tests | T-32…T-34 (3) | T-32 first; T-33/T-34 parallel |
| 9 — Unit tests | T-35…T-37 (3) | All 3 parallel |
| 1 — DB Migrations (gate fix) | T-38 (1) | Required before T-34 |
| **Total** | **38 tasks** | All 38 complete; smoke-validated |

---

## Key Learnings

1. Migrations `20260811000028`–`000031` were created and applied in a prior session (T-01…T-04). The `particulares` change consumed `20260811000032`–`000036`, so the stock series resumes at `20260811000037`.
2. TypeScript type widening for `TareaRow.category` must land in the same PR as migration T-05 (`expand_tickets_category`); splitting would cause a type mismatch window in production.
3. Cross-schema batch lookups (`identity.staff`, `support.tickets`) follow the established `useTareas.ts:140-148` pattern — PostgREST `foreign_key(...)` embeds across schemas emit PGRST200 and must never be used here.
4. No SQL-layer test harness exists in the project (only Vitest + Supabase mock pattern); DB trigger/RPC correctness is validated via manual smoke tests T-32…T-34, not automated tests.
5. Single-PR delivery with `size:exception` is an architectural constraint, not a preference — intermediate DB states (products table without counter trigger) would make a stacked-PR approach unsafe.
6. T-08 doubles as the fix for pre-existing defect C1 (`configure_key_order_item` → SQLSTATE 42703 on dropped `rfid_keys.key_type`).
7. Gatekeeper found a plan hole: the `sales-orders` spec scenarios "Order cancellation releases pending reservations" and "Egreso-consumed reservations are NOT re-released on cancel" had no task. Added T-38 to close it — specs must always be traced to tasks before apply is considered complete.
