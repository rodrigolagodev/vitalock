# Proposal: ui-foundations-hig

## Why

- Phase F0 of `docs/design/ui-audit-2026-10-05.md` §4. The accessibility score is 4/10 and F1–F3 depend on this phase.
- C1: `--muted-foreground` is 2.19:1 on card. It has 183 uses (table headers, labels, placeholders).
- C2: the `--input` border is 1.47:1, below WCAG 1.4.11.
- C3: the dark semantic pairs are 1.5–1.9:1. m12: dark `--border` is still an experiment.
- M5: two accents compete. Ghost and outline hovers paint saturated violet.
- C5, m6, m8: there is no reduced-motion handling, four controls have no visible focus ring, and the dialog close label is in English.
- `tokens.test.ts` checks literal values, not contrast. Nothing stops a regression.

## What Changes

- **Colour (`globals.css`):** `--muted-foreground` → `215 18% 43%` (5.48:1 on card, 5.05:1 on background). `--input` → `215 14% 57%` (3.29:1). In dark mode: success-fg `158 80% 10%` (7.7:1), warning-fg `38 92% 12%` (9.4:1), destructive text `0 72% 62%` (5.4:1), solid destructive `0 72% 50%` + white (4.9:1), and a final dark `--border`.
- **One accent:** `--accent` becomes a neutral hover surface. Ghost and outline hover in `button.tsx` → `bg-muted`.
- **Target-system tokens (`tailwind.preset.js` + `globals.css`):**
  - an explicit system font stack;
  - the typography ladder (`large-title` … `caption`) as `fontSize` tokens;
  - radius tiers (control 8, container 12, sheet 16);
  - control heights 36/44/52;
  - elevation levels 0–3 and motion durations (150 / 250 ms ease-out).
- **Accessibility:**
  - a global `prefers-reduced-motion` rule;
  - `focus-visible` rings on the Sidebar toggle, the UserMenu trigger and Select/Popover items;
  - the dialog sr-only label reads "Cerrar".
- **Guard:** `tokens.test.ts` computes WCAG contrast from the HSL triplets. It requires ≥4.5:1 for text pairs and ≥3:1 for borders, in both themes.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `design-system`: MODIFY Shared Design Tokens: new values, neutral `--accent`, and the Figma `#a9b0ba` muted value is retired. ADD five requirements: Contrast Floors, Type Ladder Tokens, Shape/Size/Elevation/Motion Tokens, Reduced Motion, and Visible Focus. The Light-first Sizing Language requirement stays unchanged until F1.

## Impact

- The diff is mostly `packages/ui` and is forecast at about 250–400 lines, inside the 800-line budget. Delivery is `single-pr`.
- No database changes, migrations or dependencies.
- Every admin and installer screen repaints: muted text gets darker and borders become more visible.

## Success Criteria

- The `tokens.test.ts` contrast assertions pass for every listed pair in light and dark mode.
- The preset exposes the ladder, radius, control-height, elevation and motion tokens.
- With reduced motion enabled, dialog, sheet, pulse and spin animations are suppressed.
- The four controls show a focus ring on keyboard focus. The dialog close button is named "Cerrar".
- The verifier gate is green. The main pages of both apps are screenshot-checked before merge.

## Non-goals

- Migrating component sizes, `SectionHeading`, `FormField` or app screens. These belong to F1–F3.
- Adopting the new tokens across the codebase. They are added unused but available, for F1 to consume.
- Changing the brand primary value.

## Risks

1. **Repainting every screen:** the global visual shift is intended. Mitigation: before/after screenshots of the main pages in both themes.
2. **Visual regressions** from the neutral `--accent`: `NavItem` and `SelectItem` also use `bg-accent`. Mitigation: design inventories every `accent` consumer.
3. **Class-name tests:** `tokens.test.ts` asserts the literal `--accent` value, and `primitives.test.tsx` asserts classes. Mitigation: update these tests first, under strict TDD.
4. **e2e locators:** a quick search found no locators bound to "Close" or to colour classes. Mitigation: grep again during apply.

## Rollback Plan

Revert the PR. The changes are CSS, preset tokens and class strings only. There is no data or schema state.

## Proposal question round

The session runs in auto mode, so these questions are recorded here for user review.

1. Should dark destructive get separate solid and text tokens, or one value? (Assumption: design decides, and separate tokens are likely.)
2. Should `--accent` become neutral or be retired? (Assumption: neutral, shadcn semantics.)
3. Should the Sheet sr-only "Close" label also become "Cerrar"? (Assumption: yes, same fix.)
4. Is `--status-neutral-foreground` now redundant? (Assumption: keep it and revisit in F1.)

## Ready for Spec/Design

Ready. The questions above are assumptions for design and do not block the spec.
