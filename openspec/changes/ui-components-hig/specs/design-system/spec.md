# Delta for design-system

**Change**: ui-components-hig
**Date**: 2026-10-05

Phase F1 of the UI audit. It adopts the F0 tokens (type ladder, radius tiers, control heights, elevation) in shared components and adds the form-field and icon-button accessibility guarantees.

Ordering: this delta applies AFTER `ui-foundations-hig` (F0) is applied and archived. F0 also MODIFIES "Shared Design Tokens"; the F1 version below is the F0 text plus one added clause, so archiving F0 then F1 loses nothing. Token class names (`h-control-sm|md|lg`, `size-control-md`, `rounded-control`, `rounded-container`, `text-title-*`, `text-footnote`) refer to the F0 preset tokens (36/44/52 px, 8/12 px, ladder). "Lint-free" does not substitute for the tests named in the scenarios. All UI copy stays Spanish.

## MODIFIED Requirements

### Requirement: Shared Design Tokens

`packages/ui/globals.css` MUST define the shared palettes as one token source for both apps, with a LIGHT-first palette and a `.dark` opt-out adaptation. Both apps MUST consume the shared tokens and MUST NOT keep per-app palettes.

Light palette:

- `--primary` and `--ring` MUST be `240 79% 65%` (the brand primary; its value is unchanged by this change).
- `--muted-foreground` MUST be `215 18% 43%`. The former Figma value `#a9b0ba` is retired and MUST NOT appear as a muted text colour.
- `--input` (control border) MUST be `215 14% 57%`.
- `--accent` MUST be a NEUTRAL hover surface (saturation at most 20%), not a saturated brand tone, in both themes. Ghost and outline Button hover states MUST paint this neutral accent surface (`hover:bg-accent`), not a violet fill and not `bg-muted`. The accent surface MUST differ from `--card` by at least 1.05:1. Primary is the only saturated accent in the UI chrome.
- Semantic tone values (text/tint tones): `--destructive` `0 84.2% 44%`, `--info` `217 91% 46%`, `--warning` `38 92% 29%`, `--success` `160 84% 25%`.
- `--destructive` is the text/tint tone. Solid destructive surfaces use the separate tokens `--destructive-solid` and `--destructive-foreground` (white); in light, `--destructive-solid` MUST satisfy the 4.5:1 floor with `--destructive-foreground`.
- Content background, card, border, foreground and table-head tokens keep their existing values.
- `--popover` / `--popover-foreground` MUST remain defined.
- `--status-neutral-foreground` MUST NOT be defined in any theme and MUST NOT be referenced by any stylesheet, preset or component. The neutral status tone renders its text with `text-muted-foreground`.

Dark palette (`.dark`) MUST define:

- success foreground `158 80% 10%`;
- warning foreground `38 92% 12%`;
- `--destructive` (text/tint tone) `0 72% 68%`;
- `--destructive-solid` `0 72% 50%` paired with `--destructive-foreground` white;
- `--input` `224 12% 50%`;
- a neutral `--accent` (saturation at most 20%);
- a final, non-experimental `--border` value.

The value `0 72% 62%` MUST NOT be used for any destructive token.

(Previously, F0 text without the `--status-neutral-foreground` retirement bullet.)

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

#### Scenario: Ghost and outline hover use the neutral accent surface

- GIVEN a Button with variant `ghost` or `outline` renders
- WHEN its class list is inspected
- THEN the hover class is `hover:bg-accent` and no hover class is `hover:bg-muted`

#### Scenario: Destructive text and solid tokens are split

- GIVEN `globals.css` is parsed
- WHEN `--destructive`, `--destructive-solid` and `--destructive-foreground` are read in each theme
- THEN all three are defined in both themes
- AND `--destructive-foreground` on `--destructive-solid` is at least 4.5:1 in both themes

#### Scenario: Neutral status foreground token is retired

- GIVEN `globals.css` and the Tailwind preset are read as text by the token test
- WHEN they are searched for `status-neutral`
- THEN no match exists in either file, in light or `.dark`
- AND no file under `apps/` or `packages/` references `status-neutral`

#### Scenario: Neutral StatusBadge uses muted foreground

- GIVEN a StatusBadge renders with a neutral tone
- WHEN its class list is inspected
- THEN it includes `text-muted-foreground`
- AND it includes no `status-neutral` class

### Requirement: Light-first Sizing Language

Shared controls MUST use the F0 control-height, radius and elevation tokens instead of arbitrary values. No `h-[52px]`, `rounded-[9px]` or `rounded-[12px]` arbitrary class MAY remain in shared component sources.

- **Button heights:** `sm` MUST be 36px (`h-control-sm`), `default` 44px (`h-control-md`), `lg` 52px (`h-control-lg`), and `icon` MUST be a square at `size-control-md` (44px). Button, Input and Select of the same size share one height so mixed rows align.
- **Control radius:** Button, Input, Select and Textarea MUST use `rounded-control` (8px).
- **Container radius:** Card and DataTable wrapper surfaces MUST use `rounded-container` (12px). Status pills keep a fully rounded pill shape.
- **Elevation:** Card (level 1) MUST render with a hairline border and NO resting shadow (no `shadow`, `shadow-sm` or larger class on the Card root).
- **Touch floor:** every interactive control rendered by `apps/installer` MUST be at least 44px tall. Installer call sites that used `size="sm"` MUST use the default size.

(Previously: Button `h-[52px] rounded-[9px]`, containers `rounded-[12px]`, Card with a resting `shadow-sm`.)

#### Scenario: Button sizes use control height tokens

- GIVEN Buttons render with sizes `sm`, `default`, `lg` and `icon`
- WHEN their class lists are inspected
- THEN they include `h-control-sm`, `h-control-md`, `h-control-lg` and `size-control-md` respectively
- AND none includes `h-[52px]` or `h-11`/`h-9` arbitrary equivalents

#### Scenario: Button and Input of the same size share a height

- GIVEN a default Button and a default Input render side by side
- WHEN their height classes are inspected
- THEN both resolve to the same `control-md` height token

#### Scenario: Controls use the control radius

- GIVEN Button, Input, Select trigger and Textarea render
- WHEN their class lists are inspected
- THEN each includes `rounded-control` and none includes `rounded-[9px]`

#### Scenario: Card has no resting shadow

- GIVEN a Card renders
- WHEN its class list is inspected
- THEN it includes `rounded-container` and a border
- AND it includes no `shadow` utility

#### Scenario: Merged ladder classes survive cn

- GIVEN a component passes a consumer `className` with a conflicting height or radius token to `cn`
- WHEN the classes merge
- THEN the consumer token replaces the default one and the unrelated ladder classes are kept
- AND each of Button, Card and SectionHeading has at least one such assertion

#### Scenario: Installer has no sub-44px buttons

- GIVEN the installer sources are searched
- WHEN `size="sm"` Button usages are looked up
- THEN none remain in `apps/installer`

### Requirement: Pattern Components

`packages/ui` MUST provide SidebarGroup, SectionHeading, SearchInput, Topbar, EmptyState and ErrorState as reusable components, each covered by a Vitest test (strict_tdd).

**SectionHeading** MUST be the single section-title convention: the title renders at `text-title-3` and no other size. The `text-[28px]` default and the `variant` prop MUST NOT exist. Action slots keep working. `apps/admin` `common/Section` MUST be retired (file deleted, no imports); its former call sites render `SectionHeading` plus a Card instead.

**EmptyState** MUST keep the compact `message` form unchanged (existing callers render identically) and additionally accept optional `icon`, `title`, `description` and `action` slots. Each optional slot MUST render only when provided.

**ErrorState** MUST keep its current message and optional `back` behaviour and additionally accept an optional `onRetry` callback. When `onRetry` is provided it MUST render a "Reintentar" button that calls `onRetry` once per activation; when omitted, no retry button renders. The application error fallback (`ErrorFallback`) MUST reuse ErrorState's `onRetry` instead of its own retry markup.

#### Scenario: Pattern suite passes

- GIVEN the pattern components are implemented
- WHEN `pnpm test` runs
- THEN each has at least one passing test

#### Scenario: SectionHeading renders the title-3 convention

- GIVEN a SectionHeading renders with a title and no extra props
- WHEN its heading class list is inspected
- THEN it includes `text-title-3` and does not include `text-[28px]`

#### Scenario: SectionHeading has no variant prop

- GIVEN SectionHeading's props type and sources are inspected
- WHEN `variant` is looked up
- THEN it is absent, and no consumer under `apps/` passes `variant=` to SectionHeading

#### Scenario: SectionHeading keeps its action slot

- GIVEN a SectionHeading renders with an action button
- WHEN it renders
- THEN the title and the action are both in the document

#### Scenario: Legacy Section is gone

- GIVEN `apps/admin` sources are searched
- WHEN `common/Section` is looked up
- THEN no file or import remains
- AND the EquipoDetail and KeyDetail pages render their sections with SectionHeading and a Card, with existing page tests passing

#### Scenario: EmptyState compact form is unchanged

- GIVEN an EmptyState renders with only `message`
- WHEN it renders
- THEN the message text shows and no icon, title, description or action element renders

#### Scenario: EmptyState rich slots render

- GIVEN an EmptyState renders with `icon`, `title`, `description` and `action`
- WHEN it renders
- THEN all four are in the document
- AND activating the action invokes its handler

#### Scenario: ErrorState retry fires

- GIVEN an ErrorState renders with an `onRetry` spy
- WHEN the user clicks "Reintentar"
- THEN `onRetry` is called exactly once

#### Scenario: ErrorState without onRetry has no retry button

- GIVEN an ErrorState renders without `onRetry`
- WHEN it renders
- THEN no "Reintentar" button is present and existing `back` behaviour is unchanged

#### Scenario: ErrorFallback reuses retry

- GIVEN ErrorFallback renders after a caught error
- WHEN the user clicks "Reintentar"
- THEN the reset handler runs through ErrorState's `onRetry`

### Requirement: StatCard

StatCard MUST render an icon chip, a KPI value, and a Spanish label. The value MUST use `text-title-2` with `tabular-nums`, and the label MUST use a ladder size (`text-footnote` or `text-callout`) with `text-muted-foreground`. On loading or empty data it MUST render a neutral placeholder (e.g., "—") without crashing.

(Previously: no typographic scale was specified.)

#### Scenario: Empty dataset renders placeholder

- GIVEN a page loads no rows
- WHEN StatCard renders with empty data
- THEN the card shows the label and a neutral placeholder value

#### Scenario: StatCard uses the ladder

- GIVEN a StatCard renders with a numeric value and a label
- WHEN the value and label class lists are inspected
- THEN the value includes `text-title-2` and `tabular-nums`
- AND the label includes a ladder class and `text-muted-foreground`

## ADDED Requirements

### Requirement: Form Field Accessibility

`packages/ui` MUST provide a `FormField` wrapper that renders a label, an optional description and an optional error around exactly one form control child, and MUST wire accessibility attributes into that child:

- the label is associated to the control (`htmlFor`/`id`, with an id generated when none is supplied);
- when an error is present the control MUST receive `aria-invalid="true"`, and `aria-describedby` MUST reference the error element and, when present, the description element;
- when no error is present the control MUST NOT carry `aria-invalid="true"`;
- the error MUST render at `text-footnote` in the destructive tone inside an element with `role="alert"`; the description renders at `text-footnote` in `text-muted-foreground`.

Both `LoginPage`s (admin and installer) MUST adopt FormField for their fields and surface authentication/validation errors through it. Existing labels, placeholders and Spanish copy MUST be unchanged. Adoption in other forms is out of scope.

#### Scenario: Label is associated with the control

- GIVEN a FormField with label "Correo" wraps an Input
- WHEN the test queries `getByLabelText('Correo')`
- THEN it returns the wrapped Input

#### Scenario: Error wires aria-invalid and aria-describedby

- GIVEN a FormField with an error message wraps an Input
- WHEN it renders
- THEN the Input has `aria-invalid="true"`
- AND its `aria-describedby` includes the id of the element containing the error text

#### Scenario: Error is announced

- GIVEN a FormField renders with an error message
- WHEN the test queries `getByRole('alert')`
- THEN the error text is found with a `text-footnote` class

#### Scenario: Description is referenced

- GIVEN a FormField with a description and no error wraps an Input
- WHEN it renders
- THEN `aria-describedby` references the description element and `aria-invalid` is not `"true"`

#### Scenario: Error and description are both referenced

- GIVEN a FormField with both a description and an error
- WHEN it renders
- THEN `aria-describedby` references both ids, error included

#### Scenario: No error leaves the control clean

- GIVEN a FormField without error or description
- WHEN it renders
- THEN the control has no `aria-invalid="true"` and no `aria-describedby`, and no `role="alert"` element exists

#### Scenario: Login pages use FormField

- GIVEN either LoginPage renders and a failed sign-in produces an error
- WHEN the form shows the error
- THEN the error is exposed through `role="alert"` and the related field has `aria-invalid="true"`
- AND the existing login tests (labels, submit, Spanish copy) pass unchanged

### Requirement: Icon Button Hit Area

IconButton MUST keep its 16px glyph while exposing a pointer hit area of at least 44x44 px. The hit area MUST be achieved by an absolutely positioned `after:` pseudo-element that expands past the visual box (the button is `relative`), so the visual size and layout of the glyph do not change. The accessible name (aria-label) MUST remain required and unchanged.

#### Scenario: Hit area expands to 44px

- GIVEN an IconButton renders
- WHEN its class list is inspected
- THEN it includes `relative` and an `after:` expansion whose resulting extent is at least 44px in both axes (for example `after:absolute after:-inset-*` or `after:size-control-md` centred)
- AND the glyph keeps its 16px size class

#### Scenario: Accessible name and activation are unchanged

- GIVEN an IconButton renders with aria-label "Editar a X" and an `onClick` spy
- WHEN the user clicks it
- THEN `getByRole('button', { name: 'Editar a X' })` resolves and `onClick` fires once
