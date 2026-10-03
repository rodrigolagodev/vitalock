# Exploration: order-totals

Orders (key and technical) never show line subtotals or an order total. `unit_price` already includes IVA — no tax breakdown is shown. Total = `sum(quantity × unit_price)`.

## Current state

| Surface                      | File                                                                             | State                                                                                                                                                                                                                                                       |
| ---------------------------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Key order detail items       | `apps/admin/src/components/llaves/KeyOrderItemsTable.tsx:117-121`                | Shows unit price (`formatCurrencyARS`, `hideBelow: 'md'`); no subtotal, no footer                                                                                                                                                                           |
| Technical order detail items | `apps/admin/src/components/servicio-tecnico/TechnicalOrderItemsTable.tsx:64-135` | No price column at all; `unit_price` already selected (`useTechnicalOrder.ts:93`)                                                                                                                                                                           |
| `DataTable`                  | `packages/ui/src/components/patterns/DataTable.tsx`                              | No footer/summary slot; `paginated = true` by default, so a totals row inside `<TableBody>` would paginate                                                                                                                                                  |
| KeyOrderForm                 | `apps/admin/src/components/llaves/KeyOrderForm.tsx:195-200, 589-603`             | Already has a live total (`data-testid="lines-totals"`)                                                                                                                                                                                                     |
| TechnicalOrderForm           | `apps/admin/src/components/servicio-tecnico/TechnicalOrderForm.tsx:397, 431-435` | Per-item price in header (manual `toLocaleString`); no running total                                                                                                                                                                                        |
| Key / technical lists        | `LlavesTable.tsx:31-56`, `ServicioTecnicoTable.tsx:35-60`                        | `DataCardList`: N.º, Cliente, Ítems, Estado, Fecha. Fed by `createUseOrderList` (`packages/shared/src/hooks/createUseOrderList.ts:90-143`) over views `key_orders_summary` / `technical_orders_summary`, capped at 1000 rows; items embedded as `{id}` only |
| Historial (admin)            | `HistorialTable.tsx:55-91`, `useAllOrders.ts:57-62`                              | Reads `public.all_orders` (UNION ALL, `security_invoker=on`); no total                                                                                                                                                                                      |

Data model facts:

- Technical items are always quantity 1 (`technical_order_items_quantity_one`, migration 20260901160000); key items are exploded to quantity 1 on creation.
- `unit_price numeric(12,2) NOT NULL`; maintenance items may be 0 (20260910120000), install/replace > 0.
- Items become `cancelled` only via the whole-order cancel trigger (no per-item cancel path found).
- With the building filter, list queries use `items!inner(id,building_id)`, which scopes embedded items to one building.
- Latest migration: `20260915100000_scope_installer_key_authorization_updates.sql`. Latest pgTAP test: `test_139`.

## Approaches for the server-side list total

1. **Append `total_amount` to the three existing views** (`all_orders` both branches, `key_orders_summary`, `technical_orders_summary`) via `CREATE OR REPLACE VIEW`, using a correlated `coalesce(sum(quantity * unit_price), 0)::numeric(12,2)` subquery.
   - Pros: correct under cap, building filter, search and sort; no new objects; grants preserved; hooks just add a column.
   - Cons: column must be appended last; three views change (SCHEMA.md, generated types, view tests); per-row subquery (needs `order_id` index — verify).
2. **Separate `*_order_totals` view or RPC** — second query or unavailable embed; cannot sort/filter by total; more surface.
3. **PostgREST embedded aggregate / client-side sum** — breaks with `!inner` building filter, unavailable on `all_orders`, and client sums over capped lists are wrong. Rejected.

**Recommendation:** Approach 1.

## Recommended shape

- Migration `supabase/migrations/20260916100000_add_total_amount_to_order_views.sql` (timestamp after 20260915100000), keeping each view's `security_invoker` option.
- pgTAP `supabase/tests-sql/test_140_order_totals_views.sql`: multi-item sum, zero-item order → 0, zero-price maintenance item, `all_orders` per kind, invoker RLS.
- Regenerate `packages/supabase/src/database.types.ts`; update `supabase/SCHEMA.md`; `pnpm db:rehearse` before push.
- Shared: pure `lineSubtotal` / `orderTotal` helpers in `packages/shared` (sum in cents to avoid float drift); `createUseOrderList` select + `OrderListSummaryRawRow` + `mapRow` gain `total_amount` (coerce with `Number()`); `useAllOrders` likewise.
- UI: `footer` slot on `packages/ui` `DataTable` (outside paginated body); Subtotal column + total footer on both detail tables; Precio column on technical items; live total bar in TechnicalOrderForm mirroring KeyOrderForm; Total column on `LlavesTable`, `ServicioTecnicoTable`, `HistorialTable`.

## Estimate

~450–650 changed lines (migration ~60, pgTAP ~120, types/SCHEMA ~30, ui footer ~50, shared ~60, hooks ~30, detail tables ~120, form ~60, lists ~80). Fits single PR under the 800-line budget.

## Risks

- `CREATE OR REPLACE VIEW` requires identical existing column order with the new column last; DROP/recreate would lose grants (test_093, test_109, test_112 cover them).
- Invoker RLS: totals reflect what the caller can see on items; admin-only today.
- Existing select-shape tests (test_093, test_109, test_123, `useAllOrders.test.ts`, `useKeyOrders.test.ts`, `useTechnicalOrders.test.ts`, `createUseOrderList.test.ts`) need updates.
- Client-side detail/form sums vs server list total: share one cents-based helper.
- List invalidation after item mutations relies on the shared `queryKeyFn`.

## Open questions

1. Cancelled items: include in total (order's quoted value) or exclude? Excluding makes every cancelled order show 0 in Historial.
2. Zero-price maintenance items: show `$ 0,00` or a label like "Incluido"?
3. `unit_price` typed `number | null` client-side — treat null as 0.
4. Order total only in table footer, or also in the detail header?
5. Key list with building filter: show the whole order total (recommended).
6. Installer app: no totals (out of scope).
