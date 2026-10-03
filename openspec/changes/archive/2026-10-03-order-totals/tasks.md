# Tasks: order-totals

## Review Workload Forecast

| Field                   | Value                                                                                                                                                                                                    |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Estimated changed lines | Forecast 450-650; actual ~852 added (migration ~120, test_140 ~150, shared helper + tests ~90, DataTable + tests ~50, hooks + tests ~60, detail tables + tests ~100, forms ~30, list tables + tests ~60) |
| 800-line budget risk    | High (actual over budget)                                                                                                                                                                                |
| Chained PRs recommended | No                                                                                                                                                                                                       |
| Suggested split         | None. Single PR; the work units below are commit-level seams inside it                                                                                                                                   |
| Delivery strategy       | single-pr                                                                                                                                                                                                |
| Chain strategy          | size-exception                                                                                                                                                                                           |

## Suggested Work Units

| Unit                     | Goal                                                                     | PR        | Focused check                                | Rollback                                     |
| ------------------------ | ------------------------------------------------------------------------ | --------- | -------------------------------------------- | -------------------------------------------- |
| U1 DB views              | `total_amount` last column on three views + test_140 + regenerated types | single PR | `pnpm --filter @vitalock/supabase test:sql`  | Revert the PR; the unused column is harmless |
| U2 Shared helper         | `lineSubtotal` / `orderTotal` cents-based                                | single PR | `pnpm --filter @vitalock/shared test`        | Revert commit                                |
| U3 DataTable footer      | `footer` slot outside the paginated body                                 | single PR | `pnpm --filter @vitalock/ui test`            | Revert commit                                |
| U4 Hooks                 | Select and map `total_amount` in list hooks                              | single PR | `pnpm --filter @vitalock/admin test` (hooks) | Revert commit                                |
| U5 Detail tables + forms | Subtotal/Precio columns, footer total, form live total                   | single PR | admin tests (tables, forms)                  | Revert commit                                |
| U6 List columns          | Total column in Llaves, ServicioTecnico, Historial                       | single PR | admin tests (lists)                          | Revert commit                                |

Dependencies: U1 task 1.7 (types) gates U4. U2 gates U5. U3 gates U5. U4 gates U6. U1, U2 and U3 are independent of each other and can run in parallel. U5 and U6 are independent of each other once their prerequisites are done.

## Phase 0 · Prerequisites

- [x] 0.1 Confirm the latest migration in `supabase/migrations/` is still `20260915100000` and that `20261003120000` sorts after it; rename if not (spec: Server-side total_amount on Order Views).
- [x] 0.2 Confirm `key_order_items_order_id_idx` and `technical_order_items_order_id_idx` exist (`supabase/migrations/20260831000000_baseline.sql`), so no new index is needed (design Decision 2).
- [x] 0.3 Confirm `supabase/tests-sql/test_139_*` is still the latest test so `test_140` is the next free number.

## Phase 1 · Database views (U1)

- [x] 1.1 RED: write `supabase/tests-sql/test_140_order_totals_views.sql` covering: mixed active + cancelled sum; order with no items totals 0; fully cancelled order totals 0; zero-price technical maintenance item totals 0; `all_orders` returns the right total per kind (key and technical); `total_amount` is the last `ordinal_position` and `numeric(12,2)` on `all_orders`, `key_orders_summary` and `technical_orders_summary`; `pg_class.reloptions` still contains `security_invoker` on all three; `authenticated` still has no INSERT on `all_orders`; invoker RLS: a caller without item visibility sees totals of visible items only. Run it and confirm it fails (spec: Server-side total_amount on Order Views).
- [x] 1.2 GREEN: create `supabase/migrations/20261003120000_add_total_amount_to_order_views.sql` that uses `CREATE OR REPLACE VIEW` for `key_orders_summary` (alias `ko`, `key_order_items`), `technical_orders_summary` (alias `t`, `technical_order_items`) and `all_orders` (both UNION branches, aliases `ko` and `tor`). Restate every existing column in the same order and with the same type, restate `WITH (security_invoker=...)` with the current values from the baseline, and append `coalesce((select sum(i.quantity * i.unit_price) ... where i.order_id = <alias>.id and i.status <> 'cancelled'), 0)::numeric(12,2) as total_amount` last (design Decision 1). Never DROP the views.
- [x] 1.3 Reset the local DB and run `test_140` until green.
- [x] 1.4 Run the existing guard tests (`test_093`, `test_109`, `test_112`, `test_123`, `test_138`) and confirm they still pass unchanged (grants and the `all_orders` REVOKE preserved).
- [x] 1.5 Run `pnpm --filter @vitalock/supabase test:sql` in full and confirm it is green.
- [x] 1.6 Check `supabase/SCHEMA.md § Views`; it lists names only, so edit it only if the drift check requires it.
- [x] 1.7 Regenerate types with `pnpm gen:types` (`packages/supabase/src/database.types.ts`); do not hand-edit. Confirm `total_amount` appears on the three views.

## Phase 2 · Shared helper (U2, parallel with Phases 1 and 3)

- [x] 2.1 RED: write `packages/shared/src/orders/orderTotals.test.ts` with these scenarios: sum over active items (1 x 100 + 2 x 50.50 = 201); cancelled item excluded from `orderTotal`; fully cancelled order = 0; zero-price item = 0; empty list = 0; null/undefined price = 0 in both `lineSubtotal` and `orderTotal`; string quantity and price coerced; 3 x 0.10 = exactly 0.30; `lineSubtotal` ignores status (cancelled row still returns its subtotal). Confirm it fails (spec: Order Total Calculation Rule).
- [x] 2.2 GREEN: implement `packages/shared/src/orders/orderTotals.ts` (`PricedLine`, `lineSubtotal`, `orderTotal`) with integer-cents arithmetic and a single division by 100 (design Decision 5). Add `packages/shared/src/orders/index.ts` and re-export from `packages/shared/src/index.ts`.
- [x] 2.3 Run `pnpm --filter @vitalock/shared test` and `pnpm --filter @vitalock/shared typecheck`.

## Phase 3 · DataTable footer slot (U3, parallel with Phases 1 and 2)

- [x] 3.1 RED: extend `packages/ui/src/components/DataTable.test.tsx` with: footer renders on page 1 and page 2 of a 25-row table; the "start-end de total" count excludes the footer; footer renders with zero rows; no footer region when `footer` is omitted; the footer coexists with the pagination footer. Confirm it fails (spec: design-system, Pagination on Every Table).
- [x] 3.2 GREEN: add `footer?: ReactNode` to `DataTable` in `packages/ui/src/components/DataTable.tsx`. Render it after `<TableBody>` and before `PaginationFooter` as `TableFooter > TableRow (hover:bg-transparent) > TableCell colSpan={columnCount}` (right-aligned, `tabular-nums`). Do not pass it through `getPageSlice`. Leave `DataCardList` unchanged (design Decision 4).
- [x] 3.3 Run `pnpm --filter @vitalock/ui test` and `pnpm --filter @vitalock/ui typecheck`.

## Phase 4 · List hooks (U4, needs 1.7)

- [x] 4.1 RED: update `createUseOrderList.test`, `useKeyOrders.test` and `useTechnicalOrders.test` to assert the select string contains `total_amount` and that `mapRow` coerces it to a number (string `"300.00"` to 300, null to 0). Update the `fakeAllOrders` fixtures in `useAllOrders.test` to include `total_amount` (the tests use `toEqual`) and add a coercion assertion. Confirm failures (spec: Order List Total Column).
- [x] 4.2 GREEN: in `createUseOrderList.ts` append `total_amount` to the select before `${embed}` and add `total_amount: number | string | null` to `OrderListSummaryRawRow` (design Decision 6).
- [x] 4.3 GREEN: in `useKeyOrders.ts` and `useTechnicalOrders.ts` add `total_amount: number` to the row types and set `total_amount: Number(row.total_amount) || 0` in `mapRow`.
- [x] 4.4 GREEN: in `useAllOrders.ts` append `total_amount` to the select, add `total_amount: number` to `AllOrderRow`, and map rows from `fetchCappedList` with the same coercion.
- [x] 4.5 Run the admin hook tests and `pnpm --filter @vitalock/admin typecheck`.

## Phase 5 · Detail tables and forms (U5, needs Phases 2 and 3)

- [x] 5.1 RED: add `KeyOrderItemsTable` tests: each row shows its Subtotal; footer shows `Total: $ 300,00` for two items (100 + 200); a cancelled row shows its own subtotal ($ 40,00) but the footer excludes it; footer is absent while `isFetching`; no header StatCard for the total (spec: Detail Items Tables Show Subtotal and Footer Total).
- [x] 5.2 GREEN: in `KeyOrderItemsTable` add a right-aligned Subtotal column after Precio (no `hideBelow`) using `lineSubtotal` and `formatCurrencyARS`, and pass `footer` with `Total: formatCurrencyARS(orderTotal(items))` only when `!isFetching` (design Decision 8).
- [x] 5.3 RED: add `TechnicalOrderItemsTable` tests: Precio ($ 80,00) and Subtotal ($ 80,00) columns, footer $ 80,00; zero-price maintenance item shows `$ 0,00`; cancelled row shown but excluded from the footer; footer visible on every page of a paginated table.
- [x] 5.4 GREEN: in `TechnicalOrderItemsTable` add Precio (`hideBelow: 'md'`) and Subtotal after Cant., plus the same footer.
- [x] 5.5 RED: add a `TechnicalOrderForm` test that the live total shows $ 80,00 with one item and $ 100,00 after adding a $ 20,00 item, and that missing prices count as 0. Add a `KeyOrderForm` test asserting the same value and format for an equivalent item set (spec: TechnicalOrderForm Live Total).
- [x] 5.6 GREEN: in `TechnicalOrderForm.tsx` add a `lines-totals` block after the ghost slot (about line 611) that mirrors `KeyOrderForm.tsx:590-603` and uses `orderTotal`.
- [x] 5.7 GREEN: in `KeyOrderForm.tsx` (about lines 197-200) replace the local float sum with `orderTotal(items)` so both forms share one helper.
- [x] 5.8 Verify no order detail page renders a header StatCard for the order total (grep the key and technical detail routes; remove none, add none).
- [x] 5.9 Run the admin tests for the tables and forms.

## Phase 6 · List Total columns (U6, needs Phase 4)

- [x] 6.1 RED: add tests for `LlavesTable`, `ServicioTecnicoTable` and `HistorialTable`: a row with `total_amount` 300 shows $ 300,00; a cancelled order row with `total_amount` 0 shows $ 0,00; the card meta shows the total. Add a hook-level test that the building-filtered list still returns the server `total_amount` unchanged (it is not recomputed from embedded items) (spec: Order List Total Column).
- [x] 6.2 GREEN: add a Total column to `LlavesTable`, `ServicioTecnicoTable` and `HistorialTable`, placed before Estado, `text-right tabular-nums`, rendering `formatCurrencyARS(row.total_amount)` and included in the card meta (design Decision 8). Do not compute totals from embedded items.
- [x] 6.3 Confirm `apps/installer` is untouched (no totals shown).
- [x] 6.4 Run the admin tests for the list tables.

## Phase 7 · Verify

- [x] 7.1 Run `pnpm install --frozen-lockfile`.
- [x] 7.2 Run `pnpm lint && pnpm typecheck && pnpm test && pnpm --filter @vitalock/supabase test:sql` (needs local Supabase up) and confirm everything is green.
- [x] 7.3 Confirm the diff size against the 800-line budget — ~852 added lines; `size:exception` accepted by the user (2026-10-03) and recorded in proposal.md § Impact.

## Manual post-merge steps (not apply tasks)

Performed by the user after the PR merges. They are not part of `sdd-apply`.

- Run `pnpm db:rehearse` against production data and check `EXPLAIN ANALYZE` on `all_orders` (design Runtime Behavior).
- Then run `supabase db push`. Never use MCP `apply_migration`, the dashboard or `psql`.

## Follow-ups (out of scope)

- The pre-existing `ITEM_TYPE_LABELS` bug is not addressed here; track it as a separate change.
- Per-item cancel RPC (design Decision 7), tax breakdown, discounts, invoice fields, and building-slice totals remain deferred.
