# Tasks: installer-mobile-hig

## Review Workload Forecast

| Field                   | Value                                                            |
| ----------------------- | ---------------------------------------------------------------- |
| Estimated changed lines | ~1,570–1,720 (621 deletions + ~950–1,100 feature; PNGs excluded) |
| 800-line budget risk    | High                                                             |
| Chained PRs recommended | No (user override of design Decision 10)                         |
| Suggested split         | ONE PR, `size:exception`, 3 ordered commits                      |
| Delivery strategy       | exception-ok                                                     |
| Chain strategy          | size-exception                                                   |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: High

Branch stacked on F1 (`ui-components-hig`), stacked on F0 (`ui-foundations-hig`).

### Suggested Work Units (commits in one PR)

| Unit | Goal                                                | Commit                | Focused test                                                                | Runtime harness                       | Rollback boundary                   |
| ---- | --------------------------------------------------- | --------------------- | --------------------------------------------------------------------------- | ------------------------------------- | ----------------------------------- |
| 1    | Delete dead component                               | C1 `chore(installer)` | `rg EquipmentUpdateResolveDetail apps/installer` empty                      | N/A: removal only                     | revert C1                           |
| 2    | Shell, PWA, TabBar, banner, titles, e2e             | C2 `feat(installer)`  | `pnpm --filter @vitalock/ui test && pnpm --filter @vitalock/installer test` | `pnpm e2e` installer, iPhone viewport | revert C2 (needs C3 reverted first) |
| 3    | TaskDetail actions, sheets, offline, inputs, states | C3 `feat(installer)`  | `pnpm --filter @vitalock/installer test`                                    | manual iPhone viewport                | revert C3                           |

## Phase 0 · Prerequisites

- [x] 0.1 Verify F0/F1 APIs exist: `packages/ui/tailwind.tokens.js`, `extendTailwindMerge` in `cn` (`lib/utils.ts`), `FormField`, `ErrorState onRetry`, Button `size="lg"`. If missing, STOP and rebase.
- [x] 0.2 Add `safe-t`, `safe-b`, `tab-bar` to the `cn` merge config spacing values (RED first: 1.2).

## Phase 1 · C1 Chore

- [x] 1.1 Delete `EquipmentUpdateResolveDetail.tsx` and its test in `apps/installer`; confirm `rg 'EquipmentUpdateResolveDetail' apps/installer` is empty. Commit C1.

## Phase 2 · C2 RED

- [x] 2.1 RED `tokens.test.ts`: `safe-t`/`safe-b` env values with `0px` fallback; `tab-bar` = 3.0625rem.
- [x] 2.2 RED `utils.test.ts`: `cn('pb-4','pb-safe-b')` keeps both.
- [x] 2.3 RED `layout/__tests__/TabBar.test.tsx`: hrefs, `aria-current` only on active, `text-primary` active, `pb-safe-b` on nav, default label "Principal".
- [x] 2.4 RED `UserMenu` toolbar variant, `PageHeader titleSize` tests (ui).
- [x] 2.5 RED `pwa-manifest` test: separate `any` and `maskable` PNG entries; `index.html` meta test (viewport-fit, apple tags); `toastOffset` test.
- [x] 2.6 RED `App.test.tsx` (drop hamburger/drawer/collapse tests): three tab links, header user menu, banner when offline; Tareas no longer mounts banner.

## Phase 3 · C2 GREEN

- [x] 3.1 Add safe/tab-bar tokens to `tailwind.tokens.js`/`.d.ts`; spread into preset spacing, `maxHeight.sheet`.
- [x] 3.2 Create `packages/ui/src/components/layout/TabBar.tsx`; export from index.
- [x] 3.3 Add `UserMenu variant` and `PageHeader titleSize` in ui.
- [x] 3.4 Rewrite `apps/installer/src/components/layout/AppShell.tsx`; delete `Sidebar.tsx`, `InstallerNav.tsx`; mount `ConnectivityBanner` in shell, remove from `TareasPage`.
- [x] 3.5 Create `apps/installer/pwa-manifest.ts`; wire into `vite.config.ts`; update `index.html`.
- [x] 3.6 Generate PNGs via `pnpm dlx @vite-pwa/assets-generator`; commit; document in `apps/installer/public/README.md`.
- [x] 3.7 Create `lib/toastOffset.ts`; pass to `<Toaster>` in `main.tsx`.
- [x] 3.8 Apply `large-title` on Inicio, Tareas, Historial.
- [x] 3.9 Update `e2e/installer/auth.spec.ts:8` to assert the Tareas tab link.
- [x] 3.10 Align spec wording to `pt-safe-t`, `pb-safe-b`, `h-tab-bar` in `specs/design-system`, `installer-shell`, `installer-ticket-detail`. Commit C2.

## Phase 4 · C3 RED

- [ ] 4.1 RED `sheet` bottom: grabber `aria-hidden`, `rounded-t-sheet`, `h-safe-b` spacer.
- [ ] 4.2 RED `useOfflineGate` test: offline gives reason "Sin conexión".
- [ ] 4.3 RED `StickyActionBar` and TaskDetail: bar is sticky with backdrop-blur; mutation not called until Confirmar; buttons disabled offline with hint.
- [ ] 4.4 RED sheets: Configurar equipo and Agregar comentario open in bottom Sheet; submit disabled offline.
- [ ] 4.5 RED serial field: label "Número de serie", `autoCapitalize="characters"`, `autoCorrect="off"`, `spellCheck=false`; no `text-sm` on inputs.
- [ ] 4.6 RED Dashboard skeleton (`aria-busy`); Dashboard and Tareas `ErrorState` retry calls `refetch`.

## Phase 5 · C3 GREEN

- [ ] 5.1 Restyle `sheet.tsx` bottom variant.
- [ ] 5.2 Create `hooks/useOfflineGate.ts`.
- [ ] 5.3 Create `components/common/StickyActionBar.tsx`; move Resolver/Finalizar in TaskDetail with `ConfirmDialog` closing in `onSettled`.
- [ ] 5.4 Convert `ConfigureEquipmentInline` and `AddCommentForm` to Sheets; gate with offline hook.
- [ ] 5.5 Serial field via `FormField`; remove `text-sm` overrides; textareas `md:text-base`.
- [ ] 5.6 Dashboard skeleton and `ErrorState` on Dashboard and Tareas.
- [ ] 5.7 REFACTOR: dedupe, tidy. Commit C3.

## Phase 6 · Verify

- [ ] 6.1 `pnpm lint && pnpm typecheck && pnpm test` green.
- [ ] 6.2 `rg 'MobileSidebar|EquipmentUpdateResolveDetail' apps/installer` empty.
- [ ] 6.3 `pnpm e2e` installer suite if local Supabase stack is up; else note skipped.
- [ ] 6.4 Manual iPhone-viewport check (standalone): no content under notch/indicator, toasts above tabs, no input zoom.
- [ ] 6.5 PR labeled `size:exception`; confirm proposal § Impact matches.
