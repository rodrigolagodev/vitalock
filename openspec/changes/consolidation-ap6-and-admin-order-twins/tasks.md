---
strict_tdd: true
runner: vitest
---

# Tasks: consolidation-ap6-and-admin-order-twins

## Guard lines

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: Medium

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~320 LOC total |
| 400-line budget risk | Medium (each slice is well under 200 LOC; combined approaches budget) |
| Chained PRs recommended | Yes |
| Suggested split | PR A (Slice A) → PR B (Slice B), any order |
| Delivery strategy | auto-chain |
| Chain strategy | stacked-to-main |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: Medium

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| Slice A | AP-6: view + typegen + hook rewrite | PR A → main | `pnpm --filter @vitalock/admin test -- useTechnicalOrderTickets` + `supabase test db` | `supabase test db` for pgTAP | `git revert <commit>` + apply rollback SQL |
| Slice B | Factory + admin twin rewrites | PR B → main | `pnpm --filter @vitalock/shared test` + `pnpm --filter @vitalock/admin test -- useKeyOrders useTechnicalOrders` | N/A — TS-only, no migration | Delete factory file; restore both hook copies |

---

## Slice A — `support.technical_order_tickets` view + hook rewrite

> Migration + typegen + hook rewrite + pgTAP. Satisfies REQ-DB-TECHNICAL-ORDER-TICKETS-VIEW-1, REQ-DB-TECHNICAL-ORDER-TICKETS-RLS-1, REQ-CLIENT-TECHNICAL-ORDER-TICKETS-1.

- [x] A.1 **Preflight — hook**: Read `apps/admin/src/hooks/useTechnicalOrderTickets.ts`; confirm the two-step sequential pattern (`from('technical_order_items')` then `from('tickets').in(...)`); document the nine columns the hook currently SELECTs from `support.tickets`.
  - Acceptance: two-step pattern confirmed; column list matches REQ-DB-TECHNICAL-ORDER-TICKETS-VIEW-1 req 5.

- [x] A.2 **Preflight — pattern reference**: Read `supabase/migrations/20260830000110_installer_tickets_with_context.sql`; confirm `SECURITY INVOKER` syntax and `GRANT SELECT ... TO authenticated` idiom used by the sibling view.
  - Acceptance: syntax and GRANT pattern documented for Slice A migration authoring.

- [x] A.3 **Write vitest RED tests**: Create (or rewrite) `apps/admin/src/hooks/__tests__/useTechnicalOrderTickets.test.ts` with three cases: (1) valid `orderId` → exactly one mocked call to `.schema('support').from('technical_order_tickets').eq('technical_order_id', orderId)` returning N rows; (2) `undefined` orderId → no query issued, hook idle; (3) Supabase error → hook throws. Write tests before hook rewrite — must be RED.
  - Acceptance: RED confirmed (tests fail against the current two-step hook).

- [x] A.4 **Write pgTAP test file**: Create `supabase/tests-sql/test_126_technical_order_tickets_view.sql` with four scenarios: (1) admin sees exactly the linked tickets for a seeded order (fail-loud, non-empty assertion per Risk 1); (2) non-existent order_id returns empty set; (3) orphan ticket (NULL `technical_order_item_id`) appears with `technical_order_id = NULL`; (4) cross-order isolation: `.eq('technical_order_id', order1)` returns only order1 tickets.
  - Acceptance: covers REQ-DB-TECHNICAL-ORDER-TICKETS-VIEW-1.1–1.3 and REQ-DB-TECHNICAL-ORDER-TICKETS-RLS-1.1–1.2.

- [x] A.5 **Write forward migration**: Create `supabase/migrations/20260830000111_technical_order_tickets_view.sql` with `CREATE OR REPLACE VIEW support.technical_order_tickets WITH (security_invoker = true) AS SELECT t.id, t.ticket_number, t.category, t.status, t.description, t.technical_order_item_id, t.assigned_to_staff_id, t.created_at, t.resolved_at, toi.order_id AS technical_order_id FROM support.tickets t LEFT JOIN public.technical_order_items toi ON toi.id = t.technical_order_item_id;` plus `GRANT SELECT ON support.technical_order_tickets TO authenticated;`.
  - Acceptance: `supabase db reset` applies cleanly; view is queryable via PostgREST at `supabase.schema('support').from('technical_order_tickets')`.

- [x] A.6 **Write rollback SQL**: Create `supabase/rollbacks/20260830000111_technical_order_tickets_view_rollback.sql` containing `DROP VIEW IF EXISTS support.technical_order_tickets;` (mirroring the migration filename, not auto-applied by `supabase db push`).
  - Acceptance: rollback script runs without error; view is absent after execution.

- [x] A.7 **Regenerate types**: Run `bash scripts/gen-types.sh`; verify `Database['support']['Views']['technical_order_tickets']` is present in `packages/supabase/src/database.types.ts` with the ten projected columns.
  - Acceptance: REQ-DB-TECHNICAL-ORDER-TICKETS-VIEW-1 req 7 satisfied; `pnpm --filter @vitalock/supabase tsc --noEmit` passes.

- [x] A.8 **Rewrite hook GREEN**: Rewrite `apps/admin/src/hooks/useTechnicalOrderTickets.ts` to the single-query pattern: `.schema('support').from('technical_order_tickets').select('id, ticket_number, category, status, description, technical_order_item_id, assigned_to_staff_id, created_at, resolved_at').eq('technical_order_id', orderId).order('created_at', { ascending: true })`; remove the two-step pattern entirely; preserve `enabled: Boolean(orderId)` guard.
  - Acceptance: three vitest cases from A.3 now GREEN; `TechnicalOrderDetailPage.tsx` requires no changes.

- [x] A.9 **Run pgTAP**: `supabase test db`; all four scenarios in `technical_order_tickets.sql` pass.
  - Acceptance: 4/4 PASS; no silent empty-set on admin query (Risk 1 guard).

- [x] A.10 **Verification**: `pnpm --filter @vitalock/admin test -- useTechnicalOrderTickets` GREEN; `pnpm typecheck`; `pnpm build`.
  - Acceptance: all pass; no regressions in unrelated tests.

- [x] A.11 **Delivery**: Atomic commit in this exact file order: (1) migration, (2) rollback, (3) `database.types.ts`, (4) `useTechnicalOrderTickets.ts`, (5) `useTechnicalOrderTickets.test.ts`, (6) pgTAP file. Message: `feat(db): cross-schema view support.technical_order_tickets (AP-6)`. Push to `origin/main`.
  - Acceptance: `git log --oneline -1` shows the atomic commit; no intermediate commit has mismatched migration + types.

---

## Slice B — `createUseOrderList` factory + admin twin rewrites

> TS-only. No migration. No typegen. Satisfies REQ-SHARED-ORDER-LIST-FACTORY-1, REQ-SHARED-ORDER-LIST-INVALIDATION-1, REQ-CLIENT-KEY-ORDERS-LIST-1, REQ-CLIENT-TECHNICAL-ORDERS-LIST-1.

- [ ] B.1 **Preflight — hooks side-by-side**: Read `apps/admin/src/hooks/useKeyOrders.ts` and `apps/admin/src/hooks/useTechnicalOrders.ts` together; document byte-for-byte identical lines (filter handling, ILIKE, embed, ordering, range) vs diverging lines (view name, items table, status union, return type, queryKeyFn reference, mapRow body).
  - Acceptance: divergence inventory matches ADR-3 (only 5 differences: view, itemsTable, status union, return type, queryKeyFn, mapRow).

- [ ] B.2 **Write factory RED tests**: Create `packages/shared/src/hooks/__tests__/createUseOrderList.test.ts` with four cases: (1) filter → query translation for each filter combination (search, status, administrationId, buildingId, all-four, none); (2) snapshot on `queryKeyFn` invocation: `expect(queryKeyFn).toHaveBeenCalledWith(status, trimmedSearch, administrationId, buildingId)`; (3) `mapRow` called once per row with `(row, itemsField)`; (4) empty result → `mapRow` never called. Write tests before factory exists — RED.
  - Acceptance: tests fail (RED) because the factory file does not yet exist.

- [ ] B.3 **Write queryKey snapshot tests RED**: In `apps/admin/src/hooks/__tests__/useKeyOrders.test.ts` add `expect(keyOrdersKey('draft', 'foo', 'admin-1', 'bld-1')).toMatchInlineSnapshot(...)` (snapshot captured after B.6 rewrites the hook); same pattern in `useTechnicalOrders.test.ts` with `technicalOrdersKey`. Mark as RED until inline snapshot is recorded.
  - Acceptance: tests are present; snapshot values will be written by vitest `-u` in B.8.

- [ ] B.4 **Implement factory**: Create `packages/shared/src/hooks/createUseOrderList.ts` with the exact signature from design ADR-3; implement filter handling (search ILIKE, status `.eq`, administrationId `.eq`, buildingId `!inner` embed vs plain embed), `created_at` desc ordering, `range()` pagination, `mapRow` invocation per row; use `queryKeyFn` by reference.
  - Acceptance: factory compiles; all four B.2 factory tests GREEN.

- [ ] B.5 **Re-export factory**: Add `export * from './createUseOrderList';` to `packages/shared/src/hooks/index.ts`.
  - Acceptance: `import { createUseOrderList } from '@vitalock/shared'` resolves.

- [ ] B.6 **Rewrite `useKeyOrders`**: Collapse `apps/admin/src/hooks/useKeyOrders.ts` to `export const useKeyOrders = createUseOrderList<KeyOrderStatus, KeyOrderListRow>({ view: 'key_orders_summary', itemsTable: 'key_order_items', queryKeyFn: keyOrdersKey, mapRow: (row, itemsField) => ({ ... }) });`; preserve exported types `KeyOrderStatus`, `KeyOrderListRow`, `UseKeyOrdersFilters`.
  - Acceptance: file ≤ 20 LOC; no `.ilike`, `.eq`, `.or`, `.range` calls remain; `pnpm --filter @vitalock/admin tsc --noEmit` passes.

- [ ] B.7 **Rewrite `useTechnicalOrders`**: Same collapse for `useTechnicalOrders.ts` with `view: 'technical_orders_summary'`, `itemsTable: 'technical_order_items'`, `queryKeyFn: technicalOrdersKey`; preserve exported types.
  - Acceptance: file ≤ 20 LOC; no duplicated filter logic.

- [ ] B.8 **Update admin hook tests GREEN**: Update `useKeyOrders.test.ts` and `useTechnicalOrders.test.ts` to mock the factory-backed query (not the direct view query); record inline snapshots for query key shapes (`vitest -u`); verify all existing filter-parity assertions still cover search, status, administrationId, buildingId via the factory.
  - Acceptance: all tests in both files GREEN; snapshot values are committed inline.

- [ ] B.9 **Verification**: `pnpm --filter @vitalock/shared test` GREEN; `pnpm --filter @vitalock/admin test -- useKeyOrders useTechnicalOrders` GREEN; `pnpm typecheck`; `pnpm build`.
  - Acceptance: all pass; no regressions.

- [ ] B.10 **Delivery**: Atomic commit in this order: (1) `createUseOrderList.ts`, (2) `packages/shared/src/hooks/index.ts`, (3) `createUseOrderList.test.ts`, (4) `useKeyOrders.ts`, (5) `useTechnicalOrders.ts`, (6) `useKeyOrders.test.ts`, (7) `useTechnicalOrders.test.ts`. Message: `feat(shared): createUseOrderList factory + admin hook rewrites`. Push to `origin/main`.
  - Acceptance: `git log --oneline -1` shows the atomic commit.

---

## Cross-slice verification (after both slices land)

- [ ] X.1 **Full monorepo vitest**: `pnpm test` from repo root → all packages GREEN.
  - Acceptance: no regressions across admin, shared, installer, supabase packages.

- [ ] X.2 **Full monorepo typecheck**: `pnpm typecheck` from repo root → all packages pass.
  - Acceptance: pre-existing `TaskDetailPage.test.tsx` TS errors (if still present) are the only permitted failures and are documented.

- [ ] X.3 **pgTAP full suite**: `supabase test db` → all plan lines pass including the new `technical_order_tickets.sql` file.
  - Acceptance: no regression in existing pgTAP suite.

- [ ] X.4 **Archive**: After both slices are on `origin/main`, commit `chore(sdd): archive consolidation-ap6-and-admin-order-twins` moving the openspec directory to `openspec/changes/archive/2026-08-30-consolidation-ap6-and-admin-order-twins/`.
  - Acceptance: `git log --oneline -1` shows the archive commit; openspec directory is absent from `openspec/changes/`.

---

## Total task count

| Slice | Tasks | Type |
|-------|-------|------|
| A | 11 | Migration + typegen + TS |
| B | 10 | TS-only |
| X | 4 | Verification + delivery |
| **Total** | **25** | |

Slices A and B are mutually independent and can be developed and reviewed in parallel.
