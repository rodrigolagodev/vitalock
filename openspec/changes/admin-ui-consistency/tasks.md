# Tasks: admin-ui-consistency

Phase F2 of `docs/design/ui-audit-2026-10-05.md`. Stacked on F1 (`ui-components-hig`), which is stacked on F0 (`ui-foundations-hig`). The design is authoritative; Decision numbers below refer to `design.md`. Strict TDD: every work unit runs RED (failing test written first) then GREEN (minimal implementation). UI copy is Spanish and asserted literally.

## Review Workload Forecast

| Field                   | Value                                                                                                                     |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Estimated changed lines | 1,900-2,300 authored (about 40% tests), plus the generated lockfile diff                                                  |
| 800-line budget risk    | High                                                                                                                      |
| Chained PRs recommended | No (user decision 2026-10-05)                                                                                             |
| Suggested split         | If the PR must shrink later: commits 2, 3 and 4 become follow-ups, and Decision 8 leaves commit 1 first (about 130 lines) |
| Delivery strategy       | single-pr (`exception-ok`)                                                                                                |
| Chain strategy          | size-exception                                                                                                            |

`size:exception` is acknowledged in `proposal.md § Impact`. The PR is reviewed by commit; each commit passes the verifier gate on its own.

## Suggested Work Units

| Unit | Goal                                                                       | PR / commit | Focused check                                                                                                       | Rollback                                                            |
| ---- | -------------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| WU1  | Core consistency: Decisions 1 (no blocker), 2, 5-10, 13 (~950-1,050 lines) | commit 1    | `pnpm --filter @vitalock/ui test`, `pnpm --filter @vitalock/admin test`, `pnpm lint:hardcodes`, `pnpm test:scripts` | revert commit 1 (reverts last, after 4, 3, 2)                       |
| WU2  | Data router and blocker: Decisions 3, 4, blocker in 1 (~400-450)           | commit 2    | `pnpm --filter @vitalock/admin test`, e2e navigation spec                                                           | revert commit 2; commit 1's hook API does not depend on the blocker |
| WU3  | FormField migration: Decision 11 (~550-650)                                | commit 3    | admin form tests, `pnpm --filter @vitalock/ui test`                                                                 | revert commit 3                                                     |
| WU4  | Axe gate: Decision 12 (~80 plus lockfile)                                  | commit 4    | `pnpm e2e` a11y spec (needs local stack)                                                                            | revert commit 4                                                     |

Order is sequential: WU1 -> WU2 -> WU3 -> WU4. WU2 needs WU1's hook and `ConfirmDialog` widening. WU3 needs WU1's off-token cleanup in the order forms (same files). WU4 audits WU3's error wiring. Parallelism is inside a unit only (marked `[P]`: touches disjoint files, no shared state).

## Phase 0 · Prerequisites (verify F0 and F1 on the stacked branch)

No code is written here except the conditional task 0.7. If a check fails and F1 has not landed, stop and report as blocked.

- [x] 0.1 Confirm the branch is stacked on F1 (`git log` shows F0 and F1 commits; `git merge-base` with `ui-components-hig`). Rebase if F1 moved.
- [x] 0.2 Verify F0 tokens exist in `packages/ui/tailwind.tokens.js` and `packages/ui/globals.css`: `bg-info`, `text-info`, `text-title-1..3`, `control-*` sizes. Check against `tokens.test.ts`.
- [x] 0.3 Verify `FormField` is exported from `packages/ui/src/index.ts` and read its props (`label`, `description`, `error`, `id`, `children`).
- [x] 0.4 Verify whether `FormField.children` already accepts a render-prop (`(control: FormFieldControlProps) => ReactNode`) with `id`, `aria-invalid`, `aria-describedby`. Record the answer in `apply-progress.md` (closes the first Open Question).
- [x] 0.5 Verify `ErrorState` accepts `onRetry` and renders a "Reintentar" button; verify `EmptyState` v2 accepts `icon`, `title`, `description`, `action`; verify `ConfirmDialog`, `Skeleton` and `NotFoundState` exist in `packages/ui`.
- [x] 0.6 Verify the baseline is green before starting: `pnpm lint && pnpm typecheck && pnpm test` (record failures that predate this change).
- [ ] 0.7 CONDITIONAL on 0.4 being negative: add the FormField render-prop child per Decision 11. This is scheduled inside WU3 as tasks 3.1 and 3.2 (RED/GREEN) and is skipped if 0.4 is positive.
- [x] 0.8 Check the Open Questions that affect scope: `ConfigureKeyItemSheet` "Cargando..." (line 156) and the empty-state action labels versus each page's header button (Decision 8). Record the answers in `apply-progress.md`.

## Phase 1 · Core consistency (WU1, commit 1)

### 1A · `ConfirmDialog` widening (Decision 2) [P with 1B, 1C]

- [x] 1.1 RED: add tests in `packages/ui/src/components/patterns/__tests__/ConfirmDialog.test.tsx` for a node `description` (`<strong>Ana</strong>` inside the description element, `aria-describedby` resolves), a string description unchanged, `pendingLabel` default "Procesando..." and a custom value, plus confirm and cancel flows and the pending lock (spec: ConfirmDialog scenarios).
- [x] 1.2 GREEN: widen `description` to `ReactNode` and add `pendingLabel?: string` (default `'Procesando...'`) in `packages/ui/src/components/patterns/ConfirmDialog.tsx`.
- [x] 1.3 RED: update `StaffTable` tests: deactivate opens a `ConfirmDialog` with `<strong>` name, confirm calls the mutation once, cancel zero times, pending disables both buttons.
- [x] 1.4 GREEN: replace the hand-rolled `Dialog` in `StaffTable` with `ConfirmDialog` (title `` `¿Dar de baja a ${name}?` ``, `confirmLabel="Dar de baja"`, `pendingLabel="Dando de baja..."`, `variant="destructive"`).
- [x] 1.5 RED: update `AdministrationStatusToggle` tests: the deactivate branch opens a destructive `ConfirmDialog` and runs the mutation once; the "has active buildings" branch stays a plain `Dialog` with one "Entendido" button and no mutation.
- [x] 1.6 GREEN: use `ConfirmDialog` for the deactivate branch (title "Desactivar administración", `confirmLabel="Desactivar"`, `pendingLabel="Desactivando..."`); keep the informational branch as `Dialog`.

### 1B · `useUnsavedChangesGuard` without blocker (Decision 1) [P with 1A, 1C]

- [x] 1.7 RED: add `apps/admin/src/hooks/__tests__/useUnsavedChangesGuard.test.tsx` (hook has no blocker in this commit): clean `requestLeave` runs `leave` at once; dirty opens the dialog and does not leave; `onConfirm` leaves; `onOpenChange(false)` clears the pending action and keeps the user; `UNSAVED_CHANGES_COPY` literals.
- [x] 1.8 GREEN: create `apps/admin/src/hooks/useUnsavedChangesGuard.ts` with the `UnsavedChangesGuard` API, `UNSAVED_CHANGES_COPY` and `whenRef`/`bypassRef`/pending action. No `useBlocker` yet.
- [x] 1.9 RED: update `KeyOrderForm.test` and `TechnicalOrderForm.test`: dirty Cancel opens the dialog and `window.confirm` is never called, confirm leaves, dismiss keeps the input, clean Cancel leaves with no dialog.
- [x] 1.10 GREEN: in `KeyOrderForm.tsx` and `TechnicalOrderForm.tsx`, remove `window.confirm`; use `when: isDirty && !isSubmitting && !isSubmitSuccessful`, `handleCancel = () => guard.requestLeave(() => onCancel?.())` and render `<ConfirmDialog {...UNSAVED_CHANGES_COPY} {...guard.dialogProps} variant="destructive" />`.

### 1C · Loading and not-found (Decision 5) [P with 1A, 1B]

- [x] 1.11 RED: add tests for `EquipoDetailPage` and `KeyDetailPage`: pending shows `role="status"` with `aria-label` "Cargando equipo" / "Cargando llave", skeleton blocks and no `animate-spin`; `isError` shows `ErrorState`; null record shows `NotFoundState` ("Equipo no encontrado." back "Volver al inventario" to `/equipos`; "Llave no encontrada." back to `/llaves/inventario`).
- [x] 1.12 GREEN: implement the skeletons and the `isError` / `!data` split in both pages.
- [x] 1.13 RED: tests for `EquipmentKeySnapshotPanel` ("Cargando llaves pendientes", 3 rows) and `KeyItemDetailsDialog` ("Cargando detalle", 4 rows), each with a compact not-found message when the record is missing.
- [x] 1.14 GREEN: replace the raw spinners in both with `Skeleton` inside `role="status"`; add the not-found messages.
- [x] 1.15 RED: test `CargarProductoSheet` pending: label "Cargar" unchanged, "Cargando..." absent, button disabled, contains `role="status"` named "Cargando producto".
- [x] 1.16 GREEN: implement the button spinner. Apply Open Question 3: if `ConfigureKeyItemSheet` line 156 "Cargando..." is a submit label, follow the same idiom with a test.
- [x] 1.17 Verify `rg 'window\.confirm|animate-spin' apps/admin/src` finds only button spinners with `role="status"`.

### 1D · Page identity and subtitles (Decision 6) [P with 1E, 1F]

- [x] 1.18 RED: tests for the `KeyOrdersPage` title "Órdenes de llaves" (no heading exactly "Llaves"); the KeyOrder detail, Nueva and Editar crumbs ("Órdenes de llaves", link to the list) and back links "Volver a órdenes de llaves"; `HistorialPage` stays "Órdenes".
- [x] 1.19 RED: tests for crumb tails: `AdministrationDetailPage` ends with the non-link "Admin Uno" after the "Administraciones" link; `BuildingDetailPage` shows administrations link, "Admin Uno" link, then non-link "Edificio Sur"; loading state shows no "undefined" or empty crumb.
- [x] 1.20 RED: tests that `EquiposPage`, `TechnicalOrdersPage`, `KeyOrdersPage`, `InventarioPage` and `HistorialPage` render the exact subtitles from Decision 6.
- [x] 1.21 GREEN: apply the copy and breadcrumb changes in the pages listed in Decision 6; update `e2e/admin/navigation.spec.ts` to `['/llaves', 'Órdenes de llaves']`.

### 1E · `ErrorState onRetry` wiring (Decision 7) [P with 1D, 1F]

- [x] 1.22 RED: `EquiposPage` and `EquipoDetailPage` tests: error renders "Reintentar" and a click calls the mocked `refetch` exactly once.
- [x] 1.23 GREEN: wire `onRetry={() => void refetch()}` on the 21 load-failure sites (10 lists, 8 details, both Editar pages, `EquipmentKeySnapshotPanel`); when `isError` combines queries, refetch each failed query. Drop the " Recargá la página." suffix. Leave the 5 "ID ... inválido" sites untouched.
- [x] 1.24 Verify each site renders "Reintentar" (spot-check each page test in error state; add a one-line assertion where the page test already renders the error).

### 1F · EmptyState call-site upgrade (Decision 8, cut line) [P with 1D, 1E]

- [x] 1.25 RED: `DataTable` and `DataCardList` tests for an additive `emptyState?: ReactNode` prop: shown when no rows and `!hasFilters`; filtered-empty keeps `filteredEmptyMessage`.
- [x] 1.26 GREEN: add the `emptyState` prop to `packages/ui/src/components/patterns/DataTable.tsx` and `DataCardList.tsx`.
- [x] 1.27 RED: per-list tests that the zero-state shows the title and description from the Decision 8 table, and that the action (where listed) triggers the same handler as the page's header button. Verify action labels against the real header buttons first (task 0.8).
- [x] 1.28 GREEN: wire EmptyState v2 in the 10 lists (Administraciones, Particulares, Personal, Stock, Órdenes de llaves, Servicio técnico with actions; Tareas, Equipos, Inventario, Órdenes without). Section empty states stay compact.
- [x] 1.29 If the PR must shrink, drop 1.25 to 1.28 (about 130 lines) and record it in `apply-progress.md`.

### 1G · Off-token replacements (Decision 9) [P with 1H]

- [x] 1.30 RED: update `tokens.test.ts` to assert the `topbar` spacing token (`3.75rem`) and the dark pair `info / composite(info@10%, card) >= 4.5`; update component tests that named old classes (`separator` test `h-px`/`w-px`, `Textarea`, `FilterBar`, `SearchInput`).
- [x] 1.31 GREEN: add `topbar` to `spacing` in `packages/ui/tailwind.tokens.js`; apply every row of the Decision 9 table (order-form chip `bg-info/10 text-info`, `max-w-48`, `Sidebar` `w-16`/`w-60`, `MobileSidebar` `w-72`, `UserMenu` `w-60`, `Topbar` `h-topbar` and `h-8`, `SearchInput` `w-96` and its JSDoc, `FilterBar` `sm:w-56 lg:w-64`, `Textarea` `min-h-20`, `separator`).
- [x] 1.32 RED/GREEN: a test in each order form asserting the chip uses info token classes and no `blue-` palette class.

### 1H · Hardcode gate (Decision 10) [P with 1G]

- [x] 1.33 RED: create fixtures `scripts/__fixtures__/hardcodes/bad/` (one violation per rule: palette, hex, px), `.../clean/` and an allowlisted-only fixture.
- [x] 1.34 RED: write `scripts/__tests__/lint-hardcodes.test.mjs` (`node:test`): table-driven `scanSource` flagged and allowed lists from Decision 10, ignore directive with and without a reason (`ignore-without-reason`), and CLI runs via `execFile(process.execPath, [script, '--root', fixtureDir])`: bad exits 1 listing the seeded lines (`path:line:col  rule  match`), clean and allowlisted exit 0, bad arguments exit 2, and tests and generated files are excluded.
- [x] 1.35 GREEN: implement `scripts/lint-hardcodes.mjs` (exports `RULES`, `scanSource`, `scanRoots`; comment stripping; explicit allowlist; `import.meta.url` CLI guard; defaults `apps/admin/src` and `packages/ui/src`, repeatable `--root`).
- [x] 1.36 GREEN: add root scripts `lint:hardcodes` and `test:scripts` to `package.json`; add both steps to `.github/workflows/admin-checks.yml` (no `continue-on-error`) and the path filters `scripts/lint-hardcodes.mjs`, `scripts/__tests__/**`, `scripts/__fixtures__/**`.
- [x] 1.37 Run `pnpm lint:hardcodes` on the tree; fix any remaining hit in `apps/admin` and `packages/ui` outside F1's diff (Risk 2). A one-off `lint-hardcodes-ignore-next-line` needs a written reason.
- [x] 1.38 Reconcile spec versus design: the design-system spec lists `.css` among scanned extensions, the design lists `.ts/.tsx/.js/.jsx`. Decide at apply (add `.css` with `var(--...)` allowlisting, or amend the spec wording) and record the choice in `apply-progress.md`.

### 1I · Skill update (Decision 13)

- [x] 1.39 Update `.claude/skills/admin-ui-patterns/SKILL.md`: component table additions, patterns 7-12, anti-patterns for the raw palette and px values (enforced by `pnpm lint:hardcodes`).
- [x] 1.40 Commit 1 gate: `pnpm lint && pnpm typecheck && pnpm test && pnpm lint:hardcodes && pnpm test:scripts` green. Commit `feat(admin): consistency pass for confirmations, states, identity and hardcode gate`.

## Phase 2 · Data router and navigation blocking (WU2, commit 2)

- [ ] 2.1 RED: create `apps/admin/src/router.test.tsx`: `matchRoutes(routes, path)` for every path the app had before (including `/`, `/buildings`, `/historial` redirects, `/buildings/123`, `/administraciones/456`, `/ordenes` and the `*` NotFoundPage); a dropped route fails.
- [ ] 2.2 GREEN: create `apps/admin/src/router.tsx` exporting `routes: RouteObject[]` (route table unchanged; pathless root route with `<Suspense fallback={<PageFallback />}><Outlet /></Suspense>` and `errorElement: <RouteErrorFallback />`) and `createAdminRouter()` using the existing `BASE_URL` basename.
- [ ] 2.3 RED: test `RouteErrorFallback` in `components/common/BoundaryFallbacks.tsx`: normalises `useRouteError()` to `Error`, calls `reportError('admin:route', ...)` once, renders the same UI as `RootErrorFallback` with reload as reset.
- [ ] 2.4 GREEN: implement `RouteErrorFallback`.
- [ ] 2.5 GREEN: update `apps/admin/src/main.tsx` to `AppErrorBoundary > ThemeProvider > QueryClientProvider > AuthProvider > RouterProvider` with `Toaster` as a sibling inside `AuthProvider`; no `BrowserRouter`. Verify `rg 'BrowserRouter' apps/admin/src/main.tsx` finds nothing.
- [ ] 2.6 GREEN: create `apps/admin/src/test/renderWithDataRouter.tsx` (`createMemoryRouter`, returns `{ router, ...renderResult }`; options `path`, `initialEntries`, `routes`) and a smoke test for it.
- [ ] 2.7 RED: add blocker tests to the guard hook test and the six files that render the guarded forms (`KeyOrderForm.test`, `TechnicalOrderForm.test`, `KeyOrderNuevaPage.test`, `KeyOrderEditarPage.test`, `TechnicalOrderNuevaPage.test`, `TechnicalOrderEditarPage.test`): dirty `router.navigate('/otra')` opens the dialog and the location is unchanged; confirm proceeds; dismiss stays with input intact and the blocker resets; clean form is not blocked; a successful submit that navigates opens no dialog; a search-only change does not block; POP (browser back) is guarded; `useBlocker` does not throw on mount.
- [ ] 2.8 GREEN: move the six test files to `renderWithDataRouter` (other `MemoryRouter` files stay).
- [ ] 2.9 GREEN: add `useBlocker(({ currentLocation, nextLocation }) => whenRef.current && !bypassRef.current && currentLocation.pathname !== nextLocation.pathname)` to `useUnsavedChangesGuard` with `blocker.proceed()` / `blocker.reset()` in `onConfirm` / `onOpenChange(false)`. Forms need no edit.
- [ ] 2.10 Run `e2e/admin/navigation.spec.ts` if the stack is up (every route reachable, sidebar visible).
- [ ] 2.11 Commit 2 gate: `pnpm lint && pnpm typecheck && pnpm test && pnpm lint:hardcodes` green. Commit `feat(admin): move to a data router and block navigation away from dirty forms`.

## Phase 3 · FormField migration (WU3, commit 3)

- [ ] 3.1 CONDITIONAL on 0.4 being negative. RED: in the `FormField` test add the render-prop child: it receives `FormFieldControlProps` (`id`, `aria-invalid` only on error, `aria-describedby` referencing the `role="alert"` message); an element child behaves as before.
- [ ] 3.2 CONDITIONAL on 0.4 being negative. GREEN: widen `FormField.children` to `ReactElement | ((control: FormFieldControlProps) => ReactNode)` and export `FormFieldControlProps` from `packages/ui/src/index.ts`.
- [ ] 3.3 RED: pass-through tests for `AdministrationCombobox`, `BuildingCombobox`, `ParticularSelector` and `KeyItemUnitField` forwarding `id`, `aria-invalid` and `aria-describedby` to their trigger.
- [ ] 3.4 GREEN: implement the pass-through edits [P with other GREEN edits that touch different files].
- [ ] 3.5 RED: for each of the 20 forms below, add one submit-invalid test (`getAllByRole('alert')` non-empty and the first invalid field has `aria-invalid="true"`); keep existing `getByLabelText` queries working (label text including " \*" unchanged).
- [ ] 3.6 GREEN: migrate field-error markup to `FormField` (plain element child, `Controller` with FormField inside `render`, Select via `{(p) => <SelectTrigger {...p}>}`, RadioGroup as element child). Items are [P], disjoint files, grouped by domain:
  - [ ] 3.6.1 Orders: `KeyOrderForm`, `TechnicalOrderForm`, `ConfigureKeyItemSheet`, `QuickUnitCreateDialog`, `PickupKeyDialog`.
  - [ ] 3.6.2 Stock: `CargarProductoSheet`, `ProductFormFields`, `AjusteStockSheet`.
  - [ ] 3.6.3 Equipment and tareas: `EquipmentFormSheet`, `AssignEquipmentDialog`, `TareaFormSheet`, `EquipmentUpdateFormSheet`, `ConfigureEquipmentPanel`, `DecommissionDialog`, `ReplaceEquipmentDialog`.
  - [ ] 3.6.4 Directory: `StaffFormSheet`, `QuickParticularCreateDialog`, `ParticularFormSheet`, `BuildingFormSheet`, `AdministrationFormSheet`.
- [ ] 3.7 Keep mutation-error banners and the collapsed item error summary in the order forms untouched (not field errors).
- [ ] 3.8 Verify no ad-hoc error `<p>` with a destructive text class remains beside a control in `apps/admin/src` form files (`rg 'text-destructive' apps/admin/src` reviewed; banners excluded).
- [ ] 3.9 Commit 3 gate: `pnpm lint && pnpm typecheck && pnpm test && pnpm lint:hardcodes` green. Commit `feat(admin): wire form field errors through FormField`.

## Phase 4 · Axe e2e gate (WU4, commit 4)

- [ ] 4.1 Add `@axe-core/playwright` 4.10.x as a root devDependency (`pnpm add -D -w`); confirm it appears only under `devDependencies` and the lockfile updates.
- [ ] 4.2 Create `e2e/admin/routes.ts` exporting `ROUTES`; change `e2e/admin/navigation.spec.ts` to import it.
- [ ] 4.3 RED: write `e2e/admin/a11y.spec.ts`: two `describe` blocks (`test.use({ colorScheme: 'light' | 'dark' })`), login, audit the 10 list routes plus `/llaves/nueva` and `/servicio-tecnico/nueva` after clicking submit on the empty form; `AxeBuilder` with tags `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`; fail on `serious` or `critical`, message lists rule id and targets, full JSON via `testInfo.attach`; `EXCLUDED_RULES: Record<string, string>` starts empty and `color-contrast` is never disabled.
- [ ] 4.4 GREEN: run the spec against the local stack and fix every pre-existing serious or critical violation found. Any exclusion needs a rule id and a written reason.
- [ ] 4.5 Resolve the Open Question on detail pages: assume lists and forms only; record the assumption in `apply-progress.md`.
- [ ] 4.6 Confirm `e2e.yml` runs the spec in the existing path (not a required check yet).
- [ ] 4.7 Commit 4 gate: `pnpm lint && pnpm typecheck && pnpm test` green. Commit `test(admin): add axe accessibility e2e gate`.

## Phase 5 · Verify

- [ ] 5.1 `pnpm install --frozen-lockfile`.
- [ ] 5.2 `pnpm lint`.
- [ ] 5.3 `pnpm typecheck`.
- [ ] 5.4 `pnpm test` (workspaces `@vitalock/admin` and `@vitalock/ui`).
- [ ] 5.5 `pnpm lint:hardcodes` exits 0 on the tree.
- [ ] 5.6 `pnpm test:scripts` (the `node:test` gate test): bad fixture exits 1 with each seeded finding, clean and allowlisted fixtures exit 0.
- [ ] 5.7 If the local stack is up: `pnpm e2e` including `navigation.spec.ts` and `a11y.spec.ts` (light and dark) with zero serious or critical violations. If the stack is down, record the e2e run as skipped with the reason in `apply-progress.md`; CI `e2e.yml` covers it.
- [ ] 5.8 Success-criteria greps: `rg 'window\.confirm' apps/admin/src` returns none; `rg 'animate-spin' apps/admin/src` returns only button spinners; `rg 'BrowserRouter' apps/admin/src/main.tsx` returns none; `rg 'common/Section' apps/admin/src` returns none.
- [ ] 5.9 Verify that every commit builds green on its own (`git rebase --exec 'pnpm typecheck && pnpm test' <base>`), and that `size:exception` is stated in the PR description.
- [ ] 5.10 Write `apply-progress.md` evidence and hand off to `sdd-verify`. No SQL is touched, so `test:sql` and `db:rehearse` do not apply.
