# Design: order-totals

## Technical Approach

The server computes list totals: a correlated subquery appended as the last column of the three order views. Detail tables and the form compute totals on the client with one cents-based helper in `@vitalock/shared`, which applies the same `status <> 'cancelled'` filter as the SQL. `DataTable` gains a `footer` slot that renders as `<tfoot>` outside the paginated slice. The installer app is untouched.

## Decision 1 — How do the views expose the total?

| Option                                                  | Tradeoff                                                                                                                               |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| A. `CREATE OR REPLACE VIEW` with a column appended last | Grants, comments and the `all_orders` REVOKE are kept. Every existing column must be restated in the same order and with the same type |
| B. DROP + CREATE                                        | Loses the grants (baseline `20260831000000_baseline.sql:8046-8048, 8088-8090, 8142-8144, 8348`)                                        |
| C. A separate totals view or RPC                        | Needs a second round trip and cannot be embedded in `all_orders`                                                                       |

**Chosen: A.** Verified current definitions. Only the baseline defines these views; no later migration touches them:

- `all_orders` (`baseline.sql:5074-5099`), `WITH (security_invoker='on')`: `id, order_number, order_kind ('key'::text / 'technical'::text), client_type, administration_id, particular_id, particular_full_name, status, notes, created_at, updated_at`, built as `ko UNION ALL tor`.
- `key_orders_summary` (`:5240-5257`), `WITH (security_invoker='true')`: `id, order_number, client_type, administration_id, particular_id, particular_full_name, particular_dni, particular_phone, particular_email, pickup_particular_id, status, notes, created_at, updated_at, a.company_name`, built as `ko LEFT JOIN administrations a`.
- `technical_orders_summary` (`:5443-5459`), `WITH (security_invoker='true')`: the same list without `pickup_particular_id`, with alias `t`.

**Why:** `CREATE OR REPLACE VIEW` resets reloptions to whatever the new statement declares, so the `WITH (security_invoker=...)` clause MUST be restated with its current value. The appended column is the following, with the alias `ko`, `tor` or `t` substituted per view and branch:

```sql
coalesce((select sum(i.quantity * i.unit_price)
            from public.key_order_items i          -- technical_order_items for tor/t
           where i.order_id = ko.id and i.status <> 'cancelled'), 0)::numeric(12,2) as total_amount
```

## Decision 2 — Index on `order_id`?

**Chosen: none needed.** `key_order_items_order_id_idx` (`baseline.sql:6233`) and `technical_order_items_order_id_idx` (`:6341`) already exist. Migration `20260910130000` adds only the pickup, produced-key and unit indexes.

## Decision 3 — Filenames

- Migration: `supabase/migrations/20261003120000_add_total_amount_to_order_views.sql`. It uses the wall-clock date, per the openspec-workflow naming rule, and sorts after the latest migration, `20260915100000`. Apply MUST re-check that it still sorts last.
- pgTAP: `supabase/tests-sql/test_140_order_totals_views.sql`. The latest existing test is `test_139`.
- `supabase/SCHEMA.md § Views` lists only view names (`SCHEMA.md:634-644`), so no edit is expected. The `db:rehearse` drift check confirms this.

## Decision 4 — DataTable footer API

| Option                                                                                                      | Tradeoff                                                                                                                 |
| ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| A. `footer?: ReactNode`, wrapped by DataTable in `TableFooter > TableRow > TableCell colSpan={columnCount}` | Consumers never need to know the column count. The total cannot align to a specific column                               |
| B. A per-column `footer` field                                                                              | Aligns to a column, but the footer disappears when that column has `hideBelow`. Does not match the spec's ReactNode slot |
| C. Consumer-supplied `<tr>`                                                                                 | Leaks table internals into consumers                                                                                     |

**Chosen: A.** It matches the delta spec (`specs/design-system/spec.md:9`). The existing `TableFooter` primitive (`packages/ui/src/components/table.tsx:39-52`) is rendered after `<TableBody>` and before `PaginationFooter` (`DataTable.tsx:245-247`). It uses a right-aligned cell with `tabular-nums` and the row gets `hover:bg-transparent`. It renders whenever `footer` is provided, including with zero rows. It is never affected by `getPageSlice`. `DataCardList` is unchanged: the detail tables use `DataTable`.

## Decision 5 — Shared helper

New module `packages/shared/src/orders/orderTotals.ts`, with `orders/index.ts` and a re-export from `src/index.ts`:

```ts
export interface PricedLine {
  quantity: number | string | null | undefined;
  unit_price: number | string | null | undefined;
  status?: string | null;
}
export function lineSubtotal(line: PricedLine): number; // pesos; ignores status
export function orderTotal(lines: readonly PricedLine[]): number; // pesos; skips status === 'cancelled'
```

Internally: `cents = Math.round((Number(unit_price) || 0) * 100)`, then `qty = Number(quantity) || 0`. Totals are summed as integer cents and divided by 100 once. Null or NaN becomes 0.

**KeyOrderForm switches to `orderTotal(items)`** (`KeyOrderForm.tsx:197-200`). Form items have no status, so nothing is excluded, and this removes float drift. Both forms then share one helper, as the spec requires.

## Decision 6 — List hooks

- `createUseOrderList.ts:112`: append `total_amount` before `${embed}`. Add `total_amount: number | string | null` to `OrderListSummaryRawRow`.
- `useKeyOrders.ts` and `useTechnicalOrders.ts`: add `total_amount: number` to the row types. `mapRow` sets `total_amount: Number(row.total_amount) || 0`.
- `useAllOrders.ts:60`: append `total_amount` to the select. Add `total_amount: number` to `AllOrderRow`. Map the rows from `fetchCappedList` with the same coercion. PostgREST returns numeric as JSON numbers; the coercion is defensive.

## Decision 7 — Per-item cancel

**Not implemented.** `ordenes-admin/spec.md:562` declares the requirement, but no RPC exists. The only paths to `cancelled` are the whole-order triggers (`baseline.sql:714, 773`). The design still handles cancelled rows generically: the row shows its subtotal and is excluded from the footer.

## Decision 8 — UI placement

- `KeyOrderItemsTable`: add a Subtotal column after Precio. It is right-aligned with no `hideBelow`. Footer: `Total: formatCurrencyARS(orderTotal(items))`, passed only when `!isFetching`.
- `TechnicalOrderItemsTable`: add Precio (`hideBelow: 'md'`) and Subtotal after Cant., plus the same footer.
- `TechnicalOrderForm`: add a `lines-totals` block after the ghost slot (`TechnicalOrderForm.tsx:611`) that mirrors `KeyOrderForm.tsx:590-603`.
- `LlavesTable`, `ServicioTecnicoTable`, `HistorialTable`: a Total column (`text-right tabular-nums`, card meta) placed before Estado.
- No header StatCard.

## Runtime Behavior

- With no building filter, the list query costs one indexed subquery per row. With a building filter, the `!inner` embed still scopes the rows, but `total_amount` is the whole-order total.
- On `all_orders` the subquery sits inside each UNION branch, so it may be evaluated for every row that passes the filters before `ORDER BY ... LIMIT 1000`. This is acceptable at current volumes; check it with `EXPLAIN ANALYZE` during rehearsal.
- Invoker RLS: the total covers only the items visible to the caller. Admins see all items.

## Testing Strategy (strict TDD)

| Layer      | Test                                                                                                                                                                                                                                                                                                                            |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SQL        | `test_140`: mixed active and cancelled sum, no items → 0, all cancelled → 0, zero-price technical maintenance item → 0, `all_orders` per kind, `total_amount` is the last `ordinal_position` and `numeric(12,2)` on all three views, reloptions still contain `security_invoker`, `authenticated` has no INSERT on `all_orders` |
| Regression | test_093, test_109, test_112, test_123 and test_138 are unchanged. None of them asserts full column lists                                                                                                                                                                                                                       |
| Unit       | `orderTotals.test.ts`: the spec scenarios, including 3 × 0.10 = 0.30, null price and string quantity                                                                                                                                                                                                                            |
| Hooks      | `createUseOrderList.test`, `useKeyOrders.test` and `useTechnicalOrders.test` gain assertions that the select contains `total_amount` and that it is coerced. The `useAllOrders.test` fixtures (`fakeAllOrders`) must add `total_amount` because the test uses `toEqual` (lines 142, 228)                                        |
| UI         | `DataTable.test`: footer on pages 1 and 2, with zero rows, and absent when omitted. Item tables: subtotal and footer, with a cancelled row excluded. Form total updates. List Total cells                                                                                                                                       |

## Threat Matrix

N/A: this change touches no routing, shell, subprocess, VCS/PR automation, executable-file classification or process integration.

## Rollback Plan

1. Revert the PR on the frontend. An unused `total_amount` column is harmless, so the database can keep it.
2. Only if the column itself must go: a new migration runs DROP and CREATE for each view without the column, then replays the grants and the `all_orders` REVOKE. It goes through `pnpm db:rehearse` and then `supabase db push`, never MCP, the dashboard or psql.

## Open Questions

- None blocking. Apply must confirm that the migration timestamp still sorts last at commit time.
