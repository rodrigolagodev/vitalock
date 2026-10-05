# Delta for design-system

**Change**: ui-foundations-hig
**Date**: 2026-10-05

Phase F0 of the UI audit. This delta recalibrates the shared colour tokens, introduces the target-system tokens (typography, shape, size, elevation, motion) as available-but-unused, and adds accessibility guarantees (contrast floors, reduced motion, visible focus). The "Light-first Sizing Language" requirement is NOT touched here; it stays as-is until F1.

Contrast ratios are WCAG 2.x relative-luminance ratios computed from the HSL triplets declared in `packages/ui/globals.css`.

## MODIFIED Requirements

### Requirement: Shared Design Tokens

`packages/ui/globals.css` MUST define the shared palettes as one token source for both apps, with a LIGHT-first palette and a `.dark` opt-out adaptation. Both apps MUST consume the shared tokens and MUST NOT keep per-app palettes.

Light palette:

- `--primary` and `--ring` MUST be `240 79% 65%` (the brand primary; its value is unchanged by this change).
- `--muted-foreground` MUST be `215 18% 43%`. The former Figma value `#a9b0ba` is retired and MUST NOT appear as a muted text colour.
- `--input` (control border) MUST be `215 14% 57%`.
- `--accent` MUST be a NEUTRAL hover surface (saturation at most 20%), not a saturated brand tone, in both themes. Ghost and outline Button hover states MUST paint this neutral accent surface (`hover:bg-accent`), not a violet fill and not `bg-muted` (light `--muted` against `--content` is about 1.01:1, so a muted hover would be invisible). The accent surface MUST differ from `--card` by at least 1.05:1. Primary is the only saturated accent in the UI chrome.
- Semantic tone values (text/tint tones): `--destructive` `0 84.2% 44%`, `--info` `217 91% 46%`, `--warning` `38 92% 29%`, `--success` `160 84% 25%`.
- `--destructive` is the text/tint tone. Solid destructive surfaces (solid Buttons, solid Badges) use the separate tokens `--destructive-solid` and `--destructive-foreground` (white); in light, `--destructive-solid` MUST satisfy the 4.5:1 floor with `--destructive-foreground`.
- Content background, card, border, foreground and table-head tokens keep their existing values.
- `--popover` / `--popover-foreground` MUST remain defined.

Dark palette (`.dark`) MUST define:

- success foreground `158 80% 10%`;
- warning foreground `38 92% 12%`;
- `--destructive` (text/tint tone) `0 72% 68%`;
- `--destructive-solid` `0 72% 50%` paired with `--destructive-foreground` white;
- `--input` `224 12% 50%`;
- a neutral `--accent` (saturation at most 20%);
- a final, non-experimental `--border` value.

The value `0 72% 62%` MUST NOT be used for any destructive token (it fails contrast on the dark background).

#### Scenario: Dark mode toggle persists

- GIVEN a user toggles dark mode
- WHEN the page reloads
- THEN `.dark` applies with the adapted palette and the choice persists

#### Scenario: Primary surfaces use the brand primary

- GIVEN a primary Button renders in light mode
- WHEN `globals.css` is parsed
- THEN `--primary` and `--ring` equal `240 79% 65%`

#### Scenario: Muted foreground and input tokens carry the recalibrated values

- GIVEN `globals.css` is parsed by the token test
- WHEN the light `--muted-foreground` and `--input` are read
- THEN they equal `215 18% 43%` and `215 14% 57%` respectively
- AND `#a9b0ba` / its HSL equivalent is not used for `--muted-foreground`

#### Scenario: Ghost and outline hover use the neutral accent surface

- GIVEN a Button with variant `ghost` or `outline` renders
- WHEN its class list is inspected
- THEN the hover class is `hover:bg-accent`
- AND no hover class is `hover:bg-muted`

#### Scenario: Accent token is neutral and visible

- GIVEN `globals.css` is parsed
- WHEN `--accent` is read in light and dark
- THEN its saturation is at most 20% in both themes
- AND the contrast ratio of `--accent` against `--card` is at least 1.05:1 in both themes

#### Scenario: Light semantic tone values are present

- GIVEN the light `:root` block is parsed
- WHEN the tone tokens are read
- THEN `--destructive` is `0 84.2% 44%`, `--info` is `217 91% 46%`, `--warning` is `38 92% 29%` and `--success` is `160 84% 25%`

#### Scenario: Dark semantic values are present

- GIVEN `globals.css` `.dark` block is parsed
- WHEN the success/warning foregrounds, destructive tokens and input are read
- THEN success-fg is `158 80% 10%`, warning-fg is `38 92% 12%`, `--destructive` is `0 72% 68%`, `--destructive-solid` is `0 72% 50%`, `--destructive-foreground` is white, and `--input` is `224 12% 50%`
- AND dark `--border` is defined with a single final value
- AND no destructive token equals `0 72% 62%`

#### Scenario: Destructive text and solid tokens are split

- GIVEN `globals.css` is parsed
- WHEN `--destructive`, `--destructive-solid` and `--destructive-foreground` are read in each theme
- THEN all three are defined in both themes
- AND `--destructive-foreground` on `--destructive-solid` is at least 4.5:1 in both themes

## ADDED Requirements

### Requirement: Contrast Floors

Every foreground/background token pair that renders text MUST meet WCAG contrast of at least 4.5:1, and every control-outline token MUST meet at least 3:1 against the surface it sits on, in BOTH the light and dark themes. The token test suite MUST compute these ratios from the HSL triplets in `globals.css` (no hard-coded expected ratios, no literal-value-only checks) so that a regression fails the build.

Pairs that MUST be covered at minimum, in both themes:

| Kind    | Pair                                                                                                       | Floor |
| ------- | ---------------------------------------------------------------------------------------------------------- | ----- |
| text    | `foreground` on `background`, on `card`, on `popover`                                                      | 4.5:1 |
| text    | `muted-foreground` on `card` and on `background`                                                           | 4.5:1 |
| text    | `primary-foreground` on `primary`                                                                          | 4.5:1 |
| text    | each tone text (`success`, `warning`, `info`, `destructive`) on `card`, on `popover` and on `content`      | 4.5:1 |
| text    | each tone text on its 10% tone tint composited over `card` (soft badges)                                   | 4.5:1 |
| text    | `destructive-foreground` on `destructive-solid`                                                            | 4.5:1 |
| text    | semantic foregrounds on their semantic backgrounds where defined (for example dark success-fg, warning-fg) | 4.5:1 |
| control | `input` on `card` and on `background`                                                                      | 3:1   |
| divider | `border` on `background` and on `card` (decorative hairline; see exemption)                                | 1.2:1 |

`--border` is a decorative hairline and is EXEMPT from the 3:1 floor; its floor is 1.2:1. The test MUST state this exemption explicitly rather than silently omitting the pair. Control outlines (`--input`) are never exempt.

#### Scenario: Text pairs meet 4.5:1 in light mode

- GIVEN the light token set parsed from `globals.css`
- WHEN the contrast test computes the ratio for each listed text pair
- THEN every ratio is at least 4.5:1
- AND this includes tone text on `card`, `popover` and `content`, and on the 10% tone tint over `card`

#### Scenario: Text pairs meet 4.5:1 in dark mode

- GIVEN the `.dark` token set parsed from `globals.css`
- WHEN the contrast test computes the ratio for each listed text pair, including success, warning, info and destructive tones and `destructive-foreground` on `destructive-solid`
- THEN every ratio is at least 4.5:1

#### Scenario: Control border meets 3:1

- GIVEN the light and dark `--input` tokens
- WHEN the test computes contrast against `card` and `background`
- THEN every ratio is at least 3:1

#### Scenario: Border hairline is exempt but floored

- GIVEN the light and dark `--border` tokens
- WHEN the test computes contrast against `background` and `card`
- THEN every ratio is at least 1.2:1
- AND the test documents that `--border` is exempt from the 3:1 floor as a decorative hairline

#### Scenario: A regression fails the guard

- GIVEN a token pair is changed so its ratio falls below its floor
- WHEN the token test runs
- THEN at least one assertion fails and names the offending pair and theme

#### Scenario: The contrast helper is verified

- GIVEN known reference colours (black on white, and a mid-grey pair with a known ratio)
- WHEN the helper computes contrast
- THEN black on white yields 21:1 and the known pair matches its published ratio within rounding

### Requirement: Type Ladder Tokens

The Tailwind preset in `packages/ui` MUST expose an explicit system font stack for `sans` and a semantic type ladder as `fontSize` tokens, each carrying a size, a line height and a weight. The ladder names MUST be: `large-title`, `title-1`, `title-2`, `title-3`, `headline`, `body`, `callout`, `footnote`, `caption`. The `sans` stack MUST begin with system UI fonts (`-apple-system`, `BlinkMacSystemFont`, `"SF Pro Text"`) and fall back through `Inter`, `"Segoe UI"`, `Roboto` to the generic `sans-serif`.

Sizes and line heights are expressed in `rem` (1rem = 16px). Desktop (admin) base values, as rem size/line-height, weight (px equivalent in parentheses): `title-1` 1.75rem/2.125rem 600 (28/34), `title-2` 1.375rem/1.75rem 600 (22/28), `title-3` 1.125rem/1.5rem 600 (18/24), `headline` 0.9375rem/1.25rem 600 (15/20), `body` 0.875rem/1.25rem 400 (14/20), `callout` 0.8125rem/1.125rem 400 (13/18), `footnote` 0.75rem/1rem 400 (12/16), `caption` 0.6875rem/0.8125rem 500 (11/13). `large-title` is an installer (touch) token at 2.125rem/2.5625rem 700 (34/41). The touch (installer) scale for `title-3`, `headline`, `body`, `callout`, `footnote`, `caption` is 1.25rem/1.5625rem (20/25), 1.0625rem/1.375rem (17/22), 1.0625rem/1.375rem (17/22), 1rem/1.3125rem (16/21), 0.8125rem/1.125rem (13/18) and 0.75rem/1rem (12/16) respectively. Desktop and touch scales MUST both be reachable by the same token names (how the touch variants are surfaced, for example per-app override or breakpoint, is a design decision). Tests asserting px MUST multiply the rem value by 16.

The tokens are added but not yet adopted by components; existing text utilities MUST keep working unchanged.

#### Scenario: Preset exposes the full ladder

- GIVEN the Tailwind preset is imported in a test
- WHEN `theme.extend.fontSize` is read
- THEN all nine ladder names are present, each with a size and line height
- AND `title-1` resolves to `1.75rem`/`2.125rem` (28px/34px at 16px per rem) with weight 600 and `caption` to `0.6875rem`/`0.8125rem` (11px/13px) with weight 500
- AND the touch scale values (for example `body` 1.0625rem/1.375rem) are reachable through the same token names via the design's chosen mechanism

#### Scenario: Preset declares the system font stack

- GIVEN the Tailwind preset is imported in a test
- WHEN `theme.extend.fontFamily.sans` is read
- THEN the first entries are `-apple-system`, `BlinkMacSystemFont` and `"SF Pro Text"`
- AND the list ends with the generic `sans-serif`

#### Scenario: Existing text utilities are unaffected

- GIVEN components using `text-sm`, `text-xs` or `text-lg`
- WHEN the preset gains the ladder tokens
- THEN those utilities still resolve to their previous sizes and existing component tests pass unchanged

### Requirement: Shape/Size/Elevation/Motion Tokens

The preset and `globals.css` MUST expose named tokens for shape, control size, elevation and motion, available for later phases to adopt (they are NOT adopted by components in this change):

- Radius tiers: control 8px, container 12px, sheet 16px. `rounded-full` remains the pill/avatar shape.
- Control heights: 36px, 44px and 52px, named so that Button, Input and Select of the same size can share one value.
- Elevation levels 0 to 3: level 0 is flat content; level 1 is card surface with a hairline border and no shadow; level 2 is popover/menu with a medium shadow; level 3 is dialog/sheet with a large shadow plus a dark scrim.
- Motion: a 150ms duration for state changes and a 250ms duration for sheets and dialogs, with ease-out timing and no bounce/overshoot easing.

Existing token values (for example the current `--radius` and `rounded-[9px]`/`rounded-[12px]` usages) MUST keep working; the new tokens are additive.

#### Scenario: Radius tiers are exposed

- GIVEN the preset or `globals.css` is read in a test
- WHEN the radius tokens are resolved
- THEN control, container and sheet resolve to 8px, 12px and 16px

#### Scenario: Control heights are exposed

- GIVEN the preset is read in a test
- WHEN the control-height tokens are resolved
- THEN three named heights resolve to 36px, 44px and 52px

#### Scenario: Elevation levels are exposed

- GIVEN the preset is read in a test
- WHEN the elevation tokens are resolved
- THEN levels 0 to 3 exist
- AND level 0 and level 1 define no shadow, level 2 defines a shadow, and level 3 defines a larger shadow than level 2

#### Scenario: Motion tokens are exposed

- GIVEN the preset is read in a test
- WHEN the motion tokens are resolved
- THEN a 150ms and a 250ms duration exist
- AND the associated timing function is an ease-out curve without overshoot

#### Scenario: Adding tokens does not change rendering

- GIVEN the new tokens are added and unused
- WHEN the existing primitives test suite runs
- THEN no component class assertion changes because of these tokens

### Requirement: Reduced Motion

When the user agent signals `prefers-reduced-motion: reduce`, the shared stylesheet MUST suppress non-essential animation and transition effects globally, including dialog and sheet enter/exit animations, pulse skeletons and spinners. Suppression MUST be achieved by a global rule in the shared stylesheet loaded by both apps, not by per-component opt-outs. Functional state (visibility, focus, content) MUST be unaffected; only the motion is removed or reduced to effectively instantaneous.

#### Scenario: Global rule is declared

- GIVEN `globals.css` is read as text by the test
- WHEN the `@media (prefers-reduced-motion: reduce)` block is located
- THEN it exists and targets all elements (including pseudo-elements)
- AND it neutralises animation and transition durations and animation iteration

#### Scenario: Reduced motion suppresses animated primitives

- GIVEN the user has `prefers-reduced-motion: reduce`
- WHEN a Dialog or Sheet opens and a skeleton pulse or spinner renders
- THEN no animation runs for them and the content is still shown immediately

#### Scenario: No preference keeps motion

- GIVEN the user has no reduced-motion preference
- WHEN a Dialog opens
- THEN its enter animation behaves as before (the rule does not apply)

### Requirement: Visible Focus

Every interactive control MUST show a visible focus indicator on keyboard focus (`:focus-visible`). The following controls, which currently lack one, MUST render a focus ring that uses the `--ring` token: the Sidebar collapse toggle, the UserMenu trigger, Select items and Popover items. In addition, the Dialog and Sheet close controls MUST expose the Spanish accessible name "Cerrar" (replacing the English "Close") via their screen-reader-only label.

#### Scenario: Sidebar toggle has a focus ring

- GIVEN the Sidebar collapse toggle renders
- WHEN its class list is inspected
- THEN it includes a `focus-visible` ring utility bound to the ring token

#### Scenario: UserMenu trigger has a focus ring

- GIVEN the UserMenu trigger renders
- WHEN its class list is inspected
- THEN it includes a `focus-visible` ring utility bound to the ring token

#### Scenario: Select and Popover items show focus

- GIVEN a Select item and a Popover item render
- WHEN their class lists are inspected
- THEN each includes a `focus-visible` (or Radix focus-state) style that produces a visible ring or neutral highlight with at least 3:1 indicator contrast

#### Scenario: Keyboard focus reaches the controls

- GIVEN the four controls are rendered
- WHEN the user tabs to each one
- THEN each receives focus and is visibly indicated

#### Scenario: Dialog close control is named in Spanish

- GIVEN an open Dialog with the default close button
- WHEN the test queries `getByRole('button', { name: 'Cerrar' })`
- THEN exactly one close button is found
- AND no element named "Close" remains

#### Scenario: Sheet close control is named in Spanish

- GIVEN an open Sheet with the default close button
- WHEN the test queries `getByRole('button', { name: 'Cerrar' })`
- THEN exactly one close button is found
