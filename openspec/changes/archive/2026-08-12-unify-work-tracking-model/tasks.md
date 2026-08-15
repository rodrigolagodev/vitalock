# Tasks: Unify Work Tracking Model

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 280–340 (migration ~200, test file ~90, TS ~15, docs ~20) |
| 400-line budget risk | Medium |
| Chained PRs recommended | No |
| Suggested split | Single PR — migration + tests + TS type updates ship atomically |
| Delivery strategy | ask-on-risk |
| Chain strategy | size-exception (migration file is an authored atomic unit) |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: Medium

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | Migration + TS types + SQL smoke tests + docs | PR 1 (single) | `supabase db reset --local && psql ... -f test_unify_work_tracking.sql` | `supabase migration up --local` then run both SQL test files | Revert migration file + TS union lines; un-cancel tickets via rollback SQL in design §Rollback |

---

## Phase 1: DB Migration — Single File (sequential, a→b→b2→c→d→e)

- [x] T-01 Create `supabase/migrations/20260812000060_unify_work_tracking_model.sql` with a top-of-file block comment: change name, rationale, rollback pointer (design §Rollback), and internal step labels a/b/b2/c/d/e.
  - Files: `supabase/migrations/20260812000060_unify_work_tracking_model.sql` (new)
  - Depends on: none
  - Est. lines: 10 (comment block only)

- [x] T-02 Section (a) — `CREATE OR REPLACE FUNCTION public.recompute_order_status(p_order_id uuid)` keys branch: traversal via `order_items.produced_key_id → rfid_keys.id → key_authorizations.rfid_key_id`; filter `sync_state = 'pending_install'`; explicit NULL guard (unconfigured item blocks promotion); demotion from `ready_for_pickup` when any pending_install exists; technical flow unchanged from migration 000057. Full body per design §Step a.
  - Files: migration file above
  - Depends on: T-01
  - Est. lines: ~70

- [x] T-03 Section (b) — `CREATE OR REPLACE FUNCTION support.tickets_resolution_chain()` with empty body (no category branches); comment referencing this change; guard `if new.status <> 'resolved' or old.status = 'resolved' then return null`. Trigger definition unchanged (DO NOT DROP trigger).
  - Files: migration file above
  - Depends on: T-02
  - Est. lines: ~15

- [x] T-04 Section (b2) — `CREATE OR REPLACE FUNCTION support.tickets_reject_key_installation_inserts()` BEFORE INSERT trigger function: `RAISE EXCEPTION` with `SQLSTATE '22023'` and message `"key_installation is no longer a supported ticket category; see unify-work-tracking-model change (use operations.key_authorizations for install tracking)."` when `NEW.category = 'key_installation'`; add `CREATE TRIGGER` on `support.tickets BEFORE INSERT FOR EACH ROW EXECUTE FUNCTION support.tickets_reject_key_installation_inserts()`.
  - Files: migration file above
  - Depends on: T-03
  - Est. lines: ~20

- [x] T-05 Section (c) — `UPDATE support.tickets SET status='cancelled', cancellation_reason='Auto-cancelled by unify-work-tracking-model migration; readiness now derived from key_authorizations', resolved_at=COALESCE(resolved_at, now()) WHERE category='key_installation' AND status IN ('open','in_progress')`.
  - Files: migration file above
  - Depends on: T-04
  - Est. lines: ~7

- [x] T-06 Section (d) — NO CHECK constraint change; add SQL block comment explaining the grandfather decision: Postgres re-validates all rows on ALTER, existing cancelled `key_installation` rows would fail a stricter CHECK, enforcement is via trigger (b2) and TS union; a future purge migration may tighten the domain.
  - Files: migration file above
  - Depends on: T-05
  - Est. lines: ~5 (comment only)

- [x] T-07 Section (e) — `DO $$ ... FOR v_order_id IN SELECT DISTINCT oi.order_id FROM public.order_items oi JOIN public.orders o ON o.id=oi.order_id WHERE oi.item_type='key' AND o.status IN ('confirmed','in_progress','ready_for_pickup') LOOP PERFORM public.recompute_order_status(v_order_id); END LOOP; $$`.
  - Files: migration file above
  - Depends on: T-06
  - Est. lines: ~12

## Phase 2: TypeScript Type Updates

- [x] T-08 Remove `| 'key_installation'` from `TareaRow.category` union in `apps/admin/src/hooks/useTareas.ts` (line 12).
  - Files: `apps/admin/src/hooks/useTareas.ts`
  - Depends on: T-01 (conceptual ordering only — TS and migration ship together)
  - Est. lines: 1 deletion

- [x] T-09 Remove `| 'key_installation'` from the category union in `apps/admin/src/hooks/useMutateTarea.ts` (line 13).
  - Files: `apps/admin/src/hooks/useMutateTarea.ts`
  - Depends on: T-08
  - Est. lines: 1 deletion

- [x] T-10 Audit remaining `'key_installation'` string literals in the admin app: `TareaDetailPage.tsx` (display label lines 14, 40), `TareaFormSheet.tsx` (label line 103, comment line 108), `TareasTable.tsx` (label line 39). Preserve label strings that display historical cancelled tickets; remove only occurrences that appear in new-ticket creation logic, form category selects, or filter enumerations. Add a code comment on each preserved label: `// Retained for display of cancelled historical tickets.`
  - Files: `apps/admin/src/routes/tareas/TareaDetailPage.tsx`, `apps/admin/src/components/tareas/TareaFormSheet.tsx`, `apps/admin/src/components/tareas/TareasTable.tsx`
  - Depends on: T-09
  - Est. lines: ~6 changed (comment additions + filter removals)

## Phase 3: SQL Smoke Tests

- [x] T-11 Create `supabase/tests-sql/test_unify_work_tracking.sql`. Six scenarios each in `BEGIN … ROLLBACK` with `RAISE NOTICE 'PASS: <scenario>'`:
  1. All authorizations `installed`, all items configured → `recompute_order_status` promotes to `ready_for_pickup`.
  2. One authorization `pending_install` → order stays `in_progress`.
  3. One authorization `pending_removal` on an otherwise-ready order → order promotes to `ready_for_pickup` (not a blocker).
  4. One item with `produced_key_id IS NULL` → order stays `in_progress`.
  5. Resolve a `key_configuration` ticket → no new `support.tickets` row created (chain trigger no-op).
  6. Order at `ready_for_pickup`, authorization flips to `pending_install` → `recompute_order_status` demotes to `in_progress`.
  - Files: `supabase/tests-sql/test_unify_work_tracking.sql` (new)
  - Depends on: T-07 (migration written; tests validate its output)
  - Est. lines: ~90

## Phase 4: Verification

- [x] T-12 Apply migration locally: `supabase migration up --local`. Confirm zero errors or warnings.
  - Files: none (runtime only)
  - Depends on: T-07

- [x] T-13 Run `supabase/tests-sql/test_resolve_ticket.sql` (existing). Confirm all scenarios still PASS.
  - Files: none (runtime only)
  - Depends on: T-12

- [x] T-14 Run `supabase/tests-sql/test_unify_work_tracking.sql`. Confirm all 6 scenarios PASS.
  - Files: none (runtime only)
  - Depends on: T-12, T-11

- [x] T-15 Simulate end-to-end via `psql` with installer JWT (or `supabase db test`): create a keys order → admin confirms → `configure_key_order_item` RPC → assert (a) zero `key_installation` tickets in `support.tickets`, (b) `key_authorizations` row at `pending_install`, (c) update authorization to `installed` + call `recompute_order_status` → assert order at `ready_for_pickup`.
  - Files: none (runtime only)
  - Depends on: T-12

- [x] T-16 (RED guard) Attempt direct INSERT of a `key_installation` ticket after migration → confirm `SQLSTATE 22023` is raised by the b2 trigger.
  - Files: none (runtime only)
  - Depends on: T-12

## Phase 5: Documentation

- [x] T-17 Update `supabase/FLOWS.md`: remove any mention of `key_installation` tickets in flow diagrams and the "installer worklist" section; replace with `key_authorizations` as sole source; reference `sync_state = 'pending_install'` as the in-progress gate and `sync_state = 'installed'` as the promotion trigger.
  - Files: `supabase/FLOWS.md`
  - Depends on: T-07
  - Est. lines: ~20

---

## Task Dependency Summary

```
T-01 → T-02 → T-03 → T-04 → T-05 → T-06 → T-07  (sequential, migration file sections)
T-01 → T-08 → T-09 → T-10                          (TS types, can parallel with T-02..T-07)
T-07 → T-11                                         (tests written after migration body complete)
T-07 → T-12 → T-13                                  (run existing tests after apply)
T-11 + T-12 → T-14                                  (new tests run after apply + file exists)
T-12 → T-15                                         (e2e simulation after apply)
T-12 → T-16                                         (RED guard after apply)
T-07 → T-17                                         (docs after migration sections settled)
```

Parallel-safe groups once T-07 is done: T-08/T-09/T-10 (TS), T-11 (test authoring), T-17 (docs) can proceed concurrently. T-12 through T-16 are sequential verification gates.
