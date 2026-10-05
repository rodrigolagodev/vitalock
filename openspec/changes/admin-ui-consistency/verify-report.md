```yaml
schema: gentle-ai.verify-result/v1
evidence_revision: sha256:198d91a640979498525cda19f7157b4dad636d833732c0884a3101c0bfaa7bc6
verdict: pass_with_warnings
blockers: 0
critical_findings: 0
requirements: 9/9
scenarios: 64/64
test_command: env -u SENTRY_AUTH_TOKEN pnpm exec turbo run test --force
test_exit_code: 0
test_output_hash: sha256:99bacb8a96c7f7d3fab9bef43e083b7cf677881b75811e41292337b1e4ff96ca
build_command: env -u SENTRY_AUTH_TOKEN pnpm exec turbo run lint typecheck --force
build_exit_code: 0
build_output_hash: sha256:82bf114a89f9474781de9c4c478a818762949e8a8b263bbca0a89fd60f24f2b1
```

## Verification Report

**Change**: admin-ui-consistency
**Version**: N/A (delta specs: admin-shell 7 requirements/43 scenarios, design-system 2 requirements/21 scenarios)
**Mode**: Strict TDD
**Branch / HEAD**: feat/admin-ui-consistency @ 0cc309ed65abab3a7fe79e0c816d64c7edf9cd86 (commits 3aa9fa9, ef18e2a, fd58dc2, 0cc309e on F1 9eb996c); tree clean

### Completeness

| Metric           | Value                                                                        |
| ---------------- | ---------------------------------------------------------------------------- |
| Tasks total      | 77 (Phase 0: 8, P1: 40, P2: 11, P3: 9 + 20 sub-items grouped, P4: 7, P5: 10) |
| Tasks complete   | all checked, none unchecked                                                  |
| Tasks incomplete | 0                                                                            |

### Build & Tests Execution

Note: `pnpm test --force` is not a valid pnpm option (ERR "Unknown option: force"); the equivalent uncached run was `pnpm exec turbo run test --force`.

| Command                                         | Exit    | Result                                                                                                            |
| ----------------------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------- |
| `pnpm lint` (re-run uncached via turbo --force) | 0       | 13/13 tasks (lint + typecheck) successful                                                                         |
| `pnpm typecheck` (uncached)                     | 0       | successful                                                                                                        |
| `pnpm exec turbo run test --force`              | 0       | ui 32 files/401 tests; admin 123/999; shared 23/205; installer 22/127; supabase 7/80; 0 failures                  |
| `pnpm lint:hardcodes`                           | 0       | no findings                                                                                                       |
| `pnpm test:scripts`                             | 0       | node:test 46 pass, 0 fail                                                                                         |
| e2e                                             | skipped | not re-run by verify, by instruction; apply reported 37/37 admin (auth, navigation 10, a11y 24) and 2/2 installer |

Coverage: not available (no coverage run configured in the gate).

### TDD Compliance (strict-tdd-verify)

- Apply-progress has a TDD Cycle Evidence table for every unit. WU2, WU3 and WU4 record real RED runs (failing counts named). WU1 tasks 1.1-1.39 are marked "resumed: verified post-hoc": no recorded RED run (API rate limit killed the first apply). Tests exist and pass, but RED-before-GREEN is unproven for WU1. WARNING (process, not behaviour).
- Button hover change: RED recorded (axe fail), test added.

### Spec Compliance Matrix (summary, by requirement; runtime proof = full suite green above)

| Requirement                                 | Scenarios | Covering tests                                                                                                                                                                                   | Result                                                                                                                                                                  |
| ------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Page Identity Consistency                   | 7         | page tests (KeyOrders, KeyOrderDetail/Nueva/Editar, AdministrationDetail, BuildingDetail, Equipos, TechnicalOrders, Inventario, Historial); navigation.spec updated                              | COMPLIANT 7/7                                                                                                                                                           |
| Loading and Not-Found States                | 6         | EquipoDetailPage, KeyDetailPage, EquipmentKeySnapshotPanel, KeyItemDetailsDialog, CargarProductoSheet tests; only animate-spin in source is the CargarProductoSheet button spinner (rg verified) | COMPLIANT 6/6                                                                                                                                                           |
| Destructive and Unsaved-Change Confirmation | 13        | StaffTable, AdministrationStatusToggle, useUnsavedChangesGuard (incl. block, confirm, dismiss, clean, POP, search-only), KeyOrderForm and TechnicalOrderForm tests; no window.confirm in source  | COMPLIANT 13/13 (see W3)                                                                                                                                                |
| Data Router and Navigation Blocking         | 3         | router.test.tsx (24 paths), "does not throw on mount" test; createBrowserRouter in router.tsx, no BrowserRouter in source                                                                        | COMPLIANT 3/3                                                                                                                                                           |
| Form Field Adoption                         | 5         | expectFieldErrorWiring in 20 form tests, form-field.test, getByLabelText retained                                                                                                                | COMPLIANT 5/5 (W2 on literal reading of "no ad-hoc error p")                                                                                                            |
| Accessibility E2E Gate                      | 4         | a11y.spec.ts (apply run only); axe is devDependencies only; EXCLUDED_RULES empty                                                                                                                 | 4 COMPLIANT on the design-ratified scope (lists + 2 forms); "Main routes have no serious violations" is judged compliant on that scope only, spec wording is wider (W1) |
| Error Retry and Empty State Adoption        | 4         | per-page retry tests; DataTable/DataCardList emptyState tests; 21 of 27 ErrorState sites have onRetry, the other 6 are the "ID inválido" sites left deliberately                                 | COMPLIANT 4/4                                                                                                                                                           |
| Pattern Components (design-system)          | 13        | ConfirmDialog.test, ErrorState.test, EmptyState, SectionHeading, BoundaryFallbacks tests                                                                                                         | COMPLIANT 13/13                                                                                                                                                         |
| Hardcoded Value Gate (design-system)        | 8         | lint-hardcodes.test.mjs (46 cases), fixtures, tokens tests, off-token-classes tests, order-form chip tests, admin-checks.yml steps without continue-on-error                                     | COMPLIANT 8/8                                                                                                                                                           |

**Compliance summary**: 64/64 scenarios compliant (one on the design-ratified reduced scope, see W1).

### Evaluation of apply deviations

1. **Prettier churn in fd58dc2** (52 files, +2196/-1724): the large deletion count is dominated by FormField replacing the label+error markup (KeyOrderForm, TechnicalOrderForm, ParticularFormSheet, QuickParticularCreateDialog etc. lose ~100-300 lines each), not by pure reformatting; I found no standalone whitespace-only files in the stat (every touched file is a migrated form, its test, FormField or the index). Acceptable, but it makes the commit hard to review. SUGGESTION: reviewer should use `git diff -w`.
2. **FormField wraps Controller** (design said FormField inside render): behaviour-equivalent, a11y props close over into render, errors read from the errors object either way; the wiring test passes on all Controller forms. Acceptable, record as design deviation (WARNING W4, no spec impact).
3. **Page tests without blocker cases**: acceptable. Blocker scenarios are covered at hook and form level under a real data router; page tests stub the form, so blocker cases there would test the stub. Spec scenarios only name the forms. Task 2.7 listed six files, so this is a documented deviation from the task text, not from the spec.
4. **Request shim in test setup** (apps/admin/src/test/setup.ts): jsdom AbortSignal vs Node Request, needed by createMemoryRouter. Test-only, scoped to the admin vitest setup, guarded by typeof check. Acceptable. SUGGESTION: add a comment pointing to the upstream issue or version after which it can go.
5. **Button hover:brightness-95**: VERIFIED in packages/ui/src/components/button.tsx:12 (default variant) with a class test in packages/ui/src/components/**tests**/primitives.test.tsx:44-45 (asserts brightness-95 present and hover:bg-primary/90 absent). Same change reported for AuthErrorPage. It changes the shared Button hover visual across all apps (installer included), which is out of the declared admin scope but justified by the axe contrast failure (4.1:1) and is covered. NavItem keeps its own hover class. WARNING W5 (cross-app visual change, note in PR).

### Design coherence

| Decision                                | Followed? | Notes                                          |
| --------------------------------------- | --------- | ---------------------------------------------- |
| 1 guard hook / 2 ConfirmDialog widening | Yes       |                                                |
| 3-4 data router, blocker                | Yes       | router.tsx, RouteErrorFallback, SuspenseOutlet |
| 5 skeleton / not-found                  | Yes       |                                                |
| 6-8 identity, retry, empty states       | Yes       | cut line not used                              |
| 9-10 off-token, hardcode gate           | Yes       | .css not scanned, matches spec and design      |
| 11 FormField                            | Partly    | Controller wrapping inverted (W4)              |
| 12 axe gate                             | Partly    | lists plus 2 forms only (W1)                   |
| 13 skill update                         | Yes       |                                                |

### Issues Found

**CRITICAL**: None.

**WARNING**:

- W1. Accessibility E2E Gate spec text requires axe on administration detail, building detail and login (at least); a11y.spec.ts audits the 10 list routes and 2 invalid forms, light and dark. Design Open Question and task 4.5 chose "lists and forms only" and the assumption was recorded, but the spec was not amended. The scenario "Main routes have no serious violations" is therefore covered only for the narrower design-ratified scope. Resolve before archive: either amend the delta spec wording to match, or add the three routes. Also the e2e result relies on the apply run; verify did not re-run it.
- W2. KeyOrderForm and TechnicalOrderForm keep per-item error summaries as `<p className="text-destructive text-xs">` (collapsed-row summaries, task 3.7 carve-out). The spec scenario "No ad-hoc error markup remains" reads literally against them. The carve-out is documented in tasks but not in the spec; amend the spec or accept.
- W3. WU1 has no recorded RED runs (resumed post-hoc), so strict TDD ordering for tasks 1.1-1.39 is unproven.
- W4. Design Decision 11 deviation (FormField wraps Controller), see above.
- W5. Button hover change affects every app using @vitalock/ui.
- W6. Archive order: F0 (ui-foundations-hig) and F1 (ui-components-hig) are still under openspec/changes/ (not archived). F2's design-system delta MODIFIES "Pattern Components" as F1 text plus one clause, so it must archive third: F0, then F1, then F2. Archiving F2 earlier would drop F1's SectionHeading/EmptyState/ErrorState wording.

**SUGGESTION**:

- Design counted 5 "ID inválido" ErrorState sites; the tree has 6 detail pages with a second ErrorState lacking onRetry (Tarea, TechnicalOrder, KeyOrder, Building, Administration, Stock). Reconcile the count in docs.
- Comment on the Request shim (see above); review fd58dc2 with `git diff -w`.
- Delivery: single PR with `size:exception` (about 5,000 lines changed across 4 commits vs the 800 budget); state it in the PR description (task 5.9).
- Structural validity: proposal, design, tasks, apply-progress and two delta specs present with Requirement/Scenario structure in both specs; no openspec CLI exists (file-system convention), so validity is by inspection.

### Verdict

PASS WITH WARNINGS
0 CRITICAL, 6 WARNING, 3 SUGGESTION; all gates green and every scenario covered by a passing test with the axe route scope narrower than the spec wording (W1).
