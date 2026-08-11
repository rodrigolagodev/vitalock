# Proposal: Stock / Inventory Domain

## Intent

Vitalock manages a physical warehouse of RFID keys and access-control equipment, but the platform has no system-of-record for what is on hand or what leaves the warehouse. Consumption is invisible until a key or piece of equipment fails to materialize for an installation. The admin cannot answer "how many keys of brand X do we have?" or "what left the warehouse this week?" without a manual count. This change introduces a first-class inventory domain so every unit ingress, reservation, and egress is captured as an auditable movement and reconciled against derived per-product counters.

## Scope

### In Scope
- New `public.products` catalog (inventory master) with `stock_total` and `stock_reservado` derived counters.
- New `public.stock_movements` append-only ledger (source of truth) with typed movement categories.
- Nullable FK `order_items.product_id -> public.products(id)` to link sales lines to inventory SKUs.
- Extension of `support.tickets.category` vocabulary with `key_configuration`, `key_installation`, `equipment_installation`.
- Trigger updates so key/equipment order items emit the correct initial ticket and a `reserva` movement.
- Ticket-resolution trigger that chains `key_configuration -> key_installation` and emits definitive egresos.
- Extension of `configure_key_order_item` RPC to atomically decrement stock for keys.
- New `/stock` admin route: product list (filters + search) and product detail (movement history + "Cargar producto" sidesheet with existing/new modes).
- Sidebar entry and route registration under `Inventario`.
- Seed data for a sample rfid_key product and a sample equipment product.

### Out of Scope
- Minimum stock thresholds and low-stock alerts (deferred; future refinement once real consumption data exists).
- Supplier / purchase-order management (out of Vitalock's product scope today).
- Multiple warehouse locations (single implicit location for now).
- Reporting/analytics dashboards, delivery notes, and lot/expiration tracking (not required by current workflow).

## Capabilities

### New Capabilities
- `stock-inventory`: product catalog, stock movement ledger, reservation lifecycle, and admin inventory UI.

### Modified Capabilities
- `support-tickets`: category vocabulary expanded with three new values and a resolution-chain side effect.
- `sales-orders`: `order_items` gains a nullable `product_id` FK and reservation semantics on insert.
- `key-configuration`: `configure_key_order_item` RPC additionally decrements stock atomically with key minting.

## Approach

Two new tables in `public` schema: `products` (catalog + derived counters) and `stock_movements` (append-only, signed quantities, typed). Counters on `products` are maintained by trigger on `stock_movements` inserts, so the ledger stays authoritative.

Order-item -> stock linkage uses a nullable `product_id` FK on `order_items` (decision A, already accepted): explicit, DB-enforced, and permits multiple SKUs per category without convention overhead. Legacy rows and non-stock line types (`maintenance`, `installation`) remain NULL.

Reservation model B: an `order_items` insert of a stock-consuming line (`key` or `equipment`) fires the existing tarea trigger, which additionally writes a `reserva` movement. On ticket resolution a second trigger converts the reservation into a definitive egreso (`egreso_grabacion` for keys, `egreso_instalacion` for equipment) and chains `key_configuration -> key_installation`. Order cancellation writes a `liberacion_reserva`.

Two-locus decrement: for keys, the decrement lives inside the existing `configure_key_order_item` RPC (atomic with `rfid_keys` minting); for equipment, the ticket-resolution trigger owns it (no equivalent RPC exists). Idempotency of reservation is enforced by a partial UNIQUE index on `stock_movements(order_item_id, type) WHERE type = 'reserva'`.

Admin UI mirrors the existing Tareas pattern (`PageHeader` + filters + table + right sidesheet), reuses Radix `Sheet` + `zodResolver`, and adds two hooks per resource following the flat-query + batch-lookup convention used by `useTareas`.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `supabase/migrations/` (new: ~6-7 files) | New | `public.products`, `public.stock_movements`, RLS policies, seed, ALTER `support.tickets` CHECK, ALTER `order_items` add `product_id`, ticket-resolution chain trigger, stock RPC helpers |
| `supabase/migrations/20260810000023_order_items.sql` | Modified | Extend `configure_key_order_item` RPC to atomically decrement stock and write `egreso_grabacion` |
| `supabase/migrations/20260810000027_*` (tarea trigger) | Modified | Emit `key_configuration` / `equipment_installation` tickets for `key` / `equipment` items; also write initial `reserva`; must fire for `particular` orders too |
| `supabase/seed.sql` | Modified | Seed one rfid_key product and one equipment product with initial `compra` movements |
| `apps/admin/src/main.tsx` | Modified | Register `/stock` and `/stock/:productId` routes |
| `apps/admin/src/components/layout/Sidebar.tsx` | Modified | Add `Inventario > Stock` NavSection |
| `apps/admin/src/hooks/useTareas.ts`, `useMutateTarea.ts` | Modified | Expand `TareaRow.category` union and `CreateTareaInput.category` |
| `apps/admin/src/components/tareas/TareaFormSheet.tsx` | Modified | Expand `CATEGORY_LABELS` for the three new values |
| `apps/admin/src/lib/queryKeys.ts` | Modified | Add `productsKey`, `stockMovementsKey` |
| `apps/admin/src/routes/stock/` | New | `StockPage.tsx`, `StockDetailPage.tsx` |
| `apps/admin/src/hooks/` | New | `useProducts.ts`, `useProduct.ts`, `useMutateProduct.ts`, `useStockMovements.ts`, `useMutateStockMovement.ts` |
| `apps/admin/src/components/stock/` | New | `ProductsTable.tsx`, `CargarProductoSheet.tsx`, `StockMovementsTable.tsx`, `ProductDetailForm.tsx` |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| `sales.products` vs `public.products` naming collision creates developer confusion | High | Always qualify with schema in code, docs, and comments; add explicit table comments noting the distinction (`sales.products` = billing catalog, `public.products` = inventory master) |
| `particular` orders (no `administration_id`) must still reserve stock; current tarea trigger short-circuits on non-admin orders | High | Trigger rewrite must gate reservation on `item_type IN ('key','equipment')` only, independent of client type; add regression test with a particular-client order |
| `TareaRow.category` type union expansion must land coordinated across `useTareas.ts`, `useMutateTarea.ts`, `TareaFormSheet.tsx` before triggers begin producing the new categories | Med | Land TypeScript union widening in the same migration batch as the tickets category CHECK ALTER; verify admin still compiles before applying DB changes |
| 800-line single-PR review budget likely exceeded (~6-7 migrations + full new admin view + hooks + 2 modified triggers) | High | Flag `size:exception` at `sdd-tasks` forecast, OR revisit delivery strategy to chained PRs (PR1: DB migrations, PR2: admin list + hooks, PR3: detail + sidesheet, PR4: task chain trigger integration) |

## Rollback Plan

Rollback is straightforward because inventory is additive and the linkage FK is nullable:
1. Revert the migration adding `order_items.product_id` (or leave the column; NULL is safe).
2. Drop `public.stock_movements` and `public.products` (order matters: movements first).
3. Restore the previous `support.tickets` category CHECK (no rows will hold the new values yet if rollback is prompt).
4. Restore the pre-change `configure_key_order_item` and `order_items_create_tarea` triggers from the prior migration.
5. Remove the `/stock` route, sidebar entry, and stock hooks/components from the admin bundle.

If rolled back after production use, preserve `stock_movements` as an audit archive before dropping. No customer-visible surface is affected.

## Dependencies

- Existing `support.tickets` immutable-category state machine (must remain intact after CHECK expansion).
- Existing `configure_key_order_item` RPC signature (UI callers must not need changes).
- `identity.is_admin()` / `identity.is_installer()` helpers for RLS parity with existing tables.
- Radix `Sheet`, `react-hook-form` + `zod`, and TanStack Query already used across admin.

## Success Criteria

- [ ] `products.stock_total` and `products.stock_reservado` reconcile at all times with the signed sum of `stock_movements` (DB invariant, verified by test).
- [ ] No `order_item` of type `key` or `equipment` is inserted without producing a `reserva` movement (including `particular` orders).
- [ ] Resolving a `key_configuration` ticket atomically: (a) mints an `rfid_keys` row, (b) decrements stock via `egreso_grabacion`, (c) inserts a `key_installation` ticket.
- [ ] Cancelling an order with reserved items produces `liberacion_reserva` movements restoring `stock_reservado`.
- [ ] `ConfigureKeyItemSheet` continues to work unchanged from the UI's perspective — the RPC gains stock semantics but its call signature and observable behavior at the UI boundary are preserved.
- [ ] Partial UNIQUE index prevents double `reserva` per `order_item`.
- [ ] `/stock` route ships with list, filters, detail, and "Cargar producto" sidesheet (existing + new product modes).
