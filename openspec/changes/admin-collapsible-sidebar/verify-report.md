```yaml
schema: gentle-ai.verify-result/v1
evidence_revision: sha256:f3cfcd10ff02d63494ca3ae47665150e77bbad178e5f90b3ac756721d1ee79ad
verdict: fail
blockers: 2
critical_findings: 2
requirements: 3/4
scenarios: 14/19
test_command: pnpm --filter admin test && pnpm --filter @vitalock/ui test
test_exit_code: 0
test_output_hash: sha256:f3cfcd10ff02d63494ca3ae47665150e77bbad178e5f90b3ac756721d1ee79ad
build_command: pnpm --filter @vitalock/ui exec tsc --noEmit && pnpm --filter admin exec tsc --noEmit
build_exit_code: 0
build_output_hash: sha256:d91a701857c15b4f49101d49e5d402bd7526b9e2a6bc4d9928d58de407463cab
```

## Verification Report

**Change**: admin-collapsible-sidebar
**Version**: N/A (no design.md; delta specs + proposal only)
**Mode**: Strict TDD (openspec/config.yaml `strict_tdd: true`)

### Completeness
| Metric | Value |
|--------|-------|
| Tasks total | 27 |
| Tasks complete | 25 |
| Tasks incomplete | 2 (Phase 9.1, 9.2 — manual dev-server verification) |

Phases 1–8 (automated work) are all checked. Phase 9 (manual `pnpm --filter admin dev` verification of toggle/transition/tooltips/Ctrl+\/reduced-motion/mobile) remains unchecked. Manual-only items, but they block the "all tasks complete" gate for full verification; reported as WARNING (cleanup-type), not a core-task block.

### Build & Tests Execution
**Build**: ✅ Passed (typecheck both packages)

```text
pnpm --filter @vitalock/ui exec tsc --noEmit   → exit 0 (clean)
pnpm --filter admin exec tsc --noEmit         → exit 0 (clean)
```

**Tests**: ✅ 719 passed (0 failed / 0 skipped)

```text
pnpm --filter admin test          → exit 0 — 92 files, 643 tests passed
pnpm --filter @vitalock/ui test   → exit 0 — 8 files, 76 tests passed
```

**Coverage**: ➖ Not collected (coverage tool configured but not run for this verification; changed-file coverage reported from structure below).

### Spec Compliance Matrix

| Requirement | Scenario | Test | Result |
|-------------|----------|------|--------|
| Tooltip Primitive | Tooltip appears on hover | `packages/ui/src/components/__tests__/tooltip.test.tsx` + `Sidebar.test.tsx` (tooltip on collapsed hover) | ✅ COMPLIANT |
| Tooltip Primitive | Tooltip hidden on reduced motion | (none — no test asserts reduced-motion behavior) | ❌ UNTESTED |
| Persistent Sidebar Layout | Expanded sidebar shows icons + labels | `Sidebar.test.tsx` (labels/sections), `NavItem.test.tsx` (label+badge) | ⚠️ PARTIAL (width 240px not asserted) |
| Persistent Sidebar Layout | Collapsed sidebar shows icons only | `Sidebar.test.tsx`, `NavItem.test.tsx` (labels/badge hidden, tooltip) | ⚠️ PARTIAL (width 64px not asserted) |
| Persistent Sidebar Layout | Toggle button controls sidebar state | `AppShell.test.tsx`, `Sidebar.test.tsx` | ✅ COMPLIANT (chevron rotation not asserted — minor) |
| Persistent Sidebar Layout | Collapsed user menu shows avatar only | `UserMenu.test.tsx` | ✅ COMPLIANT |
| Persistent Sidebar Layout | Keyboard shortcut toggles sidebar | `useSidebarCollapsed.test.ts` | ✅ COMPLIANT |
| Persistent Sidebar Layout | Accessibility attributes present | `Sidebar.test.tsx` (aria-expanded, aria-pressed, aria-label) | ✅ COMPLIANT |
| Persistent Sidebar Layout | Reduced motion disables transition | (none — `motion-reduce:transition-none` in source only) | ❌ UNTESTED |
| Persistent Sidebar Layout | Authenticated user sees Administraciones + Ordenes links | `Sidebar.test.tsx` (links + hrefs) | ✅ COMPLIANT |
| Persistent Sidebar Layout | Placeholder sections visible but disabled | (implementation has no Personal/Ventas/Tickets placeholder sections) | ❌ FAILING |
| Persistent Sidebar Layout | Brand header above the navigation | `Sidebar.test.tsx`, `AppShell.test.tsx` | ✅ COMPLIANT |
| useSidebarCollapsed Hook | Default state is expanded | `useSidebarCollapsed.test.ts` | ✅ COMPLIANT |
| useSidebarCollapsed Hook | State persists across reloads | `useSidebarCollapsed.test.ts` | ✅ COMPLIANT |
| useSidebarCollapsed Hook | localStorage unavailable → expanded | `useSidebarCollapsed.test.ts` | ✅ COMPLIANT |
| useSidebarCollapsed Hook | Keyboard shortcut works anywhere | `useSidebarCollapsed.test.ts` | ✅ COMPLIANT |
| Pattern Components | Pattern suite passes | UI suite (76 tests) | ✅ COMPLIANT |
| Pattern Components | SidebarGroup hides labels when collapsed | `patterns.test.tsx` | ✅ COMPLIANT |
| Pattern Components | SidebarGroup shows labels when expanded | `patterns.test.tsx` | ✅ COMPLIANT |

**Compliance summary**: 14/19 scenarios compliant

### Correctness (Static Evidence)
| Requirement | Status | Notes |
|------------|--------|-------|
| Tooltip Primitive | ✅ Implemented | Radix `Tooltip` with content/children/side/sideOffset/delayDuration, portals via `TooltipPrimitive.Portal`, `z-50` |
| Persistent Sidebar — collapse/expand | ✅ Implemented | `w-[64px]`/`w-[240px]`, `transition-[width] duration-300 ease-in-out motion-reduce:transition-none`, toggle button, `aria-expanded`/`aria-pressed`/`aria-label` |
| Persistent Sidebar — hide/avatar | ✅ Implemented | NavItem hides label/badge + Tooltip wrap; UserMenu avatar-only; SidebarGroup hides label |
| Persistent Sidebar — section structure | ❌ NOT followed | Spec requires Infraestructura/Ordenes/Personal/Ventas/Tickets (with placeholders); implementation uses Clienteles/Llaves/Equipos/Operación/Equipo interno, all live, no placeholders |
| useSidebarCollapsed Hook | ✅ Implemented | localStorage read/write, try/catch, Ctrl+\ / Cmd+\ global shortcut, consumed in AppShell |
| Pattern: SidebarGroup `collapsed` | ✅ Implemented | hides `<p>` label when collapsed |

### Coherence (Design)
| Decision | Followed? | Notes |
|----------|-----------|-------|
| Icon Rail pattern (240px ↔ 64px toggle) | ✅ Yes | Matches proposal Approach step 2 |
| Hook with localStorage + Ctrl+\ | ✅ Yes | Matches proposal Approach step 1 |
| Tooltip dependency in `packages/ui` | ✅ Yes | `@radix-ui/react-tooltip ^1.2.16` added, exported from `@vitalock/ui` |

Note: no `design.md` was produced for this change (proposal.md serves as the design source; the Approach section maps cleanly to the implementation). Design coherence verified against the proposal's Approach section.

### TDD Compliance (Strict TDD)
| Check | Result | Details |
|-------|--------|---------|
| TDD Evidence reported | ❌ | No `apply.md` in `openspec/changes/admin-collapsible-sidebar/`; no "TDD Cycle Evidence" table found in the engram apply-progress note (#326) |
| All tasks have tests | ✅ | Test files exist for tooltip, hook, SidebarGroup, NavItem, UserMenu, Sidebar, AppShell |
| RED confirmed (tests exist) | ✅ | 8 test files verified present for the change |
| GREEN confirmed (tests pass) | ✅ | All 719 tests pass on execution |
| Triangulation adequate | ⚠️ | Single-case for reduced-motion scenarios (none exist); most behaviors triangulated |
| Safety Net for modified files | ➖ | Not reported (no apply evidence) |

**TDD Compliance**: apply phase did not produce a TDD Cycle Evidence table — the Strict TDD protocol's primary artifact is missing. This is the CRITICAL process finding.

### Test Layer Distribution
| Layer | Tests | Files | Tools |
|-------|-------|-------|-------|
| Unit | 15 | 1 (useSidebarCollapsed), tooltip unit | vitest |
| Integration | ~22 | Sidebar, AppShell, NavItem, UserMenu, patterns, tooltip (render+userEvent) | @testing-library/react + user-event |
| E2E | 0 | — | not installed |

### Changed File Coverage
Coverage analysis skipped — no per-file coverage report collected during this verification (`coverage: available: true` in config but not run here).

### Assertion Quality
| File | Line | Assertion | Issue | Severity |
|------|------|-----------|-------|----------|
| `Sidebar.test.tsx` | 74–88 | asserts `aria-expanded`/`aria-pressed`, not width | Width classes `w-[240px]`/`w-[64px]` required by spec + task 8.1 never asserted → width behavior unproven | WARNING |
| (none) | — | — | No tautologies, no ghost loops, no smoke-only tests; assertions verify real behavior | — |

**Assertion quality**: 0 CRITICAL, 1 WARNING (width not asserted)

### Quality Metrics
**Linter**: ✅ No errors (eslint exit 0 on all changed source files)
**Type Checker**: ✅ No errors (tsc --noEmit exit 0 both packages)

### Issues Found
**CRITICAL**:
1. **Placeholder sections / sidebar section structure not per spec.** The admin-shell spec (base `openspec/specs/admin-shell/spec.md` and this change's delta) requires fixed-order sections `Infraestructura / Ordenes / Personal (placeholder) / Ventas (placeholder) / Tickets (placeholder)`, with Administraciones under Infraestructura and Ordenes as its own top-level section. The implementation (`Sidebar.tsx`) renders `Clientes / Llaves / Equipos / Operación / Equipo interno` with every NavItem live and NO placeholder sections. Scenario "Placeholder sections are visible but disabled" is FAILING; the persistent-sidebar requirement is not satisfied. Root cause appears to be pre-existing spec drift (the real sidebar evolved before this change and the delta spec re-stated stale section names), but per specs-first verification this is a contradiction requiring resolution (update the spec OR the sidebar).
2. **Strict TDD apply evidence missing.** OpenSpec config sets `strict_tdd: true`, but the apply phase produced no `apply.md` and no "TDD Cycle Evidence" table (not in the change dir, not in engram #326). Under the Strict TDD module this is CRITICAL — "was the code built correctly (TDD)" cannot be confirmed from evidence, even though tests exist and pass.

**WARNING**:
1. Phase 9 (manual dev-server verification: toggle, transitions, tooltips, Ctrl+\, reduced-motion, mobile unaffected) is unchecked — tasks 9.1/9.2 incomplete.
2. Reduced-motion scenarios (tooltip "hidden on reduced motion", sidebar "reduced motion disables transition") have NO runtime test; verified by source inspection only.
3. Sidebar width (`w-[240px]`/`w-[64px]`) is not asserted in any test despite being an explicit spec scenario and task 8.1; `aria-expanded` is tested but not the width class.
4. No `design.md` authored for this change (design coherence assessed against proposal Approach only).

**SUGGESTION**:
1. Add a test asserting `w-[64px]`/`w-[240px]` on the `<aside>` for both states to close the width coverage gap.
2. Add tests for `prefers-reduced-motion` (via `matchMedia` polyfill already in `setup.ts`) covering tooltip and sidebar transition disable.
3. Reconcile the admin-shell spec section list with the real sidebar (Clientes/Llaves/Equipos/Operación/Equipo interno) or implement placeholders, so spec and code agree.

### Verdict
**FAIL**
The collapsible sidebar feature (collapse/expand, toggle, tooltips, hook, persistence, accessibility) is correctly implemented and all 719 tests pass, but the implementation fails the spec's placeholder-section requirement, and Strict TDD apply evidence is absent.
