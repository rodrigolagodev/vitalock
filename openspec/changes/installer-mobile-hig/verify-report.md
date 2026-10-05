# Verify Report: installer-mobile-hig

Mode: Strict TDD. Branch feat/installer-mobile-hig (a6a4480, 9a0189e, 756e07e on F1).

## Verdict: PASS WITH WARNINGS (0 CRITICAL, 2 WARNING, 2 SUGGESTION)

## Gate

- pnpm lint: PASS (5/5 tasks)
- pnpm typecheck: PASS (8/8 tasks)
- pnpm test: PASS (admin 846, per apply-progress ui 396, installer 166, shared 205, supabase 80). Turbo replayed cached results for lint/typecheck; admin tests ran fresh.

## Structure

proposal, design, tasks, apply-progress and 5 delta specs (design-system, equipment-updates, installer-home, installer-shell, installer-ticket-detail) present. Deltas use ADDED/MODIFIED headings. The MODIFIED targets exist in baseline (equipment-updates "Installer UI - Rollback Download Section", installer-home R4 and R7).

## Archive order

design-system delta is purely ADDED and touches none of the requirements F0/F1 modify, so F0, F1, F3 loses nothing. installer-home and equipment-updates deltas are not touched by F0/F1. Archive after F0 then F1 is safe.

## Spec to code spot-check (all matched)

- TabBar, safe-area tokens, bottom sheet (grabber aria-hidden, rounded-t-sheet, h-safe-b, max-h-sheet): packages/ui.
- Shell: pt-safe-t header, ConnectivityBanner mounted only in AppShell, Sidebar/InstallerNav/MobileSidebar removed (rg empty).
- PWA: viewport-fit=cover, apple meta and touch icon, separate any/maskable entries, toastOffset on Toaster; no new dependency.
- TaskDetail: StickyActionBar (sticky, backdrop-blur), ConfirmDialog closing in onSettled, useOfflineGate ("Sin conexion"), sheets for configure/comment, serial field autoCapitalize/autoCorrect/spellCheck.
- Home: Dashboard skeleton aria-busy, ErrorState onRetry to refetch on Dashboard and Tareas.
- EquipmentUpdateResolveDetail deleted (rg empty).

## Deviations evaluated

- TabBar uses NavLink: ACCEPTED. Matches design Decision 1; ui already depends on react-router; spec reworded.
- cn dedupes safe spacing: ACCEPTED, consistent with h-control-md; tests triangulate. Task 2.2 text is stale versus behaviour (see W1).
- Obsolete Dashboard "Cargando tareas" test removed: ACCEPTED, contradicts SC-R4-1.

## Issues

- W1 WARNING: tasks.md 2.2 still says cn keeps both pb-4 and pb-safe-b; actual (tested) behaviour is dedupe. Fix the task wording or note it before archive.
- W2 WARNING: not independently re-run by verify: e2e (apply-progress reports 2 passed) and unit counts for ui/installer (cached/trusted from apply-progress). Apply noted the Sentry plugin ran with SENTRY_AUTH_TOKEN set during e2e (source maps uploaded); unset it next time.
- S1 SUGGESTION: Task 6.4 (real device) and 6.5 (size:exception PR label) remain open; 6.4 is manual and non-blocking, 6.5 must be done at PR time. Proposal Impact (~1,570-1,720 lines) matches the size:exception decision; actual diff vs F1 is +2533/-1049 including PNGs and tests, so confirm the figure in the PR body.
- S2 SUGGESTION: proposal still lists "chained-pr" as an assumption in open questions (line ~109); superseded by the user decision, harmless.

## Next

sdd-archive after F0 and F1 are archived/merged, once 6.5 is done.
