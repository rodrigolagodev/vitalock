# Design: ui-foundations-hig

## Context

Phase F0 of `docs/design/ui-audit-2026-10-05.md`. Everything lands in `packages/ui` except one line in the installer Tailwind config. The new tokens ship unused. F1 adopts them.

All ratios below are WCAG 2.x relative-luminance contrast, computed from the HSL triplets with the exact sRGB formula. **They were verified by script** (Python, exact WCAG sRGB linearisation), which corrected several earlier hand calculations. The new test in `tokens.test.ts` remains the authoritative computation in CI.

## Decision 1 — Dark destructive: one token or split solid/text?

| Option                                                                    | Tradeoff                                                                                                     |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| One bright token + dark ink (like dark success/warning)                   | No new token, but dark-mode delete buttons get maroon text. That is unconventional for a destructive action. |
| `--destructive` stays solid, add `--destructive-text`                     | All 111 `text-destructive` call sites would have to migrate.                                                 |
| **`--destructive` = text/tint/indicator tone, add `--destructive-solid`** | Only 2 solid consumers migrate (`button.tsx` and `badge.tsx`).                                               |

**Chosen:** split. `--destructive` keeps its current role (text, `/10` tints, status dots). The new `--destructive-solid` is used with `--destructive-foreground`. The preset adds `destructive.solid`, giving `bg-destructive-solid`.

| Token                      | Light                        | Dark        |
| -------------------------- | ---------------------------- | ----------- |
| `--destructive`            | `0 84.2% 44%`                | `0 72% 68%` |
| `--destructive-solid`      | `0 84.2% 44%` (same as text) | `0 72% 50%` |
| `--destructive-foreground` | `0 0% 100%`                  | `0 0% 100%` |

**Why:**

- Dark `0 72% 68%` measures 5.02 on background, 6.60 on card, 6.16 on popover and 6.08 on content. The earlier `64%` measures **4.39** on dark background and fails.
- White on dark solid (`0 72% 50%`) measures 4.89. The split exists for dark only.
- Light text and solid coincide: `0 84.2% 44%` with white measures 5.62. `--destructive-solid` still ships in both themes for API symmetry, so `bg-destructive-solid` resolves everywhere.
- Light destructive is darkened from 49% to 44% (Decision 1b). The old `210 20% 98%` foreground on light destructive measured 4.46 and failed. It becomes white.
- `button.tsx` destructive becomes `bg-destructive-solid text-destructive-foreground hover:bg-destructive-solid/90`. `badge.tsx` destructive becomes `bg-destructive-solid`.

## Decision 1b — Light tone tokens darkened in F0

| Option                           | Tradeoff                                                                                                                                                                                |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Keep light tones, defer to F1/F2 | Tone text fails on `--content` (destructive 4.32, info 4.37, warning 4.48; success passes narrowly at 4.63) and soft badges (`text-<tone>` on `bg-<tone>/10` over card) fail below 4.5. |
| **Darken the light tones now**   | Four value edits. Tone text on content and soft badges pass in F0, with no component edits.                                                                                             |

**Chosen:** darken. Ratios are card / content / 10%-tint-over-card / white-on-solid.

| Token           | Old           | New           | Ratios                    |
| --------------- | ------------- | ------------- | ------------------------- |
| `--destructive` | `0 84.2% 49%` | `0 84.2% 44%` | 5.62 / 5.18 / 4.73 / 5.62 |
| `--info`        | `217 91% 52%` | `217 91% 46%` | 5.78 / 5.32 / 4.98 / 5.78 |
| `--warning`     | `38 92% 32%`  | `38 92% 29%`  | 5.70 / 5.25 / 4.96 / 5.70 |
| `--success`     | `160 84% 27%` | `160 84% 25%` | 5.69 / 5.24 / 4.94 / 5.69 |

Light `--info-foreground` changes from `210 40% 98%` to `0 0% 100%`, matching success/warning, so the white-on-solid ratio above is the real pair. Dark tones other than destructive are unchanged.

## Decision 2 — `--accent`: neutral or retired?

| Option                                                                | Tradeoff                                                                                               |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Retire                                                                | 13 consumers must migrate. A missed class silently generates nothing, so that element loses its hover. |
| Neutral `--accent`, consumers move to `bg-muted`                      | Light `muted` vs light `content` is **1.01:1**, so ghost hover on the page canvas would be invisible.  |
| **Neutral `--accent` (shadcn semantics), consumers keep `bg-accent`** | Every consumer turns neutral with no class edits.                                                      |

**Chosen:** `--accent` is the one neutral hover/highlight surface. `--accent-foreground` equals `--foreground`.

| Token                 | Light               | Dark          |
| --------------------- | ------------------- | ------------- |
| `--accent`            | `220 16% 93%`       | `224 20% 20%` |
| `--accent-foreground` | `217.2 32.6% 17.5%` | `224 20% 95%` |

How visible the hover step is:

- Light accent vs card: 1.18. Vs content: 1.09.
- Dark accent vs card: 1.44. Vs content: 1.33. Foreground on it 11.95, muted-foreground on it 5.73 (script-verified after apply set saturation to 20%).

Text on the hover surface:

- foreground on accent: 12.37 light, 12.13 dark.
- muted-foreground on accent: 4.65 light, 5.82 dark.

Consumer inventory and the result for each:

| Consumer                                                                                 | Classes                                          | Result                                                                   |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------ |
| `button.tsx` outline, ghost                                                              | `hover:bg-accent hover:text-accent-foreground`   | Grey hover with dark text instead of violet with white text.             |
| `NavItem.tsx`                                                                            | same, for the inactive item                      | Grey hover. The active item stays `bg-primary`.                          |
| `select.tsx` SelectItem                                                                  | `focus:bg-accent focus:text-accent-foreground`   | Grey highlight.                                                          |
| `dialog.tsx` close                                                                       | `data-[state=open]:bg-accent`                    | Neutral. This is probably inert because Radix Close has no `data-state`. |
| `FilterBar.tsx` (×3)                                                                     | `hover:bg-accent`                                | Grey row/button hover.                                                   |
| `ParticularSelector`, `BuildingCombobox`, `AdministrationCombobox`, `TechnicalOrderForm` | `hover:bg-accent [hover:text-accent-foreground]` | Grey hover. No edit needed.                                              |
| `card.tsx`                                                                               | comment only                                     | Rewrite the comment.                                                     |

## Decision 3 — Final dark `--border` and `--input`

- `--input` = `224 12% 50%`. It measures 4.45 vs card, 4.14 vs popover, 4.09 vs content, 3.38 vs background and 3.76 vs muted. All are ≥3.
- `--border` = `224 20% 24%`. This is a neutral hairline that replaces the violet brand-900 experiment. It measures 1.66 vs card and 1.26 vs background.

Hairline `--border` is decorative. The light theme's border is 1.23 vs card. It gets an explicit, test-documented exemption from 3:1 and a 1.2 floor instead. Raising it to 3:1 would turn every card edge and divider into a heavy rule. Control outlines use `--input` and are never exempt.

Side effect: Switch's unchecked track (`bg-input`) gets more visible in both themes. This is intended.

## Decision 4 — `--status-neutral-foreground`

**Kept, value unchanged.** It measures 5.23 vs light card and 4.78 vs light muted. Its comment in `globals.css` ("muted-foreground stays lighter") becomes false, so rewrite it to mark the token redundant, to be removed when F1 migrates StatusBadge to `text-muted-foreground` (5.01 on muted). Removing it now would mean editing a component, which is a non-goal.

## Decision 5 — Type ladder shape

| Option                                                       | Tradeoff                                                                              |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| CSS variables switched by a `.touch` class                   | Indirection at runtime. Preset values become `var()` strings that a test cannot read. |
| Two preset entries (`body` + `touch-body`)                   | Doubles the names, and every component must pick a variant.                           |
| **Same names; installer overrides `fontSize` at build time** | One name per role. Each app compiles its own value.                                   |

**Chosen:**

- A new pure ESM module, `packages/ui/tailwind.tokens.js`, exports `fontFamily`, `typeScale`, `touchTypeScale`, `radius`, `controlHeight`, `elevation` and `motion`.
- The preset spreads them into `theme.extend`.
- `apps/installer/tailwind.config.js` adds `theme.extend.fontSize: touchTypeScale`. Later extends win in Tailwind's merge.
- Add the subpath `"./tailwind.tokens.js"` to `packages/ui/package.json` exports.

Entry shape: `'title-1': ['1.75rem', { lineHeight: '2.125rem', fontWeight: '600' }]`. Values are in rem so they respect the user's browser font size. Tests convert ×16 to the spec's px.

The tokens live in a separate module because the preset calls `require('tailwindcss-animate')`, which crashes in Vitest ESM. The module is importable on its own.

`cn()` must learn the new class names. tailwind-merge would classify `text-title-1` as a text colour and drop it next to `text-foreground`. `shadow-elevation-2` would likewise be mistaken for a shadow colour. `packages/ui/src/lib/utils.ts` switches to `extendTailwindMerge`, adding the ladder names to `font-size` and `elevation-*` to `shadow`.

## Decision 6 — Radius tiers

The new tiers are plain values in `tailwind.tokens.js`: `rounded-control` 0.5rem, `rounded-container` 0.75rem, `rounded-sheet` 1rem. They need no CSS variable, because no theme changes them. `--radius` and `rounded-sm/md/lg` (6/8/10px) stay untouched. F1 remaps controls from `rounded-lg` (10px) to `rounded-control` (8px). That 2px visual change is deliberately deferred.

## Decision 7 — Control heights

Extend `spacing` with `control-sm` 2.25rem, `control-md` 2.75rem and `control-lg` 3.25rem. Using spacing yields `h-`, `min-h-`, `w-` and `size-` from Tailwind 3.4. Square icon buttons need `size-control-*`. The trade-off is that it also generates meaningless `p-control-*` classes, which are harmless.

## Decision 8 — Elevation and motion

- `boxShadow`:
  - `elevation-0` and `elevation-1`: `none`.
  - `elevation-2`: Tailwind's `md` value.
  - `elevation-3`: Tailwind's `xl` value.
- `transitionDuration`: `state` 150ms, `overlay` 250ms.
- `transitionTimingFunction`: `standard` = `cubic-bezier(0, 0, 0.2, 1)`, which is ease-out with no overshoot.

The scrim stays a component concern (F1).

## Decision 9 — Global reduced-motion rule

Append this at the end of `globals.css`, outside `@layer`:

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

**Why 0.01ms and not `animation: none`:** `animationend` still fires, so Radix Presence unmounts closing dialogs and sheets normally. Spinners and pulses become static. They still render, so loading stays visible. The existing `motion-reduce:` on Sidebar stays.

## Decision 10 — Contrast test helper

- **Helper:** `packages/ui/src/lib/contrast.ts`. It is pure and not exported from `index.ts`. It provides:
  - `parseHsl('h s% l%')`
  - `hslToRgb`
  - `relativeLuminance` (sRGB linearisation, 0.04045 threshold)
  - `contrastRatio(a, b)`
  - `composite(fg, bg, alpha)`, which F1 needs for soft badges.
- **Tests:** `tokens.test.ts` reuses `extractBlock`/`getVar` and resolves each token per theme.
  - A data-driven `it.each` names `"<theme>: <fg> on <bg> ≥ <floor>"`, so a failure names the pair.
  - Helper sanity checks: black on white = 21. `#767676` on white ≈ 4.54.
- **Floors:** `TEXT 4.5`, `BOUNDARY 3`, `HAIRLINE 1.2` (documented exemption) and `HOVER 1.05` (perceptibility, not WCAG).

| Kind     | Pairs (both themes unless noted)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| text     | foreground/{background, card}; popover-foreground/popover; muted-foreground/{card, background, muted, popover, accent}; accent-foreground/accent; primary-foreground/primary; destructive-foreground/destructive-solid; {info, success, warning}-foreground/tone; {destructive, info, success, warning}/{card, popover, content}; {destructive, info, success, warning}/composite(tone@10%, card) (light, via `composite()`); status-neutral-foreground/{card, muted}; dark only: destructive/{background, content} |
| boundary | input/{card, background, popover}; ring/{card, background}                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| hairline | border/card                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| hover    | accent/{card, popover}                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |

Script-verified ratios for the corrected and load-bearing pairs:

| Theme | Pair                                              | Ratio                      | Floor |
| ----- | ------------------------------------------------- | -------------------------- | ----- |
| Dark  | destructive / background, card, popover, content  | 5.02 / 6.60 / 6.16 / 6.08  | 4.5   |
| Dark  | destructive-foreground / destructive-solid        | 4.89                       | 4.5   |
| Dark  | input / background, card                          | 3.38 / 4.45                | 3     |
| Dark  | ring / background                                 | 3.07 (thin pass, watch it) | 3     |
| Light | destructive / card, content, tint                 | 5.62 / 5.18 / 4.73         | 4.5   |
| Light | info / card, content, tint                        | 5.78 / 5.32 / 4.98         | 4.5   |
| Light | warning / card, content, tint                     | 5.70 / 5.25 / 4.96         | 4.5   |
| Light | success / card, content, tint                     | 5.69 / 5.24 / 4.94         | 4.5   |
| Light | white / destructive, info, warning, success solid | 5.62 / 5.78 / 5.70 / 5.69  | 4.5   |
| Light | accent / card                                     | 1.18                       | 1.05  |
| Light | foreground, muted-foreground / accent             | 12.37 / 4.65               | 4.5   |

Other values (unchanged from the earlier pass): light muted-foreground 5.48 on card, 5.05 on background, 5.01 on muted; light input 3.29 on card, 3.03 on background; light primary pair 4.83; light ring on background 4.45; dark success pair 7.72, warning pair 9.38, info pair 6.95; dark muted-foreground 8.27 on card, 6.29 on background. The test is authoritative for these.

The literal-value assertions for `--accent` change to the new values. Add a saturation guard: S ≤ 20% in both themes.

## Decision 11 — Focus rings and close labels

- **Sidebar toggle and UserMenu trigger:** add `focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring`. The ring is inset because the `aside` uses `overflow-hidden`, which clips an outer ring. The ring sits on `bg-muted`: 4.41 light, 3.41 dark.
- **SelectItem and FilterBar "Limpiar filtro" buttons (×2):** add `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`. These rings are outer, because dark ring on accent is 2.84 while ring on popover is 3.76. Radix focuses items programmatically, so only keyboard modality matches `:focus-visible`. FilterBar rows are already covered by Checkbox's ring.
- **Close labels:** the sr-only "Close" becomes the literal "Cerrar" in `dialog.tsx` and `sheet.tsx`. There is no i18n layer, and the apps are Spanish-only, so a prop or framework would be premature.

## Runtime Behavior

- Every screen repaints:
  - Muted text is darker and input borders are visible.
  - Dark borders are neutral grey instead of violet.
  - Hovers are grey.
  - Light tone text, soft badges and filled tone buttons are slightly darker.
  - Dark semantic badges and buttons get dark ink, except destructive, which keeps white on a solid `0 72% 50%`.
- Installer components compile the touch ladder. Admin compiles the desktop ladder. Neither is used yet.
- With reduced motion, dialogs, sheets and popovers appear instantly.

## Rollback Plan

Revert the PR. It contains only CSS, preset/config and class strings. There is no data or schema state.

## Threat Matrix

N/A. This change has no routing, shell, subprocess, VCS/PR automation, executable-file classification or process-integration boundary.

## Spec reconciliation

The delta spec must state:

- `--accent` is the single neutral hover/highlight surface (`hover:bg-accent`), not `hover:bg-muted`. Saturation ≤ 20% in both themes.
- The destructive split: `--destructive` is text/tint/indicator; `--destructive-solid` + `--destructive-foreground` (white) is the filled surface. Both tokens exist in both themes.
- The corrected values: dark `--destructive` `0 72% 68%`; light `--destructive` `0 84.2% 44%`, `--info` `217 91% 46%`, `--warning` `38 92% 29%`, `--success` `160 84% 25%`; light `--info-foreground` white; tone text on content and soft-badge tints at a 4.5 floor.
- The type ladder in rem (e.g. `title-1` = `1.75rem` / `2.125rem`), with px only as the ×16 equivalent.

## Open Questions

- [ ] `aria-label="Toggle sidebar"` is still English, and 9 tests bind to it. Localize it in F1?
