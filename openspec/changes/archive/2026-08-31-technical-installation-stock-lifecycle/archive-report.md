# Archive Report: technical-installation-stock-lifecycle

**Change**: technical-installation-stock-lifecycle  
**Archived**: 2026-08-31  
**Status**: COMPLETE — Commit eb7afa2 (23 files, 2317 insertions, 31 deletions)  
**Artifact Store Mode**: openspec (hybrid-capable)

---

## Final-State Summary

This change successfully extended the `installation` item category to behave symmetrically with the existing `equipment_installation` category across the technical order confirm/configure/resolve lifecycle. All four production bugs (stock integrity + UX gaps when `item_type='installation'`) are closed by a single minimal-delta extension of existing category guards.

- **Proposed**: 4 bugs to fix via symmetric guard extension  
- **Delivered**: All 4 bugs fixed + 4 new testable capability specs  
- **Test Results**: 647/647 admin tests green; 77/77 installer tests green (1 pre-existing unrelated failure in useTicketHistory.test.ts, existed in HEAD before this change)  
- **Verification**: PASS WITH WARNINGS (0 CRITICAL, 2 WARNING, 2 SUGGESTION)  
- **All Tasks**: 22/22 complete and checked in tasks.md  
- **Commits**: Single PR merged to main as eb7afa2  

---

## Scope Delivered

### Proposal Success Criteria (all met)

- [x] Extend `configure_technical_ticket_equipment` guard to accept `category='installation'`  
- [x] Extend `resolve_ticket` side-effect block to create equipment and stock movements for `category='installation'`  
- [x] Add `technical_order_items_intent_immutable` trigger bypass (GUC + trigger-side narrow-column gate) scoped to resolve_ticket only  
- [x] Require `product_id` in admin form for `installation` items (enable stock reservation at confirm)  
- [x] Extend admin TareaDetailPage and ConfigureEquipmentPanel to recognize `installation` category  
- [x] Extend installer TicketCard, ConfigureEquipmentInline, and TaskDetailPage to recognize `installation` category  
- [x] Unit tests for all new category branches + hook category-agnosticism assertion  
- [x] Manual E2E verification checklist documented  

### Files Changed (11 application files + 1 migration)

**Database**:  
- supabase/migrations/20260901120000_extend_installation_category_lifecycle.sql (new)
  - CREATE OR REPLACE FUNCTION technical_order_items_intent_immutable() — added v_allow_resolve_equipment gate + narrow-bypass branch
  - CREATE OR REPLACE FUNCTION configure_technical_ticket_equipment() — extended category guard to IN (..., 'installation')
  - CREATE OR REPLACE FUNCTION resolve_ticket() — extended guards and inserted GUC intent-bypass window

**Admin App**:  
- apps/admin/src/components/servicio-tecnico/TechnicalOrderForm.tsx — added installation branch to TechnicalItemEquipmentField with conditional product_id requirement
- apps/admin/src/routes/tareas/TareaDetailPage.tsx — added 'installation' to CATEGORIES_TWO_STEP_CONFIGURE
- apps/admin/src/components/tareas/ConfigureEquipmentPanel.tsx — extended category union and CATEGORY_HEADINGS

**Installer App**:  
- apps/installer/src/components/work/TicketCard.tsx — added 'installation' to TWO_STEP_CATEGORIES
- apps/installer/src/components/work/ConfigureEquipmentInline.tsx — extended HEADINGS union and added 'installation' branch
- apps/installer/src/routes/TaskDetailPage.tsx — extended ConfigureEquipmentInline render gate to include category === 'installation'

**Tests** (5 new test files added):  
- apps/admin/src/components/tareas/__tests__/ConfigureEquipmentPanel.test.tsx
- apps/installer/src/components/work/__tests__/ConfigureEquipmentInline.test.tsx
- apps/admin/src/hooks/__tests__/useConfigureTechnicalTicketEquipment.test.ts
- apps/installer/src/hooks/__tests__/useConfigureTechnicalTicketEquipment.test.ts
- apps/admin/src/components/servicio-tecnico/__tests__/TechnicalOrderForm.test.tsx

---

## Bugs Closed

| Bug | Root Cause | Fix | Status |
|-----|-----------|-----|--------|
| No `reserva` created for `installation` items | Admin form excluded `product_id` for installation (product_id required to gate reservation) | Extended form to require product_id for installation items | FIXED in eb7afa2 |
| No `egreso_instalacion` or `liberacion_reserva` at resolve | `resolve_ticket` guard excluded `installation` category | Extended guard to `IN (..., 'installation')` | FIXED in eb7afa2 |
| No equipment record created at resolve for `installation` | `resolve_ticket` inner branch (equipment creation) excluded `installation` | Extended inner guard to include `installation` | FIXED in eb7afa2 |
| No `intended_equipment_id` writeback on installer resolve | `technical_order_items_intent_immutable` trigger blocked all writes; no mechanism to allow swap under resolve | Added transaction-local GUC `app.allow_resolve_equipment_id_write` + trigger-side narrow-column admission (intended_equipment_id only) | FIXED in eb7afa2 |

---

## Verification Report Status

**Report Date**: 2026-08-31 18:02:25 UTC  
**Verdict**: PASS WITH WARNINGS (0 CRITICAL, 2 WARNING, 2 SUGGESTION)  
**Observation ID**: #337 (full content in Engram)

### Test Counts (Final)

Per verify-report at verification time and confirmed final in commit eb7afa2:

- **Admin**: 647/647 tests green across 92 files  
- **Installer**: 77/77 tests green across 14 files  
- **Pre-existing failure**: useTicketHistory.test.ts (1 test, mock config issue, exists in HEAD before this change)  
- **All new tests**: GREEN (ConfigureEquipmentPanel, ConfigureEquipmentInline, useConfigureTechnicalTicketEquipment×2, TechnicalOrderForm schema)

### Migration Audit

- `technical_order_items_intent_immutable`: Added v_allow_resolve_equipment variable + narrow-bypass branch. Baseline preserved.  
- `configure_technical_ticket_equipment`: Guard extended to include 'installation'. All other lines verbatim.  
- `resolve_ticket`: Outer guard extended; inner branch extended; intent-bypass window inserted after ticket equipment_id update. Baseline equipment_replacement branch untouched.  

### Warnings (Follow-Up Items, Not Blockers)

**WARNING 1**: No TareaDetailPage test asserting category='installation' routes to ConfigureEquipmentPanel  
- **Severity**: Low (constant is 3 lines, downstream component tests cover observable behavior)  
- **Status**: ACKNOWLEDGED FOLLOW-UP — captured in backlog  
- **Why not blocker**: ConfigureEquipmentPanel tests confirm panel renders; constant routing is straightforward  

**WARNING 2**: TicketCard TWO_STEP_CATEGORIES has no covering Vitest test  
- **Severity**: Low (card-level render + checkbox affordance covered by ConfigureEquipmentInline tests)  
- **Status**: ACKNOWLEDGED FOLLOW-UP — captured in backlog  
- **Why not blocker**: Downstream behavior is fully tested; TicketCard is a routing constant  

### Suggestions (Hygiene, Not Required)

**SUGGESTION 1**: Error message copy drift in `configure_technical_ticket_equipment`  
- **Original claim** (per verify-report, obs #337): Exception message still says "only equipment_installation and equipment_replacement" after guard extension  
- **RESOLVED in commit eb7afa2**: Migration file updated to include 'installation' in error message. Suggestion is now FIXED, not a follow-up.  
- **Evidence**: verify-report observation noted this as S1; final-state facts confirm fix landed in commit eb7afa2  

**SUGGESTION 2**: Product selector render test  
- **Issue**: No test explicitly asserts TechnicalItemEquipmentField renders the stock product dropdown when itemType='installation'  
- **Severity**: Low (form schema tests pass; behavior covered by ConfigureEquipmentPanel integration tests)  
- **Status**: ACKNOWLEDGED FOLLOW-UP — low-priority hygiene task  

---

## Verification Method

1. **Vitest (TDD mode)**: All test suites run to green before verify start; new tests added RED, made GREEN by apply changes
2. **SQL migration audit**: Manual checklist verifying guard extensions, GUC contract, and intent-bypass window sequencing (documented in design section 9 and manual-verification.md)
3. **Pre-existing test counts**: Verified no regression from baseline

Per verify-report (obs #337), all verification gates passed. No CRITICAL issues. All 22/22 tasks complete.

---

## Specs Synced to Main

Four new capability domains synced to openspec/specs (full specs, not deltas, because these domains did not previously exist):

| Domain | Spec File | Requirements |
|--------|-----------|--------------|
| technical-order-lifecycle | openspec/specs/technical-order-lifecycle/spec.md | 4 MODIFIED (configure guard, resolve guard, intent-bypass GUC, confirm reservation invariant) |
| admin-technical-order-form | openspec/specs/admin-technical-order-form/spec.md | 2 MODIFIED (product_id required for installation, category union) |
| admin-tarea-detail | openspec/specs/admin-tarea-detail/spec.md | 2 MODIFIED (category constant extension, heading map) |
| installer-ticket-detail | openspec/specs/installer-ticket-detail/spec.md | 2 MODIFIED (category constant extension, render gate) |

**Sync Method**: Mechanical copy via shell (`cp`) with mandatory readback diff verification (no model-based Read/Write).

**Readback Diff Results**:
- technical-order-lifecycle: ✓ empty diff (identical)
- admin-technical-order-form: ✓ empty diff (identical)
- admin-tarea-detail: ✓ empty diff (identical)
- installer-ticket-detail: ✓ empty diff (identical)

---

## Archive Contents

Moved from `openspec/changes/technical-installation-stock-lifecycle/` to `openspec/changes/archive/2026-08-31-technical-installation-stock-lifecycle/`:

- proposal.md ✓
- design.md ✓
- tasks.md ✓ (22/22 tasks checked)
- apply-progress.md ✓
- manual-verification.md ✓
- verify-report.md ✓ (only in memory via obs #337; filesystem version synced with archive)
- specs/ directory (4 domains) ✓

**Readback Diff**: Empty (archive contents match pre-move snapshot exactly). ✓

---

## Final-State Authority & Ranking

Per sdd-archive skill §Final-State Authority:

1. **Native review authority**: Not applicable (no native review gate for this candidate)
2. **Tasks artifact**: All 22 implementation tasks checked in persist persisted tasks.md ✓
3. **Final-state facts from launch prompt**:
   - "Suggestion S1 (error message copy drift) was FIXED after verify by updating the migration file to include 'installation' in error message" → RESOLVED, not follow-up
   - All 22 tasks noted as complete in launch prompt → confirmed by inspection of tasks.md
   - Commit eb7afa2 verified as single PR merge (23 files, 2317 insertions, 31 deletions)
4. **Verify-report (obs #337)**: PASS WITH WARNINGS; baseline snapshot at verification time; intermediate warnings W1/W2 reconfirmed as follow-ups; suggestion S1 updated to RESOLVED by final-state facts

**Contradiction Resolution**: verify-report (obs #337) captured S1 as pending; final-state facts override with evidence (eb7afa2 commit includes updated migration). Archive report records S1 as RESOLVED per authoritative final-state ranking.

---

## SDD Cycle Closure

✓ **Proposal** (obs #332): Change scope and approach defined  
✓ **Spec** (obs #333): 4 domains, formal requirements + scenarios  
✓ **Design** (obs #334): 9 decisions, exact migration/UI sequencing, bypass mechanism  
✓ **Tasks** (obs #335): 22 tasks, 6 phases, single-PR delivery  
✓ **Apply**: All tasks complete, changes merged to main as eb7afa2  
✓ **Verify** (obs #337): PASS WITH WARNINGS, 0 CRITICAL, all bugs closed  
✓ **Archive**: Specs synced, change folder archived, all artifacts preserved  

The change is **COMPLETE** and ready for production.

---

## Artifact References

For full traceability, all intermediate SDD artifacts are recorded in Engram:

| Artifact | Observation ID | Topic Key |
|----------|----------------|-----------|
| Proposal | #332 | sdd/technical-installation-stock-lifecycle/proposal |
| Spec | #333 | sdd/technical-installation-stock-lifecycle/spec |
| Design | #334 | sdd/technical-installation-stock-lifecycle/design |
| Tasks | #335 | sdd/technical-installation-stock-lifecycle/tasks |
| Verify Report | #337 | sdd/technical-installation-stock-lifecycle/verify-report |
| Archive Report | (this file) | sdd/technical-installation-stock-lifecycle/archive-report |

---

## Manual Verification Checklist

End-users and reviewers can perform manual E2E verification using the checklist documented in:

`openspec/changes/archive/2026-08-31-technical-installation-stock-lifecycle/manual-verification.md`

Steps:
1. Seed database with test data (products, orders)
2. Create technical order with `item_type='installation'`
3. Confirm order (assert `stock_movement.reserva` created)
4. Configure equipment (assert `pending_new_serial` and `pending_new_model` set)
5. Resolve order (assert equipment created, `egreso_instalacion`, `liberacion_reserva`, `intended_equipment_id` writeback)
6. Verify intent immutability (negative test: admin cannot change `intended_equipment_id` after resolve)

---

## Key Learnings (Archive Phase)

1. Symmetric guard extension (not new logic) was the correct minimum-delta fix because four distinct bugs shared one root cause: the installation category was mapped but excluded from every downstream guard.

2. The double-gate bypass pattern (transaction-local GUC + trigger-side narrow-column admission) successfully confined the intent-immutable trigger bypass to a single-caller context (resolve_ticket) while preventing accidental leakage.

3. Four spec domains that did not previously exist were added to the main openspec tree; no destructive merges were required because these are net-new capabilities, confirming the openspec convention's additive-only model.

4. Verification warnings W1 and W2 (missing page-level test cases) remain as acknowledged follow-ups because the observable behavior they implicitly test is already covered by component-level tests and the constant routing is straightforward code.

5. The archive readback diff confirmed exact byte-identity of archived artifacts with no truncation or loss through mechanical (shell-only) copy operations.
