```yaml
schema: gentle-ai.verify-result/v1
evidence_revision: sha256:09dda1fe6f31bd7112e683b509d3473b928cedf747a4b419eb8177511f07c206
verdict: pass_with_warnings
blockers: 0
critical_findings: 0
requirements: 6/6
scenarios: 25/25
test_command: pnpm exec turbo run test --force
test_exit_code: 0
test_output_hash: sha256:675fc9889cf787b18a6a8a3896659587f6cdbf4df510cb7a6eafe178b05d4f7c
build_command: pnpm typecheck --force
build_exit_code: 0
build_output_hash: sha256:f14780dc1ea0cd306122da990c7f5d0d43b3dfdd94bb28661ce2769e8aefe6a4
```

## Verification Report

**Change**: order-totals
**Version**: N/A
**Mode**: Strict TDD

### Completeness

| Metric           | Value                   |
| ---------------- | ----------------------- |
| Tasks total      | 33 (unique IDs 0.1-7.3) |
| Tasks complete   | 33                      |
| Tasks incomplete | 0                       |

### Build & Tests Execution

**Build (typecheck)**: Passed, 8/8 tasks (`pnpm typecheck --force`, exit 0)
**Lint**: Passed, 5/5 tasks (`pnpm lint --force`, exit 0)
**Tests**: 0 failed. supabase 80, shared 205, ui 208, installer 121, admin 828 passed (`pnpm exec turbo run test --force`, exit 0; plain `pnpm test` also exit 0, cached)
**SQL**: `pnpm --filter @vitalock/supabase test:sql` exit 0, "all SQL tests passed", includes test_140 (plan 20) and test_093/109/112/123/138/139
**Coverage**: admin 68.11% lines; no threshold configured (not available)

### Spec Compliance Matrix (by capability area; evidence = passing runtime tests)

| Requirement                           | Scenarios                                                      | Evidence                                                                                                                                                        | Result                    |
| ------------------------------------- | -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| Order Total Calculation Rule          | 6/6 (sum, cancelled, fully cancelled, zero-price, null, cents) | packages/shared/src/orders/orderTotals.test.ts (12 tests)                                                                                                       | COMPLIANT                 |
| Server-side total_amount              | 4/4                                                            | test_140 (mixed/no-items/all-cancelled/zero-price, all_orders both kinds, ordinal/numeric(12,2), reloptions, no INSERT grant, invoker RLS)                      | COMPLIANT                 |
| Detail Items Tables                   | 5/5                                                            | KeyOrderItemsTable.test, TechnicalOrderItemsTable.test (subtotal, footer, cancelled, fetching, footer on every page); no-StatCard verified by route inspection  | COMPLIANT                 |
| TechnicalOrderForm Live Total         | 2/2                                                            | TechnicalOrderForm.test live total; KeyOrderForm.test parity                                                                                                    | COMPLIANT                 |
| Order List Total Column               | 4/4                                                            | LlavesTable/ServicioTecnicoTable/HistorialTable tests; useKeyOrders/useTechnicalOrders/useAllOrders/createUseOrderList tests (select, coercion, building scope) | COMPLIANT (see WARNING-2) |
| design-system: Pagination footer slot | 4/4                                                            | DataTable.test (page 1/2, zero rows, omitted, coexists)                                                                                                         | COMPLIANT                 |

**Compliance summary**: 25/25 scenarios, 6/6 requirements.

### Correctness / invariants

| Check                                                                     | Status                                                                      |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Migration name/order                                                      | OK: 20261003120000 sorts after 20260915100000; test_140 next after test_139 |
| security_invoker preserved                                                | OK: restated (true/true/on), asserted in test_140                           |
| Column appended last, same order/types, CREATE OR REPLACE only            | OK                                                                          |
| Cancelled excluded in SQL (status <> 'cancelled') and client (orderTotal) | OK                                                                          |
| null to 0, cents arithmetic                                               | OK (SQL coalesce; helper Math.round cents, single /100)                     |
| database.types.ts                                                         | OK: only +3 generated lines (total_amount on 3 views)                       |
| No raw hex / arbitrary Tailwind in added non-test code                    | OK (scan clean)                                                             |
| No app-local duplicates of packages/ui                                    | OK: footer lives in packages/ui DataTable                                   |
| apps/installer untouched                                                  | OK                                                                          |
| No header StatCard for total                                              | OK                                                                          |
| Footer outside pagination, visible with zero rows                         | OK                                                                          |
| size:exception mirrored                                                   | OK in proposal.md Impact and tasks.md 7.3                                   |
| Strict TDD evidence                                                       | OK: apply-progress has RED/GREEN/triangulation table for every unit         |

### Coherence (Design)

All 8 decisions followed. Deviation: PricedLine fields optional (documented in apply-progress; harmless widening).

### Issues Found

**CRITICAL**: None

**WARNING**

- WARNING-1: apply-progress.md is stale. It says task 7.3 is unchecked and "no size:exception recorded", contradicting tasks.md (7.3 checked) and proposal.md (exception recorded). Update apply-progress before archive.
- WARNING-2: Building-filter and 1000-row-cap scenarios are proven only with a mocked Supabase client (select string includes total_amount, value passes through unchanged). No integration test exercises a real building-filtered query; correctness rests on the SQL subquery being independent of the embed. Acceptable, but not end-to-end.
- WARNING-3: test_140 invoker-RLS scenario asserts only "non-admin sees zero orders" because all order tables are admin-only; no partial-visibility case exists (documented in apply-progress).

**SUGGESTION**

- SUGGESTION-1: Run `pnpm db:rehearse` and EXPLAIN ANALYZE on all_orders before `supabase db push` (already listed as manual post-merge step).
- SUGGESTION-2: Footer in DataCardList (mobile cards) is intentionally not rendered; consider whether narrow viewports need a total elsewhere.

### Verdict

PASS WITH WARNINGS
All gates green, all 25 scenarios covered by passing tests, no invariant violations; only documentation staleness and mock-level coverage warnings.
