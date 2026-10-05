# Apply progress: ui-foundations-hig

Status: all tasks done except 5.3 (manual screenshots, needs a human and a browser).

## Phase 0 evidence

- 0.1 Baseline `@vitalock/ui`: 23 files, 211 tests passed.
- 0.3 e2e grep (`e2e/`: admin/auth, admin/navigation, installer/auth, fixtures): no hits for `Close`, `Cerrar`, `bg-accent`, `bg-primary`, `bg-destructive`, `text-destructive`, `Toggle sidebar`. No extra Phase 5 locator task needed.
- 0.4 Solid `bg-destructive` consumers in `packages/ui`: only `button.tsx` and `badge.tsx` (migrated). Others are `/10` `/5` tints or dot indicators (kept on `--destructive`).
- No test in apps or packages was bound to "Close".

## Deviations / adjustments

1. Dark `--accent` is `224 20% 20%`, not the design's `224 25% 20%`. The design value has saturation 25%, which violates the spec rule "saturation <= 20% in both themes" (caught by the new guard). Minimal change: saturation 25 -> 20, same hue and lightness. All hover/text pairs still pass. tasks.md 1.4 literal for dark `--accent` updated accordingly in tokens.test.ts.
2. All hand-calculated values passed the contrast test unchanged (including dark `ring` on background, 3.07 >= 3). No other value was adjusted.
3. Added `tailwind.tokens.d.ts` and `tailwind.preset.d.ts` so the TS tests can import the JS modules under strict typecheck; added `tailwind.tokens.js` to the eslint `ignores` in `packages/ui/eslint.config.js` (same reason as the preset: plain JS outside the TS project).
4. Tailwind preset imports fine in Vitest (no stub of `tailwindcss-animate` needed), so the preset wiring test imports it directly.
5. Contrast `it.each` cases compute ratios lazily inside the test so a missing token fails with the pair and theme named, instead of failing at collection.
6. Ghost/outline `hover:bg-accent` assertions already held before the change (red not applicable); the dependent value change is covered by the token tests.

## RED seen before GREEN

- 1.1 contrast.test: import of `../contrast` unresolved.
- 1.3/1.4/1.5: 55 failed against old globals.css (names show theme and pair).
- 2.1/2.3/2.6/2.8: module missing; `cn` ladder/elevation cases failed.
- 3.1: 3 failed before the rule existed.
- 4.1/4.3/4.5: 9 failed (destructive classes, 4 focus-ring, 2 "Cerrar", Badge).

## Files touched

- packages/ui/globals.css, package.json, eslint.config.js, tailwind.preset.js
- New: packages/ui/tailwind.tokens.js, tailwind.tokens.d.ts, tailwind.preset.d.ts, src/lib/contrast.ts
- packages/ui/src/lib/utils.ts (extendTailwindMerge)
- components: button.tsx, badge.tsx, card.tsx (comment), dialog.tsx, sheet.tsx, select.tsx, layout/Sidebar.tsx, layout/UserMenu.tsx, patterns/FilterBar.tsx
- apps/installer/tailwind.config.js
- Tests: src/lib/**tests**/{contrast,utils,tokens}.test.ts, src/**tests**/tailwind-tokens.test.ts, components/**tests**/primitives.test.tsx, layout/**tests**/{Sidebar,UserMenu}.test.tsx, patterns/**tests**/FilterBar.test.tsx

## Final gate

`pnpm install --frozen-lockfile` ok; `pnpm lint && pnpm typecheck && pnpm test` exit 0.
Tests: ui 346 (26 files), admin 828, installer 121, shared 205, supabase 80.

## Pending

- 5.3 manual verification (screenshots light/dark, tab focus, OS reduced motion).
- Open question deferred to F1: localize `aria-label="Toggle sidebar"`.
