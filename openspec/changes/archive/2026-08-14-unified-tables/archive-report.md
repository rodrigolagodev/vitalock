# Archive Report — unified-tables

- **Change**: unified-tables (DataTable pattern)
- **Archived**: 2026-08-14
- **Destination**: `openspec/changes/archive/2026-08-14-unified-tables/`
- **Persistence mode**: openspec (file-based)
- **Route**: dispatcher-driven `sdd-archive` phase agent (execution mode auto)
- **Commit range**: `3c19cc2..82868d6` — 8 conventional commits (W1..W8), working tree clean at `82868d6`

## Final-State Summary (at close)

All 9 ADDED `design-system` requirements implemented and verified (12/12 scenarios compliant), all 27 tasks complete, all four pipeline gates green:

| Check | Result |
|---|---|
| Typecheck `pnpm typecheck` | ✅ exit 0 (turbo 5/5 tasks, cached) |
| Lint `pnpm lint` | ✅ 0 errors; 8 admin + 2 installer warnings, all verified pre-existing |
| UI tests `pnpm --filter @vitalock/ui test` | ✅ 68/68 (7 files) |
| Admin tests `pnpm --filter @vitalock/admin test` | ✅ 374/374 (59 files) |
| **Total** | **442/442 passed** |

Verify verdict: **PASS WITH WARNINGS** — `blockers: 0`, `critical_findings: 0`, `requirements: 9/9`, `scenarios: 12/12` (per `verify-report.md`, evidence_revision `sha256:18be796d…`, independently re-run at verification time). Both W-1 (evidence-count inaccuracies) and W-2 (tasks.md checkbox drift) were resolved at archive time as part of this archive (details below).

## Native Review Receipt Gate

`reviewGate` is structurally absent from the status contract for this candidate — receipt-driven development does not exist for this change (kill switch off), zero review code ran, and no receipt/ledger topics exist. Archive proceeds under ordinary repository policy; nothing to read or block on.

## Task Completion Gate

Archived `tasks.md` shows **27/27 tasks checked `[x]`, 0 unchecked** — gate passes.

**Exceptional stale-checkbox reconciliation (W-2), recorded as required**: at verification time the persisted `tasks.md` still showed T-01..T-08 as `[ ]` (19/27) despite apply.md and git evidence proving completion. The orchestrator explicitly instructed `sdd-archive` to reconcile these stale checkboxes at archive time. Proof backing the reconciliation: `verify-report.md` ("Tasks complete (apply.md + git evidence): 27; Tasks incomplete: 0") plus commits `3c19cc2`, `7390c67`, `72cf4bb` and their passing suites. All 27 boxes are now `[x]` in the archived artifact; no task completion was invented.

## Spec Sync (Step 2) — `openspec/specs/design-system/spec.md`

The delta spec (`specs/design-system/spec.md`, 9 **ADDED** requirements, no MODIFIED/REMOVED/RENAMED) was merged into the existing main spec following the repo convention (same target as the archived `ui-visual-language` change). No requirement-name collisions existed; all 10 pre-existing requirements were preserved byte-for-byte.

| Domain | Action | Details |
|---|---|---|
| `design-system` | Updated (merge) | 9 ADDED requirements appended verbatim: DataTable Pattern Component, Table Primitives Promotion with Shim, First-Column Rule, Icon-Only Row Actions, Pagination on Every Table, renderActions Escape Hatch, Per-Table Render Contracts, Accessibility, Consistency. 10 existing requirements preserved unchanged. Main spec now has 19 requirements (257 lines). |

**Merge readback (mechanical, byte-identity)**: the requirement blocks were appended via `sed` extraction (delta lines 5–132), never re-typed through the model.
- READBACK-A: `diff` of the original 128 lines vs. the same lines in the merged file — **empty** (existing content untouched).
- READBACK-B: `diff` of the appended block (merged lines 130–257) vs. delta lines 5–132 — **empty** (requirement text byte-identical to the delta).
- PLACE-OK: `diff -r` of the verified temp file vs. the placed `openspec/specs/design-system/spec.md` — **empty**.

## W-1 Evidence-Count Corrections (archive-time)

Verify-report W-1 measured the real counts on the working tree and flagged the apply.md/tasks.md claims. Per the Final-State Authority hierarchy, the verify-report's measured values are authoritative; apply.md/tasks.md were corrected to them at archive time:

| Item | Verify-measured (authoritative) | Was claimed | Fixed in |
|---|---|---|---|
| `DataTable.test.tsx` tests | **19** | 17 | apply.md (W2 evidence ×2, Test Summary, total) |
| `OrderItemsTable.test.tsx` tests | **18** | 17 | apply.md (T-08, W3 evidence, TDD table) + tasks.md (T-07, T-08, Test Churn Notes) |
| `KeysTable.test.tsx` tests | **7** | 6 | apply.md (T-18 row) |
| `StockMovementsTable.test.tsx` tests | **5** | 6 | apply.md (T-21 row) |
| W2 commit changed files | **5** | 6 | apply.md (Work-Unit Evidence table) |
| W5 commit changed files | **7** | 9 | apply.md (Work-Unit Evidence table) |
| Total tests written/added | **59** (net +2: DataTable 17→19) | 57 | apply.md (Test Summary) |

`design.md` and `proposal.md` remain untouched as historical phase artifacts (matching the `ui-visual-language` archive precedent, which also preserved the historical proposal over later corrections); the verify-measured numbers above are the final-state record.

## Archive Contents (Step 3/4)

- `proposal.md` ✅
- `explore.md` ✅
- `specs/design-system/spec.md` ✅ (delta, unchanged)
- `design.md` ✅
- `tasks.md` ✅ (27/27 complete; W-1 counts corrected)
- `apply.md` ✅ (W-1 counts corrected)
- `verify-report.md` ✅
- `archive-report.md` ✅ (this file — additive, excluded from the mechanical readback)

Mechanical move: `git mv` of the change folder to `openspec/changes/archive/2026-08-14-unified-tables/`. **Readback READBACK-DIR: `diff -r` of the pre-move recursive snapshot vs. the archived folder — EMPTY (byte-identical).** Active changes directory no longer contains this change (only `archive/` and `atomic-stock-work-resolution/` remain). No commit was created — the working tree (renames + spec merge + untracked `verify-report.md`) is left for the user's review.

## Deviations & Follow-ups (final state)

1. **S-1 — `UnitsTable.tsx` is ORPHANED (dead code)** — no consumer anywhere in the app (only the `useUnits` hook is used by forms). Confirmed by verify-report S-1; apply.md deviation #2 deferred removal. **NOT removed** — this archive intentionally leaves it in place and records the follow-up: **dead-code removal decision deferred to the user** (remove `UnitsTable.tsx` + its test in a future change, or wire it into a surface).
2. **D2/D3 ratification note — `react-router-dom` in `packages/ui`** — design decision D2 (first-cell navigation) added `react-router-dom ^6.27.0` to `packages/ui/package.json` so DataTable renders native `<Link>`s; D3 (archive precedent) ratifies relocating shared UI dependencies into `packages/ui`. **RATIFIED** by the maintainer as part of the `size:exception` single PR (T-27, 2026-08-14). Same version as admin ships (`^6.27.0`); lockfile dedupes to a single `react-router-dom@6.27.0`. This note is the archive-D3 record.
3. **S-3 — stale shim comment** (`apps/admin/src/components/ui/table.tsx` mentions "13 existing admin import sites"; zero importers remain). **Not updated** — the archive phase must not modify application code (launch-prompt constraint). Carry as a future docs cleanup.
4. **S-4 — coverage script** — `@vitest/coverage-v8` installed but no `--coverage` script; adding one would enable changed-file coverage in future changes. Carried forward, non-blocking.
5. **Apply-time deviations confirmed by verify** — TechnicalItemsTable `capitalize` drop (correctness fix, label-map behavior preserved); OrderTareasTable renders the standard dashed empty state with verbatim message "No hay tareas generadas para esta orden."; tareas `isLoading` wired for skeleton; T-22 keys-composition test passed immediately (RED came from the technical-branch composition test).

## Contradictions

None — all sources (verify-report, apply.md, orchestrator final-state facts, git) agree on the final state once W-1/W-2 corrections were applied. The verify-report's scenario count (12) outranks the launch brief's 7 (S-2); the envelope and this report use the authoritative file count.

## Files NOT Touched (compliance)

- Application code (`apps/admin/**`, `packages/ui/**`) — zero modifications by this archive (S-3 deliberately deferred).
- `packages/supabase/**`, sibling `openspec/changes/atomic-stock-work-resolution/` — untouched.

## Next

`unified-tables` cycle complete (planned → implemented → verified → archived). Open follow-ups for the user: UnitsTable dead-code decision, shim comment refresh, optional coverage script. Next candidate: `atomic-stock-work-resolution` (currently active, untouched).
