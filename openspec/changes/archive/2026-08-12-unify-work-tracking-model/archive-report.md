# Archive Report: Unify Work Tracking Model

**Change Name**: unify-work-tracking-model  
**Status**: ARCHIVED  
**Date**: 2026-08-12  
**Verdict**: PASS WITH WARNINGS (0 CRITICAL, 2 WARNING, 1 SUGGESTION)

---

## Change Summary

Unify the work tracking model by eliminating the `key_installation` ticket category and making `operations.key_authorizations.sync_state` the sole source of truth for installer physical key installation state. This removes the dual-tracking problem where two independent systems tracked the same installer action, causing ghost tickets and stuck orders.

**Primary Deliverable**: Single Supabase migration (`20260812000060_unify_work_tracking_model.sql`) with ordered steps:
1. Rewrite `public.recompute_order_status` keys branch to derive readiness from `key_authorizations.sync_state='pending_install'`.
2. Empty `support.tickets_resolution_chain` function body (remove key_configuration→key_installation branch).
3. Add BEFORE INSERT guard trigger to reject new `key_installation` inserts.
4. Soft-cancel existing open `key_installation` tickets (audit trail preserved).
5. Backfill by re-running `recompute_order_status` for all actionable keys orders.

**Integration**: Type updates in `apps/admin/src/hooks/useTareas.ts` (remove `key_installation` from `TareaRow.category`). SQL smoke tests in `supabase/tests-sql/test_unify_work_tracking.sql`.

---

## Artifacts

### SDD Artifacts (now archived)

| Artifact | Topic Key | Observation ID |
|----------|-----------|-----------------|
| Proposal | `sdd/unify-work-tracking-model/proposal` | #145 |
| Spec (delta) | `sdd/unify-work-tracking-model/spec` | #146 |
| Design | `sdd/unify-work-tracking-model/design` | #147 |
| Tasks | `sdd/unify-work-tracking-model/tasks` | #148 |
| Apply Progress | `sdd/unify-work-tracking-model/apply-progress` | (apply phase) |
| Verify Report | `sdd/unify-work-tracking-model/verify-report` | #150 |

### Merged Main Specs

| Spec | Changes Merged |
|------|---|
| `openspec/specs/tickets/spec.md` | Added: "No New key_installation Tickets" (ADDED requirement), "Resolution Chain — key_configuration (terminal)" (MODIFIED requirement), "key_authorizations as Sole Installation Record" (ADDED requirement), "Data Migration — Soft-Cancel Existing key_installation Tickets" (ADDED requirement). Updated: "Extended Ticket Categories" note to reference soft-cancelled historical rows. |
| `openspec/specs/ordenes-admin/spec.md` | MODIFIED: "Order Status State Machine" — ready_for_pickup gate now checks `key_authorizations.sync_state IN ('installed','cancelled')` instead of `key_installation` tickets; added explicit demotion rule; clarified that `produced_key_id IS NULL` blocks readiness; `pending_removal` does NOT block. MODIFIED scenarios: Replaced 5 old scenarios (ticket-based) with 6 new scenarios (authorization-based). |

### Change Folder (Archived)

**Source Path**: `openspec/changes/unify-work-tracking-model/` (moved)  
**Archive Path**: `openspec/changes/archive/2026-08-12-unify-work-tracking-model/`

Preserved contents:
- `proposal.md` — original proposal
- `design.md` — technical design with rationale
- `tasks.md` — all 17 tasks marked [x] (complete)
- `specs/tickets/spec.md` — delta spec (merged into main)
- `specs/ordenes-admin/spec.md` — delta spec (merged into main)
- `apply-progress.md` — implementation progress snapshot
- `verify-report.md` — verification verdict

---

## Verify Phase Verdict

**Result**: PASS WITH WARNINGS

| Issue | Severity | Details | Status |
|-------|----------|---------|--------|
| WARNING-1: cancellation_reason prose mismatch | WARNING | DB contains `'Auto-cancelled by unify-work-tracking-model migration; readiness now derived from key_authorizations'`; spec prose says `'superseded by key_authorizations model'`. Rollback LIKE matcher is correct and covers both strings. Treat as documentation drift (prose is intended, DB is functionally correct). | Treated as documentation drift; no functional regression |
| WARNING-2: test_keys_ready_for_pickup_requires_installation.sql not annotated | WARNING | Scenarios (a) and (e) in `supabase/tests-sql/test_keys_ready_for_pickup_requires_installation.sql` (migration 000057 test) now fail as expected because they assume the old `key_installation` ticket model is active. File lacks a `SUPERSEDED by migration 20260812000060` header comment. Mitigation: orchestrator added annotation after verify. | File now has `SUPERSEDED by migration 20260812000060` header comment (added post-verify) |
| SUGGESTION-1: Spec scenario not covered by tests | SUGGESTION | Spec requirement "Non-key_configuration resolution chain still fires for other categories" has no covering test because no other chained categories currently exist. This is not a regression (the category trigger still fires for future categories). | Deferred as acceptable follow-up work |
| All 17 Tasks | PASS | All 17 tasks marked [x] in `tasks.md`; all implementations complete. | ✓ Complete |
| SQL Tests | PASS | 6/6 new scenarios in `test_unify_work_tracking.sql` pass live. 4/4 regression tests in `test_resolve_ticket.sql` pass. | ✓ Pass |
| DB State | PASS | Migration runs cleanly; no schema errors; no stale state. | ✓ Clean |

**Follow-up Recommendations**:
1. **Consider purging historical key_installation rows** in a future change cycle to enable strict CHECK constraint (currently grandfather `key_installation` in domain to preserve audit trail of soft-cancelled rows).
2. **Consider RLS scoping of key_authorizations** when multi-installer scenarios arrive (currently visible system-wide via `useWorklist`; out of scope for this change per proposal).
3. **Consider removing TicketsSection from installer UI** if non-key tickets remain rare (currently shows all tickets; change focuses on key model unification).

---

## Rollback Procedure (Manual — Supabase CLI convention)

Per design §Rollback:

1. Restore `public.recompute_order_status` from migration 000057 (pre-unify version).
2. Restore `support.tickets_resolution_chain` from migration 000057 (with key_configuration→key_installation branch).
3. Un-cancel soft-cancelled tickets:
   ```sql
   UPDATE support.tickets
      SET status='open', cancellation_reason=null, resolved_at=null
    WHERE cancellation_reason LIKE 'Auto-cancelled by unify-work-tracking-model%';
   ```
4. Re-run `recompute_order_status` for all keys orders in `in_progress`/`ready_for_pickup`.
5. No CHECK constraint restoration needed (kept `key_installation` in domain per final design decision).

---

## Final-State Facts (Post-Verify Updates)

- ✓ **WARNING-2 ADDRESSED**: `supabase/tests-sql/test_keys_ready_for_pickup_requires_installation.sql` now has `SUPERSEDED by migration 20260812000060` header comment (added in orchestrator after verify). File remains in-tree as historical documentation.
- ✓ **WARNING-1 TREATED**: cancellation_reason prose mismatch documented as acceptable documentation drift; rollback LIKE matcher is functionally correct.
- ✓ **CRITICAL**: No critical issues identified.
- ✓ **DELIVERY**: All 17 tasks complete. Migration applied cleanly. Tests passing. DB state correct. Ready for production delivery.

---

## Key Learnings

1. Postgres CHECK constraint validation scans every row on ALTER, so shrinking a domain requires either deleting or grandfathering historical values through an allowed-but-unused state.
2. Soft-cancel preserves foreign-key integrity from `stock_movements.ticket_id` and downstream audit paths, making rollback and historical querying safe and deterministic.
3. Migration ordering within a single transactional file matters: rewrite the gate before removing the spawning branch, remove the branch before cancelling rows, cancel before shrinking domains, backfill last.
4. Reusing `recompute_order_status` in backfill loops guarantees every state branch is evaluated correctly without risk of missed edge cases or partial promotion.
5. Soft-cancelled rows remain queryable with correct honest state, so admin `useOrderTareas` sees the full story (changed from `open`/`in_progress` to `cancelled`) rather than mysteriously losing history.

---

## Archive Metadata

| Field | Value |
|-------|-------|
| Archive date | 2026-08-12 |
| Archive path | `openspec/changes/archive/2026-08-12-unify-work-tracking-model/` |
| Verdict | PASS WITH WARNINGS |
| Proposal obs | #145 |
| Spec obs | #146 |
| Design obs | #147 |
| Tasks obs | #148 |
| Verify obs | #150 |
| Apply status | Complete (all 17 tasks) |
| DB migration | `20260812000060_unify_work_tracking_model.sql` |
| TS updates | `apps/admin/src/hooks/useTareas.ts` |
| SQL tests | `supabase/tests-sql/test_unify_work_tracking.sql` |
