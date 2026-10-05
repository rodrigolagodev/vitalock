# Design: ui-components-hig

## Context

Phase F1. It adopts the F0 token API (`openspec/changes/ui-foundations-hig/design.md`): the `text-{title-1..caption}` ladder, `rounded-{control,container}`, `{h,size}-control-{sm,md,lg}`. It applies only after F0 lands.

## Assumptions resolved (proposal question round)

| #   | Recommendation                                                                                            |
| --- | --------------------------------------------------------------------------------------------------------- |
| 1   | Pilot FormField on both LoginPages. Each is a ~10-line diff and gives the component a real consumer.      |
| 2   | Remove `variant`. Removing it turns `tsc` into the migration checklist (15 sites).                        |
| 3   | Migrate `common/Section` now. **Correction:** it has 16 usages in 2 files, not 4. It is still mechanical. |
| 4   | Move the installer `sm` buttons to `default` now. There are 10 sites, all `Button`.                       |

## Decision 1 — `cn()` must know the control and radius tokens

tailwind-merge 2.5.4 does not recognise `h-control-md` or `rounded-control`. If it is not taught them, a consumer's `className="h-9"` would stop overriding the Button height.

**Chosen:** extend `packages/ui/src/lib/utils.ts` with `theme: { spacing: ['control-sm','control-md','control-lg'], borderRadius: ['control','container','sheet'] }`. Spacing covers `h`, `w`, `size` and `min-h`.

**Rejected:** per-component `className` workarounds.

## Decision 2 — Control sizing

| Size      | Classes             |
| --------- | ------------------- |
| `default` | `h-control-md px-4` |
| `sm`      | `h-control-sm px-3` |
| `lg`      | `h-control-lg px-8` |
| `icon`    | `size-control-md`   |

- The base class uses `rounded-control`.
- Input, Select trigger, the FilterBar native select and Textarea use `rounded-control`.
- Input, Select and FilterBar change `h-11` to `h-control-md`. The height is identical; only the token changes.
- PaginationFooter waits for F2.

## Decision 3 — IconButton hit area

| Option                      | Tradeoff                                                                                                 |
| --------------------------- | -------------------------------------------------------------------------------------------------------- |
| `min-size-11` visible box   | Gives a real 44px box, but table action columns widen by about 50% and the hover blob turns heavy.       |
| **`after:` pseudo-element** | The visual stays 28px and only the hit area grows. jsdom cannot measure it, so the test asserts classes. |

**Chosen:** `relative rounded-control … after:absolute after:left-1/2 after:top-1/2 after:size-control-md after:-translate-x-1/2 after:-translate-y-1/2`. Tailwind injects `content` for `after:`, so no arbitrary value is needed.

**Density:**

- Table rows are `h-12` (48px), so the 44px area fits vertically.
- The trailing `td` has `px-4`, so the 8px overhang is not clipped by `overflow-x-auto`.
- Adjacent buttons overlap unless their centres sit ≥44px apart. With a 28px box that needs `gap-4`, so DataTable's action row (`gap-1`) and EditableTitle's edit form (`gap-2`) become `gap-4`.

## Decision 4 — FormField API

| Option                                                                       | Tradeoff                                                                                                              |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| shadcn `Form` (FormProvider + Controller + FormItem/FormControl/FormMessage) | Couples `packages/ui` to RHF context and needs 5 parts per field. That makes the F2 migration of 67 sites heavier.    |
| **RHF-agnostic wrapper + `cloneElement`**                                    | One prop per field: `error={errors.x?.message}`. `register()` spreads stay on the child, and its ref is preserved.    |
| Radix `Slot`                                                                 | The child's props win in `mergeProps`, so the child would override the aria attributes. That is the wrong precedence. |

**Chosen:**

- The id is `id ?? useId()`.
- FormField overrides the child's `id`. Consumers pass `id` to FormField, not to the child.
- `aria-describedby` joins the child's own value with `${id}-description` and `${id}-error`.
- `aria-invalid` is `true` only when `error` is set.

```tsx
interface FormFieldProps {
  label: ReactNode;
  error?: string;
  description?: ReactNode;
  id?: string;
  className?: string;
  children: React.ReactElement;
}
// <Label htmlFor={id}> · cloneElement(Children.only(children), { id, 'aria-invalid', 'aria-describedby' })
// description: text-footnote text-muted-foreground · error: <p id role="alert" class="text-footnote text-destructive">
```

PasswordInput forwards its props to `Input`, so it works as a child unchanged.

## Decision 5 — EmptyState and ErrorState

```tsx
type EmptyStateProps = { className?: string } & (
  | { message: string } // compact <p>, unchanged
  | { title: string; description?: ReactNode; icon?: LucideIcon; action?: ReactNode }
);
interface ErrorStateProps {
  message: string;
  back?;
  children?;
  className?;
  onRetry?: () => void;
  retryLabel?: string /* 'Reintentar' */;
}
```

**EmptyState:**

- The rich form is a centred column: an icon in a `size-10` muted circle (`aria-hidden`), the title at `text-headline`, the description at `text-callout text-muted-foreground`, and the action at `mt-4`.
- The union type keeps all 62 existing EmptyState/ErrorState/StatCard JSX usages compiling.

**ErrorState:**

- When `onRetry` is set, an action row (`mt-4 flex flex-wrap justify-center gap-2`) renders an outline Retry Button, followed by `children`.
- When `onRetry` is not set, `children` render exactly as today. Existing callers are unaffected.
- ErrorFallback becomes `<ErrorState message onRetry>{onGoHome && <ghost Button/>}</ErrorState>`, which keeps the same visual.

## Decision 6 — SectionHeading single convention

- The h2 uses `text-title-3`. The description uses `text-callout text-muted-foreground`. The `variant` prop and the `text-[28px]` branch are deleted.
- The 15 `variant="secondary"` sites drop the prop: 6 in the installer, 8 in admin and 1 in DataCardList. The old `secondary` was `text-lg`, which is visually identical to desktop `title-3`.

## Decision 7 — `common/Section` migration

Each `<Section title="X">…</Section>` becomes `<Card className="flex flex-col gap-3 p-4"><SectionHeading title="X" />…</Card>`. There are 9 sites in EquipoDetailPage and 7 in KeyDetailPage. Then delete `apps/admin/src/components/common/Section.tsx`.

**Rejected:**

- CardHeader/CardTitle, because it renders an h3 under an h1 with no h2.
- Keeping a thin local wrapper, because it violates the "no app-local components" rule.

The uppercase eyebrow disappears. Its titles become 18px.

## Decision 8 — Card, StatCard and containers

- **Card:** drop `shadow-sm` and change `rounded-xl` to `rounded-container` (both 12px). Rewrite the stale `--accent` comment. `primitives.test.tsx:169` updates.
- **StatCard:**
  - The container uses `rounded-container`.
  - The icon tile uses `rounded-control`.
  - The label uses `text-callout text-muted-foreground`.
  - The value uses `text-title-2 tabular-nums`.
  - The props are unchanged.
- **DataTable wrapper:** `rounded-container`.
- **Unchanged:** dashed empty boxes and TruncationNotice, which are not containers.

## Decision 9 — PageHeader

- The h1 changes from `text-2xl font-semibold` to `text-title-1`, which carries weight 600. `titleClassName` still merges.
- The breadcrumb `nav` changes from `text-xs` to `text-footnote`. The chevrons change from `h-6 w-6` to `h-3.5 w-3.5`.
- EditableTitle's input `text-2xl font-semibold` becomes `text-title-1` so that edit mode matches the h1.

## Decision 10 — Retire `--status-neutral-foreground`

- StatusBadge neutral becomes `bg-muted text-muted-foreground`. Rewrite its doc comment.
- Delete both CSS variables in `globals.css` and the `status-neutral` colour in `tailwind.preset.js`.
- Delete the `status-neutral-foreground` pair in `tokens.test.ts:192`. `muted-foreground/muted` is already asserted in both themes (5.01 in light).

## Decision 11 — Installer `sm` → `default`

The 10 sites to change:

- `DashboardPage:76`
- `TaskDetailPage:303`
- `ConfigureEquipmentInline:75,123,130`
- `EquipmentUpdateResolveDetail:154,187,205,211`
- `AddCommentForm:45`

The 33 `size="sm"` sites in admin and `packages/ui` stay at 36px, because that is intended desktop density. The proposal's figure of 47 overcounted.

## Data Flow

    RHF register() ──spread──▶ child control ◀──cloneElement(id, aria-*)── FormField(error)
    errors.x?.message ─────────────────────────────────────────────────────▶ <p role=alert>

## Size re-check

| Area                                                             | Lines (code / test)                               |
| ---------------------------------------------------------------- | ------------------------------------------------- |
| Button, IconButton, cn, controls, DataTable/EditableTitle gaps   | 30 / 55                                           |
| FormField + 2 LoginPages                                         | 125 / 70                                          |
| SectionHeading + 15 sites + Section migration (16 sites, delete) | 110 / 15                                          |
| EmptyState, ErrorState, ErrorFallback                            | 65 / 70                                           |
| Card, StatCard, PageHeader, status-neutral, installer sm         | 55 / 35                                           |
| **Total**                                                        | **about 385 / 245, so about 630 (range 600–720)** |

This is still inside 800, so the delivery stays `single-pr`. The Section count adds about 40 lines over the proposal's assumption.

## Testing Strategy (strict TDD, RED first)

| Unit           | Assertion                                                                                                                                                                                                                  |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Button         | Each size maps to its `h-control-*`/`size-control-md` class. `cn` override `h-9` wins.                                                                                                                                     |
| IconButton     | It has `relative` and `after:size-control-md`.                                                                                                                                                                             |
| cn             | `rounded-control` vs `rounded-md` dedupes. `h-control-md` vs `h-9` dedupes.                                                                                                                                                |
| FormField      | The label is associated with the control. `aria-invalid`/`aria-describedby` appear only with an error. The error has `role="alert"`. The child's `aria-describedby` is preserved. A ref from `register` reaches the input. |
| SectionHeading | The h2 has `text-title-3`.                                                                                                                                                                                                 |
| EmptyState     | The compact form is unchanged. The rich slots render.                                                                                                                                                                      |
| ErrorState     | The retry button fires `onRetry`. There is no button without `onRetry`.                                                                                                                                                    |
| Card           | It has no `shadow-sm` and has `rounded-container`.                                                                                                                                                                         |
| StatCard       | The value has `text-title-2 tabular-nums`.                                                                                                                                                                                 |
| PageHeader     | The h1 has `text-title-1`. The chevrons have `h-3.5`.                                                                                                                                                                      |
| StatusBadge    | Neutral has `text-muted-foreground`.                                                                                                                                                                                       |

## Runtime Behavior

- Admin buttons go from 52 to 44px and `sm` buttons from 44 to 36px.
- Section titles become 18px.
- Cards are flat.
- Neutral badges keep their look, because both colours measure about 5:1.
- The installer's touch targets stay at 44px or more.

## Threat Matrix

N/A. This change has no routing, shell, subprocess, VCS/PR automation, executable-file classification or process-integration boundary.

## Rollback Plan

Revert the PR. It contains only class strings, components and tests.

## Open Questions

- [ ] PasswordInput's visibility toggle is a 16px target. Defer it to F2, which adopts the IconButton technique.
- [ ] Localizing "Toggle sidebar" stays deferred, as the proposal says.
