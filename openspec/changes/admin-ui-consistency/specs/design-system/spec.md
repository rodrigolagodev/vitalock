# Delta for design-system

**Change**: admin-ui-consistency
**Date**: 2026-10-05

Phase F2 of the UI audit. Ordering: this delta applies AFTER F0 (`ui-foundations-hig`) and F1 (`ui-components-hig`) are archived. F1 MODIFIES "Pattern Components" (SectionHeading, EmptyState v2, ErrorState `onRetry`); the F2 version below is the F1 text plus one added clause (ConfirmDialog), so archiving F0, F1, then F2 loses nothing. F2 does not edit "Shared Design Tokens" or "Light-first Sizing Language"; it only consumes their tokens. All UI copy stays Spanish.

## MODIFIED Requirements

### Requirement: Pattern Components

`packages/ui` MUST provide SidebarGroup, SectionHeading, SearchInput, Topbar, EmptyState, ErrorState and ConfirmDialog as reusable components, each covered by a Vitest test (strict_tdd).

**SectionHeading** MUST be the single section-title convention: the title renders at `text-title-3` and no other size. The `text-[28px]` default and the `variant` prop MUST NOT exist. Action slots keep working. `apps/admin` `common/Section` MUST be retired (file deleted, no imports); its former call sites render `SectionHeading` plus a Card instead.

**EmptyState** MUST keep the compact `message` form unchanged (existing callers render identically) and additionally accept optional `icon`, `title`, `description` and `action` slots. Each optional slot MUST render only when provided.

**ErrorState** MUST keep its current message and optional `back` behaviour and additionally accept an optional `onRetry` callback. When `onRetry` is provided it MUST render a "Reintentar" button that calls `onRetry` once per activation; when omitted, no retry button renders. The application error fallback (`ErrorFallback`) MUST reuse ErrorState's `onRetry` instead of its own retry markup.

**ConfirmDialog** `description` MUST accept a `ReactNode` (it was a `string`), so callers can emphasise names with `<strong>`. A plain string MUST keep rendering identically. `title`, `confirmLabel`, `cancelLabel`, `variant`, `isPending` and the pending lock (no dismissal and disabled buttons while `isPending`) are unchanged.

(Previously: F1 text, with ConfirmDialog absent from the list and `description: string`.)

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

#### Scenario: ConfirmDialog accepts a node description

- GIVEN a ConfirmDialog is open with `description` set to a fragment containing `<strong>Ana</strong>`
- WHEN it renders
- THEN the `strong` element with text "Ana" is inside the dialog description
- AND the description element still has the accessible description role wiring (`aria-describedby` resolves to it)

#### Scenario: ConfirmDialog string description is unchanged

- GIVEN a ConfirmDialog is open with a string `description`
- WHEN it renders
- THEN the text shows exactly as before and existing ConfirmDialog tests pass unchanged

#### Scenario: ConfirmDialog flows

- GIVEN a ConfirmDialog is open with `onConfirm` and `onOpenChange` spies
- WHEN the user clicks the confirm button, then (in a second render) the cancel button
- THEN `onConfirm` is called once for the first click
- AND `onOpenChange(false)` is called for the cancel click and `onConfirm` is not called

## ADDED Requirements

### Requirement: Hardcoded Value Gate

The repository MUST provide `scripts/lint-hardcodes.mjs`, a dependency-free Node script exposed as `pnpm lint:hardcodes` at the repo root, that fails when design values are hardcoded instead of coming from tokens. It MUST scan `.ts`, `.tsx`, `.js` and `.jsx` sources under `apps/admin/src` and `packages/ui/src` (the installer joins in a later phase). `.css` is not scanned: the colour tokens are defined in `packages/ui/globals.css` by design, and the app stylesheet is a single `@import`. The scan excludes `node_modules`, build output, generated files, test files (`__tests__`, `*.test.*`) and its own fixtures.

The script MUST flag:

- raw Tailwind palette colour classes (for example `bg-blue-100`, `text-blue-800`, `border-red-500`, `text-gray-*`, for the default Tailwind colour names with a numeric step);
- hex colour literals (`#rgb`, `#rrggbb`, `#rrggbbaa`) in source;
- arbitrary px values in class strings (for example `w-[372px]`, `max-w-[200px]`, `h-[60px]`, `text-[14px]`).

It MUST allow, as an explicit and tested allowlist: `data-[...]` variant selectors, `var(--…)` references, `%` and `fr` values, `calc()`/`min()`/`max()` expressions that reference `var(--…)`, grid templates (`grid-cols-[...]`, `grid-rows-[...]`), and token-based colour classes (`bg-info`, `text-destructive`, and the like). The exit code MUST be 0 when there are no findings and non-zero otherwise; each finding MUST print file, line and the offending text. The script MUST also have a fixture-driven test proving each rule: it exits non-zero on a seeded fixture containing one violation of every rule and exits 0 on a clean fixture and on an allowlisted-only fixture.

Existing hits in `apps/admin` and `packages/ui` MUST be cleaned in this change so the script exits 0 on the tree: the blue palette in both order forms moves to the info tone tokens, and arbitrary px sizes move to standard Tailwind scale steps; named spacing tokens (for example topbar height, sidebar widths) are added to the preset only where the exact value matters. CI MUST run `pnpm lint:hardcodes` in `admin-checks.yml` as a failing (not warning) step.

#### Scenario: Clean tree passes

- GIVEN the repository after this change
- WHEN `pnpm lint:hardcodes` runs
- THEN it exits 0 and prints no findings

#### Scenario: Seeded fixture fails

- GIVEN a fixture file containing a raw palette class, a hex literal and an arbitrary px value
- WHEN the script scans it
- THEN it exits non-zero
- AND it prints each finding with file, line and text, one per violation

#### Scenario: Each rule is proven independently

- GIVEN three fixtures, each containing exactly one rule's violation
- WHEN the script scans each
- THEN each exits non-zero and reports exactly one finding of the matching rule

#### Scenario: Allowlisted values pass

- GIVEN a fixture using `data-[state=open]:…`, `w-[var(--radix-popover-trigger-width)]`, `w-[50%]`, `grid-cols-[1fr_auto]` and `bg-info`
- WHEN the script scans it
- THEN it exits 0 with no findings

#### Scenario: Tests and generated files are excluded

- GIVEN a hardcoded value exists only in a `__tests__` file or a generated file
- WHEN the script scans the repo
- THEN that value is not reported

#### Scenario: Blue palette is replaced by info tokens

- GIVEN KeyOrderForm and TechnicalOrderForm render the badge that used `bg-blue-100 text-blue-800`
- WHEN its class list is inspected
- THEN it uses info tone token classes and no `blue-` palette class

#### Scenario: Arbitrary sizes are replaced

- GIVEN `apps/admin` and `packages/ui` sources are searched for `max-w-[200px]`, `w-[372px]`, `w-[248px]`, `w-[220px]`, `w-[260px]`, `h-[60px]` and `min-h-[80px]`
- WHEN the matches are listed
- THEN none remain, and each replacement is a standard scale step or a named preset token
- AND existing component tests pass, with class assertions updated where they named the old values

#### Scenario: CI enforces the gate

- GIVEN `.github/workflows/admin-checks.yml` is read
- WHEN its steps are listed
- THEN a step runs `pnpm lint:hardcodes` without `continue-on-error`
