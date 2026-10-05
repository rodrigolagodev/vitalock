# Proposal: installer-mobile-hig

## Why

This is phase F3 of `docs/design/ui-audit-2026-10-05.md` §4. The installer is a phone PWA, but today it is built like a desktop app.

- **M6:** the shell reuses the admin sidebar, and a hamburger FAB (`fixed bottom-6 left-4`) covers content. The app has only 3 destinations.
- **M7, m14:** there is no `viewport-fit=cover` and no safe-area handling. There is no apple-touch-icon PNG and no apple-mobile-web-app meta. Each icon is declared as `any maskable`. Toasts sit under the home indicator.
- **M8:** Resolver and Finalizar sit at the top of a long page, out of thumb reach, and Finalizar has no confirmation.
- **M9:** Dashboard and Tareas ignore `isError`. Dashboard shows "Cargando…" text instead of a skeleton.
- **M12:** `ConnectivityBanner` is mounted only on Tareas, but the actions happen on TaskDetail.
- **m9, m10:** inputs use `text-sm`, which makes iOS zoom on focus. The serial input has no label and gets autocorrected.
- **m13:** `EquipmentUpdateResolveDetail.tsx` is used only by its own test.

## What Changes

- **`TabBar` (new, `@vitalock/ui`):** three tabs (Inicio, Tareas, Historial). It is 49px tall plus the safe area. The active tab uses the primary tint, has a label and sets `aria-current="page"`.
- **Installer shell:** a new shell with a top bar (logo and `UserMenu`), the main area and the `TabBar` at every width. The sidebar, the `MobileSidebar` and `InstallerNav` are removed from the installer. The admin app does not change.
- **PWA:**
  - `viewport-fit=cover`;
  - `safe-t`, `safe-b` and `pb-safe` utilities in the preset;
  - apple-touch-icon and `apple-mobile-web-app-*` meta;
  - separate `any` and `maskable` PNG icons;
  - the Toaster is offset above the TabBar and the safe area.
- **TaskDetail:**
  - Resolver and Finalizar move to a sticky bottom bar (translucent material, safe-area aware).
  - A `ConfirmDialog` opens before either terminal action.
  - Configuring equipment and adding a comment open in a bottom `Sheet` with `rounded-sheet` top corners and a grabber.
- **Offline:** `ConnectivityBanner` moves to the shell. While offline, mutation buttons are disabled and show the reason "Sin conexión".
- **States:** Dashboard gets a skeleton. Dashboard and Tareas show `ErrorState` with `onRetry={refetch}`.
- **Inputs:** installer inputs use 16px text. The serial field uses `FormField` with a visible label and sets `autoCapitalize="characters"`, `autoCorrect="off"` and `spellCheck={false}`.
- **Large title:** `text-large-title` on Inicio, Tareas and Historial.
- **Dead code:** delete `EquipmentUpdateResolveDetail.tsx` and its test. The search found no importer other than its own test.
- **e2e:** `e2e/installer/auth.spec.ts:8` clicks "Abrir menú". It will assert the Tareas tab instead. `App.test.tsx:100-136` changes to match.

## Capabilities

### New Capabilities

- `installer-shell`: tab navigation, the top bar, PWA chrome (viewport, safe areas, icons, meta), the shell-level connectivity banner and toast placement.

### Modified Capabilities

- `design-system`:
  - ADD TabBar;
  - ADD Safe-area utilities;
  - ADD Bottom Sheet presentation.
- `installer-home`:
  - MODIFY R4 Loading (Dashboard skeleton);
  - MODIFY R7 (the banner is mounted in the shell);
  - ADD Error state with retry (Dashboard and Tareas).
- `installer-ticket-detail`:
  - ADD Sticky action bar with confirmation;
  - ADD Secondary tasks in a bottom sheet;
  - ADD Offline-disabled mutations;
  - ADD Touch-safe inputs.
- `equipment-updates`: MODIFY "Installer UI — Rollback Download Section" so it names `TaskDetailPage` instead of the deleted component.

## Impact

- **Size:**
  - The feature work is about 950–1,100 changed lines, roughly half of them tests.
  - The dead-code deletion adds another 621 lines (218 + 403).
  - Together that is over the 800-line budget.
- **Delivery (user decision 2026-10-05): ONE PR with `size:exception`.** Estimate: ~1,570–1,720 changed lines (950–1,100 feature + 621 deletions), excluding binary PNGs. This explicitly acknowledges `size:exception`; the earlier chained-pr recommendation is superseded.
  - Ordered commits inside the PR: (1) `chore(installer)` delete `EquipmentUpdateResolveDetail` + test; (2) Slice A work (shell, PWA, TabBar, offline banner, large titles, e2e, ~450 lines); (3) Slice B work (TaskDetail, sheets, offline gating, inputs, states, ~550 lines).
- No database changes, migrations or runtime dependencies.
- Stacked on F0 (`ui-foundations-hig`) and F1 (`ui-components-hig`), neither of which is merged yet.

## Success Criteria

- Component tests cover:
  - TabBar `aria-current`, the active tint and the safe-area padding;
  - the sticky action bar and that ConfirmDialog opens before the mutation;
  - the sheets opening;
  - buttons disabled offline with the reason shown;
  - ErrorState retry calling `refetch`;
  - the Dashboard skeleton;
  - the serial input attributes and label.
- `rg 'MobileSidebar|EquipmentUpdateResolveDetail' apps/installer` returns nothing.
- The installer e2e suite passes with tab navigation. The verifier gate is green.
- Checked by hand on a real iPhone in standalone mode: no content sits under the notch or the home indicator, toasts appear above the tabs, and inputs do not zoom on focus.

## Non-goals

- Collapsing the large title on scroll (E6), pull-to-refresh, a serial scanner and an offline cache (F4).
- Any change to the admin shell.
- A manifest `background_color` that follows dark mode, because the manifest cannot vary by color scheme.

## Risks

1. **PNG generation.** No generator is installed, and the design-system spec forbids new dependencies. Mitigation: generate the PNGs once from `public/icon-512.svg` with `pnpm dlx @vite-pwa/assets-generator` and commit them. If that fails, the PNGs become a manual asset task.
2. **`navigator.onLine` reports false positives.** Mitigation: offline mode only disables buttons. Server errors still go through the existing toasts.
3. **The `installer-home` baseline is stale.** It still describes `BuildingWorkCard`. Mitigation: the deltas touch only R4 and R7.
4. **Stacked on two unmerged branches.** Mitigation: rebase after F0 and F1 merge.
5. **Desktop installer users lose the sidebar.** Mitigation: the TabBar is centered and has a maximum width on md+.

## Rollback Plan

Revert each slice's PR on its own. The changes are components, the shell, `index.html`, the manifest, PNG assets and tests, with no data state. Reverting the chore commit brings the dead component back.

## Proposal question round

The session runs in auto mode, so these questions are recorded here for user review.

1. Should Resolver (equipment update) also require confirmation, or only Finalizar? (Assumption: both, because both are terminal and immutable.)
2. Should the TabBar replace the sidebar at every width, or only below md? (Assumption: every width. The installer has 3 destinations.)
3. Where should `UserMenu` (logout) live: in the top bar or in a 4th "Perfil" tab? (Assumption: top bar, keeping 3 tabs.)
4. Delivery: chained-pr plus the chore commit, or a single PR with `size:exception`? (Assumption: chained-pr.)

## Ready for Spec/Design

Ready. The questions above are assumptions for design and do not block the spec.
