# Design: installer-mobile-hig

## Context

Phase F3 of `docs/design/ui-audit-2026-10-05.md`. It is stacked on F0 (`ui-foundations-hig`: tokens module, touch ladder, `rounded-sheet`, `control-*`, motion) and F1 (`ui-components-hig`: Button sizes, FormField, `ErrorState onRetry`, PageHeader `text-title-1`). Both APIs are taken from their designs and proposals, not from the working tree.

Facts this design relies on:

- `Input` is already `text-base` (16px). The iOS zoom comes from call-site overrides (`AddCommentForm` `className="text-sm"`) and from `Textarea`'s `md:text-sm`.
- No app uses `<SheetContent side="bottom">`, so the bottom variant can be restyled safely.
- `Tooltip` is hover-only (Radix), so it does not work on touch.
- Sonner is `^2.0.8`, which supports the `offset` and `mobileOffset` props.
- The manifest is inline in `vite.config.ts`, and its only icons are SVG `any maskable`.

## Decision 1 — TabBar API

| Option                                          | Tradeoff                                                                               |
| ----------------------------------------------- | -------------------------------------------------------------------------------------- |
| Reuse `NavItem` in a horizontal row             | Built for the sidebar (tooltips, collapsed state). It would need a second layout mode. |
| **New `TabBar` in `@vitalock/ui` on `NavLink`** | Small and touch-specific. `NavLink` sets `aria-current="page"` for free.               |

**Chosen:** `packages/ui/src/components/layout/TabBar.tsx`.

```ts
export interface TabBarItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}
export interface TabBarProps {
  items: TabBarItem[];
  'aria-label'?: string /* default "Principal" */;
  className?: string;
}
```

- `<nav>` with `border-t bg-card/90 backdrop-blur pb-safe-b`.
- Inner `mx-auto grid h-tab-bar max-w-md grid-cols-{n}`. That gives 49px plus the safe area, centered on md+.
- Each link stacks the icon (`h-6 w-6`, `aria-hidden`) over a `text-caption` label.
- Active: `text-primary`. Inactive: `text-muted-foreground`.
- Focus: `focus-visible:ring-2 ring-inset ring-ring`.

## Decision 2 — Installer shell composition

| Option                                                                | Tradeoff                                                                                  |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Extend the ui `AppShell` with an optional sidebar and a `tabBar` slot | Adds conditionals to a component the admin uses. Its header is hard-wired to `md:hidden`. |
| **App-local shell from ui primitives**                                | Admin stays untouched (non-goal).                                                         |

**Chosen:** rewrite `apps/installer/src/components/layout/AppShell.tsx`.

```
div.flex.h-dvh.flex-col
├─ header  bg-card border-b pt-safe-t → [BrandLogoImages h-7] …… [UserMenu variant="toolbar"]
├─ ConnectivityBanner (full width, squared)
├─ main    flex-1 overflow-auto bg-content px-4 pt-4  (no pb; pages own bottom spacing)
└─ TabBar  items: Inicio "/" (end) · Tareas "/tareas" · Historial "/historial"
```

- Delete `Sidebar.tsx` and `InstallerNav.tsx` from the installer. `MobileSidebar` and `useSidebarCollapsed` stay in ui because the admin uses them.
- `UserMenu` in ui gains `variant?: 'sidebar' | 'toolbar'`, default `sidebar`.
  - `toolbar` is an avatar-only trigger, `size-control-md`, keeping the "Abrir menú de usuario" label.
  - Its popover opens with `side="bottom" align="end"`.
- The installer wrapper drops `collapsed`.

## Decision 3 — Safe-area utilities

| Option                                       | Tradeoff                                                                                  |
| -------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Tailwind plugin `addUtilities` in the preset | Needs the preset (which requires `tailwindcss-animate`), so it is not testable in Vitest. |
| **Spacing tokens in `tailwind.tokens.js`**   | Pure ESM and testable. Gives `pt-`, `pb-`, `h-`, `bottom-` and `mb-` for free.            |

**Chosen:**

- `safeArea = { 'safe-t': 'env(safe-area-inset-top, 0px)', 'safe-b': 'env(safe-area-inset-bottom, 0px)' }`.
- `tabBar = { height: '3.0625rem' }`.
- The preset spreads both into `spacing` (`tab-bar`) and adds `maxHeight: { sheet: '90dvh' }`.
- `tailwind.tokens.d.ts` gains the typings.
- F0's `extendTailwindMerge` registers `safe-t`, `safe-b` and `tab-bar` as spacing values.

**Spec reconciliation:** the proposal's `safe-t`/`safe-b`/`pb-safe` become the classes `pt-safe-t` and `pb-safe-b`.

## Decision 4 — Sticky action bar: shared or local?

| Option                                                      | Tradeoff                                                                 |
| ----------------------------------------------------------- | ------------------------------------------------------------------------ |
| `@vitalock/ui` component                                    | No second consumer yet. Admin sticky footers follow a different pattern. |
| **Installer-local `components/common/StickyActionBar.tsx`** | Promote it to ui when a second consumer appears.                         |

**Chosen:** local.

- It is `sticky bottom-0 -mx-4 border-t bg-card/90 backdrop-blur px-4 py-3`, rendered as the last child of the page.
- Props: `children` (buttons) and `hint?: string`. The hint renders a `text-footnote` line with an `id` that the buttons reference through `aria-describedby`.
- No safe-area padding, because the TabBar below it already consumes the inset.

TaskDetail moves Resolver/Finalizar out of the `PageHeader` children into the bar at `size="lg"` full width.

- Each button opens a `ConfirmDialog` (variant `default`, `isPending` bound to the mutation).
- The dialog closes in `onSettled`.

## Decision 5 — Bottom Sheet variant

**Chosen:** restyle `side: 'bottom'` in `sheet.tsx`. There are no current consumers, so it is not a new prop.

- Add `rounded-t-sheet max-h-sheet overflow-y-auto`.
- Prepend a decorative grabber (`aria-hidden`, `mx-auto h-1 w-9 rounded-full bg-muted-foreground/40`) when `side === 'bottom'`.
- Append a spacer `div.h-safe-b`. This avoids an arbitrary `calc()` padding.
- Dismissal stays as overlay tap, Escape or the "Cerrar" X. Drag-to-dismiss is out of scope.

Consumers:

- `ConfigureEquipmentInline` replaces its `editing` toggle with `Sheet open` state and closes on success.
- `AddCommentForm` moves into a sheet opened by an "Agregar comentario" button in the Historial section.

## Decision 6 — Offline gating and the disabled reason

| Option                            | Tradeoff                                                                      |
| --------------------------------- | ----------------------------------------------------------------------------- |
| Tooltip on the disabled button    | Hover-only, and disabled buttons get no pointer events. Invisible on a phone. |
| **Hook plus visible helper text** | Works on touch and is announced through `aria-describedby`.                   |

**Chosen:** `apps/installer/src/hooks/useOfflineGate.ts` builds on `useOnlineStatus`:

```ts
export function useOfflineGate(): { offline: boolean; reason: 'Sin conexión' | undefined };
```

- Gated: resolve, finalize, configure-save and comment-submit (`disabled={offline || isPending}`).
- The reason renders as the StickyActionBar `hint`, or as FormField-style helper text in the sheets.
- Downloads are not gated. They are reads, and their errors already toast.

## Decision 7 — Toast offset

**Chosen:** `apps/installer/src/lib/toastOffset.ts` exports:

```ts
{
  bottom: `calc(${tabBar.height} + env(safe-area-inset-bottom, 0px) + 0.75rem)`;
}
```

- `tabBar` is imported from `@vitalock/ui/tailwind.tokens.js`.
- `main.tsx` passes it as both `offset` and `mobileOffset` to `<Toaster position="bottom-center">`.
- One height source means the TabBar and the toasts cannot drift apart.

## Decision 8 — PWA chrome and PNG icons

**Chosen:**

- **PNGs:** generate them once with `pnpm dlx @vite-pwa/assets-generator --preset minimal-2023 public/icon-512.svg`, then commit `pwa-192x192.png`, `pwa-512x512.png`, `maskable-icon-512x512.png` and `apple-touch-icon-180x180.png`.
  - No dependency is added.
  - The command is recorded in `apps/installer/public/README.md`.
  - Fallback: export them by hand from the SVG.
- **Manifest:** extract it to `apps/installer/pwa-manifest.ts` (`buildManifest(basePath)`), so a unit test can assert separate `any` and `maskable` entries.
- **`index.html`:**
  - `viewport-fit=cover`;
  - `apple-touch-icon`;
  - `mobile-web-app-capable`;
  - `apple-mobile-web-app-status-bar-style=black-translucent`, which requires the header's `pt-safe-t`;
  - `apple-mobile-web-app-title`.

## Decision 9 — Inputs, large titles and states

- **Inputs:**
  - Remove the installer call-site `text-sm` overrides.
  - Installer textareas pass `md:text-base`, so iPads do not zoom either.
  - The serial field moves to F1's `FormField` (label "Número de serie"), with `autoCapitalize="characters"`, `autoCorrect="off"` and `spellCheck={false}`.
- **Large title:** ui `PageHeader` gains an additive `titleSize?: 'title-1' | 'large-title'`. Inicio, Tareas and Historial pass `large-title`.
- **States:**
  - Dashboard replaces the "Cargando tareas…" `EmptyState` with `Skeleton` rows (`aria-busy`).
  - Dashboard and Tareas render `ErrorState` with `onRetry={() => void query.refetch()}` on `isError`.
  - `ConnectivityBanner` leaves `TareasPage`.

## Decision 10 — Delivery

**Chosen: single PR with size:exception (user decision 2026-10-05).** Ordered commits inside the one PR: chore deletion, then Slice A, then Slice B. The table below remains the commit seam (not separate PRs).

| Unit                                                                        | Content                                                                                                | Est. lines    |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------- |
| Chore commit `chore(installer): delete unused EquipmentUpdateResolveDetail` | Deletes the component and its test. The `equipment-updates` delta names `TaskDetailPage`. Lands first. | 621 deletions |
| Slice A `feat(installer): tab bar shell and PWA chrome`                     | Decisions 1–3, 7 and 8; banner in the shell; `PageHeader titleSize`; `App.test.tsx` and e2e            | ~450          |
| Slice B `feat(installer): thumb-reach task actions` (chained on A)          | Decisions 4–6 and 9 (except titles)                                                                    | ~550          |

- Seam: B depends on A only for the `safe-b` token (the sheet spacer) and the shell-mounted banner.
- The chained-PR alternative was rejected by the user.
- Binary PNGs add no reviewable lines.

## Testing Strategy (strict TDD, RED first)

| Layer          | Test                                                                                                                                                                                                     |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ui unit        | `TabBar.test.tsx`: links and hrefs, `aria-current="page"` only on the active tab, `text-primary` on the active tab, `pb-safe-b` on the nav                                                               |
| ui unit        | `tokens.test.ts`: `safe-t`/`safe-b` env values, `tab-bar` = 3.0625rem. `utils.test.ts`: `cn` keeps `pb-safe-b` next to `pb-4`                                                                            |
| ui unit        | `sheet` bottom: grabber `aria-hidden`, `rounded-t-sheet`. `UserMenu` toolbar variant. `PageHeader titleSize`                                                                                             |
| installer unit | `App.test.tsx`: drop the hamburger, drawer and collapse tests; assert the three tab links (Inicio `/`), the header user menu and the banner when offline                                                 |
| installer unit | `StickyActionBar`/TaskDetail: confirm before the mutation (the mutation is not called until Confirmar), and disabled with the "Sin conexión" hint when offline. Sheets open. Serial attributes and label |
| installer unit | Dashboard skeleton; Dashboard and Tareas retry call `refetch`; `pwa-manifest` purposes; `index.html` meta (fs read); `toastOffset`                                                                       |
| e2e            | `e2e/installer/auth.spec.ts`: replace the "Abrir menú" click with `getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: 'Tareas' })` visible                                         |

## Runtime Behavior

On a phone, the content sits between a safe-area-padded header and a 49px tab bar. Task actions sit above the tabs, toasts float above both, and offline mode disables mutations with a visible reason. Desktop gets the same layout with a centered tab bar.

## Threat Matrix

N/A. This change has no shell, subprocess, VCS/PR automation, executable-file classification or process-integration boundary. Client-side navigation links are UI, not a routing trust boundary.

## Rollback Plan

Revert each slice on its own, and revert the chore commit to restore the dead component. There is no data or schema state.

## Open Questions

- [ ] Should the grabber eventually support drag-to-dismiss (a dependency or custom gesture code)? Deferred.
- [ ] Is `bg-card/90 backdrop-blur` acceptable under the "no arbitrary values" rule, or should a `material` token be added to F0?
