# SDD Design: consolidation-ap6-and-admin-order-twins

## Chosen approach

Two fully independent slices, each self-contained and shippable in either order or on parallel branches.

- **Slice A (AP-6, Postgres-first)**: push the current two-step admin read into Postgres via a sibling `SECURITY INVOKER` view `support.technical_order_tickets`, mirroring the exact cadence proven by slice F of the prior change (migration + typegen + hook rewrite + pgTAP as one atomic commit).
- **Slice B (Admin twins, TS-only)**: extract a generic `createUseOrderList` factory into `packages/shared/src/hooks/` and rewrite the two admin hooks as thin consumers. The factory receives `queryKeyFn` **by reference**, so mutation hooks and list hooks share the exact same key factory — invalidation drift becomes impossible at the call site and is enforced at test time via a snapshot on the emitted key.

Both slices reuse patterns already validated in the archived `logic-consolidation-shared-hooks-and-postgres` change; no new architectural surface is introduced.

---

## Key ADRs

### ADR-1: New sibling view instead of extending `installer_tickets_with_context`

**Context.** `support.installer_tickets_with_context` (shipped 2026-08-30) joins `support.tickets` + `public.buildings` + `public.administrations` for installer scope, keyed on `t.building_id` and scoped by the installer's assigned tickets. AP-6 needs a different JOIN: `support.tickets` + `public.technical_order_items` keyed on `t.technical_order_item_id → toi.id`, exposing `toi.order_id` so admin callers can filter `.eq('technical_order_id', orderId)` in one round-trip.

**Decision.** Ship a **sibling view** `support.technical_order_tickets` rather than overloading the installer view. Different join key (`technical_order_item_id` vs `building_id`), different consumers (admin vs installer), different RLS surface (admin sees all vs installer-scoped by `assigned_to_staff_id`), different denormalization intent (order-scoped ticket list vs installer-worklist context).

**Consequences.** Admin hook queries `supabase.schema('support').from('technical_order_tickets').eq('technical_order_id', orderId)`. The installer view stays untouched — no risk to the shipped installer worklist. Both views coexist under `support` and are auto-exposed because `support` is already in `PGRST_DB_SCHEMAS` (confirmed by the working installer view).

---

### ADR-2: `SECURITY INVOKER` for `support.technical_order_tickets`

**Context.** RLS on `support.tickets` allows admin role to SELECT all tickets. RLS on `public.technical_order_items` grants SELECT to `authenticated`. Under `SECURITY INVOKER`, both underlying SELECTs run as the caller and each table's RLS is enforced separately. `SECURITY DEFINER` would run as the view owner and bypass caller RLS on the joined tables — creating a trust boundary that needs its own audit.

**Decision.** Ship with **`WITH (security_invoker = true)`**. Do not escalate to DEFINER. Rationale:

1. Admin already has SELECT on both `support.tickets` and `public.technical_order_items` in live code (the current two-step read works under admin credentials, which proves the grants exist).
2. The installer role has no legitimate use case for this view — technical-order admin listing is an admin-only surface. INVOKER naturally excludes installer callers by falling back to their existing `support.tickets` RLS which does not expose other-order tickets to them.
3. INVOKER keeps the view transparent to RLS: no trust boundary widens, no compensating filter inside the view body needed, no owner-based audit surface.

**Rejected alternative.** `SECURITY DEFINER` with a hardcoded SELECT list and an internal `WHERE` filter. Rejected because the admin case does not need it and the installer case is not a supported consumer — adding DEFINER only creates a surface we would need to audit forever for a nonexistent caller.

**Consequences.** The pgTAP file explicitly asserts admin sees the expected non-empty tickets for a seeded order (fail-loud on missing grants, per exploration risk #1). If a future non-admin consumer legitimately needs this view, that PR revisits this ADR with concrete RLS evidence rather than pre-emptively escalating now.

---

### ADR-3: Factory shape for `createUseOrderList`

**Context.** The two admin hooks (`useKeyOrders` 106 LOC, `useTechnicalOrders` 104 LOC) diverge on: status union type, return row type, view name, items table name, and query-key factory reference. Everything else — filter handling (search / administrationId / buildingId / status), server-side ILIKE composition, embed selection (`!inner` when scoped-by-building), ordering, and row mapping shape — is byte-identical. Two shapes were considered: (i) a single hook with a discriminator prop; (ii) a factory returning a hook.

**Decision.** Ship the **factory** `createUseOrderList<TStatus extends string, TRow>({ view, itemsTable, queryKeyFn, mapRow })` in `packages/shared/src/hooks/createUseOrderList.ts`. Signature:

```ts
// packages/shared/src/hooks/createUseOrderList.ts
import type { UseQueryResult } from '@tanstack/react-query';

export interface OrderListFilters<TStatus extends string> {
  search?: string;
  status?: TStatus | 'all' | (string & {});
  administrationId?: string;
  buildingId?: string;
}

export interface OrderListSummaryRawRow {
  id: string;
  order_number: string;
  client_type: 'administration' | 'particular';
  administration_id: string | null;
  company_name: string | null;
  particular_full_name: string | null;
  status: string;
  created_at: string;
  // items array present under the configured itemsTable name
  [itemsField: string]: unknown;
}

export interface CreateUseOrderListOptions<TStatus extends string, TRow> {
  /** View name in the public schema (e.g. 'key_orders_summary'). */
  view: string;
  /** Items table name used for embed + building filter (e.g. 'key_order_items'). */
  itemsTable: string;
  /**
   * Query-key factory. MUST be the same reference imported by mutation hooks
   * so invalidation and list caching share one key shape.
   */
  queryKeyFn: (
    status?: string,
    search?: string,
    administrationId?: string,
    buildingId?: string,
  ) => readonly unknown[];
  /** Maps the raw summary row (with typed items array) to the domain row. */
  mapRow: (row: OrderListSummaryRawRow, itemsField: string) => TRow;
}

export function createUseOrderList<TStatus extends string, TRow>(
  options: CreateUseOrderListOptions<TStatus, TRow>,
): (filters?: OrderListFilters<TStatus>) => UseQueryResult<TRow[]>;
```

Rationale for factory over discriminator: (a) return type stays exactly typed per app (no widened union bleeding into consumers); (b) the two status unions differ (`KeyOrderStatus` has 8 values, `TechnicalOrderStatus` has 6) — a discriminator would need conditional types to preserve them; (c) `mapRow` isolates the one truly diverging shape (items array field name) without polluting the factory body.

**Rejected alternative.** A single `useOrderList({ kind: 'key' | 'technical' })` hook. Rejected because the return type would need conditional inference on `kind` and the status filter would need the same, producing a call site harder to consume than the factory.

**Consequences.** Admin hooks collapse to ~15 LOC each: a `createUseOrderList` call with typed options. Future `useClientOrders` reuses the same factory with a `ClientOrderStatus` union, a client-side view name, and a mapper — no third rewrite.

---

### ADR-4: `queryKeyFn` passed by reference (invalidation-drift prevention)

**Context.** Both admin hooks currently import `keyOrdersKey` / `technicalOrdersKey` from `apps/admin/src/lib/queryKeys.ts`. The mutation hooks (`useMutateKeyOrder`, `useMutateTechnicalOrder`) import the same factories to invalidate the exact matching queries. If the factory owned its own key-building logic internally, a future edit to `queryKeys.ts` could silently drift the mutation-side invalidation from the list-side cache key.

**Decision.** The factory **never** builds keys internally. `queryKeyFn` is a required option and callers pass the same reference the mutation hooks use. Concretely:

```ts
// apps/admin/src/hooks/useKeyOrders.ts
import { keyOrdersKey } from '@/lib/queryKeys';
import { createUseOrderList } from '@vitalock/shared';

export const useKeyOrders = createUseOrderList<KeyOrderStatus, KeyOrderListRow>({
  view: 'key_orders_summary',
  itemsTable: 'key_order_items',
  queryKeyFn: keyOrdersKey,               // ← same reference the mutation hook uses
  mapRow: (row, itemsField) => ({ ... }),
});
```

The factory internally calls `queryKeyFn(status, trimmed, administrationId, buildingId)` with the exact same argument order and normalization (`trimmed = search?.trim() ?? ''`) that the current hooks use, so the emitted key shape stays byte-identical to what mutation hooks invalidate today.

**Consequences.** Any future change to the key shape happens in exactly one file (`queryKeys.ts`) and automatically flows to both sides. The snapshot test locks the current shape so a silent renumbering of arguments in `queryKeys.ts` triggers a failing assertion in the list-hook test — the PR author then updates the mutation hook in the same PR.

---

### ADR-5: Migration ordering (atomic commit per slice)

**Context.** Slice A ships a migration + typegen regen + hook rewrite + tests. Following the atomic-commit rule established as ADR-8 in the prior change avoids intermediate commits where the migration disagrees with `database.types.ts`.

**Decision.** Slice A's file list in a single commit, in this order:

1. `supabase/migrations/<timestamp>_technical_order_tickets_view.sql` (forward)
2. `supabase/rollbacks/<timestamp>_technical_order_tickets_view.sql` (paired rollback, non-applied by `supabase db push`)
3. `packages/supabase/src/database.types.ts` regenerated via `pnpm --filter @vitalock/supabase typegen`
4. `apps/admin/src/hooks/useTechnicalOrderTickets.ts` rewritten to single view query
5. `apps/admin/src/hooks/__tests__/useTechnicalOrderTickets.test.ts` updated
6. `supabase/tests/views/technical_order_tickets.sql` (pgTAP)

Slice B has no migration and no typegen; it is a normal TS-only commit.

**Consequences.** Reviewer sees migration + types + hook + tests together. `git bisect` on a hook regression lands on the atomic commit, not on a stale-types intermediate.

---

### ADR-6: Rollback strategy (Slice A)

**Context.** The view is additive; the only rollback failure surface is if a consumer starts calling it, the migration is reverted, and the consumer breaks. Because the slice commits pair migration + hook rewrite, reverting the commit reverts both simultaneously.

**Decision.** Ship a paired rollback file at `supabase/rollbacks/<timestamp>_technical_order_tickets_view.sql`:

```sql
-- Rollback for support.technical_order_tickets view
DROP VIEW IF EXISTS support.technical_order_tickets;
```

Not applied by `supabase db push` (naming convention keeps it out of the main migration stream). `git revert <commit>` restores the previous hook file and typegen simultaneously; combined recovery = revert the commit and apply the rollback SQL.

**Consequences.** No data-loss risk (view is metadata-only). PR review includes reading the one-line rollback.

---

## Component diagram

```
                                packages/shared
                                +----------------------+
                                | hooks/               |
                                |   createUseOrderList.ts   <── Slice B
                                |   useConfigureTechnical...(unchanged)
                                | errors/              |
                                |   toastMutationError.ts   (unchanged)
                                +-----------+----------+
                                            |
                                            v
                     apps/admin/src/hooks
                     +---------------------------------------+
                     | useKeyOrders.ts        (thin wrapper) |  <── Slice B
                     | useTechnicalOrders.ts  (thin wrapper) |  <── Slice B
                     | useTechnicalOrderTickets.ts           |  <── Slice A
                     |   .schema('support').from(            |
                     |     'technical_order_tickets')        |
                     +---------------------------------------+
                                            |
                              packages/supabase/src/database.types.ts
                              (regen in Slice A only)
                                            |
                                            v
                     Postgres
                     +---------------------------------------+
                     | support.technical_order_tickets  <──  Slice A
                     | support.installer_tickets_with_context (unchanged)
                     | public.key_orders_summary             (unchanged)
                     | public.technical_orders_summary       (unchanged)
                     +---------------------------------------+

Dependency order:  Slice A ──┐  (independent)
                             │
                   Slice B ──┘  (independent, TS-only)
```

Both slices are mutually independent — no shared file, no ordering constraint.

---

## Data model changes

### Slice A — View `support.technical_order_tickets`

```sql
-- ============================================================
-- Cross-schema view: support.technical_order_tickets
-- ============================================================
-- Collapses the two-step read in
--   apps/admin/src/hooks/useTechnicalOrderTickets.ts
-- (public.technical_order_items → support.tickets)
-- into one round-trip keyed on technical_order_id.
--
-- SECURITY INVOKER: admin already has SELECT on both
-- public.technical_order_items and support.tickets (proven by
-- the current two-step read). Installer has no legitimate use
-- case for this admin surface; INVOKER naturally scopes them
-- to whatever support.tickets RLS already allows them to see.

CREATE OR REPLACE VIEW support.technical_order_tickets
WITH (security_invoker = true) AS
SELECT
  t.id,
  t.ticket_number,
  t.category,
  t.status,
  t.description,
  t.technical_order_item_id,
  t.assigned_to_staff_id,
  t.created_at,
  t.resolved_at,
  toi.order_id AS technical_order_id
FROM support.tickets t
LEFT JOIN public.technical_order_items toi
  ON toi.id = t.technical_order_item_id;

GRANT SELECT ON support.technical_order_tickets TO authenticated;
```

**Projected columns**: exactly the nine columns the current hook selects from `support.tickets`, plus the derived `technical_order_id` from `public.technical_order_items`. No wildcard SELECT — every column is enumerated so future column additions on `support.tickets` do not silently widen the exposed surface.

**LEFT JOIN vs INNER JOIN**: LEFT JOIN preserves tickets whose linked item was soft-deleted or is otherwise unreadable under RLS; those rows surface with `technical_order_id = NULL` and the caller's `.eq('technical_order_id', orderId)` filter naturally excludes them. INNER JOIN would drop the same rows silently but couples read semantics to the item table's presence — LEFT JOIN + client filter is the more conservative choice and matches the pattern used in `installer_tickets_with_context`.

**No trigger, no index**: the view exposes existing indexed columns; `technical_order_items(id)` is the PK and `support.tickets(technical_order_item_id)` already has an index (existing production schema).

### Slice A — Rollback SQL

```sql
-- supabase/rollbacks/<timestamp>_technical_order_tickets_view.sql
DROP VIEW IF EXISTS support.technical_order_tickets;
```

### Slice B — No migration, no typegen

Slice B is TS-only. `packages/supabase/src/database.types.ts` is not touched by Slice B; the factory operates on the existing `key_orders_summary` / `technical_orders_summary` types already generated by the prior change.

---

## Interface changes

### Slice A

**Hook rewrite** — `apps/admin/src/hooks/useTechnicalOrderTickets.ts`. Public signature unchanged; internal body collapses from two sequential queries to one:

```ts
export function useTechnicalOrderTickets(orderId: string | undefined) {
  return useQuery({
    queryKey: ['admin', 'technical-orders', orderId ?? '', 'tickets'],
    enabled: Boolean(orderId),
    queryFn: async (): Promise<TechnicalOrderTicketRow[]> => {
      if (!orderId) return [];
      const { data, error } = await supabase
        .schema('support')
        .from('technical_order_tickets')
        .select(
          'id, ticket_number, category, status, description, technical_order_item_id, assigned_to_staff_id, created_at, resolved_at',
        )
        .eq('technical_order_id', orderId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as TechnicalOrderTicketRow[];
    },
  });
}
```

The exported `TechnicalOrderTicketRow` interface is unchanged, so the three call sites in `apps/admin/src/routes/servicio-tecnico/TechnicalOrderDetailPage.tsx` need no edits.

**Typegen impact.** `packages/supabase/src/database.types.ts` regenerates and adds an entry under `support.Views.technical_order_tickets` with the nine projected columns plus `technical_order_id`. The only consumer of the new type is the admin hook rewrite in the same commit — no other file references the new view.

### Slice B

**New file** — `packages/shared/src/hooks/createUseOrderList.ts` exports the factory per ADR-3.

**Barrel update** — `packages/shared/src/hooks/index.ts` gains `export * from './createUseOrderList';`. `packages/shared/src/index.ts` already re-exports from `./hooks`.

**Admin hook rewrites** — `apps/admin/src/hooks/useKeyOrders.ts` and `apps/admin/src/hooks/useTechnicalOrders.ts` collapse to thin factory consumers. What stays app-side:

- Exported types: `KeyOrderStatus`, `KeyOrderListRow`, `UseKeyOrdersFilters` (and the technical equivalents) — these are the public contract for pages and mutation hooks.
- The `mapRow` implementation — this is where each app translates the raw summary row into its domain row shape (specifically the `administrations: { company_name } | null` reconstruction and the `items` field renaming).
- The `queryKeyFn` reference — imported from `@/lib/queryKeys` per ADR-4.

What moves into the factory:

- The `useQuery` boilerplate.
- Filter handling (search / status / administrationId / buildingId) — all handled server-side via `.eq` / `.ilike` / `.or` composition.
- Embed selection (`itemsTable!inner(id,building_id)` when scoped by building, `itemsTable(id)` otherwise).
- Server-side ILIKE composition (`escapeIlikeValue` + the three-column `.or()` clause).
- `created_at` desc ordering.

**Public signatures.** `useKeyOrders` and `useTechnicalOrders` retain their existing exported shapes — same filter interface, same return type. No page or route file changes.

---

## Testing strategy

### Slice A

**pgTAP** — `supabase/tests/views/technical_order_tickets.sql`. Scenarios:

1. **Happy path (admin)**: seed a technical order with 2 items and 3 tickets (2 linked to item A, 1 to item B). Assert admin `SELECT ... FROM support.technical_order_tickets WHERE technical_order_id = <order>` returns exactly 3 rows in `created_at ASC` order.
2. **Empty order**: seed a technical order with 0 items. Assert admin query returns `[]`.
3. **RLS visibility (admin)**: assert admin sees ticket rows even when the linked item was created by a different actor — proves the SELECT grant on `public.technical_order_items` under INVOKER is sufficient. Fail-loud on missing grants (per exploration risk #1).
4. **Cross-order isolation**: seed two orders with distinct item and ticket sets; assert `.eq('technical_order_id', order1.id)` returns only order1's tickets.

Installer-role coverage is intentionally omitted per ADR-2 — installer has no legitimate use case for this view. If a future consumer proposes installer access, that PR adds the coverage.

**Vitest** — `apps/admin/src/hooks/__tests__/useTechnicalOrderTickets.test.ts`. Rewrites the mocked-supabase harness from a two-query mock (`from('technical_order_items')` chained with `from('tickets')`) to a single-query mock on `.schema('support').from('technical_order_tickets').eq('technical_order_id', ...)`. Cases: (1) success with N tickets → returns the mapped rows; (2) empty result → returns `[]`; (3) supabase error → throws.

### Slice B

**Factory unit tests** — `packages/shared/src/hooks/__tests__/createUseOrderList.test.ts`. Scenarios:

1. **Filter → query translation**: for each filter combination (search-only, status-only, admin-only, building-only, all-four, none), assert the mocked supabase client received the expected chain of `.eq` / `.ilike` / `.or` calls and the correct embed string.
2. **Snapshot test on `queryKeyFn` invocation**: assert the factory calls `queryKeyFn` with the exact argument tuple `(status, trimmed, administrationId, buildingId)` — locks the invalidation contract at the boundary between factory and app-side key factory.
3. **`mapRow` invocation**: assert the factory calls `mapRow` once per row with `(row, itemsField)` — locks the callback contract.
4. **Empty result**: mocked supabase returns `[]` → hook returns `[]` without calling `mapRow`.

**Admin snapshot tests** — `apps/admin/src/hooks/__tests__/useKeyOrders.test.ts` and `useTechnicalOrders.test.ts`. Each file gains one snapshot assertion:

```ts
expect(keyOrdersKey('draft', 'foo', 'admin-1', 'bld-1'))
  .toMatchInlineSnapshot(`["admin", "key-orders", "draft", "foo", "admin-1", "bld-1"]`);
```

The snapshot lives on the imported key factory (not on the hook itself) so it fails loudly if any future edit to `queryKeys.ts` changes the shape — forcing the mutation hook to update in the same PR. Existing filter-translation assertions in each admin hook test migrate to the factory-level tests.

---

## Risks and Mitigations

### Risk 1 — `GRANT SELECT on public.technical_order_items` for admin under `SECURITY INVOKER`

**Surface.** If the admin role's grant on `public.technical_order_items` is missing (or revoked in a future migration), the LEFT JOIN silently returns rows with `technical_order_id = NULL` and the `.eq` filter drops them — the hook returns `[]` instead of raising.

**Mitigation.** pgTAP scenario 1 (happy path) explicitly asserts a non-empty result under admin credentials for a seeded order. The test fails loudly rather than passing with `[]`. If the grant is ever revoked, the pgTAP suite catches it before merge. Additionally, the exploration confirmed the current two-step admin read works today — which is direct empirical evidence that the grant exists — so this risk is "guard against future regression", not "unknown current state".

### Risk 2 — TypeGen ordering if both slices land near each other

**Surface.** Slice A regenerates `packages/supabase/src/database.types.ts` (adds `support.Views.technical_order_tickets`). Slice B does not. If both slices land in the same PR branch and a developer regenerates types after Slice B lands but before Slice A's migration is applied to their local DB, the regen wipes the Slice A view type and Slice A's hook rewrite stops compiling.

**Mitigation.** Two independent PRs (as recommended in the proposal) with atomic commits per slice (ADR-5). Slice A's typegen ships in the same commit as its migration. Slice B never touches `database.types.ts`. If both slices are combined into a single branch, the tasks phase specifies a single `typegen` step after Slice A's migration is applied, and Slice B's commits explicitly do not include the types file — CI catches any accidental regen.

### Risk 3 — Factory generics complexity at the call site

**Surface.** The factory signature uses two generic parameters (`TStatus`, `TRow`) plus a `mapRow` callback whose row-type is discriminated by `itemsTable`. TypeScript inference may fail to narrow `TRow` from `mapRow`'s return type in some configurations, producing confusing errors.

**Mitigation.** Call sites use **explicit generic instantiation**: `createUseOrderList<KeyOrderStatus, KeyOrderListRow>({ ... })`. This is documented in the factory's TSDoc and mirrored in the two admin hook rewrites so future consumers (including `useClientOrders`) copy the pattern. The factory unit tests exercise the exact call-site shape with both admin variants, catching any regression in the exported types.

---

## Out of scope (recap)

- No cross-app twin extraction beyond the two admin hooks in Slice B.
- No new `packages/hooks` package — the factory lives under existing `packages/shared/src/hooks/`.
- No changes to `useAssignedTickets`'s residual enrichment queries (equipment_update snapshots, product names) — orthogonal to ticket-stitching and stay as-is.
- No changes to auth, RLS grammars, `PGRST_DB_SCHEMAS`, or the exposed schema list.
- No installer-role coverage on `support.technical_order_tickets` (ADR-2 — no legitimate use case; revisit if one materializes).
- No `clients`-app scaffolding — Slice B only makes the future reuse trivial; it does not add the third consumer.

## Delivery order

Two independent PRs, no ordering constraint:

```
Slice A (support.technical_order_tickets view + hook rewrite + pgTAP)   ──┐
                                                                          ├── merge in any order
Slice B (createUseOrderList factory + admin twin rewrites)              ──┘
```

Recommended: Slice B first (pure TS, unblocks the future `clients` app immediately, zero server surface), then Slice A (closes the AP-1…AP-6 story). But either order is safe.
