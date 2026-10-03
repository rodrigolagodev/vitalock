# Apply Progress: order-totals

Mode: Strict TDD. Branch `feat/order-totals`. Nothing committed.

## Status per phase

| Phase                   | Status | Notes                                                                                                                                                                             |
| ----------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0 Prerequisites         | Done   | Latest migration was `20260915100000`; `20261003120000` sorts after it. Both order_id indexes exist. test_139 was latest, so test_140 is free.                                    |
| 1 DB views              | Done   | Migration applied locally with `supabase migration up --local` (no push). Types regenerated with `pnpm gen:types` (local; +3 lines). SCHEMA.md unchanged (lists view names only). |
| 2 Shared helper         | Done   | `lineSubtotal` / `orderTotal`, integer cents. `PricedLine` fields are optional so react-hook-form item types (optional `unit_price`) are accepted.                                |
| 3 DataTable footer      | Done   | `footer?: ReactNode` in `TableFooter > TableRow > TableCell colSpan`, outside pagination.                                                                                         |
| 4 Hooks                 | Done   | select + mapRow coercion in createUseOrderList, useKeyOrders, useTechnicalOrders, useAllOrders.                                                                                   |
| 5 Detail tables + forms | Done   | Subtotal/Precio columns, footer total (hidden while fetching), TechnicalOrderForm live total, KeyOrderForm uses `orderTotal`. No header StatCard exists on either detail route.   |
| 6 List columns          | Done   | Total column before Estado in LlavesTable, ServicioTecnicoTable, HistorialTable. apps/installer untouched.                                                                        |
| 7 Verify                | Done   | Diff is ~852 added lines, over the 800 budget; `size:exception` accepted by the user (2026-10-03), 7.3 checked.                                                                   |

## TDD Cycle Evidence

| Task    | Test file                                                                              | Layer     | Safety net   | RED                                                                                                                    | GREEN     | Triangulate                           | Refactor                             |
| ------- | -------------------------------------------------------------------------------------- | --------- | ------------ | ---------------------------------------------------------------------------------------------------------------------- | --------- | ------------------------------------- | ------------------------------------ |
| 1.1-1.3 | supabase/tests-sql/test_140_order_totals_views.sql                                     | pgTAP     | N/A (new)    | psql: `column "total_amount" does not exist`                                                                           | 20/20 ok  | 3 key + 2 tech + 3 all_orders cases   | None needed                          |
| 2.1-2.3 | packages/shared/src/orders/orderTotals.test.ts                                         | Unit      | N/A (new)    | Failed (module missing)                                                                                                | 12/12     | 12 cases                              | Extracted `toCents`/`lineCents`      |
| 3.1-3.2 | packages/ui/.../**tests**/DataTable.test.tsx                                           | Component | 19/19        | 4 failed                                                                                                               | 24/24     | page 1/2, zero rows, omitted, coexist | None needed                          |
| 4.1-4.4 | createUseOrderList.test, useKeyOrders.test, useTechnicalOrders.test, useAllOrders.test | Hook      | 21/21, 58/58 | 2 + 7 failed                                                                                                           | all green | string, null, building-scoped         | None needed                          |
| 5.1-5.4 | KeyOrderItemsTable.test, TechnicalOrderItemsTable.test                                 | Component | 28/28        | 7 failed                                                                                                               | 32/32     | cancelled, null, fetching, pagination | None needed                          |
| 5.5-5.7 | TechnicalOrderForm.test, KeyOrderForm.test                                             | Component | 31/31        | Technical live-total failed; key parity test passed from the start (parity regression guard, behavior already existed) | 32/32     | add item + reprice                    | Replaced local float sum with helper |
| 6.1-6.2 | LlavesTable/ServicioTecnicoTable/HistorialTable tests                                  | Component | 20/20        | 6 failed                                                                                                               | 26/26     | 300 and 0                             | None needed                          |

## Work Unit Evidence

| Unit | Focused command and result                                                                               | Runtime harness                                                       | Rollback boundary                        |
| ---- | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | ---------------------------------------- |
| U1   | `pnpm --filter @vitalock/supabase test:sql` -> all SQL tests passed (incl. test_093/109/112/123/138/140) | Local Supabase, migration applied via `supabase migration up --local` | migration + test_140 + database.types.ts |
| U2   | `vitest run src/orders` -> 12 passed                                                                     | N/A (pure function)                                                   | packages/shared/src/orders, index.ts     |
| U3   | `pnpm --filter @vitalock/ui test` -> 208 passed                                                          | N/A (component)                                                       | DataTable.tsx + test                     |
| U4   | admin hooks 304 passed; shared 205 passed                                                                | N/A (mocked supabase)                                                 | 4 hook files + tests                     |
| U5   | admin components 329 passed                                                                              | N/A                                                                   | tables + forms                           |
| U6   | included above                                                                                           | N/A                                                                   | 3 list tables                            |

## Final gate

- `pnpm lint`: 5/5 tasks successful, no warnings.
- `pnpm typecheck`: 8/8 tasks successful.
- `pnpm test`: supabase 80, shared 205, ui 208, installer 121, admin 828 passed; 0 failed.
- `pnpm --filter @vitalock/supabase test:sql`: all SQL tests passed.

## Deviations / notes

- `PricedLine.quantity` and `unit_price` are optional (design had them required-but-nullable) so form item types type-check.
- Invoker-RLS test: all four order tables are admin-only, so a non-admin sees zero orders through the views; that is what test_140 asserts (no partial-visibility scenario exists in this schema).
- List cards: the Total column uses `text-right tabular-nums` per design.
- Pre-existing `ITEM_TYPE_LABELS` bug untouched.
- Size: ~447 insertions tracked + ~405 untracked lines (migration 86, test_140 201, helper+test 118) = ~850 added lines, over the 800 budget; `size:exception` accepted by the user on 2026-10-03 and recorded in proposal.md § Impact.
