# SDD Proposal: consolidation-ap6-and-admin-order-twins

## Intent

The prior change `logic-consolidation-shared-hooks-and-postgres` (archived 2026-08-30) resolved AP-1 through AP-5 but deliberately deferred two lower-priority items: AP-6 (`useTechnicalOrderTickets` two-step sequential read) and the intra-admin twin extraction of `useKeyOrders` / `useTechnicalOrders`. Both live entirely inside `apps/admin`, so they were correctly parked while the multi-app consolidation and data-integrity fixes shipped. With that foundation in place — and the `clients` app on the roadmap — the residual duplication now blocks the same pattern from being cleanly reused a third time. This change closes those two gaps as one small, tightly scoped follow-up: (1) push the AP-6 stitching into Postgres using the same cross-schema view pattern proven in slice F of the prior change, and (2) collapse the admin order-list twins into a shared factory that a future `useClientOrders` can consume without a third rewrite.

## Scope

### In scope

- **Slice A — AP-6 cross-schema view** (`supabase/migrations/` + regen + hook rewrite + tests):
  - New Postgres view `support.technical_order_tickets` (`SECURITY INVOKER`) that JOINs `support.tickets` with `public.technical_order_items` and exposes `toi.order_id AS technical_order_id`. Sibling to the existing `support.installer_tickets_with_context`.
  - Rewrite of `apps/admin/src/hooks/useTechnicalOrderTickets.ts` to a single `.schema('support').from('technical_order_tickets').eq('technical_order_id', orderId)` round-trip, replacing the current two-step (`technical_order_items` → `.in(...)` on `support.tickets`) sequence.
  - Typegen regen of `packages/supabase/src/database.types.ts` in the same commit as the migration.
  - Rollback SQL under `supabase/rollbacks/` mirroring the migration filename.
  - pgTAP test at `supabase/tests/views/technical_order_tickets.sql` covering admin RLS (admin sees own order's tickets; empty `order_id` returns []).
  - Vitest update to `apps/admin/src/hooks/__tests__/useTechnicalOrderTickets.test.ts` against the new server shape.

- **Slice B — Admin order-list twins factory** (TS-only, no migration, no typegen):
  - New `packages/shared/src/hooks/createUseOrderList.ts` exposing `createUseOrderList<TStatus, TRow>({ view, itemsTable, queryKeyFn, mapRow })`.
  - Rewrite of `apps/admin/src/hooks/useKeyOrders.ts` and `apps/admin/src/hooks/useTechnicalOrders.ts` as thin factory consumers.
  - `queryKeyFn` passed **by reference** from `apps/admin/src/lib/queryKeys` so mutation hooks (`useMutateKeyOrder`, `useMutateTechnicalOrder`) invalidate the exact same key shape — no drift.
  - Export from `packages/shared/src/hooks/index.ts`.
  - Vitest for the factory itself, plus a snapshot test in each admin hook's existing test file to lock the invalidation key payload.

### Not in scope

- No admin/installer twin extraction beyond these two admin hooks.
- No new `packages/hooks` package. The factory lives under the existing `packages/shared/src/hooks/` directory (consistent with prior consolidation).
- No changes to auth, RLS grammars, PostgREST config, or `PGRST_DB_SCHEMAS`.
- No consumer changes beyond the two admin hooks in Slice B and the one in Slice A.
- No enrichment-query consolidation in `useAssignedTickets` — those residual side-loads (equipment_update snapshots, product names) are intentionally orthogonal to the ticket-stitching view and stay as-is.

## Approach

Incremental, slice-by-slice, mirroring the prior change's proven cadence. Both slices are **fully independent** — no ordering dependency, no shared file touched by both — so they can ship in either order or on parallel feature branches. Each slice is small enough to stay well under any review budget and each has a narrow blast radius.

### Slice forecast

| # | Slice | Type | Migration | TypeGen | Independent? | Est. LOC |
|---|---|---|---|---|---|---|
| A | `support.technical_order_tickets` view + hook rewrite (AP-6) | Migration + hook | Yes | Yes | Yes | ~130 |
| B | `createUseOrderList` factory + admin twin rewrites | TS-only | No | No | Yes | ~150 |

Slice A follows the exact pattern of slice F from the prior change (cross-schema `INVOKER` view + hook collapse + pgTAP), so risk is contained by precedent. Slice B is pure TypeScript, unblocks the future `clients` app immediately, and requires no server surface changes.

### Rationale

- **Why now**: the `clients` app is on the roadmap. Shipping Slice B before the third consumer exists means `useClientOrders` can be written directly against the factory instead of being a third rewrite. Shipping Slice A now completes the AP-1…AP-6 cleanup as one coherent story rather than leaving one loose end.
- **Why sibling view (Slice A) and not extending `installer_tickets_with_context`**: the installer view is scoped to `building/administration` context for the installer's RLS; AP-6 needs a `technical_order_items` JOIN keyed on `order_id` for admin. Different join key, different consumers, different RLS surface — a sibling view is cleaner than overloading the existing one.
- **Why factory-by-options and not a shared hook with a discriminator (Slice B)**: the two hooks diverge on return type, status union, view name, items table name, and query-key factory. A generic factory with typed options lets each app keep exact typing while eliminating the boilerplate. Passing `queryKeyFn` by reference guarantees the mutation hooks invalidate the same shape.

## Success Criteria

- `apps/admin/src/hooks/useTechnicalOrderTickets.ts` performs exactly one Supabase round-trip (down from two).
- New Postgres view `support.technical_order_tickets` exists with `SECURITY INVOKER` and is exercised by pgTAP for admin RLS (positive case + empty-order case).
- `packages/supabase/src/database.types.ts` reflects the new view in the same commit as the migration; no consumer imports a stale type.
- Rollback SQL for Slice A exists under `supabase/rollbacks/`.
- `packages/shared/src/hooks/createUseOrderList.ts` exists and is exported from the package index.
- `apps/admin/src/hooks/useKeyOrders.ts` and `apps/admin/src/hooks/useTechnicalOrders.ts` are thin factory consumers with no duplicated query-building logic between them.
- Each admin hook's test file includes a snapshot asserting the exact `queryKey` array shape, so any future drift with mutation invalidation is caught at test time.
- The existing vitest suite passes; new factory unit tests pass; new pgTAP test passes.
- Verify phase confirms no regression in: admin ticket listing on the technical-order detail page, key-order list filtering (search/status/administration/building), and technical-order list filtering with the same filters.

## Risks and Mitigations

- **RLS on the new view (Slice A)**. `SECURITY INVOKER` requires the admin role to have SELECT on `public.technical_order_items` as well as `support.tickets`. If the grant is missing, the JOIN silently returns zero rows. *Mitigation*: pgTAP test explicitly asserts admin sees the expected non-empty result set for a seeded order; the test fails loudly rather than passing with `[]`.
- **TypeGen drift (Slice A)**. If the migration ships without regenerating `database.types.ts` in the same commit, the hook rewrite either won't compile or references a stale shape. *Mitigation*: migration + typegen + hook rewrite + tests are one atomic commit, as in the prior change's slices C–F.
- **Invalidation key drift (Slice B)**. The factory receives `queryKeyFn` by reference, but a future edit to `queryKeys.ts` could still change the key shape without updating the mutation hooks. *Mitigation*: the two admin hook test files include a snapshot test on the exact `queryKey` array; any shape change fails the snapshot and forces the mutation hook to be updated in the same PR.

## Out of Scope / Non-Goals

- No admin/installer cross-app twin extraction beyond these two admin hooks.
- No new `packages/hooks` package.
- No changes to `useAssignedTickets`'s residual enrichment queries (equipment_update snapshots, product names via `technical_order_items → products`) — they are orthogonal to ticket-stitching and stay as-is.
- No changes to auth, RLS grammars, PostgREST config, or the exposed schemas list.
- No new server surface beyond the one view in Slice A.
- No `clients`-app scaffolding — Slice B only makes future reuse trivial; it does not add the third consumer.

## Delivery Strategy

Recommended: two independent PRs, one per slice, no ordering constraint. Both slices are well under any review budget and neither touches the other's files. The tasks phase will confirm per-slice LOC and may split Slice A if the pgTAP + rollback + migration + hook rewrite happen to exceed the forecast, but current estimates leave ample headroom.
