# Design: admin-ui-consistency

## Context

Phase F2 of `docs/design/ui-audit-2026-10-05.md`. It is stacked on F1 (`ui-components-hig`), which is stacked on F0 (`ui-foundations-hig`). Both are being applied concurrently, so this design relies on their designs and specs for the API: tokens `bg-info`, `text-title-*` and `control-*` (F0), and `FormField`, EmptyState v2 and `ErrorState onRetry` (F1). `ConfirmDialog`, `Skeleton` and `NotFoundState` already exist in `packages/ui`.

The scope expanded on 2026-10-05. The data-router migration, the FormField migration and the axe gate are now in scope. Delivery is one PR under `size:exception` (`exception-ok`), ordered by commit (§ Delivery).

All UI copy below is Spanish and final. Tests assert it literally.

## Decision 1 — `useUnsavedChangesGuard` shape

| Option                                                                        | Tradeoff                                                                         |
| ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Each form calls `useBlocker` and owns a dialog                                | Duplicated state machine in 2 forms. The Cancel path and the blocker path drift. |
| Hook returns a rendered `<ConfirmDialog>`                                     | Hooks returning elements hide the copy and resist testing.                       |
| **Hook returns `requestLeave` + `dialogProps`; forms render `ConfirmDialog`** | One state machine. Forms keep the markup visible.                                |

**Chosen:** `apps/admin/src/hooks/useUnsavedChangesGuard.ts`.

```ts
export interface UnsavedChangesGuard {
  /** Runs `leave` at once when clean; otherwise opens the dialog first. */
  requestLeave: (leave: () => void) => void;
  dialogProps: { open: boolean; onOpenChange: (open: boolean) => void; onConfirm: () => void };
}
export function useUnsavedChangesGuard(opts: { when: boolean }): UnsavedChangesGuard;
export const UNSAVED_CHANGES_COPY = {
  title: '¿Descartar los cambios?',
  description: 'Tenés cambios sin guardar. Si salís ahora, se pierden.',
  confirmLabel: 'Descartar cambios',
  cancelLabel: 'Seguir editando',
} as const;
```

- **Internals:** `whenRef` and `bypassRef` refs, plus one pending action: either a `leave` callback or the blocker.
  - `onConfirm` sets `bypassRef`, then calls `blocker.proceed()` or the pending `leave`.
  - `onOpenChange(false)` calls `blocker.reset()` and clears the pending action.
- **Blocker (commit 2):** `useBlocker(({ currentLocation, nextLocation }) => whenRef.current && !bypassRef.current && currentLocation.pathname !== nextLocation.pathname)`. A ref avoids a stale closure. Search-only changes (filters) never block. Commit 1 ships the same API without the blocker, so the forms do not change in commit 2.
- **Arming:** forms pass `when: isDirty && !isSubmitting && !isSubmitSuccessful`. The pages navigate inside `onSubmit` (for example `KeyOrderNuevaPage` calls ``navigate(`/llaves/${newId}`)``). By then RHF has already rendered `isSubmitting = true`, so the post-save redirect is never blocked. If the submit throws, the guard re-arms.
- **Forms:** `handleCancel = () => guard.requestLeave(() => onCancel?.())`, and `<ConfirmDialog {...UNSAVED_CHANGES_COPY} {...guard.dialogProps} variant="destructive" />`. The Cancel path then navigates with `bypassRef` set, so the blocker does not fire twice.
- **Not covered:** tab close and reload (`beforeunload`) are a non-goal.

## Decision 2 — Widening `ConfirmDialog`

- `description: ReactNode`. `DialogDescription` renders a `<p>`, so callers pass inline content only, never block elements.
- New optional `pendingLabel?: string`, default `'Procesando...'`. It keeps the existing caller copy ("Dando de baja...", "Desactivando..."), so current tests keep passing.
- **StaffTable:** title `` `¿Dar de baja a ${name}?` ``, the current description, `confirmLabel="Dar de baja"`, `pendingLabel="Dando de baja..."`, `variant="destructive"`.
- **AdministrationStatusToggle:** the deactivate branch uses `ConfirmDialog` with title "Desactivar administración" and the current `<strong>` description, `confirmLabel="Desactivar"` and `pendingLabel="Desactivando..."`. The "No se puede desactivar" branch stays a plain `Dialog` with one "Entendido" button, because it confirms nothing. This is the rule recorded in the skill.

## Decision 3 — Data router migration

| Option                                                        | Tradeoff                                                 |
| ------------------------------------------------------------- | -------------------------------------------------------- |
| Keep `<BrowserRouter>`, guard Cancel only                     | No `useBlocker`, so sidebar clicks drop drafts silently. |
| `unstable_usePrompt` / a custom history patch                 | Same data-router requirement, or private APIs.           |
| **`createBrowserRouter` + `RouterProvider`, same route tree** | One-time move. It also unlocks loaders later.            |

**Chosen:** a new `apps/admin/src/router.tsx` exports `routes: RouteObject[]` and `createAdminRouter()`, which calls `createBrowserRouter(routes, { basename })` with the existing `BASE_URL` expression. `main.tsx` keeps the observability setup and renders:

```
AppErrorBoundary > ThemeProvider > QueryClientProvider > AuthProvider
  > RouterProvider(router)   + Toaster (sibling, inside AuthProvider)
```

- **AuthProvider placement:** it moves above the router. This is safe: `AuthProvider`, `useAuth` and `useIdleTimeout` use no router hooks (verified in `packages/shared/src/auth`). `ProtectedRoute` (`Navigate`, `Outlet`) and `AuthErrorPage` (`useNavigate`) stay route elements, so they still have router context.
- **Suspense placement:** a pathless root route renders `<Suspense fallback={<PageFallback />}><Outlet /></Suspense>`. This is the same position as today, above every route and below Auth. The lazy page modules (`routes/lazy`) do not change. No `future` flags are set, so the fallback behaviour does not change.
- **Errors:** data routers catch render errors per route before an outer React boundary sees them. The root route gets `errorElement: <RouteErrorFallback />` (in `components/common/BoundaryFallbacks.tsx`). It reads `useRouteError()`, normalises it to `Error`, calls `reportError('admin:route', …)` once and renders the same UI as `RootErrorFallback`, with reset = reload. `RouteBoundaryLayout` stays below the shell, so a page crash still keeps the sidebar.
- **The route table is unchanged:** paths, `Navigate` redirects (`/`, `/buildings`, `/historial`), `*` → `NotFoundPage`.
- A `router.test.tsx` uses `matchRoutes(routes, path)` for every path the app had before, so a dropped route fails.

## Decision 4 — Tests under a data router

`useBlocker` throws outside a data router. Six files render the guarded forms under `MemoryRouter`: `KeyOrderForm.test`, `TechnicalOrderForm.test`, `KeyOrderNuevaPage.test`, `KeyOrderEditarPage.test`, `TechnicalOrderNuevaPage.test` and `TechnicalOrderEditarPage.test`.

- **New helper:** `apps/admin/src/test/renderWithDataRouter.tsx`. Signature: `renderWithDataRouter(ui, { path = '/', initialEntries = ['/'], routes = [] })`. It builds `createMemoryRouter([{ path, element: ui }, ...routes], { initialEntries })` and returns `{ router, ...renderResult }`. Existing query and auth wrappers stay in each file.
- **Usage:** guard tests call `act(() => router.navigate('/otra'))` and assert the dialog opens and `router.state.location` has not changed.
- The other 35 `MemoryRouter` test files do not render a blocker, so they stay as they are.

## Decision 5 — Loading and not-found shapes

This follows the existing idiom (`StockDetailPage`: inline `Skeleton` blocks, a split `ErrorState`/`NotFoundState`). The wrapper adds `role="status"` and an `aria-label`, so tests and screen readers can find it.

| Surface                     | Skeleton                                                                                            | Label                        | Not-found                                                                 |
| --------------------------- | --------------------------------------------------------------------------------------------------- | ---------------------------- | ------------------------------------------------------------------------- |
| `EquipoDetailPage`          | crumb `h-4 w-48`, title `h-8 w-64`, serial `h-4 w-40`, then the page's section grid with 4 × `h-40` | "Cargando equipo"            | "Equipo no encontrado." back "Volver al inventario" → `/equipos`          |
| `KeyDetailPage`             | same shape                                                                                          | "Cargando llave"             | "Llave no encontrada." back "Volver al inventario" → `/llaves/inventario` |
| `EquipmentKeySnapshotPanel` | 3 × `h-10 w-full`                                                                                   | "Cargando llaves pendientes" | n/a                                                                       |
| `KeyItemDetailsDialog`      | 4 rows of `h-4 w-24` + `h-4 w-40`                                                                   | "Cargando detalle"           | n/a                                                                       |

- `isError` and `!data` split. The error case uses `ErrorState` with `onRetry` and `back`, replacing today's child `Button asChild`. The null case uses `NotFoundState`.
- **CargarProductoSheet:** while pending, the button keeps the label "Cargar" and prepends `<span role="status" aria-label="Cargando producto"><Loader2 className="animate-spin" /></span>`. The button stays disabled. `animate-spin` then remains only inside buttons.

## Decision 6 — Page identity copy

| Page                                                                 | Change                                                                                            |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `KeyOrdersPage`                                                      | title "Llaves" → "Órdenes de llaves" (= nav label)                                                |
| `KeyOrderNuevaPage`, `KeyOrderEditarPage` (×2), `KeyOrderDetailPage` | crumb "Llaves" → "Órdenes de llaves". Back links "Volver a llaves" → "Volver a órdenes de llaves" |
| `AdministrationDetailPage`                                           | crumbs end with `{ label: administration.company_name }`                                          |
| `BuildingDetailPage`                                                 | crumbs end with `{ label: building.name }`, after the administration crumb                        |
| `EquiposPage`                                                        | subtitle "Consultá los equipos instalados y su estado."                                           |
| `TechnicalOrdersPage`                                                | subtitle "Gestioná las órdenes de servicio técnico."                                              |
| `KeyOrdersPage`                                                      | subtitle "Gestioná las órdenes de llaves de administraciones y particulares."                     |
| `InventarioPage`                                                     | subtitle "Consultá las llaves emitidas y su estado."                                              |
| `HistorialPage`                                                      | subtitle "Consultá el historial de órdenes de llaves y de servicio técnico."                      |
| `e2e/admin/navigation.spec.ts`                                       | `['/llaves', 'Órdenes de llaves']`                                                                |

## Decision 7 — `ErrorState onRetry` wiring

- **Covered:** 21 load-failure sites. They are the 10 list pages (`Equipos`, `TechnicalOrders`, `KeyOrders`, `Inventario`, `Stock`, `Historial`, `Particulares`, `Personal`, `Tareas`, `Administrations`); the load errors on the 8 detail pages (`EquipoDetail`, `KeyDetail`, `TechnicalOrderDetail`, `KeyOrderDetail`, `StockDetail`, `BuildingDetail`, `TareaDetail`, `AdministrationDetail`); both Editar pages; and `EquipmentKeySnapshotPanel`.
- **Excluded:** the 5 "ID … inválido" sites, where a retry cannot succeed.
- **Wiring:** `onRetry={() => void refetch()}`. The wrapper satisfies `no-misused-promises`. When `isError` combines several queries, the callback refetches each query that failed.
- **Copy:** messages drop " Recargá la página.", because the button now offers the action. No test binds to the old suffix (verified).
- **Tests:** one list page (`EquiposPage`) and one detail page (`EquipoDetailPage`) assert that clicking "Reintentar" calls the mocked `refetch`. Every other site is a mechanical copy.

## Decision 8 — EmptyState call-site upgrade

| Option                                                               | Tradeoff                                                                                                                    |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Pages render `EmptyState` outside the table when `rows.length === 0` | Duplicates DataTable's empty branch and loses the table frame.                                                              |
| **`DataTable` / `DataCardList` accept `emptyState?: ReactNode`**     | One additive prop. Shown when there are no rows and `!hasFilters`. Filtered-empty keeps the compact `filteredEmptyMessage`. |

The list zero-states use EmptyState v2 with `icon`, `title`, `description` and, where the page has a create action, an `action` that reuses the page's handler:

| List                                           | Title                                                   | Description                                            | Action               |
| ---------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------ | -------------------- |
| Administraciones                               | Todavía no hay administraciones                         | Creá la primera para cargar sus edificios.             | Nueva administración |
| Particulares                                   | Todavía no hay particulares                             | Los particulares se crean desde una orden o desde acá. | Nuevo particular     |
| Personal                                       | Todavía no hay personal                                 | Agregá a las personas que usan el sistema.             | Nuevo integrante     |
| Stock                                          | Todavía no hay productos                                | Cargá el catálogo para registrar movimientos.          | Nuevo producto       |
| Órdenes de llaves                              | Todavía no hay órdenes de llaves                        | Creá una orden para emitir llaves.                     | Nueva orden          |
| Servicio técnico                               | Todavía no hay órdenes de servicio técnico              | Creá una orden para registrar trabajos.                | Nueva orden          |
| Tareas, Equipos, Inventario de llaves, Órdenes | Todavía no hay {tareas \| equipos \| llaves \| órdenes} | Aparecen acá cuando se crean desde las órdenes.        | none                 |

- The action labels must match each page's existing header button. Apply verifies them against the page.
- The 8 section `EmptyState`s on detail pages and in `TicketCommentsList` keep the compact `message` form, which is the rule for sections. Upgrading them is not required.
- **Budget note:** this is the cut line. If the PR has to shrink, Decision 8 moves out first (≈130 lines).

## Decision 9 — Off-token replacements

| File                                              | From                                                            | To                                       | Δ px    |
| ------------------------------------------------- | --------------------------------------------------------------- | ---------------------------------------- | ------- |
| `KeyOrderForm`, `TechnicalOrderForm` product chip | `bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200` | `bg-info/10 text-info`                   | n/a     |
| same, chip and building name (×4)                 | `max-w-[200px]`                                                 | `max-w-48`                               | −8      |
| `TechnicalOrderForm:579`                          | `sm:max-w-[200px]`                                              | `sm:max-w-48`                            | −8      |
| `Sidebar`                                         | `w-[64px]` / `w-[240px]`                                        | `w-16` / `w-60`                          | 0       |
| `MobileSidebar`                                   | `w-[280px]`                                                     | `w-72`                                   | +8      |
| `UserMenu` popover                                | `w-[248px]`                                                     | `w-60` (expanded sidebar width)          | −8      |
| `Topbar`                                          | `h-[60px]`                                                      | `h-topbar` (new spacing token `3.75rem`) | 0       |
| `Topbar` divider                                  | `h-[32px]`                                                      | `h-8`                                    | 0       |
| `SearchInput` lg                                  | `w-[372px]` (+ JSDoc)                                           | `w-96`                                   | +12     |
| `FilterBar`                                       | `sm:w-[220px] lg:w-[260px]`                                     | `sm:w-56 lg:w-64`                        | +4 / −4 |
| `Textarea`                                        | `min-h-[80px]`                                                  | `min-h-20`                               | 0       |
| `separator` (+ its test)                          | `h-[1px]` / `w-[1px]`                                           | `h-px` / `w-px`                          | 0       |

- Tailwind 3.4.14 provides `max-w-*` and `min-h-*` on the spacing scale.
- `topbar` joins `spacing` in `packages/ui/tailwind.tokens.js`. It is the only value with no exact scale step (56 and 64 are the neighbours), and `tokens.test.ts` asserts it.
- `tokens.test.ts` gains the dark pair `info / composite(info@10%, card) ≥ 4.5` for the chip.
- `h-[52px]` and `text-[28px]` are F1's.

## Decision 10 — Hardcode gate

`scripts/lint-hardcodes.mjs` is plain ESM with no dependencies and runs on Node 20 or later.

- **Exports:** `RULES`, `scanSource(text, file) → Finding[]` and `scanRoots(roots)`.
- **CLI:** guarded by `import.meta.url === pathToFileURL(process.argv[1]).href`.
- **Defaults:**
  - Roots: `apps/admin/src` and `packages/ui/src`. `--root <dir>` (repeatable) overrides them.
  - Extensions: `.ts`, `.tsx`, `.js`, `.jsx`.
  - Skipped: `__tests__/`, `*.test.*`, `*.spec.*`, `*.d.ts` and `node_modules`.

**Rules.** Comments are stripped first, so `// spec #220` is never scanned.

| Rule      | Flags                                                                                                                                                                       |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `palette` | `(variant:)*{bg,text,border(-side),ring,ring-offset,outline,divide,fill,stroke,from,via,to,placeholder,caret,accent,decoration,shadow}-{22 Tailwind hues}-{50…950}(/alpha)` |
| `hex`     | `#rgb`, `#rgba`, `#rrggbb` or `#rrggbbaa` inside an arbitrary value (`[#…]`), or as a whole string literal (`'#fff'`). Prose such as `'Orden #123'` is not flagged.         |
| `px`      | an arbitrary value `utility-[…]` whose value contains a px length (`372px`, `-1px`, `calc(100%-8px)`)                                                                       |

**Allowlist** (explicit and tested):

- Selector variants, which are brackets but not values: `data-[…]`, `aria-[…]`, `group-data-[…]`, `peer-data-[…]`, `supports-[…]` and arbitrary variants `[&_…]:`.
- Values starting with `var(` or `--` (Radix CSS variables).
- Grid templates: `grid-cols-[…]`, `grid-rows-[…]`.
- Non-px arbitrary values, which pass by construction: `%` (Radix `translate-x-[-50%]`, `slide-in-from-top-[48%]`), unitless and `rem`.
- `black` and `white` (the scrim `bg-black/80` is F1's).

**Escape hatch:** `// lint-hardcodes-ignore-next-line: <reason>`. A directive with an empty reason is itself a finding (`ignore-without-reason`). There is no file-level allowlist.

**Output:** findings print as `path:line:col  rule  match`, sorted. The exit code is 0 when clean, 1 on findings and 2 on bad arguments or an unreadable root.

**Wiring:**

- Root scripts: `"lint:hardcodes": "node scripts/lint-hardcodes.mjs"` and `"test:scripts": "node --test scripts/__tests__/"`.
- `admin-checks.yml` runs both as steps after lint/typecheck/test. Its path filter adds `scripts/lint-hardcodes.mjs`, `scripts/__tests__/**` and `scripts/__fixtures__/**`.

**Test:** `scripts/__tests__/lint-hardcodes.test.mjs` uses `node:test`.

- Table-driven `scanSource` cases.
  - Flagged: `bg-blue-100`, `dark:text-blue-200`, `hover:bg-red-500/50`, `w-[372px]`, `sm:max-w-[200px]`, `top-[-1px]`, `text-[#a13c22]`, `color: '#fff'`.
  - Allowed: `data-[state=open]:bg-accent`, `translate-x-[-50%]`, `slide-in-from-top-[48%]`, `grid-cols-[200px_1fr]`, `w-[var(--radix-popover-trigger-width)]`, `max-h-[--radix-select-content-available-height]`, `bg-black/80`, `// spec #220`, `'Orden #123'`, `bg-info/10`, `h-px`.
- An ignore directive with and without a reason.
- A CLI run via `execFile(process.execPath, [script, '--root', fixtureDir])` (no shell). `scripts/__fixtures__/hardcodes/bad/` must exit 1 and list the seeded lines. `…/clean/` must exit 0.

## Decision 11 — FormField migration

The F1 spec wires `id`, `aria-invalid` and `aria-describedby` into exactly one element child. Several admin controls are composites where the focusable node is not the child: Radix `Select` (the trigger is inside the root), `Controller` render props and the comboboxes.

| Option                                                                                                      | Tradeoff                                                                            |
| ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Wrap composites in FormField anyway                                                                         | The `aria-*` lands on a non-DOM root and is lost silently.                          |
| Leave composites unmigrated                                                                                 | About 20 of the 67 sites keep bare errors.                                          |
| **Additive render-prop child: `children: ReactElement \| ((control: FormFieldControlProps) => ReactNode)`** | One small FormField extension. Composites spread the props on their focusable node. |

```ts
export interface FormFieldControlProps {
  id: string;
  'aria-invalid'?: true;
  'aria-describedby'?: string;
}
```

- If F1 already ships an equivalent, F2 reuses it and drops this extension.
- **Patterns:**
  - Plain element: `<FormField label="Cantidad *" id={`items.${i}.quantity`} error={e?.message}><Input {...register(...)} /></FormField>`.
  - `Controller`: FormField goes inside `render`. For Select: `{(p) => <Select …><SelectTrigger {...p}>…`.
  - `RadioGroup`: as an element child. The Radix root takes `aria-*`, and `aria-invalid` is valid on `radiogroup`.
- **Pass-through edits:** `AdministrationCombobox`, `BuildingCombobox`, `ParticularSelector` and `KeyItemUnitField` forward `id`, `aria-invalid` and `aria-describedby` to their trigger.
- **Scope:** 20 files. `KeyOrderForm`, `TechnicalOrderForm`, `ConfigureKeyItemSheet`, `QuickUnitCreateDialog`, `PickupKeyDialog`, `StaffFormSheet`, `CargarProductoSheet`, `ProductFormFields`, `AjusteStockSheet`, `EquipmentFormSheet`, `AssignEquipmentDialog`, `TareaFormSheet`, `EquipmentUpdateFormSheet`, `QuickParticularCreateDialog`, `ConfigureEquipmentPanel`, `DecommissionDialog`, `ReplaceEquipmentDialog`, `ParticularFormSheet`, `BuildingFormSheet` and `AdministrationFormSheet`.
- **Unchanged:**
  - Label text, including " \*", so existing `getByLabelText` queries keep working.
  - Mutation-error banners and the collapsed item error summary in the order forms. These are not field errors.
- **Tests:** each migrated form's existing test gains one submit-invalid assertion: `getAllByRole('alert')` is non-empty, and the first invalid field has `aria-invalid="true"`. FormField's own test covers the render-prop child.

## Decision 12 — Axe e2e gate

- **Dependency:** `@axe-core/playwright` 4.10.x is a root devDependency, next to `@playwright/test` 1.48.2.
- **Shared route list:** `e2e/admin/routes.ts` holds `ROUTES`, which `navigation.spec.ts` now imports.
- **Spec:** `e2e/admin/a11y.spec.ts` runs in two `describe` blocks with `test.use({ colorScheme: 'light' | 'dark' })`. It logs in, then audits:
  - the 10 list routes;
  - `/llaves/nueva` and `/servicio-tecnico/nueva`, after clicking submit on the empty form, so the FormField error wiring is audited.
- **Config:** `new AxeBuilder({ page }).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa'])`.
- **Gate:** it fails on violations with `impact` `serious` or `critical`. The message lists the rule id and the targets, and the full JSON is attached with `testInfo.attach`.
- **Exclusions:** `EXCLUDED_RULES: Record<string, string>` maps a rule to its reason and is passed to `disableRules`. It starts empty, and each entry needs a reason.
- **CI:** it runs in the existing `e2e.yml`, which is not a required check yet. Pre-existing violations it finds are fixed in commit 4.

## Decision 13 — `admin-ui-patterns` skill update

- **Component table:** add `ConfirmDialog`, `FormField`, `EmptyState`, `ErrorState`, `Skeleton`, `NotFoundState` and `useUnsavedChangesGuard`.
- **New patterns:**
  - 7: Type ladder and sections. `text-title-*`, and SectionHeading at `text-title-3` with no `variant`. `common/Section` is gone.
  - 8: Page identity. Title = nav label. Breadcrumbs end at the current item. Every list has a one-line subtitle.
  - 9: Confirmation rule. A destructive or irreversible action uses `ConfirmDialog variant="destructive"`. An informational notice uses a plain `Dialog` with one button. A dirty form uses `useUnsavedChangesGuard`. Never `window.confirm`.
  - 10: Loading idiom. A layout-matching `Skeleton` inside `role="status"`. `ErrorState` with `onRetry` for load failures. `NotFoundState` for null. Button spinners keep their label.
  - 11: Empty states. Lists use the v2 zero-state with an action. Sections and filtered lists use the compact `message`.
  - 12: Form fields. Always `FormField`. Composites use the render-prop child.
- **Anti-patterns:** add the raw palette and px arbitrary values, now enforced by `pnpm lint:hardcodes`.

## Delivery — commit order and size

The line counts were re-measured against the files. The proposal's earlier 700–800 for the core was low by about 250 lines. That gap mostly comes from the 21 retry sites, the empty-state slot and the gate test.

| #   | Commit                                                    | Authored lines                            |
| --- | --------------------------------------------------------- | ----------------------------------------- |
| 1   | Core consistency: Decisions 1 (no blocker), 2, 5–10, 13   | ~950–1,050                                |
| 2   | Data router and blocker: Decisions 3, 4, the blocker in 1 | ~400–450 (~150 of them moved route lines) |
| 3   | FormField migration: Decision 11                          | ~550–650                                  |
| 4   | Axe gate: Decision 12                                     | ~80, plus the generated lockfile          |
|     | **Total**                                                 | **~1,900–2,300** (`size:exception`)       |

Each commit passes the verifier gate on its own. If the user later wants the PR under 800 lines: 2, 3 and 4 become follow-ups, and Decision 8 leaves commit 1.

## Runtime Behavior

- Leaving a dirty order form by Cancel, a sidebar link or a breadcrumb opens "¿Descartar los cambios?". Browser back is also guarded, because the blocker covers POP navigations.
- Load errors show "Reintentar". Detail pages show skeletons, then content, an error or not-found.
- Field errors are announced and linked to their inputs.
- Small width shifts (Decision 9): drawer +8, search +12, user menu −8.
- Router render errors outside a page show the root fallback, and are reported instead of showing React Router's default screen.

## Rollback Plan

Revert the PR, or revert commits 4 → 3 → 2 individually. Each leaves a green tree, and commit 1's hook API does not depend on the blocker. There is no data or schema state.

## Threat Matrix

| Boundary                 | Applicability | Reason                                                              |
| ------------------------ | ------------- | ------------------------------------------------------------------- |
| Documentation-like paths | N/A           | The gate reads `.ts/.tsx/.js/.jsx` as text and never executes them. |
| Git repository selection | N/A           | No git invocation. Roots are fixed repo-relative paths or `--root`. |
| Commit state             | N/A           | No commit automation.                                               |
| Push state               | N/A           | No push automation.                                                 |
| PR commands              | N/A           | No PR automation.                                                   |

The only subprocess is the gate's own test, which runs `execFile(process.execPath, …)` with no shell and fixed arguments. App URL routing is not an agent or process routing boundary.

## Open Questions

- [ ] Does F1 ship FormField with a render-prop child? If it does, Decision 11's extension is dropped.
- [ ] Should axe also cover detail pages (they need seeded ids or a first-row click)? Assumption: lists and forms only.
- [ ] Should `ConfigureKeyItemSheet`'s "Cargando..." (line 156) follow the button-spinner idiom? Assumption: yes, if it is a submit label. Apply checks.
