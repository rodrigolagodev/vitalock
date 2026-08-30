# SDD Spec: logic-consolidation-shared-hooks-and-postgres

## Scope

Delta spec for six delivery slices (A–F). Each requirement describes WHAT must be true after the slice ships. No implementation decisions are made here.

---

## REQ-SHARED-ERROR-1: Centralized mutation error mapping

**Slice A.** A single canonical error-mapping function lives in `packages/shared/src/errors/toastMutationError.ts` and is consumed by both apps. Neither app retains a local `mapMutationError.ts` copy.

### Requirements

1. The function signature is `toastMutationError(error: unknown, extraHandlers?: Record<string, (e: PostgrestError) => string>): string`. The `extraHandlers` map is keyed by SQLSTATE code or error category string and is optional.
2. The function handles every SQLSTATE case currently covered by `apps/admin/src/hooks/mapMutationError.ts`: network error branch, `42501` (RLS denial), `23505` (unique violation), `23514` (immutable field), `23503` (FK blocker), `P0001` (RPC-raised message match via substring), and an unknown-SQLSTATE fallback.
3. For `23505`, the admin app must be able to inject handlers that distinguish at minimum: duplicate serial in building, duplicate key reference, and any other unique constraint specific to admin domain — without editing shared code.
4. `extraHandlers` entries take precedence over built-in handlers for the same key. Built-in handlers fire when no `extraHandlers` entry matches.
5. The unknown-SQLSTATE fallback returns a non-empty human-readable string that does not expose raw SQL or SQLSTATE codes to the caller.
6. Both `apps/admin/src/hooks/mapMutationError.ts` and `apps/installer/src/hooks/mapMutationError.ts` are deleted. All ~73 callers across both apps import from `@vitalock/shared`.
7. The shared primitives `isNetworkError` and `isPostgrestError` from `packages/shared/src/errors/parseSupabaseError.ts` remain unchanged.

### Test file

`packages/shared/src/errors/__tests__/toastMutationError.test.ts`

### Scenarios

**REQ-SHARED-ERROR-1.1 — Network error branch**
- Given: `error` is an instance of `TypeError` with `message` containing "Failed to fetch"
- When: `toastMutationError(error)` is called
- Then: the returned string is the canonical network-error message; no SQLSTATE branch is entered

**REQ-SHARED-ERROR-1.2 — RLS denial (42501)**
- Given: `error` is a `PostgrestError` with `code: "42501"`
- When: `toastMutationError(error)` is called without `extraHandlers`
- Then: the returned string is the canonical permission-denied message

**REQ-SHARED-ERROR-1.3 — Unique violation (23505) — built-in fallback**
- Given: `error` is a `PostgrestError` with `code: "23505"` and `message` that matches no `extraHandlers` key
- When: `toastMutationError(error)` is called
- Then: the returned string is the canonical duplicate-record message

**REQ-SHARED-ERROR-1.4 — Unique violation (23505) — admin-injected case**
- Given: `error` is a `PostgrestError` with `code: "23505"` and `message` containing "equipment_serial_building_id_key"
- When: `toastMutationError(error, adminHandlers)` is called and `adminHandlers` includes a handler matching that constraint name
- Then: the returned string is the app-specific duplicate-serial message from `adminHandlers`, not the built-in fallback

**REQ-SHARED-ERROR-1.5 — Immutable field violation (23514)**
- Given: `error` is a `PostgrestError` with `code: "23514"`
- When: `toastMutationError(error)` is called
- Then: the returned string is the canonical immutable-field message

**REQ-SHARED-ERROR-1.6 — FK blocker (23503)**
- Given: `error` is a `PostgrestError` with `code: "23503"`
- When: `toastMutationError(error)` is called
- Then: the returned string is the canonical FK-constraint message

**REQ-SHARED-ERROR-1.7 — P0001 RPC message substring match**
- Given: `error` is a `PostgrestError` with `code: "P0001"` and `message` containing a known RPC-raised substring (e.g., "ticket not found")
- When: `toastMutationError(error)` is called
- Then: the returned string reflects the matched RPC message, not the generic fallback

**REQ-SHARED-ERROR-1.8 — Unknown SQLSTATE fallback**
- Given: `error` is a `PostgrestError` with `code: "99999"` matching no built-in or injected handler
- When: `toastMutationError(error)` is called
- Then: the returned string is a non-empty human-readable fallback; it does not contain the raw SQLSTATE code or SQL text

**REQ-SHARED-ERROR-1.9 — extraHandlers extensibility**
- Given: a caller passes `extraHandlers` with two keys, one matching the error and one not
- When: `toastMutationError(error, extraHandlers)` is called
- Then: exactly the matching handler fires; the non-matching handler is not invoked

---

## REQ-SHARED-CONFIG-EQUIP-1: Configure technical ticket equipment factory

**Slice B.** A factory function `createUseConfigureTechnicalTicketEquipment` in `packages/shared/src/hooks/useConfigureTechnicalTicketEquipment.ts` produces a hook. Both apps consume the factory. Neither app retains a local `useConfigureTechnicalTicketEquipment.ts` copy.

### Requirements

1. The factory accepts an options object with at minimum: `onSuccess: (vars: ConfigureTechnicalTicketEquipmentInput) => void | Promise<void>` and `mapMutationError: (error: unknown) => string`.
2. The underlying mutation calls the existing `configureTechnicalTicketEquipment` RPC from `@vitalock/supabase/rpc/tickets` — the RPC call is byte-for-byte identical across admin and installer consumers.
3. The `onSuccess` callback is invoked with the original mutation variables after a successful RPC response. Each app passes its own `onSuccess` that performs the correct query invalidation for that app.
4. The `mapMutationError` option is used to map mutation errors to toast strings. Each app passes its own `toastMutationError` call with app-specific `extraHandlers`.
5. No query invalidation keys are hardcoded inside the factory. All invalidation is the caller's responsibility via `onSuccess`.
6. The admin app's hook test and the installer app's hook test both migrate to use the factory. Neither test file is deleted; both are updated to test the factory via their respective `onSuccess` stubs.
7. The factory does not use `useAuthContext` internally. If a `staffId` is needed by a consumer, the consumer passes it through `onSuccess` or as an additional factory option.

### Scenarios

**REQ-SHARED-CONFIG-EQUIP-1.1 — Successful mutation triggers onSuccess**
- Given: the RPC `configureTechnicalTicketEquipment` resolves successfully
- When: a hook produced by the factory executes the mutation
- Then: the `onSuccess` callback from options is called with the exact mutation variables

**REQ-SHARED-CONFIG-EQUIP-1.2 — Failed mutation triggers mapMutationError**
- Given: the RPC `configureTechnicalTicketEquipment` rejects with a `PostgrestError`
- When: a hook produced by the factory executes the mutation
- Then: `mapMutationError` from options is called with the error; `onSuccess` is not called

**REQ-SHARED-CONFIG-EQUIP-1.3 — Admin invalidation set is preserved**
- Given: admin's hook is produced by the factory with admin-specific `onSuccess`
- When: mutation succeeds
- Then: `onSuccess` is called; the admin test asserts that `tareasKey()` and `['admin', 'tarea', vars.ticketId]` are among the invalidated keys in the mock

**REQ-SHARED-CONFIG-EQUIP-1.4 — Installer invalidation set is preserved**
- Given: installer's hook is produced by the factory with installer-specific `onSuccess`
- When: mutation succeeds
- Then: `onSuccess` is called; the installer test asserts that `assignedTicketsKey(staffId)` is among the invalidated keys in the mock

---

## REQ-DB-CREATE-ASSIGN-EQUIP-1: Atomic equipment creation and ticket assignment

**Slice C.** A Postgres RPC performs equipment creation and ticket assignment in a single transaction. The browser hook calls it with one round trip.

### Requirements

1. RPC signature: `public.create_and_assign_equipment(p_ticket_id uuid, p_building_id uuid, p_serial text, p_model text, p_description text, p_access_type text) RETURNS uuid`
2. On success, the function inserts one row into `operations.equipment`, updates `support.tickets SET equipment_id = <new_id> WHERE id = p_ticket_id`, and returns the new equipment UUID — all in one transaction.
3. If the INSERT into `operations.equipment` fails (e.g., duplicate serial), the UPDATE is never executed and no equipment row is persisted.
4. If the UPDATE on `support.tickets` fails (e.g., ticket not found), the INSERT is rolled back and no equipment row is persisted.
5. The RPC raises a descriptive exception (not a silent NULL return) when `p_ticket_id` does not match any row in `support.tickets`.
6. The RPC raises `42501` when the calling role lacks INSERT permission on `operations.equipment` or UPDATE permission on `support.tickets`.
7. The RPC raises `23505` with a clear constraint-name-bearing message when a duplicate serial exists within the same building.
8. The RPC is accessible to the same Postgres roles that previously executed the two-step pattern.

### pgTAP test file

`supabase/tests/rpc/create_and_assign_equipment.sql`

### Scenarios

**REQ-DB-CREATE-ASSIGN-EQUIP-1.1 — Happy path**
- Given: a valid `p_ticket_id` referencing an existing ticket in `support.tickets`, a valid `p_building_id`, and unique serial for that building
- When: `SELECT public.create_and_assign_equipment(...)` is called
- Then: the function returns a UUID; `operations.equipment` contains one new row with that UUID; `support.tickets.equipment_id` for `p_ticket_id` equals the returned UUID

**REQ-DB-CREATE-ASSIGN-EQUIP-1.2 — Invalid ticket_id raises**
- Given: `p_ticket_id` does not exist in `support.tickets`
- When: `SELECT public.create_and_assign_equipment(...)` is called
- Then: an exception is raised; no row is inserted into `operations.equipment`

**REQ-DB-CREATE-ASSIGN-EQUIP-1.3 — RLS-denied caller raises 42501**
- Given: the calling role has no INSERT permission on `operations.equipment`
- When: `SELECT public.create_and_assign_equipment(...)` is called
- Then: the call raises with SQLSTATE `42501`; no row is inserted; no ticket is updated

**REQ-DB-CREATE-ASSIGN-EQUIP-1.4 — Duplicate serial in building raises 23505**
- Given: a row already exists in `operations.equipment` with the same serial and `building_id` combination
- When: `SELECT public.create_and_assign_equipment(...)` is called with the same serial and building
- Then: the call raises with SQLSTATE `23505` and a message that includes the constraint name; no new equipment row is inserted

**REQ-DB-CREATE-ASSIGN-EQUIP-1.5 — Rollback verified on second-step failure**
- Given: a valid ticket and unique serial, but the UPDATE step is made to fail (e.g., by temporarily revoking UPDATE on `support.tickets` in the test transaction)
- When: `SELECT public.create_and_assign_equipment(...)` is called
- Then: the entire transaction is rolled back; `operations.equipment` contains no new row with the attempted serial

---

## REQ-DB-COMPLETE-AUTH-1: Atomic authorization batch completion

**Slice E.** A Postgres RPC completes an install batch and a remove batch in a single transaction. The browser hook calls it with one round trip.

### Requirements

1. RPC signature: `public.complete_authorizations(p_install_ids uuid[], p_remove_ids uuid[], p_staff_id uuid, p_timestamp timestamptz) RETURNS void`
2. On success, the function updates all rows in `p_install_ids` to their installed state and all rows in `p_remove_ids` to their removed state — in one transaction.
3. If any UPDATE for `p_install_ids` rows fails, all updates in the call are rolled back.
4. If any UPDATE for `p_remove_ids` rows fails, all updates in the call are rolled back.
5. Both arrays may be non-empty simultaneously. The function processes both within the same transaction.
6. Both arrays being empty is a valid no-op call: the function returns without error and touches no rows.
7. The function raises `42501` when the calling role lacks UPDATE permission on the authorizations table.
8. The function raises a descriptive exception when any authorization in `p_install_ids` or `p_remove_ids` is already in a terminal state (installed or removed respectively), preventing silent double-completion.
9. `p_staff_id` and `p_timestamp` are recorded on the updated rows (or on an audit log if the schema uses one) — they are not ignored.

### pgTAP test file

`supabase/tests/rpc/complete_authorizations.sql`

### Scenarios

**REQ-DB-COMPLETE-AUTH-1.1 — Install-only batch**
- Given: `p_install_ids` contains two valid authorization UUIDs in pending state; `p_remove_ids` is empty
- When: `SELECT public.complete_authorizations(...)` is called
- Then: both authorizations are updated to installed state; no other rows are touched

**REQ-DB-COMPLETE-AUTH-1.2 — Remove-only batch**
- Given: `p_remove_ids` contains two valid authorization UUIDs in pending state; `p_install_ids` is empty
- When: `SELECT public.complete_authorizations(...)` is called
- Then: both authorizations are updated to removed state; no other rows are touched

**REQ-DB-COMPLETE-AUTH-1.3 — Mixed batch**
- Given: `p_install_ids` contains one UUID and `p_remove_ids` contains one UUID, both in pending state
- When: `SELECT public.complete_authorizations(...)` is called
- Then: the install authorization is in installed state; the remove authorization is in removed state; both changes are committed atomically

**REQ-DB-COMPLETE-AUTH-1.4 — Empty arrays (no-op)**
- Given: both `p_install_ids` and `p_remove_ids` are empty arrays
- When: `SELECT public.complete_authorizations(...)` is called
- Then: the function returns without error; no authorization rows are updated

**REQ-DB-COMPLETE-AUTH-1.5 — RLS-denied caller raises 42501**
- Given: the calling role lacks UPDATE permission on the authorizations table
- When: `SELECT public.complete_authorizations(...)` is called with valid IDs
- Then: SQLSTATE `42501` is raised; no rows are updated

**REQ-DB-COMPLETE-AUTH-1.6 — Authorization already in terminal state raises**
- Given: one of the UUIDs in `p_install_ids` is already in installed state
- When: `SELECT public.complete_authorizations(...)` is called
- Then: a descriptive exception is raised; no rows are updated (full rollback)

**REQ-DB-COMPLETE-AUTH-1.7 — Rollback on partial failure**
- Given: `p_install_ids` contains two UUIDs, the first valid, the second referencing a non-existent row
- When: `SELECT public.complete_authorizations(...)` is called
- Then: the transaction is rolled back; the first authorization remains in its original pending state

---

## REQ-DB-ORDERS-VIEW-1: Server-side order list filtering

**Slice D.** Two Postgres views expose order data with `company_name` and building linkage as first-class columns so PostgREST can apply server-side ILIKE and building_id filters in a single query.

### Requirements

1. `public.key_orders_summary` exists as a Postgres view. It JOINs the `key_orders` table with `administrations` (to expose `company_name`) and with the key order items table (to expose building linkage).
2. `public.technical_orders_summary` exists as a Postgres view with the same JOIN structure for `technical_orders`.
3. Both views expose `company_name` as a named, directly filterable column (not nested under an embed) so PostgREST can apply `.ilike('company_name', ...)` without a cross-column `.or()`.
4. Both views expose building linkage such that PostgREST can filter on `items.building_id` via an embedded resource relationship, OR the view exposes a `building_ids` array column that can be filtered with PostgREST array operators — the exact mechanism is a design decision, but server-side filtering without a pre-query must be possible.
5. A `pg_trgm` GIN index on `administrations.company_name` MUST exist in the migration so ILIKE on `company_name` does not require a full sequential scan.
6. The views inherit the RLS policies of their underlying tables. No `SECURITY DEFINER` is used unless the design phase documents a specific, justified reason.
7. Both views are additive: existing direct queries to `key_orders` and `technical_orders` continue to work without modification.

### pgTAP test file

`supabase/tests/views/order_summaries.sql`

### Scenarios

**REQ-DB-ORDERS-VIEW-1.1 — Search by company_name (server-side ILIKE)**
- Given: two orders exist, one belonging to administration "Edificio Sol" and one to "Parque Norte"
- When: a query against `key_orders_summary` applies `.ilike('company_name', '%sol%')`
- Then: exactly one row is returned, belonging to "Edificio Sol"; no client-side filtering is applied

**REQ-DB-ORDERS-VIEW-1.2 — Filter by building_id**
- Given: orders with items spanning multiple buildings; one building has ID `B1`
- When: a query against `key_orders_summary` filters on building_id `B1` via the view's building linkage column or embed
- Then: only orders with at least one item in building `B1` are returned; the N+1 pre-query for building IDs is not needed

**REQ-DB-ORDERS-VIEW-1.3 — Combined company_name and building_id filter**
- Given: orders belong to different administrations and buildings
- When: both `.ilike('company_name', '%sol%')` and a building_id filter are applied in a single query
- Then: only orders matching both conditions are returned

**REQ-DB-ORDERS-VIEW-1.4 — Empty result set**
- Given: no orders match the applied filters
- When: a filtered query is executed against either view
- Then: an empty array is returned without error

---

## REQ-DB-TICKETS-VIEW-1: Cross-schema installer tickets view

**Slice F.** A Postgres view joins `support.tickets`, `public.buildings`, and `public.administrations` in one row per ticket so PostgREST can resolve all three in a single query.

### Requirements

1. A view named `support.installer_tickets_with_context` (exact name confirmed in design phase) exists and joins `support.tickets` with `public.buildings` and `public.administrations` such that building and administration data appear as columns on each ticket row.
2. The view exposes at minimum: all columns required by `useAssignedTickets` and `useTicketHistory` result shapes, plus `building_name`, `administration_company_name`, and any other cross-schema columns currently fetched in separate queries.
3. The view enforces installer RLS: the `assigned_staff_id = auth.uid()` filter (or equivalent RLS policy) remains enforceable. A logged-in installer sees only their own assigned tickets through this view.
4. The view uses `SECURITY INVOKER` (default) unless the design phase documents a specific, justified reason to escalate to `SECURITY DEFINER`. If `SECURITY DEFINER` is used, the SELECT list MUST be restricted to columns safe under the callers' existing RLS.
5. The cross-schema JOIN reduces the installer ticket fetch from 3–5 sequential queries to 1 query per data load.
6. Realtime channel subscriptions on `support.tickets` remain functional after the hook migration.

### pgTAP test file

`supabase/tests/views/installer_tickets_with_context.sql`

### Scenarios

**REQ-DB-TICKETS-VIEW-1.1 — Installer sees only assigned tickets**
- Given: three tickets exist; installer `I1` is assigned to two of them; installer `I2` is assigned to the third
- When: a query against `support.installer_tickets_with_context` is executed as role `I1`
- Then: exactly two rows are returned, both with `assigned_staff_id = I1.id`

**REQ-DB-TICKETS-VIEW-1.2 — Non-assigned staff sees zero rows**
- Given: a ticket exists assigned to installer `I1`
- When: a query against `support.installer_tickets_with_context` is executed as a staff role that is not `I1`
- Then: zero rows are returned

**REQ-DB-TICKETS-VIEW-1.3 — Cross-schema JOIN reduces installer fetch to 1 query**
- Given: a ticket assigned to `I1` has a `building_id` referencing a building in `public.buildings`, which belongs to an administration in `public.administrations`
- When: a query against `support.installer_tickets_with_context` is executed as role `I1`
- Then: the returned row includes building and administration columns populated correctly without requiring a second or third query

---

## REQ-CLIENT-EQUIP-1: Admin hook consumes atomic RPC

**Slice C.** `useMutateTicketEquipment.createAndAssignEquipment` calls the new RPC in a single round trip.

### Requirements

1. `apps/admin/src/hooks/useMutateTicketEquipment.ts` — the `createAndAssignEquipment` mutation function calls `create_and_assign_equipment` from `@vitalock/supabase/rpc/tickets` instead of the previous two-step pattern.
2. The mutation makes exactly one network call to Supabase per invocation.
3. `apps/admin/src/components/servicio-tecnico/AssignEquipmentDialog.tsx` is not modified in this slice. Its behavior from the user's perspective is identical before and after.
4. Vitest coverage exists for `useMutateTicketEquipment` covering: successful creation (mock RPC resolves, mutation state is success), and RPC failure (mock RPC rejects, mutation state is error, error is surfaced).

### Scenarios

**REQ-CLIENT-EQUIP-1.1 — Single RPC call on create**
- Given: `createAndAssignEquipment` mutation is triggered with valid input
- When: the mutation executes
- Then: exactly one call to the `create_and_assign_equipment` RPC wrapper is made; the old two-step pattern (INSERT then UPDATE) is not executed

**REQ-CLIENT-EQUIP-1.2 — Successful mutation state**
- Given: the mocked `create_and_assign_equipment` RPC resolves with a UUID
- When: the mutation completes
- Then: mutation state is `success`; the returned UUID is accessible to the caller

**REQ-CLIENT-EQUIP-1.3 — Failed mutation state**
- Given: the mocked `create_and_assign_equipment` RPC rejects with a `PostgrestError`
- When: the mutation completes
- Then: mutation state is `error`; the error is propagated; no orphaned equipment row is possible (since the operation was never split)

---

## REQ-CLIENT-AUTH-1: Installer hook consumes atomic RPC

**Slice E.** `useCompleteAuthorizations` calls the new RPC in a single round trip.

### Requirements

1. `apps/installer/src/hooks/useCompleteAuthorizations.ts` calls `complete_authorizations` from `@vitalock/supabase/rpc/tickets` instead of the previous two-step sequential UPDATE pattern.
2. The mutation makes exactly one network call to Supabase per invocation.
3. Vitest coverage exists for `useCompleteAuthorizations` covering: install-only batch success, remove-only batch success, mixed batch success, and RPC failure with error propagation.

### Scenarios

**REQ-CLIENT-AUTH-1.1 — Single RPC call on batch complete**
- Given: `useCompleteAuthorizations` mutation is triggered with non-empty install or remove arrays
- When: the mutation executes
- Then: exactly one call to the `complete_authorizations` RPC wrapper is made; no sequential UPDATEs are issued

**REQ-CLIENT-AUTH-1.2 — Install-only batch success**
- Given: the mocked RPC resolves; `p_install_ids` has two entries; `p_remove_ids` is empty
- When: the mutation completes
- Then: mutation state is `success`

**REQ-CLIENT-AUTH-1.3 — RPC failure is propagated**
- Given: the mocked `complete_authorizations` RPC rejects with a `PostgrestError`
- When: the mutation completes
- Then: mutation state is `error`; the error message is surfaced via `mapMutationError`

---

## REQ-CLIENT-ORDERS-1: Admin order list hooks consume view

**Slice D.** `useKeyOrders` and `useTechnicalOrders` filter `company_name` and `building_id` server-side through the new views.

### Requirements

1. `apps/admin/src/hooks/useKeyOrders.ts` queries `public.key_orders_summary` (or the PostgREST equivalent) instead of `key_orders` directly when filters are present.
2. `apps/admin/src/hooks/useTechnicalOrders.ts` queries `public.technical_orders_summary` (or the PostgREST equivalent) instead of `technical_orders` directly when filters are present.
3. The `building_id` filter is applied in the same query as the main order fetch — no pre-query to `key_order_items` or `technical_order_items` is performed to collect building IDs.
4. The `company_name` filter is applied server-side via `.ilike('company_name', ...)` — no post-fetch JS `.filter()` on `company_name` remains.
5. Existing vitest tests for both hooks are updated to mock the new view-backed queries. No behavior regression: the same list, pagination, and filter semantics are preserved.

### Scenarios

**REQ-CLIENT-ORDERS-1.1 — company_name filter is server-side**
- Given: `useKeyOrders` is called with a non-empty `companyName` filter
- When: the hook executes its query
- Then: the Supabase client call includes `.ilike('company_name', ...)` applied to the view; no JavaScript `.filter()` on the result is present in the hook code

**REQ-CLIENT-ORDERS-1.2 — building_id filter requires no pre-query**
- Given: `useKeyOrders` is called with a non-empty `buildingId` filter
- When: the hook executes its query
- Then: exactly one Supabase query is issued; no prior query to `key_order_items` fetches building IDs

**REQ-CLIENT-ORDERS-1.3 — Combined filters in one query**
- Given: both `companyName` and `buildingId` filters are active
- When: the hook executes its query
- Then: both filters are applied in a single Supabase query against the view

**REQ-CLIENT-ORDERS-1.4 — No filter returns all orders**
- Given: neither `companyName` nor `buildingId` is provided
- When: the hook executes its query
- Then: the query returns all orders accessible to the caller; no filters are applied

---

## REQ-CLIENT-TICKETS-1: Installer ticket hooks consume view

**Slice F.** `useAssignedTickets` and `useTicketHistory` issue a single query for ticket + building + administration data.

### Requirements

1. `apps/installer/src/hooks/useAssignedTickets.ts` queries `support.installer_tickets_with_context` (or equivalent view) instead of the three-step fetch pattern.
2. `apps/installer/src/hooks/useTicketHistory.ts` queries the same view instead of the three-step fetch pattern.
3. Neither hook issues a `.in('id', buildingIds)` batch fetch or `.in('id', administrationIds)` batch fetch after the main query.
4. Realtime channel subscriptions on `support.tickets` remain present and functional in both hooks after migration. The subscription target remains `support.tickets`, not the view.
5. Existing vitest tests for both hooks are updated to mock the view-backed query shape. No behavioral regression in the returned data shape.

### Scenarios

**REQ-CLIENT-TICKETS-1.1 — Single query for ticket + context**
- Given: `useAssignedTickets` is called for a logged-in installer
- When: the hook executes
- Then: exactly one Supabase query is issued; the result includes building and administration fields without a second or third network call

**REQ-CLIENT-TICKETS-1.2 — Realtime channel remains active**
- Given: `useAssignedTickets` is mounted
- When: the hook sets up subscriptions
- Then: a Supabase realtime channel subscription is established for `support.tickets`; the subscription is cleaned up on unmount

**REQ-CLIENT-TICKETS-1.3 — useTicketHistory single query**
- Given: `useTicketHistory` is called for a logged-in installer
- When: the hook executes
- Then: exactly one Supabase query is issued returning ticket + building + administration data

---

## REQ-TYPEGEN-1: Database types reflect new server surfaces

**Applies to slices C, D, E, F.** Each slice that introduces a migration also regens `database.types.ts` in the same commit.

### Requirements

1. `packages/supabase/src/database.types.ts` MUST include type definitions for `public.create_and_assign_equipment` after slice C lands.
2. `packages/supabase/src/database.types.ts` MUST include type definitions for `public.complete_authorizations` after slice E lands.
3. `packages/supabase/src/database.types.ts` MUST include type definitions for `public.key_orders_summary` and `public.technical_orders_summary` after slice D lands.
4. `packages/supabase/src/database.types.ts` MUST include type definitions for `support.installer_tickets_with_context` (or the design-confirmed view name) after slice F lands.
5. The typegen step runs in the same commit as the migration so that no intermediate commit has a mismatched migration and type file.
6. Consumer imports that reference newly typed RPCs or views MUST compile without TypeScript errors immediately after the typegen commit.
7. No consumer import that existed before a slice is broken by the typegen change — i.e., existing types for unchanged tables and RPCs are preserved.

### Scenarios

**REQ-TYPEGEN-1.1 — New RPC types are present after slice C**
- Given: slice C migration is applied and typegen is run
- When: a TypeScript file imports `Database['public']['Functions']['create_and_assign_equipment']`
- Then: the type is defined and the import compiles without error

**REQ-TYPEGEN-1.2 — New view types are present after slice D**
- Given: slice D migration is applied and typegen is run
- When: a TypeScript file references `Database['public']['Views']['key_orders_summary']`
- Then: the type is defined and includes `company_name` as a column

**REQ-TYPEGEN-1.3 — No existing type is broken by regen**
- Given: typegen is run for any slice
- When: the existing test suite (`pnpm tsc --noEmit`) is executed
- Then: zero TypeScript errors are introduced by the typegen change

---

## Non-Goals

The following are explicitly out of scope and MUST NOT appear in any task derived from this spec:

- Hono, Node, Deno, or Cloudflare Workers backend services
- A new `packages/hooks` package
- Intra-admin twin extraction of `useKeyOrders` / `useTechnicalOrders` beyond fixing AP-2 and AP-3
- Fix for AP-6 (`useTechnicalOrderTickets`)
- Changes to auth, routing, RLS grammars, or PostgREST configuration

---

## Open Assumptions

The following items could not be fully determined from the proposal and are flagged for the design phase:

1. **View name for cross-schema tickets**: the spec uses `support.installer_tickets_with_context` as a placeholder. The design phase must confirm the exact name before the migration is written.
2. **`SECURITY DEFINER` decision for cross-schema view**: the spec defaults to `INVOKER` (REQ-DB-TICKETS-VIEW-1 requirement 4). If the design phase determines `INVOKER` cannot satisfy RLS across `support → public`, it must document the escalation justification and the restricted SELECT list.
3. **Building linkage column strategy for order views**: the spec permits either a `building_ids uuid[]` array column or an embed-friendly items relationship (REQ-DB-ORDERS-VIEW-1 requirement 4). The design phase picks one and confirms PostgREST filterability.
4. **Authorization table name**: the spec refers to "the authorizations table" generically. The design phase must confirm the exact schema-qualified name for `complete_authorizations` UPDATE targets.
5. **P0001 message substrings for REQ-SHARED-ERROR-1.7**: the test scenario requires at least one known RPC-raised substring. The design phase must enumerate the exact substrings that the shared handler matches (e.g., "ticket not found", "authorization already completed") to make the pgTAP and vitest assertions deterministic.
