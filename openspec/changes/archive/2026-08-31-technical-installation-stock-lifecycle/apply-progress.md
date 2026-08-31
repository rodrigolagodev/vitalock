# Apply Progress: technical-installation-stock-lifecycle

**Mode**: Strict TDD
**Delivery**: single-pr (size:exception acknowledged — estimated 480–620 lines)
**Date**: 2026-08-31

---

## Phase Status

| Phase | Status | Notes |
|-------|--------|-------|
| 1. Database Migration | done | 3 functions replaced in delta migration |
| 2. Admin Form | done | Product selector + Zod guard for `installation` |
| 3. Admin Tarea Detail UI | done | `CATEGORIES_TWO_STEP_CONFIGURE` + `ConfigureEquipmentPanel` extended |
| 4. Installer UI | done | `TWO_STEP_CATEGORIES` + `ConfigureEquipmentInline` + `TaskDetailPage` gate |
| 5. Tests (Vitest) | done | 4 new admin tests, 4 new installer tests; all suites green |
| 6. Manual Verification Checklist | done | 6-step checklist committed |

---

## Files Changed

| File | Action | Description |
|------|--------|-------------|
| `supabase/migrations/20260901120000_extend_installation_category_lifecycle.sql` | Created | Delta migration: 3 functions (trigger, configure, resolve) with GUC bypass and extended category guards |
| `apps/admin/src/components/servicio-tecnico/TechnicalOrderForm.tsx` | Modified | `TechnicalItemEquipmentField` renders product selector for `installation`; Zod `superRefine` requires `product_id` when `item_type='installation'`; collapsed error summary shows `product_id` error |
| `apps/admin/src/routes/tareas/TareaDetailPage.tsx` | Modified | `CATEGORIES_TWO_STEP_CONFIGURE` now includes `'installation'` |
| `apps/admin/src/components/tareas/ConfigureEquipmentPanel.tsx` | Modified | `CATEGORY_HEADINGS`, `EMPTY_HELP`, and category cast widened to include `'installation'` |
| `apps/installer/src/components/work/TicketCard.tsx` | Modified | `TWO_STEP_CATEGORIES` now includes `'installation'` |
| `apps/installer/src/components/work/ConfigureEquipmentInline.tsx` | Modified | `HEADINGS` record and category cast widened to include `'installation'` |
| `apps/installer/src/routes/TaskDetailPage.tsx` | Modified | `ConfigureEquipmentInline` render gate extended for `category === 'installation'` |
| `apps/admin/src/components/tareas/__tests__/ConfigureEquipmentPanel.test.tsx` | Modified | Added: `installation` category renders panel heading |
| `apps/installer/src/components/work/__tests__/ConfigureEquipmentInline.test.tsx` | Modified | Added: `installation` heading, configure submit, no-checkbox assertions |
| `apps/admin/src/hooks/__tests__/useConfigureTechnicalTicketEquipment.test.ts` | Modified | Added: `installation` ticket payload passes to mocked RPC |
| `apps/installer/src/hooks/__tests__/useConfigureTechnicalTicketEquipment.test.ts` | Modified | Added: symmetric `installation` RPC pass-through case |
| `apps/admin/src/components/servicio-tecnico/__tests__/TechnicalOrderForm.test.tsx` | Modified | Added: 5.9a/5.9b schema unit tests; updated T-14c-1k to match new product_id requirement |
| `openspec/changes/technical-installation-stock-lifecycle/manual-verification.md` | Created | 6-step E2E manual verification checklist with SQL assertions |

---

## TDD Cycle Evidence

| Task | RED | GREEN | REFACTOR |
|------|-----|-------|----------|
| 5.1 ConfigureEquipmentPanel `installation` heading | Confirmed: test failed "Unable to find text /configurar equipo a instalar/i" | Passed after CATEGORY_HEADINGS + cast widened (task 3.2) | No refactor needed |
| 5.3 ConfigureEquipmentInline `installation` heading + submit + no checkbox | Confirmed: test failed "Unable to find text /equipo a instalar/i" | Passed after HEADINGS + cast widened (task 4.2) | No refactor needed |
| 5.5 Admin hook installation payload | Passed immediately (hook is category-agnostic) | N/A — already green | N/A |
| 5.7 Installer hook installation payload | Passed immediately (hook is category-agnostic) | N/A — already green | N/A |
| 5.9a TechnicalOrderForm installation requires product_id | Confirmed: test failed "Unable to find text /elegí un equipo del stock/i" | Passed after Zod superRefine extended + collapsed error summary updated (task 2.2) | No refactor needed |
| 5.9b TechnicalOrderForm installation with product_id passes | Passed immediately after 5.9a GREEN | N/A — same implementation | N/A |

---

## Test Counts

| Package | Before | After | Delta |
|---------|--------|-------|-------|
| admin | 643 tests, 92 files passing | 647 tests, 92 files passing | +4 tests |
| installer | 73 tests, 14 files passing (1 pre-existing failure) | 77 tests, 14 files passing (1 pre-existing failure) | +4 tests |

Pre-existing failure: `apps/installer/src/hooks/__tests__/useTicketHistory.test.ts` — unrelated to this change (missing `loadClientEnv` export in `@vitalock/shared` mock). Present in baseline before any edits.

---

## Deviations from Design

1. **T-14c-1k test update**: The existing test "allows installation item without equipment when assignee is set" (with `product_id: null`) was updated to reflect the new requirement. The test description was corrected from "optional for installation" to "requires product_id" — this aligns with Design §5 and Spec `admin-technical-order-form`. The test comment explicitly flags this as a behavior change.

2. **`v_toi.id IS NOT NULL` guard in migration**: The intent-bypass UPDATE in `resolve_ticket` uses `WHERE id = v_toi.id AND v_toi.id IS NOT NULL`. This is correct — if `v_toi` is null (no linked order item), the UPDATE is a no-op. This matches Design §4 step 7 "Skipped as a no-op when `v_toi.id IS NULL`."

---

## Migration Verification Note

`supabase db reset` was NOT run (remote Supabase project — deferred to sdd-verify phase per task instructions). The migration SQL was reviewed character-by-character against the baseline functions at lines 1087, 2975, and 3534 of `20260831000000_baseline.sql`. All function bodies reproduced verbatim except for the targeted changes. Manual verification checklist in Phase 6 covers the E2E runtime path.

---

## Risks

- **Migration copy errors (highest risk)**: Mitigated by reading baseline functions verbatim from `20260831000000_baseline.sql` and making only the documented targeted edits. The migration comment header documents the GUC contract.
- **Pre-existing installer test failure**: `useTicketHistory.test.ts` fails due to a mock setup issue in `@vitalock/shared` — unrelated to this change. sdd-verify must confirm this was pre-existing.
- **Legacy `installation` tickets**: Existing tickets in `open`/`in_progress` with no `product_id` on their linked item will correctly skip stock movements at resolve time (existing freestanding path). No breakage.

---

## Key Learnings

1. When four production bugs share one root cause (a single mapping gap in category guards), the minimum-delta fix is to extend the guards symmetrically rather than add new dispatch logic.
2. A TDD-strict codebase with category-agnostic hooks means hook tests for new categories pass immediately — the evidence of correctness is the hook's existing coverage, not a failing RED cycle.
3. Collapsed form item error summaries must explicitly enumerate each validated field — adding a new Zod guard without surfacing its error in the collapsed view renders the validation invisible to the user.
4. The GUC bypass pattern (`set_config(..., true)` + narrow-column admission in the trigger) requires two independent gates: transaction-local scoping prevents cross-transaction leakage, while the column check prevents intra-transaction misuse if the GUC somehow reaches a sibling UPDATE.
5. Reading baseline function bodies verbatim before delta migration authoring is the highest-leverage anti-copy-error practice for squashed-baseline codebases.
