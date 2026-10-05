# Proposal: admin-ui-consistency

## Why

- Phase F2 of `docs/design/ui-audit-2026-10-05.md` §4. It consumes the F0 tokens and the F1 components (`ConfirmDialog`, `Skeleton`, `NotFoundState`, EmptyState v2, `ErrorState onRetry`, `FormField`).
- M10: `ConfirmDialog` has 2 callers. `StaffTable` and `AdministrationStatusToggle` hand-roll `Dialog`s. Both order forms guard Cancel with `window.confirm`, and nothing guards in-app navigation away from a dirty form.
- M13: raw `animate-spin` divs in EquipoDetail, KeyDetail, EquipmentKeySnapshotPanel and KeyItemDetailsDialog. CargarProductoSheet labels its submit "Cargando...".
- m2: AdministrationDetail and BuildingDetail breadcrumbs omit the current item.
- m3: verified against `AdminNav`, HistorialPage ("Órdenes") already matches its nav label and `/ordenes`. The only mismatch is KeyOrdersPage: "Llaves" versus the nav label "Órdenes de llaves".
- m4: 5 lists have no subtitle (Equipos, ServicioTécnico, KeyOrders, Inventario, Historial).
- m5: `bg-blue-100/text-blue-800` and `max-w-[200px]` in both order forms. Most other hits are in `packages/ui`: SearchInput `w-[372px]`, UserMenu `w-[248px]`, FilterBar `w-[220/260px]`, Topbar `h-[60px]`, Textarea `min-h-[80px]` and Sidebar widths. CI has no hardcode gate, and the vendor linter lives outside the repo.
- C4, m11: about 67 admin field-error sites in ~20 files render a bare `<p class="text-destructive">` with no `aria-invalid`/`aria-describedby`. No automated accessibility check exists.

## What Changes

- **Confirmations:**
  - `StaffTable` and the `AdministrationStatusToggle` deactivate path use `ConfirmDialog`.
  - The "has active buildings" branch is informational. It stays a plain `Dialog`.
  - `ConfirmDialog.description` widens to `ReactNode` so callers can keep `<strong>` names. An optional `pendingLabel` keeps each caller's in-progress copy.
- **Data router and unsaved changes:**
  - The admin app moves from `<BrowserRouter>` to `createBrowserRouter` + `RouterProvider`, with the same route table, basename, auth gate, Suspense fallback and error boundaries.
  - A `useUnsavedChangesGuard` hook guards dirty `KeyOrderForm` and `TechnicalOrderForm` with `ConfirmDialog`: the Cancel button and in-app navigation (`useBlocker`). `window.confirm` is removed.
  - The 6 form and page test files that render those forms move to a memory data router.
- **Loading and not-found:**
  - Layout-matching `Skeleton` and `NotFoundState` in the 4 surfaces above.
  - The CargarProductoSheet submit button keeps its label and shows a button spinner with `role="status"`.
- **Navigation:**
  - Detail breadcrumbs include the current item.
  - KeyOrdersPage and the KeyOrder\* breadcrumbs say "Órdenes de llaves".
  - Every list page has a one-line subtitle.
- **States:**
  - About 20 admin `ErrorState` load-failure sites wire `onRetry={refetch}`.
  - List and section empty states use the EmptyState v2 title, description and action.
- **Form fields:** every admin form field with a validation error uses `FormField` (label, description, error, `aria-invalid`, `aria-describedby`, `role="alert"`). Composite controls (Select, RadioGroup, comboboxes) are covered too.
- **Accessibility gate:** `@axe-core/playwright` (devDependency) and an axe e2e check over the main admin routes and both order forms, in light and dark.
- **Off-token cleanup:**
  - Info tone tokens replace the blue palette.
  - Standard scale steps replace arbitrary sizes. Named spacing tokens are added only where the exact value matters (topbar).
- **Hardcode gate:**
  - New `scripts/lint-hardcodes.mjs`, a Node script with no dependencies, exposed as `pnpm lint:hardcodes`.
  - It flags raw palette colours, hex values and px arbitrary values. It allowlists `data-[…]`, `var(--…)`, `%` and grid templates.
  - Scope is `apps/admin` + `packages/ui`. It runs in `admin-checks.yml`. The installer is added in F3.
- **Skill:** `admin-ui-patterns` documents the type ladder, the section convention, the confirmation rule, the loading idiom, the form-field rule and title = nav label.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `admin-shell`:
  - ADD Page Identity Consistency (title = nav label, breadcrumbs end at the current item, list subtitles).
  - ADD Loading and Not-Found States.
  - ADD Destructive and Unsaved-Change Confirmation (Cancel and in-app navigation).
  - ADD Data Router (route table, auth gate and boundaries preserved).
  - ADD Accessible Admin Forms and the axe gate.
- `design-system`:
  - MODIFY Pattern Components (`ConfirmDialog` description takes a `ReactNode`).
  - MODIFY Form Field Accessibility (composite controls through a render-prop child).
  - ADD Hardcoded Value Gate.

## Impact

- **`size:exception`.** Estimated 1,900–2,300 authored changed lines (about 40% tests), plus the generated lockfile diff. Delivery is one PR (`delivery_strategy: exception-ok`), stacked on F1. The user accepted the exception on 2026-10-05 in exchange for landing the router migration and the form fields with this change.
- The PR is reviewable by commit, in this order:
  1. core consistency (~950–1,050 lines);
  2. the data router and the navigation guard (~400–450);
  3. the FormField migration (~550–650);
  4. the axe gate (~80).
- No DB, migrations or runtime dependencies. One devDependency (`@axe-core/playwright`).

## Success Criteria

- Component and page tests cover:
  - the ConfirmDialog flows;
  - the Cancel guard and a blocked in-app navigation opening a dialog (no `window.confirm`), and a successful submit navigating without one;
  - the skeleton and not-found states;
  - the breadcrumb tails;
  - the titles and subtitles;
  - `onRetry` calling `refetch`;
  - field errors exposing `role="alert"` and `aria-invalid="true"` in every migrated form.
- `rg 'window\.confirm|animate-spin' apps/admin/src` finds only button spinners. `rg 'BrowserRouter' apps/admin/src/main.tsx` finds nothing.
- `pnpm lint:hardcodes` exits 0 and fails on a seeded fixture. CI runs it.
- The axe e2e spec reports no serious or critical violation on the covered routes.
- The verifier gate is green.

## Non-goals

- The installer: F3 (FormField, hardcode gate scope, data router if needed).
- A `beforeunload` guard for tab close or reload.
- Route-level data loaders (`loader`/`action`). The router migration keeps TanStack Query as the data layer.

## Risks

1. **Review load.** The PR is about 2,000 lines. Mitigation: four ordered commits with green tests at each, and the size forecast in `tasks.md`.
2. **The lint gate flags `packages/ui` hits outside F1's diff.** Mitigation: clean them here. The allowlist is explicit and tested.
3. **Stacking on unmerged F0 and F1.** Mitigation: rebase after each merges. FormField's render-prop child depends on F1's final API.
4. **The title rename breaks e2e and unit selectors.** Mitigation: update `e2e/admin/navigation.spec.ts` in the same PR.
5. **The data router changes error and Suspense behaviour.** Mitigation: a root `errorElement` reports and renders the root fallback; Suspense keeps its position; the e2e navigation spec covers every route.
6. **The blocker traps the post-save redirect.** Mitigation: the guard disarms while submitting; a test proves a successful submit navigates without a dialog.
7. **Axe finds pre-existing violations.** Mitigation: fix them in this PR; any exclusion is listed with a reason in the spec file.

## Rollback Plan

Revert the PR, or revert single commits in reverse order (axe, then form fields, then router). Each commit leaves the tree green. There is no data state.

## Proposal question round

The session runs in auto mode, so these questions are recorded here for user review.

1. ~~Split out FormField + axe and the router migration?~~ Resolved 2026-10-05: both land here under `size:exception`.
2. Should the informational "No se puede desactivar" dialog stay a `Dialog`, or should the toggle be disabled with a reason? (Assumption: keep the dialog.)
3. Should the nav and title be "Órdenes de llaves" everywhere, or should the nav shorten to "Órdenes" inside the "Llaves" group? (Assumption: "Órdenes de llaves".)
4. Should the hardcode gate fail CI immediately, or warn first? (Assumption: fail, because the target is zero hits.)

## Ready for Spec/Design

Ready. The questions above are design assumptions and do not block the spec.
