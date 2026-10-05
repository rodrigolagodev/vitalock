# Verification Report: ui-components-hig (F1)

**Mode**: Strict TDD (runner: `pnpm test`, Vitest). **Artifacts**: proposal, design, 2 delta specs, tasks, apply-progress (all present).
**Verdict**: PASS WITH WARNINGS

## Completeness

Tasks 35/36 checked. Unchecked: 6.5 (before/after screenshots). It is a manual runtime check owned by the orchestrator and was excluded from blocking by instruction. Reported as WARNING, not CRITICAL.

## Execution evidence

| Command          | Exit | Result                                                                                                                      |
| ---------------- | ---- | --------------------------------------------------------------------------------------------------------------------------- |
| `pnpm lint`      | 0    | 5/5 tasks, no errors (Turbo cache replay of identical inputs)                                                               |
| `pnpm typecheck` | 0    | 8/8 tasks, no errors (cache replay)                                                                                         |
| `pnpm test`      | 0    | ui 377, admin 846, installer 127, shared 205, supabase 80, all passing. `test_output_hash` sha256:d70f9e9eb626ce65 (prefix) |

Static greps: no `h-[52px]`, `text-[28px]`, `common/Section`, `status-neutral`, `rounded-[9px]`, `rounded-[12px]` in apps/packages. No `size="sm"` in `apps/installer/src`. Card has no shadow class. `common/Section.tsx` deleted. FormField exported from the package index.

## TDD compliance

| Check                       | Result | Details                                                                                                                                                             |
| --------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TDD evidence table reported | OK     | present in apply-progress                                                                                                                                           |
| Test files exist            | OK     | 7 new test files confirmed in the working tree (form-field, EmptyState, ErrorState, StatCard, EquipoDetailPage, KeyDetailPage, AddCommentForm) plus modified suites |
| GREEN confirmed             | OK     | all suites pass on my run                                                                                                                                           |
| Triangulation               | OK     | multiple cases per behaviour                                                                                                                                        |
| Safety net                  | OK     | recorded for modified files; "N/A (new)" rows are new files                                                                                                         |

## Spec compliance matrix

Counts (from spec files): 7 requirements (design-system: 4 MODIFIED + 2 ADDED; admin-shell: 1 MODIFIED), 37 scenarios.

| Requirement                                                                                 | Scenarios | Evidence                                                                 | Status                                                                |
| ------------------------------------------------------------------------------------------- | --------- | ------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| Shared Design Tokens (incl. `status-neutral` retirement, neutral StatusBadge)               | 7         | `tokens.test.ts`, `StatusBadge.test.tsx`, rg clean                       | COMPLIANT                                                             |
| Light-first Sizing (heights, radius, no shadow, cn merge, installer 44px)                   | 6         | `primitives.test.tsx`, `utils.test.ts`, rg: no installer `size="sm"`     | COMPLIANT (class assertions)                                          |
| Pattern Components (SectionHeading, Section retired, EmptyState, ErrorState, ErrorFallback) | 11        | SectionHeading/EmptyState/ErrorState/ErrorFallback/Equipo/Key page tests | COMPLIANT                                                             |
| StatCard                                                                                    | 2         | `StatCard.test.tsx`                                                      | COMPLIANT                                                             |
| Form Field Accessibility                                                                    | 7         | `form-field.test.tsx` (8 cases), both LoginPage tests                    | COMPLIANT                                                             |
| Icon Button Hit Area                                                                        | 2         | `primitives.test.tsx` IconButton (relative, `after:size-control-md`)     | COMPLIANT (class assertion; real 44px hit area unmeasurable in jsdom) |
| PageHeader Sizing (admin-shell)                                                             | 3         | `PageHeader.test.tsx`                                                    | COMPLIANT                                                             |

No scenario is UNTESTED or FAILING.

## Assertion quality

Many assertions are CSS-class checks (about 17 test files). This is the known deviation: design.md authorises class assertions because jsdom cannot measure layout, and behavioural assertions (roles, aria, handlers) are used wherever they exist. Class assertions are the only runtime proof for sizing/token scenarios. No tautologies, ghost loops or smoke-only tests found in the new files sampled. Rated WARNING (accepted, documented).

## Design coherence

| Decision                                                        | Followed                         |
| --------------------------------------------------------------- | -------------------------------- |
| D1-D3 control tokens, Button, IconButton                        | Yes                              |
| D4 FormField (`useId`, `cloneElement`), both LoginPages         | Yes                              |
| D5 EmptyState/ErrorState, ErrorFallback delegates               | Yes                              |
| D6/D7 SectionHeading title-3, Section deleted, 15 sites         | Yes (counts deviate, documented) |
| D8-D11 Card, StatCard, PageHeader, neutral status, installer sm | Yes                              |

## Delta-spec archive order

`ui-foundations-hig` (F0) is committed (6a99004) but its change folder is still under `openspec/changes/`, not archived. The F1 design-system delta restates "Shared Design Tokens" as F0 text plus one clause, so F0 MUST be archived first, then F1. Otherwise F1 would overwrite F0's modification of that requirement. The proposal references F0. No conflict while the order is respected.

## Structural validity

Change folder has proposal, design, tasks, apply-progress and two delta specs with GIVEN/WHEN/THEN scenarios. Proposal § Impact records `size:exception` (about 1,057 lines, mostly tests), matching the delivery instruction. `tasks.md` still says "~630 lines" in its forecast (stale vs measured), minor.

## Issues

CRITICAL: none.

WARNING:

1. Task 6.5 (screenshots, confirming installer targets stay 44px or more) not complete; runtime layout is not proven by any test. Orchestrator is handling it.
2. Layout/sizing scenarios are proven by class assertions only (accepted deviation).
3. F0 not yet archived; archive F0 before F1.
4. Spec text for PageHeader says breadcrumb "keeps `text-xs`" while code and tasks use `text-footnote`. Tests do not contradict, but the spec wording is stale.
5. Lint and typecheck results were Turbo cache replays (inputs unchanged); tests were executed (exit 0).
6. Working tree contains unrelated untracked change folders (`admin-ui-consistency`, `installer-mobile-hig`); keep them out of this PR.

SUGGESTION:

1. Update the stale `~630` forecast line in tasks.md.
2. TaskDetailPage "Descargar" keeps an `h-7` override, which is below 44px in the installer. Confirm it is intentional (design says compact by design) and exempt it in the touch-floor scenario or screenshot check.

## Result

Status: done. Next: sdd-archive after 6.5 screenshots are confirmed (archive F0 first).
