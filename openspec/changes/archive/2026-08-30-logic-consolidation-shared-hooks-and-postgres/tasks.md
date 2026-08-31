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

- [x] A.11 **Delivery**: Commit `feat(shared): extract toastMutationError to @vitalock/shared [slice-A]`; push to PR A branch targeting `feat/logic-consolidation`.
  - Completed: commit 96e78b5 shipped to main.

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

- [x] B.10 **Delivery**: Commit `feat(shared): add createUseConfigureTechnicalTicketEquipment factory [slice-B]`; push to PR B branch targeting PR A branch.
  - Completed: commit ad3b7ac shipped to main.

---

## Slice C — RPC `create_and_assign_equipment`

> Migration + typegen + hook rewrite + new vitest. Satisfies REQ-DB-CREATE-ASSIGN-EQUIP-1, REQ-CLIENT-EQUIP-1, REQ-TYPEGEN-1.1. Depends on Slice A.

- [x] C.1 **Preflight**: Read `apps/admin/src/hooks/useMutateTicketEquipment.ts` lines 64–85; confirm the current two-step INSERT+UPDATE pattern; verify `AssignEquipmentDialog.tsx` is the sole caller per explore.md.
  - Acceptance: two-step pattern confirmed; no other callers found.

- [x] C.2 **Write vitest RED tests**: Create `apps/admin/src/hooks/__tests__/useMutateTicketEquipment.test.ts` with two cases per ADR-10: (1) mock RPC resolves → mutation state is `success`; (2) mock RPC rejects with `code: '23505'` → mutation state is `error`. Mock `@vitalock/supabase/rpc/tickets` at module level.
  - Acceptance: RED confirmed — success case failed with two-step hook; GREEN after C.9.

- [x] C.3 **Write forward migration**: Create `supabase/migrations/20260830000107_create_and_assign_equipment.sql`. Uses actual schema column `serial_number` (not `serial` as design draft) and `description NOT NULL`.
  - Acceptance: `supabase migration up` applies cleanly to local DB.

- [x] C.4 **Write rollback migration**: Placed at `supabase/rollbacks/20260830000107_create_and_assign_equipment_rollback.sql` (deviating from ADR-9 which placed it in `migrations/` — that path would have been auto-applied and dropped the RPC on next `supabase db reset`).
  - Acceptance: idempotent `DROP FUNCTION IF EXISTS` script.

- [x] C.5 **Write pgTAP test file**: `supabase/tests-sql/test_122_create_and_assign_equipment.sql` (following actual repo convention, not `supabase/tests/rpc/` as design draft said). Five scenarios REQ-DB-CREATE-ASSIGN-EQUIP-1.1..1.5.
  - Acceptance: `pg_prove` reports 5/5 PASS.

- [x] C.6 **Regenerate types**: Ran `bash scripts/gen-types.sh` (no package.json typegen script — script exists at repo scripts/). `Database['public']['Functions']['create_and_assign_equipment']` present at line 1206 of database.types.ts.
  - Acceptance: REQ-TYPEGEN-1.1 satisfied.

- [x] C.7 **Add RPC wrapper**: `createAndAssignEquipment(client, input)` added to `packages/supabase/src/rpc/tickets.ts`.
  - Acceptance: exported and typed.

- [x] C.8 **Add Slice C P0001 entry**: Appended to `P0001_HANDLERS` in `packages/shared/src/errors/toastMutationError.ts`.

- [x] C.9 **Rewrite hook**: `useMutateTicketEquipment.createAndAssignEquipment` collapsed to a single RPC call via the wrapper. JSDoc updated.
  - Acceptance: hook body issues exactly one `client.rpc('create_and_assign_equipment', ...)` call (REQ-CLIENT-EQUIP-1.2).

- [x] C.10 **Verify tests go GREEN**: `pnpm --filter @vitalock/admin exec vitest run src/hooks/__tests__/useMutateTicketEquipment.test.ts` → 2/2 pass.

- [x] C.11 **Verification**: `pnpm test` → 624/624 admin, all packages pass. `pnpm typecheck` and `pnpm build` — only pre-existing installer `TaskDetailPage.test.tsx` errors (commit d915224, unrelated to Slice C — same as noted for Slices A/B).

- [x] C.12 **Delivery**: Commit all files together as one atomic commit per ADR-8: `feat(db): atomic create_and_assign_equipment RPC [slice-C]`; push to PR C branch targeting PR B branch.
  - Completed: commit 65a8d4a shipped to main.

---

## Slice D — Views for `useKeyOrders` + `useTechnicalOrders`

> Migration + typegen + hook rewrites + test updates. Satisfies REQ-DB-ORDERS-VIEW-1, REQ-CLIENT-ORDERS-1, REQ-TYPEGEN-1.2. Independent of C, E.

- [x] D.1 **Preflight**: two-query N+1 + client `.filter()` on `administrations.company_name` confirmed.

- [x] D.2 **Smoke-test embed filterability**: PostgREST embed on view works out of the box — `.from('key_orders_summary').select('*, key_order_items!inner(id)').eq('key_order_items.building_id', X)` returns correct rows in a single request. ADR-3 option (b) confirmed; no `building_ids uuid[]` fallback needed.

- [x] D.3 **Forward migration**: `supabase/migrations/20260830000108_order_summary_views.sql` — pg_trgm extension + trigram GIN index on `administrations.company_name` + `public.key_orders_summary` + `public.technical_orders_summary` (both `security_invoker = true`, `SELECT <base>.*, a.company_name`).

- [x] D.4 **Rollback migration**: `supabase/rollbacks/20260830000108_order_summary_views_rollback.sql` (outside `migrations/` for the same reason as Slice C).

- [x] D.5 **pgTAP tests**: `supabase/tests-sql/test_123_order_summary_views.sql` — 8/8 GREEN covering REQ-DB-ORDERS-VIEW-1.1..1.4 for each view (ILIKE, building_id filter, combined, empty result).

- [x] D.6 **Regenerate types**: `Database['public']['Views']['key_orders_summary']` and `['technical_orders_summary']` present.

- [x] D.7 **Rewrite `useKeyOrders`**: single query against `key_orders_summary` with `!inner` embed for building filter and `company_name.ilike.%X%` in the `.or()` search chain. Client reshapes flat `company_name` back into the nested `{ administrations: { company_name } }` shape to preserve consumer contract per design line 365 (no consumer signature changes).

- [x] D.8 **Rewrite `useTechnicalOrders`**: same rewrite for `technical_orders_summary`.

- [x] D.9 **Update `useKeyOrders.test.ts`**: 12/12 GREEN — new assertions: `from('key_orders_summary')`, no client `.filter()`, `!inner` embed for building, reshape into nested `administrations`.

- [x] D.10 **Update `useTechnicalOrders.test.ts`**: 12/12 GREEN, same shape as D.9.

- [x] D.11 **Verification**: `pnpm test` → 626/626 admin (+2 from Slice C); typecheck + build clean for admin/shared/supabase/ui; installer TS errors pre-existing (commit d915224).

- [x] D.12 **Delivery**: Commit + push slice D directly to main per user directive (skipping design's PR chain).
  - Completed: commit faa70fe shipped to main.

---

## Slice E — RPC `complete_authorizations`

> Migration + typegen + hook rewrite + new vitest. Satisfies REQ-DB-COMPLETE-AUTH-1, REQ-CLIENT-AUTH-1, REQ-TYPEGEN-1. Depends on Slice A. Independent of D.

- [x] E.1 **Preflight**: Read `apps/installer/src/hooks/useCompleteAuthorizations.ts` lines 23–50; confirm two-step sequential UPDATE pattern targeting `operations.key_authorizations` per ADR-4; confirm `sync_state` column values (`pending_install`/`pending_removal`).
  - Acceptance: table name, column name, and state values match ADR-4.

- [x] E.2 **Write vitest RED tests**: Create `apps/installer/src/hooks/__tests__/useCompleteAuthorizations.test.ts` with four cases per ADR-10: (1) install-only batch success; (2) remove-only batch success; (3) mixed batch success; (4) RPC failure → `mapMutationError` called. Mock `@vitalock/supabase/rpc/tickets` at module level.
  - Acceptance: tests fail (RED) because hook still uses two-step pattern.

- [x] E.3 **Write forward migration**: Create `supabase/migrations/<timestamp>_complete_authorizations.sql` with `CREATE OR REPLACE FUNCTION public.complete_authorizations(...)` body from the design data model section.
  - Acceptance: `supabase db reset` applies migration; function exists in `public` schema.

- [x] E.4 **Write rollback migration**: Create `supabase/migrations/<timestamp>_complete_authorizations_rollback.sql` per ADR-9.
  - Acceptance: rollback runs without error.

- [x] E.5 **Write pgTAP test file**: Create `supabase/tests/rpc/complete_authorizations.sql` covering all seven scenarios REQ-DB-COMPLETE-AUTH-1.1 through REQ-DB-COMPLETE-AUTH-1.7 (install-only, remove-only, mixed, empty no-op, RLS denied, terminal state raises, rollback on partial failure).
  - Acceptance: `supabase test db` passes all plan lines.

- [x] E.6 **Regenerate types**: Run `pnpm --filter @vitalock/supabase typegen`; verify `Database['public']['Functions']['complete_authorizations']` is present.
  - Acceptance: REQ-TYPEGEN-1 satisfied for slice E; `pnpm tsc --noEmit` passes.

- [x] E.7 **Add RPC wrapper**: Add `completeAuthorizations(input)` wrapper to `packages/supabase/src/rpc/tickets.ts` per design interface changes section.
  - Acceptance: wrapper exported and typed.

- [x] E.8 **Add Slice E P0001 entry**: Add `complete_authorizations` substring and message to `packages/shared/src/errors/toastMutationError.ts` P0001 built-in list per ADR-5.
  - Acceptance: the new substring is present.

- [x] E.9 **Rewrite hook**: Rewrite `apps/installer/src/hooks/useCompleteAuthorizations.ts` to call `completeAuthorizations` RPC wrapper in a single mutation; remove two-step sequential UPDATEs.
  - Acceptance: hook makes exactly one RPC call (REQ-CLIENT-AUTH-1.1).

- [x] E.10 **Verify tests go GREEN**: Run `pnpm --filter @vitalock/installer test -- useCompleteAuthorizations`; all four E.2 cases must pass.
  - Acceptance: tests pass (GREEN).

- [x] E.11 **Verification**: Run `pnpm test`, `pnpm typecheck`, `pnpm build`.
  - Acceptance: all green.

- [x] E.12 **Delivery**: Commit all files atomically per ADR-8: `feat(db): atomic complete_authorizations RPC [slice-E]`; push to PR E branch targeting PR D branch.
  - Completed: commit 0461fd1 shipped to main.

---

## Slice F — Cross-schema view for installer tickets

> Migration + typegen + hook rewrites + test updates. Satisfies REQ-DB-TICKETS-VIEW-1, REQ-CLIENT-TICKETS-1, REQ-TYPEGEN-1. Independent of C/D/E beyond A.

- [x] F.1 **Preflight**: Read `apps/installer/src/hooks/useAssignedTickets.ts` and `apps/installer/src/hooks/useTicketHistory.ts`; confirm the 3–5 sequential query pattern + Realtime subscription target (`support.tickets`); document current result shape columns needed for both hooks.
  - Acceptance: stitching pattern confirmed; subscription target is `support.tickets`; required column set for view SELECT list documented.

- [x] F.2 **Write forward migration**: Create `supabase/migrations/<timestamp>_installer_tickets_with_context.sql` with `CREATE OR REPLACE VIEW support.installer_tickets_with_context WITH (security_invoker = true) AS ...` body from design data model section.
  - Acceptance: `supabase db reset` applies migration; view is queryable via `supabase.schema('support').from('installer_tickets_with_context')`.

- [x] F.3 **Write rollback migration**: Create `supabase/migrations/<timestamp>_installer_tickets_with_context_rollback.sql` per ADR-9 (`DROP VIEW IF EXISTS support.installer_tickets_with_context;`).
  - Acceptance: rollback runs without error.

- [x] F.4 **Write pgTAP test file**: Create `supabase/tests/views/installer_tickets_with_context.sql` covering three spec scenarios (REQ-DB-TICKETS-VIEW-1.1 through REQ-DB-TICKETS-VIEW-1.3) plus one extra ADR-2 INVOKER evidence scenario (installer sees own tickets + joined building rows under INVOKER; if this scenario fails, escalate to DEFINER per ADR-2 and update the migration before merging).
  - Acceptance: all four pgTAP plan lines pass; if DEFINER escalation is needed, migration is updated with the hardcoded SELECT list and internal `auth.uid()` WHERE clause before this task closes.

- [x] F.5 **Regenerate types**: Run `pnpm --filter @vitalock/supabase typegen`; verify `Database['support']['Views']['installer_tickets_with_context']` is present and includes `building_name` and `administration_company_name`.
  - Acceptance: REQ-TYPEGEN-1 satisfied for slice F; `pnpm tsc --noEmit` passes.

- [x] F.6 **Rewrite `useAssignedTickets`**: Replace 3–5 query stitching with single query against `supabase.schema('support').from('installer_tickets_with_context')`; remove `.in('id', buildingIds)` and `.in('id', administrationIds)` batch fetches; keep Realtime subscription on `support.tickets` unchanged.
  - Acceptance: exactly one Supabase query issued (REQ-CLIENT-TICKETS-1.1); Realtime subscription still targets `support.tickets` (REQ-CLIENT-TICKETS-1.2).

- [x] F.7 **Rewrite `useTicketHistory`**: Same single-query rewrite for `useTicketHistory.ts`.
  - Acceptance: exactly one Supabase query issued (REQ-CLIENT-TICKETS-1.3).

- [x] F.8 **Update `useAssignedTickets.test.ts`**: Mock view-backed single query; drop stitching assertions; assert Realtime subscription is set up and cleaned up on unmount.
  - Acceptance: tests pass; no `.in('id', ...)` mock assertions remain.

- [x] F.9 **Update `useTicketHistory.test.ts`**: Mock view-backed single query; assert single query returns ticket + building + administration fields.
  - Acceptance: tests pass.

- [x] F.10 **Verification**: Run `pnpm test`, `pnpm typecheck`, `pnpm build`.
  - Acceptance: all green.

- [x] F.11 **Delivery**: Commit all files atomically per ADR-8: `feat(db): installer_tickets_with_context cross-schema view [slice-F]`; push to PR F branch targeting PR E branch. After all PRs are reviewed and approved, merge the `feat/logic-consolidation` tracker to `main`.
  - Completed: commit 791fc07 shipped to main. Follow-up TS fix: commit 493f071 shipped to main.

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
