# Proposal: ui-components-hig

## Why

- Phase F1 of `docs/design/ui-audit-2026-10-05.md` §4. It consumes the tokens F0 (`ui-foundations-hig`) adds unused.
- M3: Button default/lg/icon are `h-[52px]` and inputs are 44px. Mixed rows misalign.
- M4: IconButton has a ~28px hit area (target 44).
- C4, m11: no field component. 67 error sites in 20 app files use a bare `<p class="text-destructive">` with no `aria-invalid`/`aria-describedby`.
- M1, M2: `SectionHeading` defaults to `text-[28px]`, which is larger than the page h1. Four section styles coexist, including `apps/admin` `common/Section` (uppercase eyebrow).
- M9: `EmptyState` is a muted `<p>`. `ErrorState` has no retry.
- M11, m1: Card has a resting `shadow-sm`. Containers mix `rounded-md/lg/xl`. Breadcrumb chevrons are `h-6` next to `text-xs` text.

## What Changes

- **Button:** sizes on control tokens: `sm` 36, `default` 44, `lg` 52, `icon` `size-control-md`. Controls use `rounded-control`. No `h-[52px]` remains.
- **IconButton:** keeps the 16px glyph. An `after:` pseudo-element expands the hit area to ≥44px.
- **FormField (new):** a field wrapper with label, description and error.
  - Wires `id`, `aria-invalid` and `aria-describedby` into its child.
  - Renders the error at `text-footnote` with `role="alert"`.
  - Pilots: both `LoginPage`s.
- **SectionHeading:** one convention, `text-title-3`. The 28px default and the `variant` prop are removed. Consumers drop `variant="secondary"`.
- **`common/Section`:** retired. Its 4 call sites (EquipoDetail, KeyDetail) migrate to `SectionHeading` + Card.
- **EmptyState v2:** adds optional `icon`, `title`, `description` and `action`. `message` stays as the compact form, so existing callers do not change.
- **ErrorState:** adds optional `onRetry` ("Reintentar"). `back` stays. `ErrorFallback` reuses `onRetry`.
- **Card / StatCard / containers:**
  - Card has no resting shadow.
  - Containers use `rounded-container`.
  - StatCard value uses `text-title-2 tabular-nums` and its label uses the ladder.
- **PageHeader:** the title uses `text-title-1`. Breadcrumb chevrons become `h-3.5 w-3.5`.
- **`--status-neutral-foreground`:** retired. StatusBadge neutral uses `text-muted-foreground`.
- **Installer:** `size="sm"` call sites (~9) move to `default`, so touch targets stay at 44 or more.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `design-system`:
  - MODIFY Light-first Sizing Language: control heights, radius tiers and no resting shadow.
  - MODIFY Pattern Components: SectionHeading single convention, EmptyState v2, ErrorState retry.
  - MODIFY StatCard.
  - MODIFY Shared Design Tokens: remove `--status-neutral-foreground`.
  - ADD Form Field Accessibility.
  - ADD Icon Button Hit Area.
- `admin-shell`: MODIFY PageHeader Sizing to the ladder (title-1, small chevrons).

## Impact

- Estimated 550–700 changed lines, about 55% of them tests. This is inside the 800-line budget, so delivery is `single-pr` and stacked on `feat/ui-foundations-hig`.
- **size:exception** (recorded after apply, 2026-10-05): the measured diff is about 1,057 changed lines. Production code is about 400 lines, matching the design; the overrun is tests. It ships as one PR under the user's "one PR per phase" decision for this audit series.
- No database changes, migrations or dependencies.
- Visual: admin buttons shrink from 52 to 44. `sm` buttons go from 44 to 36 (47 sites). Section titles go from 28 to 18px. Cards lose their shadow.

## Success Criteria

- Component tests cover:
  - the Button height classes;
  - the IconButton hit area of 44 or more;
  - FormField `aria-*` and `role="alert"`;
  - SectionHeading `text-title-3`;
  - the EmptyState and ErrorState slots, including that `onRetry` fires;
  - Card with no shadow;
  - PageHeader `text-title-1`.
- `rg 'h-\[52px\]|text-\[28px\]|common/Section|status-neutral'` finds no matches in `apps/` or `packages/`.
- The verifier gate is green. Main pages are screenshot-checked in both apps.

## Non-goals

- **FormField in admin forms** (18 files, 67 sites): deferred to F2 `admin-ui-consistency`, because it is the bulk of the budget.
- **FormField in installer forms other than login:** deferred to F3.
- **Rich EmptyState call-site upgrades and wiring `refetch` into ErrorState:** F2 for admin and F3 for the installer. Both APIs are additive.
- **Skeletons, ConfirmDialog and `useBlocker`:** these belong to F2.
- **axe e2e gate:** deferred to F2, to keep this change within budget.
- **Localizing "Toggle sidebar":** deferred, because 9 tests bind to the label.

## Risks

1. **Desktop density shift** (52→44 and 44→36). Mitigation: before/after screenshots. Pattern 4 already avoids `sm` in headers.
2. **Installer touch regressions from the smaller `sm`.** Mitigation: installer `sm` sites move to `default` in this change.
3. **Stacking on an unmerged F0.** Mitigation: rebase after F0 merges. F1 applies only after F0 is applied.
4. **`cn` merge of the new ladder classes.** Mitigation: rely on F0's `extendTailwindMerge`, with one assertion per component.

## Rollback Plan

Revert the PR. The changes are components, class strings and tests only. There is no data or schema state.

## Proposal question round

The session runs in auto mode, so these questions are recorded here for user review.

1. Should FormField pilot on both LoginPages in F1, or ship with no consumers? (Assumption: pilot. `packages/ui` has no forms with field errors to migrate.)
2. Should the `variant` prop on SectionHeading be removed, or kept as a no-op? (Assumption: remove it.)
3. Should `common/Section` migrate now or in F2? (Assumption: now. There are only 4 sites.)
4. Should the installer `sm` buttons become `default` now, or wait for F3? (Assumption: now, so the 44px touch floor never regresses.)

## Ready for Spec/Design

Ready. The questions above are assumptions for design and do not block the spec.
