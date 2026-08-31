# SDD Spec: consolidation-ap6-and-admin-order-twins

## Scope

Delta spec for two independent delivery slices (A–B). Each requirement describes WHAT must be true after the slice ships. No implementation decisions are made here.

---

## REQ-DB-TECHNICAL-ORDER-TICKETS-VIEW-1: Cross-schema admin tickets view

**Slice A.** A Postgres view `support.technical_order_tickets` exists in the database and exposes `toi.order_id AS technical_order_id` so that PostgREST can resolve all relevant ticket columns in a single query keyed by order ID.

### Requirements

1. The view is named exactly `support.technical_order_tickets`.
2. The view is defined as `SECURITY INVOKER` (no `SECURITY DEFINER`).
3. The view body is: `SELECT t.*, toi.order_id AS technical_order_id FROM support.tickets t LEFT JOIN public.technical_order_items toi ON toi.id = t.technical_order_item_id`.
4. The view exposes `technical_order_id` as a flat scalar column — no PostgREST embed required to filter on it.
5. The column list exposed by the view includes at minimum: all columns currently consumed by `apps/admin/src/hooks/useTechnicalOrderTickets.ts` (`id`, `ticket_number`, `category`, `status`, `description`, `technical_order_item_id`, `assigned_to_staff_id`, `created_at`, `resolved_at`) plus `technical_order_id`.
6. A rollback SQL file exists at `supabase/rollbacks/` mirroring the migration filename and drops the view.
7. `packages/supabase/src/database.types.ts` reflects `support.technical_order_tickets` in the same commit as the migration. No intermediate commit has a mismatched migration and type file.
8. The view is a sibling of `support.installer_tickets_with_context` — it does not extend or modify that view.

### pgTAP test file

`supabase/tests/views/technical_order_tickets.sql`

### Scenarios

#### Scenario: REQ-DB-TECHNICAL-ORDER-TICKETS-VIEW-1.1 — Admin sees tickets for a seeded order (happy path)

- Given: a technical order exists with ID `O1`; two items `I1` and `I2` belong to `O1` in `public.technical_order_items`; two tickets `T1` and `T2` exist in `support.tickets` with `technical_order_item_id = I1` and `I2` respectively
- When: the admin role queries `support.technical_order_tickets` filtering `.eq('technical_order_id', O1)`
- Then: exactly two rows are returned, `T1` and `T2`; both rows include the `technical_order_id` column equal to `O1`; the result is non-empty (guards against silent empty-set from missing GRANTs)

#### Scenario: REQ-DB-TECHNICAL-ORDER-TICKETS-VIEW-1.2 — Non-existent order_id returns empty set

- Given: no technical order with ID `O_MISSING` exists in `public.technical_order_items`
- When: the admin role queries `support.technical_order_tickets` filtering `.eq('technical_order_id', O_MISSING)`
- Then: an empty array is returned without error

#### Scenario: REQ-DB-TECHNICAL-ORDER-TICKETS-VIEW-1.3 — Tickets without a technical_order_item link are included with NULL technical_order_id

- Given: a ticket `T_ORPHAN` exists in `support.tickets` with `technical_order_item_id = NULL`
- When: the admin role queries `support.technical_order_tickets` without any `technical_order_id` filter
- Then: `T_ORPHAN` appears in the result set with `technical_order_id = NULL` (LEFT JOIN semantics preserved)

---

## REQ-DB-TECHNICAL-ORDER-TICKETS-RLS-1: RLS behavior on the new view

**Slice A.** The view inherits `support.tickets` RLS. The admin role can SELECT all rows. No non-admin role can escalate read privileges through the view.

### Requirements

1. The admin Postgres role can SELECT from `support.technical_order_tickets` without restriction — no `assigned_to_staff_id` filter is imposed on admin queries.
2. The admin role also has SELECT on `public.technical_order_items` (required for the INVOKER JOIN to resolve). If this grant is absent, the pgTAP test fails loudly rather than returning an empty set silently.
3. A role that lacks SELECT on `support.tickets` cannot access `support.technical_order_tickets` — `SECURITY INVOKER` ensures the caller's permissions govern the underlying tables.
4. No new RLS policy is introduced specifically for this view. The existing `support.tickets` RLS policies apply unchanged through INVOKER semantics.

### pgTAP test file

`supabase/tests/views/technical_order_tickets.sql` (same file as REQ-DB-TECHNICAL-ORDER-TICKETS-VIEW-1)

### Scenarios

#### Scenario: REQ-DB-TECHNICAL-ORDER-TICKETS-RLS-1.1 — Admin role sees all tickets across all orders

- Given: tickets assigned to multiple staff members exist in `support.tickets`
- When: the admin role queries `support.technical_order_tickets` with no additional filter
- Then: all tickets are returned regardless of `assigned_to_staff_id`; the result count equals the total row count in `support.tickets`

#### Scenario: REQ-DB-TECHNICAL-ORDER-TICKETS-RLS-1.2 — Unprivileged role is blocked at the view

- Given: a Postgres role `r_unpriv` has no SELECT grant on `support.tickets`
- When: `r_unpriv` attempts `SELECT * FROM support.technical_order_tickets`
- Then: the query raises a permission error (SQLSTATE `42501` or equivalent); no ticket rows are returned

---

## REQ-CLIENT-TECHNICAL-ORDER-TICKETS-1: Admin hook consumes the view in one round-trip

**Slice A.** `useTechnicalOrderTickets` performs exactly one Supabase network call per invocation by querying `support.technical_order_tickets` directly instead of the prior two-step sequential pattern.

### Requirements

1. `apps/admin/src/hooks/useTechnicalOrderTickets.ts` queries `.schema('support').from('technical_order_tickets').select(...).eq('technical_order_id', orderId)` — one call.
2. The prior two-step pattern (step 1: `from('technical_order_items').select('id').eq('order_id', orderId)`; step 2: `from('tickets').select(...).in('technical_order_item_id', ids)`) is fully removed from the hook.
3. The data shape returned to callers (`TechnicalOrderDetailPage.tsx`) is identical before and after — no consumer component is modified in this slice.
4. Vitest for `useTechnicalOrderTickets.test.ts` is updated to mock the new single-query shape. The test file is not deleted.
5. The hook disables the query when `orderId` is falsy — consistent with the existing guard behavior.

### Scenarios

#### Scenario: REQ-CLIENT-TECHNICAL-ORDER-TICKETS-1.1 — Single round-trip on valid orderId (happy path)

- Given: `useTechnicalOrderTickets` is called with a valid `orderId`
- When: the hook executes
- Then: exactly one Supabase client call is made; the call targets `support.technical_order_tickets` and filters `.eq('technical_order_id', orderId)`; no prior call to `technical_order_items` occurs

#### Scenario: REQ-CLIENT-TECHNICAL-ORDER-TICKETS-1.2 — Hook disabled when orderId is absent

- Given: `useTechnicalOrderTickets` is called without an `orderId` (or with `undefined`)
- When: the hook initializes
- Then: no Supabase query is issued; the hook remains in an idle/disabled state

#### Scenario: REQ-CLIENT-TECHNICAL-ORDER-TICKETS-1.3 — Returned data shape matches existing consumer contract

- Given: the mocked `support.technical_order_tickets` query resolves with two ticket rows including all required columns
- When: `useTechnicalOrderTickets` returns data
- Then: the returned array shape matches what `TechnicalOrderDetailPage.tsx` currently consumes; no mapping adapter is required in the consumer

---

## REQ-SHARED-ORDER-LIST-FACTORY-1: createUseOrderList factory in shared package

**Slice B.** A factory function `createUseOrderList` lives in `packages/shared/src/hooks/createUseOrderList.ts`, accepts typed options, and returns a hook with the same external signature the current admin order-list hooks expose.

### Requirements

1. The factory is located at `packages/shared/src/hooks/createUseOrderList.ts`.
2. The factory signature is `createUseOrderList<TStatus extends string, TRow>(options: CreateUseOrderListOptions<TStatus, TRow>)` returning a hook function `(filters?: UseOrderListFilters<TStatus>) => UseQueryResult<TRow[]>`.
3. `CreateUseOrderListOptions` accepts at minimum: `view: string`, `itemsTable: string`, `queryKeyFn: (...args) => readonly unknown[]`, and `mapRow: (row: OrderSummaryRawRow, itemsField: string) => TRow`.
4. The factory is exported from `packages/shared/src/hooks/index.ts`.
5. The returned hook applies all filters currently implemented by `useKeyOrders` and `useTechnicalOrders`: free-text search (ILIKE on `order_number`, `particular_full_name`, `company_name`), `status`, `administrationId`, and `buildingId`.
6. Pagination semantics (range, page size) are preserved — the factory must support the same `range()` call the current hooks perform.
7. No query-building logic is duplicated between `useKeyOrders.ts` and `useTechnicalOrders.ts` after the rewrite — all shared logic lives exclusively in the factory.
8. Vitest for the factory exists at `packages/shared/src/hooks/__tests__/createUseOrderList.test.ts`.

### Scenarios

#### Scenario: REQ-SHARED-ORDER-LIST-FACTORY-1.1 — Factory returns a working hook (happy path)

- Given: `createUseOrderList` is called with valid options including a mock `view`, `itemsTable`, `queryKeyFn`, and `mapRow`
- When: the returned hook is called with no filters
- Then: the hook issues one Supabase query against the specified view; the returned data is the result of applying `mapRow` to each raw row

#### Scenario: REQ-SHARED-ORDER-LIST-FACTORY-1.2 — Status filter is applied when provided

- Given: the hook returned by the factory is called with `filters.status = 'pending'`
- When: the hook executes its query
- Then: the Supabase call includes `.eq('status', 'pending')`; rows with other statuses are not returned

#### Scenario: REQ-SHARED-ORDER-LIST-FACTORY-1.3 — administrationId filter is applied when provided

- Given: the hook is called with `filters.administrationId = 'A1'`
- When: the hook executes its query
- Then: the Supabase call includes `.eq('administration_id', 'A1')` (or equivalent); only orders for that administration are returned

#### Scenario: REQ-SHARED-ORDER-LIST-FACTORY-1.4 — buildingId filter is applied server-side with no pre-query

- Given: the hook is called with `filters.buildingId = 'B1'`
- When: the hook executes its query
- Then: exactly one Supabase query is issued; the query filters on building ID through the view's items embed or scalar column; no prior query to the items table fetches building IDs

#### Scenario: REQ-SHARED-ORDER-LIST-FACTORY-1.5 — Free-text search applies ILIKE server-side

- Given: the hook is called with `filters.search = 'sol'`
- When: the hook executes its query
- Then: the Supabase call includes an `.or()` ILIKE across `order_number`, `particular_full_name`, and `company_name`; no client-side `.filter()` on the result is present

#### Scenario: REQ-SHARED-ORDER-LIST-FACTORY-1.6 — No filters returns all accessible orders

- Given: the hook is called with no filters (or `undefined`)
- When: the hook executes its query
- Then: all rows accessible to the caller are returned; no WHERE clauses other than implicit RLS are applied

---

## REQ-SHARED-ORDER-LIST-INVALIDATION-1: queryKeyFn passed by reference preserves invalidation

**Slice B.** The factory receives `queryKeyFn` by reference from the admin `queryKeys` module. Mutation hooks (`useMutateKeyOrder`, `useMutateTechnicalOrder`) continue to invalidate the exact same key shapes the factory registered.

### Requirements

1. `queryKeyFn` in `CreateUseOrderListOptions` is the exact function reference imported from `apps/admin/src/lib/queryKeys` — it is not re-created, inlined, or cloned inside the factory.
2. The factory uses `queryKeyFn(status, search, adminId, buildingId)` as the `queryKey` for React Query — same call-site arity as the current hooks.
3. The mutation hooks `useMutateKeyOrder` and `useMutateTechnicalOrder` import their respective key factories from `apps/admin/src/lib/queryKeys` and call `queryClient.invalidateQueries(keyOrdersKey(...))` / `queryClient.invalidateQueries(technicalOrdersKey(...))` — the key shape produced is identical to what the factory registered.
4. Each admin hook's test file includes a snapshot test that captures the exact `queryKey` array value. Any future change to the key shape fails the snapshot and forces the mutation hook to be updated in the same PR.

### Scenarios

#### Scenario: REQ-SHARED-ORDER-LIST-INVALIDATION-1.1 — key_orders mutation invalidates the factory-registered key

- Given: `useKeyOrders` is mounted (the factory-produced hook is active with a query registered under `keyOrdersKey(...)`)
- When: `useMutateKeyOrder` mutation succeeds and calls `queryClient.invalidateQueries(keyOrdersKey(...))`
- Then: the React Query cache entry for `useKeyOrders` is invalidated and a re-fetch is triggered; the snapshot test in `useKeyOrders.test.ts` asserts the exact key array shape

#### Scenario: REQ-SHARED-ORDER-LIST-INVALIDATION-1.2 — technical_orders mutation invalidates the factory-registered key

- Given: `useTechnicalOrders` is mounted (the factory-produced hook is active with a query registered under `technicalOrdersKey(...)`)
- When: `useMutateTechnicalOrder` mutation succeeds and calls `queryClient.invalidateQueries(technicalOrdersKey(...))`
- Then: the React Query cache entry for `useTechnicalOrders` is invalidated and a re-fetch is triggered; the snapshot test in `useTechnicalOrders.test.ts` asserts the exact key array shape

#### Scenario: REQ-SHARED-ORDER-LIST-INVALIDATION-1.3 — queryKey shape is locked by snapshot

- Given: a snapshot test exists in both `useKeyOrders.test.ts` and `useTechnicalOrders.test.ts` asserting the exact `queryKey` array returned by `keyOrdersKey(...)` / `technicalOrdersKey(...)`
- When: a developer changes the key shape in `queryKeys.ts`
- Then: the snapshot tests fail, surfacing the drift before the PR merges; no silent invalidation mismatch is possible

---

## REQ-CLIENT-KEY-ORDERS-LIST-1: useKeyOrders is a thin factory consumer

**Slice B.** `apps/admin/src/hooks/useKeyOrders.ts` is rewritten as a thin call to `createUseOrderList`. All query-building logic is removed from the file; behavior (filters, pagination, ILIKE search) is unchanged from the caller's perspective.

### Requirements

1. `useKeyOrders.ts` calls `createUseOrderList<KeyOrderStatus, KeyOrderListRow>({ view: 'key_orders_summary', itemsTable: 'key_order_items', queryKeyFn: keyOrdersKey, mapRow: ... })` and exports the returned hook as the default export.
2. No duplicated `.ilike`, `.eq`, `.or`, or `.range` call remains in `useKeyOrders.ts` — all such logic is delegated to the factory.
3. The `KeyOrderStatus` type union and `KeyOrderListRow` return type are preserved — no type regression for consumers.
4. The existing test file `useKeyOrders.test.ts` is updated to mock the factory-backed query. It is not deleted. Behavior assertions remain for all existing filter scenarios.

### Scenarios

#### Scenario: REQ-CLIENT-KEY-ORDERS-LIST-1.1 — Filter parity: search passes through to factory (happy path)

- Given: `useKeyOrders` is called with `search = 'edificio'`
- When: the hook executes
- Then: the factory's ILIKE filter for `company_name`, `order_number`, and `particular_full_name` is invoked with `'%edificio%'`; the behavior is identical to the pre-refactor hook

#### Scenario: REQ-CLIENT-KEY-ORDERS-LIST-1.2 — Filter parity: administrationId and buildingId pass through

- Given: `useKeyOrders` is called with `administrationId = 'A1'` and `buildingId = 'B2'`
- When: the hook executes
- Then: the factory applies both filters in a single Supabase query; no pre-query to `key_order_items` is issued

#### Scenario: REQ-CLIENT-KEY-ORDERS-LIST-1.3 — Filter parity: status filter passes through

- Given: `useKeyOrders` is called with `status = 'completed'`
- When: the hook executes
- Then: the factory applies `.eq('status', 'completed')`; rows with other statuses are excluded

---

## REQ-CLIENT-TECHNICAL-ORDERS-LIST-1: useTechnicalOrders is a thin factory consumer

**Slice B.** `apps/admin/src/hooks/useTechnicalOrders.ts` is rewritten as a thin call to `createUseOrderList`. All query-building logic is removed; behavior is unchanged.

### Requirements

1. `useTechnicalOrders.ts` calls `createUseOrderList<TechnicalOrderStatus, TechnicalOrderListRow>({ view: 'technical_orders_summary', itemsTable: 'technical_order_items', queryKeyFn: technicalOrdersKey, mapRow: ... })` and exports the returned hook as the default export.
2. No duplicated `.ilike`, `.eq`, `.or`, or `.range` call remains in `useTechnicalOrders.ts` — all such logic is delegated to the factory.
3. The `TechnicalOrderStatus` type union and `TechnicalOrderListRow` return type are preserved — no type regression for consumers.
4. The existing test file `useTechnicalOrders.test.ts` is updated to mock the factory-backed query. It is not deleted. Behavior assertions remain for all existing filter scenarios.

### Scenarios

#### Scenario: REQ-CLIENT-TECHNICAL-ORDERS-LIST-1.1 — Filter parity: search passes through to factory (happy path)

- Given: `useTechnicalOrders` is called with `search = 'norte'`
- When: the hook executes
- Then: the factory's ILIKE filter for `company_name`, `order_number`, and `particular_full_name` is invoked with `'%norte%'`; the behavior is identical to the pre-refactor hook

#### Scenario: REQ-CLIENT-TECHNICAL-ORDERS-LIST-1.2 — Filter parity: administrationId and buildingId pass through

- Given: `useTechnicalOrders` is called with `administrationId = 'A2'` and `buildingId = 'B3'`
- When: the hook executes
- Then: the factory applies both filters in a single Supabase query; no pre-query to `technical_order_items` is issued

#### Scenario: REQ-CLIENT-TECHNICAL-ORDERS-LIST-1.3 — Filter parity: status filter passes through

- Given: `useTechnicalOrders` is called with `status = 'in_progress'`
- When: the hook executes
- Then: the factory applies `.eq('status', 'in_progress')`; rows with other statuses are excluded

---

## Non-Goals

The following are explicitly out of scope and MUST NOT appear in any task derived from this spec:

- Changes to `useAssignedTickets` residual enrichment queries (equipment_update snapshots, product names via `technical_order_items → products`)
- Extension or modification of `support.installer_tickets_with_context`
- Changes to auth, RLS grammars, PostgREST configuration, or `PGRST_DB_SCHEMAS`
- A new `packages/hooks` package
- Any `clients`-app scaffolding or `useClientOrders` implementation
- Admin/installer cross-app twin extraction beyond `useKeyOrders` and `useTechnicalOrders`
- Changes to `useMutateKeyOrder` or `useMutateTechnicalOrder` beyond adding snapshot tests for query key shapes

---

## Open Assumptions

The following items could not be fully resolved from the proposal and exploration and are flagged for the design phase:

1. **`mapRow` generic surface**: the spec assumes `mapRow` receives a raw DB row and the items field name. The design phase must confirm the exact TS type of `OrderSummaryRawRow` — whether it is derived from `database.types.ts` or is a manually maintained interface — to ensure the factory compiles without explicit type casts at the consumer call site.
2. **`queryKeyFn` arity**: the factory's `queryKeyFn` parameter type must match the arity of both `keyOrdersKey` and `technicalOrdersKey`. If the two key factories have different argument counts, a union overload or a variadic signature will be needed. The design phase confirms the exact shared signature.
3. **Pagination and range semantics**: the spec requires pagination parity but does not prescribe how `range` arguments are passed into the factory (as a filter field, a separate option, or derived from a `page` index). The design phase confirms the exact API.
