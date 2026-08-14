# Proposal: UI Visual Language — Vitalock apps → CRM Dashboard reference

## Intent

Both apps render neutral-zinc shadcn defaults: no brand accent, ~290 duplicated primitive lines across two `components/ui` folders, flat ungrouped admin sidebar, raw-`<input>` login forms, no stat cards or pagination. This change aligns both apps to the Figma CRM reference via one shared design system.

## Scope

### In Scope
- **Tokens (A)**: `packages/ui/globals.css` + preset converge — light palette per reference, accent `#4B2AD1` (violet) driving primary/ring/accent, card/popover tokens, `--popover` fix. Dark palette adapted in the same pass: dark mode KEPT, `.dark` block filled.
- **Primitives (B)**: extract 6 duplicated components (badge, button, checkbox, dialog, switch, textarea) into `packages/ui`; rewire imports.
- **Patterns**: StatCard, PaginationFooter, SectionHeading, SearchInput, SidebarGroup, Topbar — with tests (strict_tdd).
- **Admin shell (C)**: logo+wordmark, grouped sidebar w/ badges, topbar (search+bell+avatar), PageHeader sizing.
- **Tables/forms (D)**: uppercase headers, density, pagination footer, stat cards on key list pages, section headings, 44px fields.
- **Login pages**: restyle raw `<input>` forms onto shared `Input`.
- **Installer (E)**: header + cards on shared tokens.

### Out of Scope
- `apps/admin/src/components/tareas/*` UI files — owned by sibling `atomic-stock-work-resolution`; restyle after it lands.
- Date pickers + charts (follow-up; no new deps).
- UI copy changes (stays Spanish).

## Capabilities

### New Capabilities
- `design-system`: shared tokens (light+dark, accent), extracted primitives, pattern components.

### Modified Capabilities
- `admin-shell`: layout-shell structure (grouped sidebar, topbar, header sizing) per reference.

## Approach

Chained slices (`ask-on-risk`; 800-line budget; forecast High → chained PRs mandatory):

| Slice | PR | Scope | Est. lines |
|---|---|---|---|
| A Tokens | 1 | tokens converge, css dedupe, fill `.dark` | 150–250 |
| B Primitives | 2 | extract dupes → packages/ui (split if >800) | 600–900 |
| C Admin shell | 3 | logo, grouped nav, topbar, header sizing | 400–600 |
| D1 Tables | 4 | headers, density, pagination, stat cards | 400–600 |
| D2 Forms | 5 | section headings, fields, login restyle | 300–400 |
| E Installer | 6 | header + cards on tokens | 150–300 |

## Affected Areas

| Area | Impact | Description |
|---|---|---|
| `packages/ui/globals.css`, `tailwind.preset.js`, `src/components/*` | Modified/New | Tokens, `.dark`, patterns, primitives |
| Both app `styles/globals.css` | Modified | Converge onto shared tokens (dedupe) |
| `apps/admin/src/components/layout/*` | Modified | AppShell, Sidebar, NavItem, PageHeader |
| Both app `components/ui/*` | Modified/Removed | Restyle; dupes migrate to packages/ui |
| Tables/sheets/OrdenForm, LoginPages, installer home | Modified | Pattern adoption |

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| 2,500–4,500 lines vs 800 budget | High | Chained PRs per slice; `ask-on-risk` at task time |
| Sibling touches `tareas/*` | Med | Exclude from slices A–E; restyle after sibling lands |
| Stat-card KPIs lack data sources | Med | Reuse existing hooks; name per-page KPIs at spec time |
| Dark palette foreign (Figma light-only) | Med | Best-effort translation; keep toggle (ThemeToggle.test binding) |
| Test breakage (`.animate-pulse`, roles/text) | Low | Role/text-safe restyle; keep skeletons; add pattern tests |

## Rollback Plan

Each chained PR independently revertible via `git revert`. Slice A revert restores prior palettes; Slice B revert re-points imports to per-app copies. No data migrations.

## Dependencies

- Sibling `atomic-stock-work-resolution` merges before any `tareas/*` restyle.
- No new external dependencies.

## Success Criteria

- [ ] Both apps on shared tokens; duplicated palettes removed; `--popover` defined; `.dark` filled; toggle works in both apps.
- [ ] 6 duplicated primitives served from `packages/ui`; per-app copies removed.
- [ ] Admin shell matches reference; logins use shared `Input`; stat cards + pagination footer on key list pages.
- [ ] ThemeToggle.test.tsx, `.animate-pulse`, and role/text suites pass; pattern components have tests.
- [ ] UI copy stays Spanish; pipeline green (lint/typecheck/test/build).

## Open Questions

- Which pages get stat cards, and which KPIs (data source)? — resolve at spec/design time.
- Topbar search: functional global search or visual placeholder?
