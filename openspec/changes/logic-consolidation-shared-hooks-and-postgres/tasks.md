# Tasks: logic-consolidation-shared-hooks-and-postgres

## Guard lines

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
Budget risk: High total (≈910 LOC); each individual slice is within the 400-line budget

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~910 LOC total |
| 400-line budget risk (per slice) | Low–Medium per slice; High for total |
| 800-line budget risk (per slice) | Low per slice |
| Chained PRs recommended | Yes |
| Suggested split | PR A → PR B → PR C → PR D → PR E → PR F |
| Delivery strategy | ask-on-risk |
| Chain strategy | feature-branch-chain |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: High
800-line budget risk: Low

### Chain topology

- PR A bases on: `feat/logic-consolidation` tracker branch
- PR B bases on: PR A branch
- PR C bases on: PR B branch
- PR D bases on: PR C branch
- PR E bases on: PR D branch
- PR F bases on: PR E branch
- Tracker `feat/logic-consolidation` merges to `main` last

### Estimated changed lines per slice

- Slice A: ~180 LOC (new shared file + delete 2 + update ~73 import lines)
- Slice B: ~90 LOC (new factory file + new shared test + update 2 app tests + collapse 2 app hooks)
- Slice C: ~175 LOC (forward migration + rollback + pgTAP + typegen delta + RPC wrapper + hook rewrite + 2 vitest cases)
- Slice D: ~155 LOC (forward migration + rollback + pgTAP + typegen delta + 2 hook rewrites + 2 test updates)
- Slice E: ~160 LOC (forward migration + rollback + pgTAP + typegen delta + RPC wrapper + hook rewrite + 4 vitest cases)
- Slice F: ~150 LOC (forward migration + rollback + pgTAP + typegen delta + 2 hook rewrites + 2 test updates)

Total: ~910 LOC

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| Slice A | Shared error mapper extracted | PR A | `pnpm --filter @vitalock/shared test` | N/A — pure TS, no migration | Delete `toastMutationError.ts`; restore both `mapMutationError.ts` copies; revert imports |
| Slice B | Equipment factory extracted | PR B | `pnpm --filter @vitalock/shared test && pnpm --filter @vitalock/admin test && pnpm --filter @vitalock/installer test` | N/A — pure TS, no migration | Delete factory file; restore both app hook copies |
| Slice C | Atomic `create_and_assign_equipment` RPC | PR C | `pnpm --filter @vitalock/admin test -- useMutateTicketEquipment` + pgTAP | `supabase test db` | Rollback SQL script + `git revert <commit>` |
| Slice D | Order summary views (AP-2 + AP-3) | PR D | `pnpm --filter @vitalock/admin test -- useKeyOrders useOrders` + pgTAP | `supabase test db` | Rollback SQL script + `git revert <commit>` |
| Slice E | Atomic `complete_authorizations` RPC | PR E | `pnpm --filter @vitalock/installer test -- useCompleteAuthorizations` + pgTAP | `supabase test db` | Rollback SQL script + `git revert <commit>` |
| Slice F | Cross-schema installer tickets view | PR F | `pnpm --filter @vitalock/installer test -- useAssignedTickets useTicketHistory` + pgTAP | `supabase test db` | Rollback SQL script + `git revert <commit>` |

---

## Slice A — Shared `mapMutationError` extraction

> TS-only. No migration. No typegen. Satisfies REQ-SHARED-ERROR-1.

- [x] A.1 **Preflight**: Read `apps/admin/src/hooks/mapMutationError.ts` and `apps/installer/src/hooks/mapMutationError.ts`; confirm the four P0001 substrings from ADR-5 (`configure_key`, `create_order`, `replace`, `record_order_key_pickup`) are present; confirm admin covers SQLSTATE `23503` and installer does not.
  - Acceptance: findings match ADR-5; no undocumented SQLSTATE branches exist in either file.

- [x] A.2 **Preflight**: Run `rg --files-with-matches "mapMutationError"` under `apps/admin/src` and `apps/installer/src`; count callers.
  - Acceptance: count matches ~73 total callers per REQ-SHARED-ERROR-1 req 6.

- [x] A.3 **Create shared module**: Create `packages/shared/src/errors/toastMutationError.ts` implementing `toastMutationError(err, opts?)` per ADR-6 signature; include all six SQLSTATE branches + P0001 ordered list + unknown-SQLSTATE fallback; export `ExtraHandler`, `ExtraHandlersMap`, `ToastMutationErrorOptions`.
  - Acceptance: module compiles; no `sonner` import inside the file.

- [x] A.4 **Re-export**: Add `export * from './toastMutationError';` to `packages/shared/src/errors/index.ts`.
  - Acceptance: `import { toastMutationError } from '@vitalock/shared'` resolves.

- [x] A.5 **Write shared test (RED → GREEN)**: Create `packages/shared/src/errors/__tests__/toastMutationError.test.ts` with nine vitest test cases covering REQ-SHARED-ERROR-1.1 through REQ-SHARED-ERROR-1.9. Write all tests before running — they must fail first (RED), then pass after A.3 is complete (GREEN).
  - Acceptance: all nine scenarios pass; `mapMutationError` is not imported anywhere in the file.

- [x] A.6 **Delete app copies**: Delete `apps/admin/src/hooks/mapMutationError.ts` and `apps/installer/src/hooks/mapMutationError.ts`.
  - Acceptance: files are absent; `git status` shows two deletions.

- [x] A.7 **Update callers — admin**: Update all ~60 admin callers in `apps/admin/src/hooks/` to `import { toastMutationError } from '@vitalock/shared'`; replace `mapMutationError(error)` calls with `toastMutationError(error, adminExtraHandlers)` where `adminExtraHandlers` covers admin-only `23505` cases (`units_one_admin_per_building`, `administrations_tax_id_key`, `orders_order_number`, `particulares`) per ADR-6.
  - Acceptance: `pnpm --filter @vitalock/admin tsc --noEmit` passes.

- [x] A.8 **Update callers — installer**: Update all ~13 installer callers in `apps/installer/src/hooks/` to `import { toastMutationError } from '@vitalock/shared'`; replace `mapMutationError(error)` calls with `toastMutationError(error)` (no extra handlers needed for installer subset).
  - Acceptance: `pnpm --filter @vitalock/installer tsc --noEmit` passes (pre-existing TS errors in TaskDetailPage.test.tsx are unrelated to Slice A).

- [x] A.9 **Migrate or delete app-level test files**: Migrate `apps/admin/src/hooks/__tests__/mapMutationError.test.ts` and `apps/installer/src/hooks/__tests__/mapMutationError.test.ts` — delete if the nine shared scenarios fully cover their cases, or update imports if app-specific scenarios remain.
  - Acceptance: no test file imports from a deleted `mapMutationError.ts`.

- [x] A.10 **Verification**: Run `pnpm test`, `pnpm typecheck`, `pnpm build` from monorepo root.
  - Acceptance: all tests green; no reference to deleted files; installer build blocked by pre-existing TS errors in TaskDetailPage.test.tsx (not introduced by Slice A — confirmed via git stash).

- [ ] A.11 **Delivery**: Commit `feat(shared): extract toastMutationError to @vitalock/shared [slice-A]`; push to PR A branch targeting `feat/logic-consolidation`.

---

## Slice B — `useConfigureTechnicalTicketEquipment` factory

> TS-only. No migration. No typegen. Satisfies REQ-SHARED-CONFIG-EQUIP-1. Depends on Slice A.

- [x] B.1 **Preflight**: Read `apps/admin/src/hooks/useConfigureTechnicalTicketEquipment.ts` and `apps/installer/src/hooks/useConfigureTechnicalTicketEquipment.ts`; confirm `mutationFn` is byte-for-byte identical; document the differing `onSuccess` invalidation keys for each app.
  - Acceptance: findings match ADR-7; both files call `configureTechnicalTicketEquipment` from `@vitalock/supabase/rpc/tickets`.

- [x] B.2 **Create `packages/shared/src/hooks/` subpath**: Create directory with `index.ts`; add `export * from './hooks';` to `packages/shared/src/index.ts`.
  - Acceptance: `pnpm --filter @vitalock/shared build` succeeds with the new barrel.

- [x] B.3 **Create factory**: Create `packages/shared/src/hooks/useConfigureTechnicalTicketEquipment.ts` implementing `createUseConfigureTechnicalTicketEquipment(opts)` per ADR-7 signature; no `useAuthContext`; no hardcoded query keys.
  - Acceptance: factory compiles; `useQueryClient` is not called inside the factory.

- [x] B.4 **Write shared factory test (RED → GREEN)**: Create `packages/shared/src/hooks/__tests__/useConfigureTechnicalTicketEquipment.test.ts` with two vitest cases for REQ-SHARED-CONFIG-EQUIP-1.1 and REQ-SHARED-CONFIG-EQUIP-1.2. Write tests before implementing — RED first.
  - Acceptance: both scenarios pass after B.3 is complete.

- [x] B.5 **Rewrite admin hook**: Collapse `apps/admin/src/hooks/useConfigureTechnicalTicketEquipment.ts` to a 3-line factory call passing admin `onSuccess` (invalidates `tareasKey()` + `['admin', 'tarea', vars.ticketId]`) and `mapMutationError` with admin extra handlers.
  - Acceptance: file is ≤10 lines; no `useMutation` boilerplate.

- [x] B.6 **Rewrite installer hook**: Collapse `apps/installer/src/hooks/useConfigureTechnicalTicketEquipment.ts` to a factory call passing installer `onSuccess` (invalidates `assignedTicketsKey(staffId)`) and `mapMutationError`.
  - Acceptance: file is ≤10 lines.

- [x] B.7 **Update admin hook test**: Update `apps/admin/src/hooks/__tests__/useConfigureTechnicalTicketEquipment.test.ts` to assert `tareasKey()` and `['admin', 'tarea', vars.ticketId]` are invalidated (REQ-SHARED-CONFIG-EQUIP-1.3).
  - Acceptance: test passes; no dead import references.

- [x] B.8 **Update installer hook test**: Update `apps/installer/src/hooks/__tests__/useConfigureTechnicalTicketEquipment.test.ts` to assert `assignedTicketsKey(staffId)` is invalidated (REQ-SHARED-CONFIG-EQUIP-1.4).
  - Acceptance: test passes.

- [x] B.9 **Verification**: Run `pnpm test`, `pnpm typecheck`, `pnpm build`.
  - Acceptance: all green except pre-existing installer TaskDetailPage.test.tsx TS errors (commit d915224, not introduced by Slice B).

- [ ] B.10 **Delivery**: Commit `feat(shared): add createUseConfigureTechnicalTicketEquipment factory [slice-B]`; push to PR B branch targeting PR A branch.

---

## Slice C — RPC `create_and_assign_equipment`

> Migration + typegen + hook rewrite + new vitest. Satisfies REQ-DB-CREATE-ASSIGN-EQUIP-1, REQ-CLIENT-EQUIP-1, REQ-TYPEGEN-1.1. Depends on Slice A.

- [ ] C.1 **Preflight**: Read `apps/admin/src/hooks/useMutateTicketEquipment.ts` lines 64–85; confirm the current two-step INSERT+UPDATE pattern; verify `AssignEquipmentDialog.tsx` is the sole caller per explore.md.
  - Acceptance: two-step pattern confirmed; no other callers found.

- [ ] C.2 **Write vitest RED tests**: Create `apps/admin/src/hooks/__tests__/useMutateTicketEquipment.test.ts` with two cases per ADR-10: (1) mock RPC resolves → mutation state is `success`; (2) mock RPC rejects with `code: '23505'` → mutation state is `error`. Mock `@vitalock/supabase/rpc/tickets` at module level.
  - Acceptance: tests fail (RED) because hook still uses two-step pattern.

- [ ] C.3 **Write forward migration**: Create `supabase/migrations/<timestamp>_create_and_assign_equipment.sql` with the `CREATE OR REPLACE FUNCTION public.create_and_assign_equipment(...)` body from the design data model section.
  - Acceptance: `supabase db reset` applies migration without error.

- [ ] C.4 **Write rollback migration**: Create `supabase/migrations/<timestamp>_create_and_assign_equipment_rollback.sql` with `DROP FUNCTION IF EXISTS public.create_and_assign_equipment(uuid, uuid, text, text, text, text);` per ADR-9.
  - Acceptance: rollback script runs without error on a migrated DB.

- [ ] C.5 **Write pgTAP test file**: Create `supabase/tests/rpc/create_and_assign_equipment.sql` covering all five scenarios REQ-DB-CREATE-ASSIGN-EQUIP-1.1 through REQ-DB-CREATE-ASSIGN-EQUIP-1.5 (happy path, invalid ticket_id, RLS-denied caller, duplicate serial, rollback on second-step failure).
  - Acceptance: `supabase test db` reports all plan lines pass.

- [ ] C.6 **Regenerate types**: Run `pnpm --filter @vitalock/supabase typegen`; verify `Database['public']['Functions']['create_and_assign_equipment']` is present in `packages/supabase/src/database.types.ts`.
  - Acceptance: REQ-TYPEGEN-1.1 satisfied; `pnpm tsc --noEmit` passes.

- [ ] C.7 **Add RPC wrapper**: Add `createAndAssignEquipment(input)` wrapper to `packages/supabase/src/rpc/tickets.ts` calling `supabase.rpc('create_and_assign_equipment', {...})` per design interface changes section.
  - Acceptance: wrapper exported; typed against new `database.types.ts`.

- [ ] C.8 **Add Slice C P0001 entry**: Add `create_and_assign_equipment` substring and message to `packages/shared/src/errors/toastMutationError.ts` P0001 built-in list per ADR-5.
  - Acceptance: the new substring is present in the ordered list.

- [ ] C.9 **Rewrite hook**: Rewrite `apps/admin/src/hooks/useMutateTicketEquipment.ts` `createAndAssignEquipment` mutation to call `createAndAssignEquipment` RPC wrapper instead of the two-step pattern; remove the two sequential queries.
  - Acceptance: hook makes exactly one RPC call (REQ-CLIENT-EQUIP-1.2).

- [ ] C.10 **Verify tests go GREEN**: Run `pnpm --filter @vitalock/admin test -- useMutateTicketEquipment`; both C.2 cases must now pass.
  - Acceptance: tests pass (GREEN); no two-step pattern in hook body.

- [ ] C.11 **Verification**: Run `pnpm test`, `pnpm typecheck`, `pnpm build`.
  - Acceptance: all green; no orphaned two-step pattern in hook.

- [ ] C.12 **Delivery**: Commit all files together — migration, rollback, pgTAP, typegen, wrapper, P0001 entry, hook rewrite, tests — as one atomic commit per ADR-8: `feat(db): atomic create_and_assign_equipment RPC [slice-C]`; push to PR C branch targeting PR B branch.

---

## Slice D — Views for `useKeyOrders` + `useTechnicalOrders`

> Migration + typegen + hook rewrites + test updates. Satisfies REQ-DB-ORDERS-VIEW-1, REQ-CLIENT-ORDERS-1, REQ-TYPEGEN-1.2. Independent of C, E.

- [ ] D.1 **Preflight**: Read `apps/admin/src/hooks/useKeyOrders.ts` and `apps/admin/src/hooks/useTechnicalOrders.ts`; confirm the two-query N+1 pattern (lines 46–57 and 44–55) and the client-side company_name `.filter()` (lines 100–108 and 98–106); document current PostgREST table name used.
  - Acceptance: both N+1 patterns and JS filter calls confirmed.

- [ ] D.2 **Smoke-test embed filterability** (ADR-3 option b): Against local Supabase, verify that PostgREST can filter `key_orders` by `key_order_items.building_id` via embed (`?key_order_items.building_id=eq.<uuid>`). If the filter returns zero rows for a known match, ADR-3 option (b) fails and option (a) must be used instead.
  - Acceptance: embed filter returns correct rows → proceed with option (b); OR embed fails → document in task output and use `building_ids uuid[]` with `array_agg` in view body.

- [ ] D.3 **Write forward migration**: Create `supabase/migrations/<timestamp>_order_summary_views.sql` with: `CREATE INDEX IF NOT EXISTS administrations_company_name_trgm_idx`; `CREATE OR REPLACE VIEW public.key_orders_summary`; `CREATE OR REPLACE VIEW public.technical_orders_summary` — bodies per design data model section; apply ADR-3 option (b) unless D.2 forced option (a).
  - Acceptance: `supabase db reset` applies migration; both views are queryable.

- [ ] D.4 **Write rollback migration**: Create `supabase/migrations/<timestamp>_order_summary_views_rollback.sql` per ADR-9 (`DROP INDEX`, `DROP VIEW` for both views).
  - Acceptance: rollback script runs without error.

- [ ] D.5 **Write pgTAP test file**: Create `supabase/tests/views/order_summaries.sql` covering all four scenarios REQ-DB-ORDERS-VIEW-1.1 through REQ-DB-ORDERS-VIEW-1.4 (server-side ILIKE, building_id filter, combined filter, empty result set) for both `key_orders_summary` and `technical_orders_summary`.
  - Acceptance: `supabase test db` passes all plan lines.

- [ ] D.6 **Regenerate types**: Run `pnpm --filter @vitalock/supabase typegen`; verify `Database['public']['Views']['key_orders_summary']` and `Database['public']['Views']['technical_orders_summary']` are present and include `company_name`.
  - Acceptance: REQ-TYPEGEN-1.2 satisfied; `pnpm tsc --noEmit` passes.

- [ ] D.7 **Rewrite `useKeyOrders`**: Replace two-query N+1 pattern with single query against `key_orders_summary`; replace JS `.filter()` on `company_name` with `.ilike('company_name', ...)` on the view; apply building_id filter via embed or array operator per ADR-3 decision from D.2.
  - Acceptance: hook has exactly one Supabase query in the filter path (REQ-CLIENT-ORDERS-1.3).

- [ ] D.8 **Rewrite `useTechnicalOrders`**: Same rewrite as D.7 for `technical_orders_summary`.
  - Acceptance: same single-query criterion.

- [ ] D.9 **Update `useKeyOrders.test.ts`**: Mock new view-backed query; add assertion that `.ilike('company_name', ...)` is called server-side; assert no prior `key_order_items` pre-query; preserve list/pagination semantics.
  - Acceptance: tests pass; no client-side `.filter()` assertion remains.

- [ ] D.10 **Update `useTechnicalOrders.test.ts`**: Same update shape as D.9.
  - Acceptance: tests pass.

- [ ] D.11 **Verification**: Run `pnpm test`, `pnpm typecheck`, `pnpm build`.
  - Acceptance: all green.

- [ ] D.12 **Delivery**: Commit all files atomically per ADR-8: `feat(db): key/technical orders summary views [slice-D]`; push to PR D branch targeting PR C branch.

---

## Slice E — RPC `complete_authorizations`

> Migration + typegen + hook rewrite + new vitest. Satisfies REQ-DB-COMPLETE-AUTH-1, REQ-CLIENT-AUTH-1, REQ-TYPEGEN-1. Depends on Slice A. Independent of D.

- [ ] E.1 **Preflight**: Read `apps/installer/src/hooks/useCompleteAuthorizations.ts` lines 23–50; confirm two-step sequential UPDATE pattern targeting `operations.key_authorizations` per ADR-4; confirm `sync_state` column values (`pending_install`/`pending_removal`).
  - Acceptance: table name, column name, and state values match ADR-4.

- [ ] E.2 **Write vitest RED tests**: Create `apps/installer/src/hooks/__tests__/useCompleteAuthorizations.test.ts` with four cases per ADR-10: (1) install-only batch success; (2) remove-only batch success; (3) mixed batch success; (4) RPC failure → `mapMutationError` called. Mock `@vitalock/supabase/rpc/tickets` at module level.
  - Acceptance: tests fail (RED) because hook still uses two-step pattern.

- [ ] E.3 **Write forward migration**: Create `supabase/migrations/<timestamp>_complete_authorizations.sql` with `CREATE OR REPLACE FUNCTION public.complete_authorizations(...)` body from the design data model section.
  - Acceptance: `supabase db reset` applies migration; function exists in `public` schema.

- [ ] E.4 **Write rollback migration**: Create `supabase/migrations/<timestamp>_complete_authorizations_rollback.sql` per ADR-9.
  - Acceptance: rollback runs without error.

- [ ] E.5 **Write pgTAP test file**: Create `supabase/tests/rpc/complete_authorizations.sql` covering all seven scenarios REQ-DB-COMPLETE-AUTH-1.1 through REQ-DB-COMPLETE-AUTH-1.7 (install-only, remove-only, mixed, empty no-op, RLS denied, terminal state raises, rollback on partial failure).
  - Acceptance: `supabase test db` passes all plan lines.

- [ ] E.6 **Regenerate types**: Run `pnpm --filter @vitalock/supabase typegen`; verify `Database['public']['Functions']['complete_authorizations']` is present.
  - Acceptance: REQ-TYPEGEN-1 satisfied for slice E; `pnpm tsc --noEmit` passes.

- [ ] E.7 **Add RPC wrapper**: Add `completeAuthorizations(input)` wrapper to `packages/supabase/src/rpc/tickets.ts` per design interface changes section.
  - Acceptance: wrapper exported and typed.

- [ ] E.8 **Add Slice E P0001 entry**: Add `complete_authorizations` substring and message to `packages/shared/src/errors/toastMutationError.ts` P0001 built-in list per ADR-5.
  - Acceptance: the new substring is present.

- [ ] E.9 **Rewrite hook**: Rewrite `apps/installer/src/hooks/useCompleteAuthorizations.ts` to call `completeAuthorizations` RPC wrapper in a single mutation; remove two-step sequential UPDATEs.
  - Acceptance: hook makes exactly one RPC call (REQ-CLIENT-AUTH-1.1).

- [ ] E.10 **Verify tests go GREEN**: Run `pnpm --filter @vitalock/installer test -- useCompleteAuthorizations`; all four E.2 cases must pass.
  - Acceptance: tests pass (GREEN).

- [ ] E.11 **Verification**: Run `pnpm test`, `pnpm typecheck`, `pnpm build`.
  - Acceptance: all green.

- [ ] E.12 **Delivery**: Commit all files atomically per ADR-8: `feat(db): atomic complete_authorizations RPC [slice-E]`; push to PR E branch targeting PR D branch.

---

## Slice F — Cross-schema view for installer tickets

> Migration + typegen + hook rewrites + test updates. Satisfies REQ-DB-TICKETS-VIEW-1, REQ-CLIENT-TICKETS-1, REQ-TYPEGEN-1. Independent of C/D/E beyond A.

- [ ] F.1 **Preflight**: Read `apps/installer/src/hooks/useAssignedTickets.ts` and `apps/installer/src/hooks/useTicketHistory.ts`; confirm the 3–5 sequential query pattern + Realtime subscription target (`support.tickets`); document current result shape columns needed for both hooks.
  - Acceptance: stitching pattern confirmed; subscription target is `support.tickets`; required column set for view SELECT list documented.

- [ ] F.2 **Write forward migration**: Create `supabase/migrations/<timestamp>_installer_tickets_with_context.sql` with `CREATE OR REPLACE VIEW support.installer_tickets_with_context WITH (security_invoker = true) AS ...` body from design data model section.
  - Acceptance: `supabase db reset` applies migration; view is queryable via `supabase.schema('support').from('installer_tickets_with_context')`.

- [ ] F.3 **Write rollback migration**: Create `supabase/migrations/<timestamp>_installer_tickets_with_context_rollback.sql` per ADR-9 (`DROP VIEW IF EXISTS support.installer_tickets_with_context;`).
  - Acceptance: rollback runs without error.

- [ ] F.4 **Write pgTAP test file**: Create `supabase/tests/views/installer_tickets_with_context.sql` covering three spec scenarios (REQ-DB-TICKETS-VIEW-1.1 through REQ-DB-TICKETS-VIEW-1.3) plus one extra ADR-2 INVOKER evidence scenario (installer sees own tickets + joined building rows under INVOKER; if this scenario fails, escalate to DEFINER per ADR-2 and update the migration before merging).
  - Acceptance: all four pgTAP plan lines pass; if DEFINER escalation is needed, migration is updated with the hardcoded SELECT list and internal `auth.uid()` WHERE clause before this task closes.

- [ ] F.5 **Regenerate types**: Run `pnpm --filter @vitalock/supabase typegen`; verify `Database['support']['Views']['installer_tickets_with_context']` is present and includes `building_name` and `administration_company_name`.
  - Acceptance: REQ-TYPEGEN-1 satisfied for slice F; `pnpm tsc --noEmit` passes.

- [ ] F.6 **Rewrite `useAssignedTickets`**: Replace 3–5 query stitching with single query against `supabase.schema('support').from('installer_tickets_with_context')`; remove `.in('id', buildingIds)` and `.in('id', administrationIds)` batch fetches; keep Realtime subscription on `support.tickets` unchanged.
  - Acceptance: exactly one Supabase query issued (REQ-CLIENT-TICKETS-1.1); Realtime subscription still targets `support.tickets` (REQ-CLIENT-TICKETS-1.2).

- [ ] F.7 **Rewrite `useTicketHistory`**: Same single-query rewrite for `useTicketHistory.ts`.
  - Acceptance: exactly one Supabase query issued (REQ-CLIENT-TICKETS-1.3).

- [ ] F.8 **Update `useAssignedTickets.test.ts`**: Mock view-backed single query; drop stitching assertions; assert Realtime subscription is set up and cleaned up on unmount.
  - Acceptance: tests pass; no `.in('id', ...)` mock assertions remain.

- [ ] F.9 **Update `useTicketHistory.test.ts`**: Mock view-backed single query; assert single query returns ticket + building + administration fields.
  - Acceptance: tests pass.

- [ ] F.10 **Verification**: Run `pnpm test`, `pnpm typecheck`, `pnpm build`.
  - Acceptance: all green.

- [ ] F.11 **Delivery**: Commit all files atomically per ADR-8: `feat(db): installer_tickets_with_context cross-schema view [slice-F]`; push to PR F branch targeting PR E branch. After all PRs are reviewed and approved, merge the `feat/logic-consolidation` tracker to `main`.

---

## Total task count

| Slice | Tasks | Type |
|-------|-------|------|
| A | 11 | TS-only |
| B | 10 | TS-only |
| C | 12 | Migration + TS |
| D | 12 | Migration + TS |
| E | 12 | Migration + TS |
| F | 11 | Migration + TS |
| **Total** | **68** | |

Parallel after A+B land: C, D, E, F are mutually independent and may be reviewed in any order or in parallel by different reviewers.
