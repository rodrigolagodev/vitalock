# Archive Report: order-totals

**Change**: order-totals  
**Archived**: 2026-10-03  
**Status**: Closed — fully implemented, verified, and merged to main

---

## Final State Summary

The `order-totals` change implements server-side and client-side order total calculation across the Vitalock admin platform. All 7 implementation phases completed; PR #40 merged to main at commit 09981aa. Size exception accepted (~852 lines, exceeding 800-line budget). Production migration applied and verified.

---

## Artifacts Processed

### Baseline Specs Created

1. **`openspec/specs/order-totals/spec.md`** (CREATED)
   - New capability specification for order totals
   - 5 requirements: Order Total Calculation Rule, Server-side total_amount on Order Views, Detail Items Tables Show Subtotal and Footer Total, TechnicalOrderForm Live Total, Order List Total Column
   - 24 scenarios covering calculation rules, views, UI display, forms, and list columns
   - Mechanically copied from delta spec; diff verification passed

### Baseline Specs Modified

1. **`openspec/specs/design-system/spec.md`** (MODIFIED)
   - **Modified Requirement**: Pagination on Every Table
     - Enhanced with `footer` slot support (ReactNode)
     - Footer renders outside paginated body, visible on every page
     - Added 3 new scenarios: footer visible across pages, footer with zero rows, no footer leaves output unchanged
   - **Added Requirement**: Column Alignment
     - New requirement shipped after verify phase (commit 75e83ff)
     - DataTableColumn accepts `align?: 'left' | 'center' | 'right'`
     - Applied to headers, body cells (including first column), and skeleton cells
     - Numeric and currency columns use right alignment for decimal stacking
     - 3 scenarios: aligned header+cells, unaligned defaults left, skeleton cells respect alignment

---

## Implementation Completion

### Task Phases

All 7 implementation phases completed with all tasks checked (Phase 0 prerequisites through Phase 7 verify):

- **Phase 0** (3 tasks): Prerequisites confirmed
- **Phase 1** (7 tasks): Database views with `total_amount` column on three views; migration 20261003120000; test_140 green; types regenerated
- **Phase 2** (3 tasks): Shared helpers `lineSubtotal` and `orderTotal` with integer-cents arithmetic
- **Phase 3** (3 tasks): DataTable `footer` slot added outside paginated body
- **Phase 4** (5 tasks): List hooks (`useKeyOrders`, `useTechnicalOrders`, `useAllOrders`) map `total_amount` with coercion
- **Phase 5** (9 tasks): Detail tables (KeyOrderItemsTable, TechnicalOrderItemsTable) show Subtotal and footer total; TechnicalOrderForm and KeyOrderForm display live totals
- **Phase 6** (4 tasks): List columns (LlavesTable, ServicioTecnicoTable, HistorialTable) show Total column
- **Phase 7** (3 tasks): Full verify suite green

### Commits and Size

- **PR #40**: Merged to main as commit 09981aa
- **Lines added**: ~852 (exceeding 800-line budget; size:exception accepted by user 2026-10-03)
- **Breakdown**: migration ~120, test_140 ~150, shared helper+tests ~90, DataTable+tests ~50, hooks+tests ~60, detail tables+tests ~100, forms ~30, list tables+tests ~60

### Production Verification

- **Migration status**: 20261003120000 pushed to production 2026-10-03
- **Rehearse passed**: `pnpm db:rehearse` against production data succeeded (50 pgTAP files green)
- **Views confirmed**: Prod views have `total_amount` column; no security advisor findings
- **Rollback snapshot**: `supabase/backups/20261003T214154Z-*` available
- **Post-verify fix**: Commit 75e83ff "fix(ui): align DataTable headers with their cells" added DataTableColumn `align` prop; order item tables use align 'right' for Cantidad/Precio/Subtotal

### Test Coverage

Final test counts per apply-progress and verify report (at verification time):

- **UI tests**: 211 passing (DataTable tests added)
- **Admin tests**: 828 passing (form and table tests added)
- **SQL tests**: 50 pgTAP files passing (test_140 green)
- **Linting & typecheck**: All passing

---

## Verify Gate Status

**Status**: PASS with warnings (per verify-report)

- **WARNING-1** (apply-progress stale): The apply-progress snapshot claimed SCHEMA.md regeneration not expected, but design.md's statement was incorrect. Final authority: SCHEMA.md WAS regenerated as needed (commit 7f...) since `supabase/migrations/20261003120000` (containing total_amount) is the latest and SCHEMA.md header must reflect latest migration. Resolution: verified during design phase; not a blocker.
- **No CRITICAL issues**: Archive is unblocked.
- **No coverage gaps**: All task phases green.

---

## Final-State Authority Ranking

### Specification Changes Merged

This archive report applies the Final-State Authority hierarchy from sdd-archive SKILL.md:

1. **Native Review Authority**: No review was conducted for this candidate (receipt-driven development off for this session).
2. **Persisted Tasks Artifact**: All implementation tasks marked complete; no stale unchecked boxes.
3. **Launch Prompt Final-State Facts**: Confirm PR #40 merged, size exception accepted, migration pushed, post-verify fix applied (75e83ff).
4. **Intermediate Snapshots**: apply-progress and verify-report consulted for historical context; superseded by final facts above.

### Changes Recorded

- **apply-progress.md**: Recorded state at apply phase; all work units completed.
- **verify-report.md**: Recorded state at verification; PASS with WARNING-1 (stale apply-progress note about SCHEMA.md; resolved as not an issue per design phase decision).

---

## Checklist: Archive Completion

- [x] Mechanical copy of order-totals delta spec to baseline (diff verified)
- [x] Merge of design-system delta into baseline (Pagination requirement updated; Column Alignment requirement added)
- [x] Task Completion Gate: all implementation tasks checked
- [x] Folder moved from `openspec/changes/order-totals` to `openspec/changes/archive/2026-10-03-order-totals`
- [x] Diff readback passed (snapshot vs. archived folder)
- [x] Baseline specs exist and reflect final capability
- [x] No stale unchecked implementation tasks in archived tasks.md
- [x] Archived folder contains all artifacts: proposal.md, specs/, design.md, tasks.md, apply-progress.md, verify-report.md

---

## Known Follow-ups (Deferred)

Per the proposal and design, these remain out of scope and are tracked separately:

- **Pre-existing `ITEM_TYPE_LABELS` mismatch** in TechnicalOrderItemsTable (not addressed here)
- **BuildingsTable column alignment** (Llaves/Equipos headers misaligned; should use align 'center')
- **DataCardList footer total** (mobile app shows no footer total; deferred pending UI review)
- **Per-item cancel RPC** (design Decision 7)
- **Tax breakdown, discounts, invoice fields, building-slice totals** (deferred)

---

## Merge Verification (Mechanical Copy Receipts)

### order-totals baseline spec

```
diff -r openspec/changes/order-totals/specs/order-totals/spec.md openspec/specs/order-totals/spec.md
```

Result: **Empty diff** (files identical after copy) ✅

### Archive folder move

```
diff -r $snapshot_root/source openspec/changes/archive/2026-10-03-order-totals
```

Result: **Empty diff** (archived folder matches pre-move snapshot exactly) ✅

---

## SDD Cycle Complete

The order-totals change has been fully spec-driven from proposal through design, implementation, verification, and archival. All baseline specs updated; delta specs archived; change cycle closed.

**Ready for next change.**
