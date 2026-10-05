# Tasks: ui-components-hig (F1)

## Review Workload Forecast

| Field                   | Value                                               |
| ----------------------- | --------------------------------------------------- |
| Estimated changed lines | ~630 (range 600-720), ~40% tests                    |
| 800-line budget risk    | Low                                                 |
| Chained PRs recommended | No                                                  |
| Suggested split         | Single PR stacked on `feat/ui-foundations-hig` (F0) |
| Delivery strategy       | single-pr                                           |
| Chain strategy          | N/A                                                 |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: N/A
400-line budget risk: Low (800-line budget risk: Low)

### Suggested Work Units

| Unit | Goal                                                              | Likely PR | Focused test command                         | Runtime harness                            | Rollback boundary                                           |
| ---- | ----------------------------------------------------------------- | --------- | -------------------------------------------- | ------------------------------------------ | ----------------------------------------------------------- |
| 1    | cn tokens, Button, IconButton, control radius, gaps (D1-D3)       | PR 1      | `pnpm --filter @vitalock/ui test`            | Screenshot admin list page                 | `utils.ts`, `button.tsx`, IconButton, input/select/textarea |
| 2    | FormField + both LoginPages (D4)                                  | PR 1      | `pnpm --filter @vitalock/ui test form-field` | Login error flow in both apps              | `form-field.tsx`, 2 LoginPages                              |
| 3    | SectionHeading, Section migration (D6, D7)                        | PR 1      | `pnpm --filter @vitalock/admin test`         | Equipo/Key detail pages                    | SectionHeading, 15 sites, Section.tsx                       |
| 4    | EmptyState/ErrorState/ErrorFallback (D5)                          | PR 1      | `pnpm --filter @vitalock/ui test`            | Force a query error, click Reintentar      | state components                                            |
| 5    | Card, StatCard, PageHeader, status-neutral, installer sm (D8-D11) | PR 1      | `pnpm test`                                  | Dashboard + installer worklist screenshots | each component revertable alone                             |

## Phase 0 · Prerequisites (F0 present)

- [x] 0.1 Verify `packages/ui/tailwind.tokens.js` exists with `control-sm/md/lg` spacing, `control/container` radius and the type ladder (`title-1..caption`).
- [x] 0.2 Verify `packages/ui/src/lib/utils.ts` uses `extendTailwindMerge`; `pnpm --filter @vitalock/ui test` green on baseline.
- [x] 0.3 Record baseline counts: `rg 'size="sm"'` (33 admin/ui), `variant="secondary"` on SectionHeading (15), `common/Section` (16).

## Phase 1 · Control tokens, Button, IconButton (D1-D3)

- [x] 1.1 RED: `utils.test.ts` asserts `cn('rounded-control','rounded-md')` and `cn('h-control-md','h-9')` dedupe.
- [x] 1.2 GREEN: add `theme.spacing`/`borderRadius` extension to `packages/ui/src/lib/utils.ts` (skip if F0 already covers; keep the test).
- [x] 1.3 RED: `primitives.test.tsx` Button sizes: default `h-control-md`, sm `h-control-sm`, lg `h-control-lg`, icon `size-control-md`; consumer `h-9` wins.
- [x] 1.4 GREEN: update `packages/ui/src/components/button.tsx` (sizes, `rounded-control`); no `h-[52px]` remains.
- [x] 1.5 RED: IconButton has `relative` and `after:size-control-md`.
- [x] 1.6 GREEN: update IconButton with the `after:` hit-area classes and `rounded-control`.
- [x] 1.7 RED+GREEN: Input, Select trigger, FilterBar select (`h-11` to `h-control-md`) and Textarea use `rounded-control`; update their tests.
- [x] 1.8 GREEN: DataTable action row `gap-1` to `gap-4`, EditableTitle edit form `gap-2` to `gap-4` (with class assertions).

## Phase 2 · FormField + login pilots (D4)

- [x] 2.1 RED: `form-field.test.tsx`: label bound to control; `aria-invalid`/`aria-describedby` only with `error`; error `role="alert"`; child `aria-describedby` preserved; `register` ref reaches input; PasswordInput as child.
- [x] 2.2 GREEN: create `packages/ui/src/components/form-field.tsx` (`useId`, `cloneElement`) and export from the package index.
- [x] 2.3 RED: LoginPage tests (admin, installer) assert error alert and `aria-invalid` on the field.
- [x] 2.4 GREEN: wrap fields in FormField in `apps/admin` and `apps/installer` LoginPage.

## Phase 3 · SectionHeading and Section retirement (D6, D7)

- [x] 3.1 RED: SectionHeading h2 has `text-title-3`; `variant` prop rejected by types.
- [x] 3.2 GREEN: update SectionHeading, delete `variant` and the `text-[28px]` branch.
- [x] 3.3 GREEN: drop `variant="secondary"` at 15 sites (6 installer, 8 admin, 1 DataCardList); `pnpm typecheck` is the checklist.
- [x] 3.4 GREEN: migrate 8 sites in EquipoDetailPage and 7 in KeyDetailPage (the 9/16 counts included the import lines) to `<Card className="flex flex-col gap-3 p-4"><SectionHeading/>`.
- [x] 3.5 GREEN: delete `apps/admin/src/components/common/Section.tsx`; fix affected page tests.

## Phase 4 · EmptyState and ErrorState (D5)

- [x] 4.1 RED: EmptyState compact `message` form unchanged; rich form renders icon (`aria-hidden`), title `text-headline`, description, action.
- [x] 4.2 GREEN: update EmptyState with the union props type.
- [x] 4.3 RED: ErrorState `onRetry` button fires callback; no button without `onRetry`; `retryLabel` default "Reintentar".
- [x] 4.4 GREEN: update ErrorState; refactor ErrorFallback to `<ErrorState onRetry>` with ghost go-home child; its tests stay green.

## Phase 5 · Containers, PageHeader, neutral status, installer (D8-D11)

- [x] 5.1 RED+GREEN: Card has no `shadow-sm`, has `rounded-container`; update `primitives.test.tsx:169` and the stale `--accent` comment.
- [x] 5.2 RED+GREEN: StatCard value `text-title-2 tabular-nums`, label `text-callout`, tile `rounded-control`; DataTable wrapper `rounded-container`.
- [x] 5.3 RED+GREEN: PageHeader h1 `text-title-1`, breadcrumb `text-footnote`, chevrons `h-3.5 w-3.5`; EditableTitle input `text-title-1`.
- [x] 5.4 RED: StatusBadge neutral has `text-muted-foreground`; GREEN: update StatusBadge and its doc comment.
- [x] 5.5 GREEN: delete `--status-neutral*` in `packages/ui/globals.css`, `status-neutral` in `tailwind.preset.js`, and the pair in `tokens.test.ts:192`.
- [x] 5.6 GREEN: installer `size="sm"` to default at 10 sites: DashboardPage:76, TaskDetailPage:303, ConfigureEquipmentInline:75/123/130, EquipmentUpdateResolveDetail:154/187/205/211, AddCommentForm:45.

## Phase 6 · Verify

- [x] 6.1 `rg 'h-\[52px\]|text-\[28px\]|common/Section|status-neutral' apps packages` returns no matches.
- [x] 6.2 `pnpm lint`
- [x] 6.3 `pnpm typecheck`
- [x] 6.4 `pnpm test`
- [x] 6.5 Screenshot main pages in both apps (before/after); confirm installer targets stay 44px or more.
