# Tasks: ui-foundations-hig

Authority on values: `design.md` (Decisions 1, 1b, 2-11 and "Spec reconciliation") wins over `proposal.md` where they differ. Light `--info-foreground` becomes white (`0 0% 100%`). Strict TDD: every GREEN task is preceded by its RED task, and the RED task MUST be seen failing before the GREEN task starts.

## Review Workload Forecast

| Field                   | Value                                                                                                |
| ----------------------- | ---------------------------------------------------------------------------------------------------- |
| Estimated changed lines | 450-650 (about 60% tests, helper and token module; about 40% CSS values, preset and class strings)   |
| 800-line budget risk    | Low-Medium                                                                                           |
| Chained PRs recommended | No                                                                                                   |
| Suggested split         | None. If the diff passes 800 lines, split after Phase 3 (colour + tokens) from Phase 4+ (a11y edits) |
| Delivery strategy       | single-pr                                                                                            |
| Chain strategy          | N/A                                                                                                  |

## Suggested Work Units

| Unit | Goal                                                                  | PR   | Focused check                                     | Rollback                |
| ---- | --------------------------------------------------------------------- | ---- | ------------------------------------------------- | ----------------------- |
| U1   | Contrast helper + colour tokens in `globals.css` + accent/focus tests | PR 1 | `pnpm --filter @vitalock/ui test -- tokens`       | Revert PR (CSS + tests) |
| U2   | `tailwind.tokens.js`, preset wiring, installer touch ladder, `cn()`   | PR 1 | `pnpm --filter @vitalock/ui test -- preset utils` | Revert PR               |
| U3   | Reduced-motion rule, focus rings, close labels, destructive classes   | PR 1 | `pnpm --filter @vitalock/ui test`                 | Revert PR               |
| U4   | Final gate, e2e grep, screenshots                                     | PR 1 | `pnpm lint && pnpm typecheck && pnpm test`        | Revert PR               |

All units ship in the single PR (no database, schema or dependency state).

## Phase 0 · Prerequisites and baseline

- [x] 0.1 Confirm branch `feat/ui-foundations-hig` and a clean baseline: run `pnpm --filter @vitalock/ui test` and record the pass count (repo root).
- [x] 0.2 Read `packages/ui/src/lib/__tests__/tokens.test.ts` and note the existing `extractBlock`/`getVar` helpers and every literal assertion on `--accent`, `--muted-foreground`, `--input`, `--border` and the dark semantic tokens (`packages/ui/src/lib/__tests__/tokens.test.ts`).
- [x] 0.3 Grep `apps/*/e2e/` (and any root `e2e/`) for the strings `Close`, `Cerrar`, `bg-accent`, `bg-primary`, `text-destructive`, `bg-destructive` and `Toggle sidebar`; record hits in `apply-progress.md`. Any locator bound to "Close" or to a colour class becomes an extra task under Phase 5 (apps/\*/e2e/).
- [x] 0.4 Grep `packages/ui/src` and `apps/*/src` for `bg-destructive` to confirm the only solid consumers are `button.tsx` and `badge.tsx` (Decision 1), and for `accent` consumers against the Decision 2 inventory (packages/ui, apps/\*).

## Phase 1 · Contrast helper and colour tokens

RED first: helper and token tests fail against the old values.

- [x] 1.1 RED: write `packages/ui/src/lib/__tests__/contrast.test.ts` covering `parseHsl`, `hslToRgb`, `relativeLuminance`, `contrastRatio` (black on white = 21, `#767676` on white about 4.54) and `composite(fg, bg, alpha)` (Spec: The contrast helper is verified). Confirm it fails (module missing).
- [x] 1.2 GREEN: create `packages/ui/src/lib/contrast.ts` (pure, NOT exported from `index.ts`) with `parseHsl`, `hslToRgb`, `relativeLuminance` (0.04045 threshold), `contrastRatio`, `composite` (Decision 10). Confirm 1.1 passes.
- [x] 1.3 RED: in `tokens.test.ts`, add the data-driven contrast table using `it.each` with names like `"<theme>: <fg> on <bg> >= <floor>"` and floors `TEXT 4.5`, `BOUNDARY 3`, `HAIRLINE 1.2` (explicit, commented exemption from 3:1 for `--border`), `HOVER 1.05`. Pairs exactly as the Decision 10 table: text, tone-on-tint via `composite()`, boundary (`input`, `ring`), hairline, hover (`accent` on `card`, `popover`) (Spec: Contrast Floors). Confirm it fails on old values and that the failure names pair and theme (Spec: A regression fails the guard).
- [x] 1.4 RED: add token value assertions for the new literals: light `--muted-foreground` `215 18% 43%`, `--input` `215 14% 57%`, `--destructive` `0 84.2% 44%`, `--info` `217 91% 46%`, `--warning` `38 92% 29%`, `--success` `160 84% 25%`, `--info-foreground` `0 0% 100%`, `--destructive-foreground` `0 0% 100%`, `--destructive-solid` `0 84.2% 44%`; dark `--destructive` `0 72% 68%`, `--destructive-solid` `0 72% 50%`, `--destructive-foreground` `0 0% 100%`, success-fg `158 80% 10%`, warning-fg `38 92% 12%`, `--input` `224 12% 50%`, `--border` `224 20% 24%`, `--accent` `224 20% 20%`, `--accent-foreground` `224 20% 95%`; light `--accent` `220 16% 93%`, `--accent-foreground` `217.2 32.6% 17.5%`. Also: no destructive token equals `0 72% 62%`; `--destructive`, `--destructive-solid`, `--destructive-foreground` defined in both themes; `--accent` saturation <= 20% in both themes; `#a9b0ba` not used as muted text; dark `--border` has one final value (Specs: Muted foreground and input; Dark semantic values; Destructive split; Accent neutral).
- [x] 1.5 UPDATE existing: edit the existing literal `--accent` assertions (and any old `--muted-foreground`, `--input`, `--border`, dark semantic literal assertions found in 0.2) in `tokens.test.ts` to the new values, replacing rather than duplicating (Risk 3).
- [x] 1.6 GREEN: edit light `:root` values in `packages/ui/globals.css` per Decisions 1, 1b, 2, 3 (muted-foreground, input, destructive, info, warning, success, info-foreground, `--destructive-solid`, `--destructive-foreground`, accent, accent-foreground).
- [x] 1.7 GREEN: edit `.dark` values in `packages/ui/globals.css` per Decisions 1, 2, 3 (destructive, destructive-solid, destructive-foreground, success-fg, warning-fg, input, border, accent, accent-foreground). Remove the violet brand-900 experiment comment on dark `--border`.
- [x] 1.8 GREEN: rewrite the `--status-neutral-foreground` comment to mark it redundant until F1 migrates StatusBadge to `text-muted-foreground` (value unchanged; Decision 4). Rewrite any stale `--accent` comments in `globals.css` and the `card.tsx` comment (Decision 2).
- [x] 1.9 Run `pnpm --filter @vitalock/ui test -- tokens contrast`; confirm 1.1, 1.3, 1.4, 1.5 are green. If a dark `ring` pair (3.07) is borderline, keep the value and leave the floor at 3.

## Phase 2 · Preset token module and `cn()`

- [x] 2.1 RED: create `packages/ui/src/__tests__/tailwind-tokens.test.ts` importing `../../tailwind.tokens.js` (ESM, no `tailwindcss-animate`). Assert: `fontFamily.sans` starts `-apple-system`, `BlinkMacSystemFont`, `"SF Pro Text"`, then `Inter`, `"Segoe UI"`, `Roboto`, ends `sans-serif`; `typeScale` has the nine names with desktop rem values (`title-1` `1.75rem`/`2.125rem`/600, `title-2` `1.375rem`/`1.75rem`/600, `title-3` `1.125rem`/`1.5rem`/600, `headline` `0.9375rem`/`1.25rem`/600, `body` `0.875rem`/`1.25rem`/400, `callout` `0.8125rem`/`1.125rem`/400, `footnote` `0.75rem`/`1rem`/400, `caption` `0.6875rem`/`0.8125rem`/500, `large-title` `2.125rem`/`2.5625rem`/700), with px checked by rem x 16; `touchTypeScale` values for `title-3` `1.25rem`/`1.5625rem`, `headline` and `body` `1.0625rem`/`1.375rem`, `callout` `1rem`/`1.3125rem`, `footnote` `0.8125rem`/`1.125rem`, `caption` `0.75rem`/`1rem`; `radius` control `0.5rem`, container `0.75rem`, sheet `1rem`; `controlHeight` `control-sm` `2.25rem`, `control-md` `2.75rem`, `control-lg` `3.25rem`; `elevation` 0 and 1 are `none`, 2 equals Tailwind `md`, 3 equals Tailwind `xl` (and level 3 differs from level 2); `motion` durations `state` 150ms and `overlay` 250ms, timing `standard` `cubic-bezier(0, 0, 0.2, 1)` with y-values within 0-1 (no overshoot) (Specs: Type Ladder, Shape/Size/Elevation/Motion). Confirm it fails.
- [x] 2.2 GREEN: create `packages/ui/tailwind.tokens.js` (pure ESM) exporting `fontFamily`, `typeScale`, `touchTypeScale`, `radius`, `controlHeight`, `elevation`, `motion` with the values above (Decisions 5-8).
- [x] 2.3 RED: add preset wiring test in the same file or `tailwind-preset.test.ts` that loads the preset via `createRequire` (mock or stub `tailwindcss-animate` if it breaks Vitest) and asserts `theme.extend.fontSize`, `fontFamily.sans`, `borderRadius` (`control`, `container`, `sheet`), `spacing` (`control-sm|md|lg`), `boxShadow` (`elevation-0..3`), `transitionDuration` (`state`, `overlay`), `transitionTimingFunction.standard`, and `colors.destructive.solid` resolving to `hsl(var(--destructive-solid))`; also that existing keys (`rounded-sm/md/lg`, `--radius`) are untouched (Spec: Adding tokens does not change rendering). Confirm it fails.
- [x] 2.4 GREEN: wire `tailwind.tokens.js` into `packages/ui/tailwind.preset.js` `theme.extend` and add `destructive.solid` colour. Do not remove or alter existing keys.
- [x] 2.5 GREEN: add the `"./tailwind.tokens.js"` subpath to `packages/ui/package.json` `exports` (Decision 5).
- [x] 2.6 RED: add a test that `apps/installer/tailwind.config.js` sets `theme.extend.fontSize` to `touchTypeScale` (read the file as text or import it) and that `apps/admin/tailwind.config.js` does not override `fontSize` (Spec: touch scale reachable via the same names). Confirm it fails.
- [x] 2.7 GREEN: edit `apps/installer/tailwind.config.js` to import `touchTypeScale` from `@vitalock/ui/tailwind.tokens.js` and set `theme.extend.fontSize: touchTypeScale`.
- [x] 2.8 RED: add `packages/ui/src/lib/__tests__/utils.test.ts` (or extend the existing one) asserting `cn('text-foreground', 'text-title-1')` keeps both, `cn('text-title-1', 'text-body')` keeps only the last (same group), `cn('shadow-elevation-2', 'shadow-md')` keeps only the last, `cn('shadow-elevation-2', 'shadow-primary')` still keeps both-class independence as colour vs shadow, and existing `cn('px-2', 'px-4')` behaviour still holds. Confirm it fails for the ladder and elevation cases.
- [x] 2.9 GREEN: switch `packages/ui/src/lib/utils.ts` to `extendTailwindMerge` with the nine ladder names in `font-size` and `elevation-0..3` in `shadow` (Decision 5).
- [x] 2.10 Run `pnpm --filter @vitalock/ui test`; confirm Phase 2 tests are green and no existing primitive assertion changed because of these unused tokens.

## Phase 3 · Reduced motion

- [x] 3.1 RED: add a test (in `tokens.test.ts` or `reduced-motion.test.ts`) that reads `globals.css` as text, locates the `@media (prefers-reduced-motion: reduce)` block outside any `@layer`, and asserts it targets `*, *::before, *::after` and sets `animation-duration: 0.01ms !important`, `animation-iteration-count: 1 !important`, `transition-duration: 0.01ms !important` and `scroll-behavior: auto !important`; also asserts the block does not use `animation: none` (Decision 9; Spec: Global rule is declared). Confirm it fails.
- [x] 3.2 GREEN: append the Decision 9 rule at the end of `packages/ui/globals.css`, outside `@layer`.
- [x] 3.3 Confirm the Sidebar's existing `motion-reduce:` utilities are untouched.

## Phase 4 · Component class and label edits

- [x] 4.1 RED: update `packages/ui/src/components/__tests__/primitives.test.tsx` for the new expectations: Button `destructive` has `bg-destructive-solid`, `text-destructive-foreground`, `hover:bg-destructive-solid/90` and not `bg-destructive `; Badge `destructive` has `bg-destructive-solid`; Button `ghost`/`outline` have `hover:bg-accent` and not `hover:bg-muted`. Update any existing assertions of the old literal classes in the same file (Risk 3). Confirm they fail.
- [x] 4.2 GREEN: edit `packages/ui/src/components/button.tsx` (destructive variant) and `packages/ui/src/components/badge.tsx` (destructive variant) per Decision 1. Leave ghost/outline on `hover:bg-accent`.
- [x] 4.3 RED: add focus-ring tests: Sidebar toggle in `layout/__tests__/Sidebar.test.tsx` and UserMenu trigger in `layout/__tests__/UserMenu.test.tsx` include `focus-visible:ring-2`, `focus-visible:ring-inset` and `focus-visible:ring-ring`; Select item (`primitives.test.tsx`) and FilterBar "Limpiar filtro" buttons x2 (`patterns/__tests__/FilterBar.test.tsx`) include `focus-visible:outline-none`, `focus-visible:ring-2` and `focus-visible:ring-ring` (Decision 11; Spec: Visible Focus). Confirm they fail.
- [x] 4.4 GREEN: add the ring classes to `layout/Sidebar.tsx` (toggle) and `layout/UserMenu.tsx` (trigger) with `ring-inset`; add the outer ring classes to `select.tsx` SelectItem and to both "Limpiar filtro" buttons in `patterns/FilterBar.tsx`.
- [x] 4.5 RED: add close-label tests: open `Dialog` and `Sheet` with default close and assert `getByRole('button', { name: 'Cerrar' })` finds exactly one and `queryByRole('button', { name: 'Close' })` is null (Spec: Dialog and Sheet close named in Spanish). Update any existing test that queries "Close". Confirm they fail.
- [x] 4.6 GREEN: change the sr-only text from "Close" to "Cerrar" in `dialog.tsx` and `sheet.tsx`.
- [x] 4.7 Update the `card.tsx` comment that mentions accent (Decision 2) if not done in 1.8. Comment-only.
- [x] 4.8 Run `pnpm --filter @vitalock/ui test`; confirm the whole workspace is green.
- [x] 4.9 Grep apps for tests or e2e bound to "Close" (see 0.3 results) and update them: `rg -n "name: ['\"]Close|getByText\\(['\"]Close|\\bClose\\b" apps packages` (apps/admin, apps/installer, e2e/). Leave `aria-label="Toggle sidebar"` unchanged (open question, deferred to F1).

## Phase 5 · Verify

- [x] 5.1 Re-grep `e2e/` (and `apps/*/e2e/`) for `Close` and colour classes (`bg-accent`, `bg-primary`, `bg-destructive`, `text-destructive`) as planned in 0.3; fix any locator found, otherwise record "no hits" in `apply-progress.md` (Risk 4).
- [x] 5.2 Run `pnpm install --frozen-lockfile`, then `pnpm lint`, `pnpm typecheck`, `pnpm test` from the repo root; all must pass (verifier gate). No SQL touched, so `test:sql` and `db:rehearse` are not required.
- [x] 5.3 Manual verification (record in `manual-verification.md`): before/after screenshots of main admin and installer pages in light and dark; check ghost/outline hover, Select highlight, NavItem hover, destructive button/badge, dark borders, and tab-focus on Sidebar toggle, UserMenu trigger, Select items, FilterBar clear buttons; toggle OS reduced-motion and confirm dialogs/sheets still open and close.
- [x] 5.4 Write `apply-progress.md` with files touched and test evidence; mark checklist items `[x]` only when proven.
