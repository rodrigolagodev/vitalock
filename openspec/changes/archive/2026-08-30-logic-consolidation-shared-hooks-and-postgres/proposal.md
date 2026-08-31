# SDD Proposal: logic-consolidation-shared-hooks-and-postgres

## Intent

Business logic in Vitalock is currently scattered between the `admin` and `installer` React apps, and a meaningful portion of it runs as browser-orchestrated multi-query sequences that belong in Postgres. The user is preparing to add a third app (`clients`), and the current shape guarantees a third duplicate of hooks like `mapMutationError` and a third caller for non-atomic write sequences such as `createAndAssignEquipment`. This change addresses both frentes as one logical unit: (1) extract genuine cross-app duplication into `packages/shared`, and (2) migrate browser orchestration anti-patterns into Postgres views and RPCs so all current and future apps consume the same server surface. Delivery is intentionally sliced so each frente can be reviewed independently, but the intent is a single consolidation effort.

## Scope

### In scope

- **Shared TS extraction** into `packages/shared/src/errors/`:
  - `mapMutationError` — extract skeleton to `toastMutationError.ts`; each app provides `extraHandlers` for app-scoped messages.
  - `useConfigureTechnicalTicketEquipment` — extract as a `createUseConfigureTechnicalTicketEquipment(options)` factory; each app supplies `onSuccess` invalidation, `staffId` source, and toast copy.
- **New Postgres RPCs** (`supabase/migrations/` + `packages/supabase/src/rpc/tickets.ts` + typegen):
  - `public.create_and_assign_equipment(p_ticket_id, p_building_id, p_serial, p_model, p_description, p_access_type) RETURNS uuid` — resolves AP-1 (non-atomic write, data integrity defect).
  - `public.complete_authorizations(p_install_ids, p_remove_ids, p_staff_id, p_timestamp)` — resolves AP-4 (non-atomic batch).
- **New Postgres views**:
  - `public.key_orders_summary` and `public.technical_orders_summary` — resolve AP-2 (N+1 buildingId filter) and AP-3 (client-side `company_name` filter), including `pg_trgm` GIN index for ILIKE.
  - Cross-schema view joining `support.tickets` + `public.buildings` + `public.administrations` — resolves AP-5 (installer stitching in `useAssignedTickets` and `useTicketHistory`).
- **Consumer rewrites** for every hook whose server surface changes.
- **Regen** of `packages/supabase/src/database.types.ts` in the same slice as its migration.
- **Test updates**: existing vitest suites migrate to new import paths / new server shapes; new pgTAP tests for both RPCs; new hook tests for `useMutateTicketEquipment` and `useCompleteAuthorizations` (both currently uncovered).

### Not in scope

- No Hono, Node, Deno, or Cloudflare Workers backend service. This change stays PostgREST + RPCs.
- No new `packages/hooks` package. Extractions live under the existing `packages/shared/src/errors/` structure.
- `useKeyOrders` and `useTechnicalOrders` intra-admin twin extraction is deferred as lower priority; only the AP-2 / AP-3 fixes land now.
- `useTechnicalOrderTickets` (AP-6) is deferred; the same cross-schema view pattern in slice F can pick it up in a later change if needed.
- No changes to auth, routing, RLS grammars, or PostgREST configuration.

## Approach

Approach 1 from exploration: **incremental, frente-by-frente**, chained. Each slice is independently reviewable and stays within the 800 LOC review budget. AP-1 is prioritized because it is a data-integrity defect (orphaned equipment on failed second write), not just perf debt.

### Slice forecast

| # | Slice | Type | Migration | TypeGen | Independent? |
|---|---|---|---|---|---|
| A | `mapMutationError` → `@vitalock/shared` | TS-only | No | No | Yes |
| B | `useConfigureTechnicalTicketEquipment` factory | TS-only | No | No | Yes |
| C | RPC `create_and_assign_equipment` (AP-1) | Migration + hook | Yes | Yes | Yes |
| D | Views `key_orders_summary` + `technical_orders_summary` (AP-2 + AP-3) | Migration + hooks | Yes | Yes | Yes |
| E | RPC `complete_authorizations` (AP-4) | Migration + hook | Yes | Yes | Yes |
| F | Cross-schema view for installer tickets (AP-5) | Migration + hooks | Yes | Yes | Yes |

Slices A and B are pure TypeScript and unblock any future third app immediately. Slices C–F each combine one migration + typegen regen + hook rewrite + tests in a single atomic commit so `database.types.ts` and its consumers never drift.

### Rationale

- **Why not Approach 2** (client-side only): leaves AP-1 as an unresolved data-integrity hole. Unacceptable given the user identified this consolidation as a priority.
- **Why not Approach 3** (all at once): 600–800 LOC of mixed TS and migration diff over one PR mixes review contexts (SQL + RLS + TS + typegen), and any single blocker stalls the entire consolidation.
- **Why Approach 1**: each slice has a narrow failure surface, TypeGen regen is contained per slice, rollback is per slice, and the AP-1 integrity fix can ship without waiting on view design.

## Success Criteria

- `mapMutationError` and `useConfigureTechnicalTicketEquipment` no longer live in both `apps/admin/src/hooks/` and `apps/installer/src/hooks/`.
- All six in-scope anti-patterns (AP-1 through AP-5, plus AP-3 which pairs with AP-2) are resolved by a Postgres view or RPC, and their consumer hooks call that server surface instead of orchestrating in JS.
- The existing vitest suite (~600 tests across the monorepo) passes.
- New pgTAP tests exist for `create_and_assign_equipment` and `complete_authorizations`, each covering happy path plus RLS with both installer and admin roles.
- New vitest coverage exists for `useMutateTicketEquipment` and `useCompleteAuthorizations` (written **before** the refactor in each slice).
- `packages/supabase/src/database.types.ts` reflects every new RPC and view, and no consumer imports a stale type.
- The Verify phase confirms no new failure modes (equipment orphaning on partial failure, RLS bypass through new views, or missing invalidation keys after factory extraction).

## Risks and Mitigations

- **RLS on new RPCs**. `create_and_assign_equipment` requires INSERT on `operations.equipment` and UPDATE on `support.tickets` for the calling role; `complete_authorizations` requires UPDATE on the authorizations table for the installer role. *Mitigation*: pgTAP tests explicitly exercise both installer and admin roles per RPC before merge.
- **`SECURITY DEFINER` on the cross-schema view**. If `INVOKER` cannot satisfy RLS across `support` → `public`, `DEFINER` is required, but that widens the trust boundary. *Mitigation*: default to `INVOKER`; only escalate to `DEFINER` with an explicit documented justification in the design phase, and constrain the view's SELECT list to columns that are safe under the callers' existing RLS.
- **TypeGen regen breaks compilation**. If migration ships without `database.types.ts` regen and hook rewrite in the same commit, downstream apps stop compiling. *Mitigation*: migration + typegen + hook rewrite + tests are one atomic commit per slice.
- **Uncovered mutation hooks**. `useMutateTicketEquipment` and `useCompleteAuthorizations` have no existing tests, so a silent behavioral regression would slip through. *Mitigation*: write the test **first** in slices C and E, then refactor against it.
- **Factory extraction changes invalidation semantics**. If the `createUseConfigureTechnicalTicketEquipment` factory drops or renames a query key that either app depended on, the UI silently stales. *Mitigation*: the factory takes `onSuccess` as an option so each app keeps its exact invalidation set; a snapshot test asserts each app's invalidation payload.

## Out of Scope / Non-Goals

- No Hono, Node, Deno, or Cloudflare Workers backend service.
- No new `packages/hooks` package — extractions live in `packages/shared/src/errors/`.
- No refactor of admin's `useKeyOrders` / `useTechnicalOrders` beyond fixing AP-2 and AP-3. The intra-admin twin extraction (candidate C in exploration) is deferred.
- No fix for AP-6 (`useTechnicalOrderTickets`) in this change; a later change can extend slice F's cross-schema view pattern.
- No changes to auth, routing, RLS grammars, or PostgREST configuration.

## Delivery Strategy

Recommended: `auto-chain` across the six slices. Six migrations + hook rewrites is too many for a single PR under an 800 LOC review budget, and the slices have a natural ordering (A → B unblock any future third app immediately; C is the integrity priority; D–F clear the read-path debt). The tasks phase will produce the definitive per-slice LOC forecast and may collapse or split slices if the numbers demand it. If any slice exceeds the review budget on forecast, the tasks phase should split it rather than compress review.
