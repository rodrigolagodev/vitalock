# Proposal: order-totals

## Why

- Key and technical orders never show line subtotals or an order total. Admins add them up by hand before invoicing.
- Technical order detail has no price column at all. `TechnicalOrderForm` has no running total, but `KeyOrderForm` does (`lines-totals`), so the two forms behave differently.
- Lists (`LlavesTable`, `ServicioTecnicoTable`, `HistorialTable`) cannot show a correct total on the client. They cap at 1000 rows, the building filter (`items!inner`) scopes the embedded items, and `all_orders` is a UNION view with no embed.

## What Changes

- **Business rule:** order total = `sum(quantity × unit_price)` over items whose `status <> 'cancelled'`. `unit_price` already includes IVA, so there is no tax breakdown. Zero-price maintenance items add 0 and display `$ 0,00`. A fully cancelled order totals `$ 0,00`.
- **DB:** one migration appends `total_amount numeric(12,2)` as the last column of `all_orders` (both branches), `key_orders_summary` and `technical_orders_summary`, via `CREATE OR REPLACE VIEW`, keeping `security_invoker`. Add the pgTAP test `test_140`, regenerate the types and update `SCHEMA.md`.
- **Shared:** cents-based `lineSubtotal` / `orderTotal` helpers in `packages/shared`. They exclude cancelled items and treat a null price as 0. `createUseOrderList` and `useAllOrders` select and map `total_amount`.
- **UI:** a `footer` slot on `packages/ui` `DataTable`, rendered outside the paginated body.
- **Detail tables:** key items gain a Subtotal column. Technical items gain Precio and Subtotal columns. Both show the order total in the table footer only, with no header StatCard. Cancelled rows still show their line subtotal but are left out of the footer total.
- **Form:** `TechnicalOrderForm` gets a live total that mirrors `KeyOrderForm`.
- **Lists:** a Total column on `LlavesTable`, `ServicioTecnicoTable` and `HistorialTable`, read from the server column. Under the building filter it shows the whole-order total.

## Capabilities

### New Capabilities

- `order-totals`: the total calculation rule, view columns, the detail footer, the form's live total and the list Total columns.

### Modified Capabilities

- `design-system`: the DataTable Pattern Component gains a non-paginated footer slot.

## Impact

- **`size:exception`** — actual diff is ~852 added lines (forecast 450–650), ~50 over the 800-line budget. Overage comes from the migration restating all view columns (86) and test_140 edge-case coverage (201). Accepted by the user on 2026-10-03; ships as one PR.
- 1 migration, which changes three views. No data is changed and no new tables are added.
- Affects admin users only. The installer app is untouched.

## Success Criteria

- Each view returns `total_amount` equal to the sum over non-cancelled items. It returns 0 for orders with no items, fully cancelled orders and zero-price-only orders (pgTAP).
- The detail footer, the form total and the list column agree for the same order, because they share one helper or the server value.
- The footer stays visible on every page of a paginated detail table.
- Existing grants, invoker RLS and the select-shape tests still pass after they are updated.

## Non-goals

- Tax/IVA breakdown, since prices already include IVA.
- Discounts, invoice number or invoice date. These are left for a later change.
- Totals in the installer app.
- Building-slice totals in lists.

## Risks

1. **View replacement:** the new column must be appended last. A DROP/recreate would lose the grants. Mitigation: use `CREATE OR REPLACE` only; test_093, test_109 and test_112 guard the grants.
2. **Per-row subquery cost:** mitigation is to confirm an `order_id` index on the item tables before writing the migration.
3. **Production rollout:** the migration reaches production only through `pnpm db:rehearse` followed by `supabase db push`. Never use MCP, the dashboard or psql.
4. **Cancelled orders show $0:** this is accepted by the product decision. Historial loses the quoted value of cancelled orders.
5. **Client/server drift:** mitigation is the single cents-based helper, which mirrors the SQL filter.

## Rollback Plan

- Revert the PR and push a migration that runs `CREATE OR REPLACE VIEW` without `total_amount`. This needs a DROP/recreate plus grant replay, because columns cannot be removed with replace. The UI changes are additive.

## Ready for Spec/Design

Ready. The user has already answered all the open exploration questions.
