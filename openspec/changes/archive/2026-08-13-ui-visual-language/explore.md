# Exploration: UI Visual Language — Vitalock apps → CRM Dashboard (Figma) reference

> Change: `ui-visual-language` · Artifact store: OpenSpec · Date: 2026-08-13
> Scope: read-only investigation of `apps/admin`, `apps/installer`, `packages/ui`. No code modified.

## Current State

### Theming & design tokens
- `packages/ui/globals.css` defines the base light palette (default shadcn zinc: `--foreground 222.2 84% 4.9%`, `--radius 0.5rem`) with an **EMPTY `.dark` block** ("to be filled in a future change"). It does **not** define `--popover`, though the preset references it.
- `packages/ui/tailwind.preset.js` is the shared preset used by BOTH apps (`presets: [preset]`). Standard shadcn color mapping to CSS vars + `tailwindcss-animate`.
- `apps/admin/src/styles/globals.css` and `apps/installer/src/styles/globals.css` are **near-duplicates** of each other (each ~45 lines): full light + dark palettes (default shadcn zinc). Admin's is the superset (identical light, identical dark).
- Both apps run `next-themes` `ThemeProvider` (`attribute="class"`, `defaultTheme="system"`, `enableSystem`) and ship an identical `ThemeToggle` (Sun icon + Switch + Moon) in different paths.
- Palette is neutral zinc — **no brand/accent color** anywhere. No typography scale beyond Tailwind defaults. No `card`/`popover` tokens in `packages/ui/globals.css`.

### Shared UI vs duplication
- `packages/ui` exports **only `cn`** (`src/index.ts`). It hosts zero primitives.
- 6 primitives exist in BOTH apps: `badge`, `button`, `checkbox`, `dialog`, `switch`, `textarea` — **5 are byte-identical** (`checkbox` differs). ≈290 duplicated lines.
- Admin-only primitives (7): `input`, `label`, `popover`, `select`, `sheet`, `table`, `tabs`. Admin total: 13 files / 839 lines.
- Installer-only primitives (5): `card`, `collapsible`, `separator`, `skeleton`, `sonner`. Installer total: 11 files / 465 lines.
- `Tabs` is dead weight in admin: only usage is the primitive itself (0 page usages).

### Layout shells
- **Admin** (`AppShell`): top header h-14 (`Vitalock Admin` text wordmark, staff name, ThemeToggle, `Salir` ghost button) + `Sidebar` w-60 with a **flat list of 6 `NavItem`s** (16px icons, no logo, no section labels, no badges) + `main` p-6. Mobile: hamburger + slide-over.
- `PageHeader`: breadcrumbs (text-xs, `/` separators) + `h1 text-2xl` (~32px) + subtitle + action slot. Used by 10 files.
- **Installer** (`App.tsx`): minimal h-14 header + `Outlet`; no sidebar. Home = `Mi turno` heading + `BuildingWorkCard` list (max-w-2xl centered, Card-based).
- `LoginPage` in both apps uses **raw `<input>` elements** (not the `ui/Input` primitive) in a centered max-w-sm card.

### Page/route inventory & composite patterns
Admin — 16 routes:
| Route | Page | Patterns |
|---|---|---|
| `/login`, `/error` | LoginPage, AuthErrorPage | raw form inputs |
| `/` | redirect → `/administraciones` | — |
| `/administraciones` | AdministrationsPage | PageHeader + search Input + table + create Sheet |
| `/administraciones/:adminId` | AdministrationDetailPage | PageHeader (breadcrumb+badge+Edit) + buildings sub-table + 2 sheets |
| `/buildings/:buildingId` | BuildingDetailPage | same detail pattern |
| `/ordenes` | OrdenesPage | **raw h1 (no PageHeader)** + badge filter pills (Tipo/Estado) + search + table |
| `/ordenes/nueva` | OrdenNuevaPage | full-page OrdenForm — bordered `<section>` boxes w/ `h2` headings |
| `/ordenes/:ordenId` | OrdenDetailPage | detail + items table + dialogs |
| `/ordenes/:ordenId/editar` | OrdenEditarPage | OrdenForm (edit) |
| `/tareas` | TareasPage | table + Sheet |
| `/tareas/:tareaId` | TareaDetailPage | detail (WIP-modified) |
| `/personal` | PersonalPage | table + Sheet |
| `/particulares` | ParticularesPage | table + Sheet + quick-create dialog + selector |
| `/stock` | StockPage | PageHeader + search + category badge pills + ProductsTable + Sheet |
| `/stock/:productId` | StockDetailPage | detail + StockMovementsTable |

Composite usage (admin, file counts): PageHeader 10 · Table 12 · Sheet 10 · Dialog 14 · Badge 21 · Select 14 · Input 26 · Textarea 6 · Tabs 1 (primitive only).

Installer — 3 routes (`/`, `/login`, `/error`): home = BuildingWorkCard list (Card + Badge + Collapsible sections + SelectionToolbar floating pill + EmptyState + ConnectivityBanner).

### Tests constraining restyle
- 43 test files (admin) + 4 (installer). 20 admin UI component tests + 2 route tests; installer has **zero** UI component tests (hooks only).
- Tests assert **roles/text/hrefs, not styles** → restyle-safe as long as DOM structure, roles, and Spanish labels survive.
- Known style-ish constraints: `BuildingsTable.test` asserts `.animate-pulse` skeletons; `ThemeToggle.test` asserts Switch role, `dark` class toggle, and localStorage persistence.
- Full inventory of UI test files: `components/*/__tests__/*.test.tsx` (tables, form sheets, dialogs, toggles, PageHeader, ThemeToggle) + `routes/ordenes/__tests__/OrdenDetailPage|OrdenEditarPage`.

### Existing gap vs Figma reference
| Figma pattern | Current equivalent | Gap |
|---|---|---|
| Sidebar 322px, grouped sections (PAGES/APPS/SETTINGS), 48px items, 24px icons, badge pills, chevron groups, logo+wordmark | w-60 flat list, 16px icons, no groups/logo/badges | **Missing** |
| Topbar: search field 372×48 + bell 44×44 + avatar + divider | plain h-14 header, text wordmark, ThemeToggle, Salir | **Missing** (no search/bell/avatar) |
| Breadcrumb + ~40px page title | PageHeader: text-xs crumbs + text-2xl title | Partial (sizes off) |
| KPI stat cards ~350×176 (icon chip, value, label) | none anywhere | **Missing** |
| Charts (bar/line, legend dots, "Weekly" filter) | none, no charting dep | **Missing** |
| Tables: uppercase headers, checkbox col, ~71px rows, status badges, progress bars, pagination footer ("1-10 of 30", rows-per-page, 52px icon buttons) | lowercase headers, no checkbox cols, no progress bars, **no pagination anywhere** | **Missing** (pagination/progress) |
| Forms: section headings (~28px), 44px inputs, date pickers w/ calendar icon, dropdowns w/ chevron, checkbox rows w/ thumbnail, ~52px primary actions bottom-right | sheets: plain label stacks, default 40px inputs, no date picker, bordered sections only in OrdenForm | Partial |
| Light-only aesthetic | light + dark (zinc) | Dark mode decision needed |

## Affected Areas
- `packages/ui/globals.css` — token source of truth; add accent/card tokens; align light palette to reference; resolve empty dark block.
- `packages/ui/tailwind.preset.js` — token mapping, radius scale, possibly font/container tweaks.
- `packages/ui/src/index.ts` (+ new `packages/ui/src/components/*`) — move shared primitives here; export new patterns.
- `apps/admin/src/styles/globals.css`, `apps/installer/src/styles/globals.css` — converge onto shared tokens (dedupe).
- `apps/admin/src/components/layout/{AppShell,Sidebar,NavItem,PageHeader,ThemeToggle}.tsx` — layout shell redesign (logo, grouped nav, topbar).
- `apps/admin/src/components/ui/*` (13 files) — restyle table/input/select/sheet/badge etc.; possible migration to `packages/ui`.
- `apps/installer/src/components/ui/*` (11 files) — same; card/collapsible/skeleton restyle.
- 12 admin table components + 10 sheets/dialogs + OrdenForm — adopt section headings, header styles, action placement.
- 16 admin routes + installer home — adopt PageHeader consistency (OrdenesPage uses raw h1), search field variant, optional stat cards.
- `apps/admin/src/components/administrations/AdministrationFormSheet.tsx` etc. — form field sizing.
- Tests: `ThemeToggle.test.tsx` (dark-mode decision), any new pattern component tests.

## Approaches

### 1. Token-level restyle only
Retune `packages/ui/globals.css` + preset (and app css files) to the reference palette/radius/typography. Nothing structural.
- Pros: Cheapest (~3–6 files, ~200–400 lines). Instant global alignment. Zero test churn. Zero collision risk.
- Cons: Layout stays flat-sidebar/plain-header; tables keep lowercase headers, no pagination, no stat cards, no grouped nav, no topbar search — the Figma "language" is mostly structure, not color. Delivers only the color/radius/type layer.
- Effort: **Low**
- Delivers: palette/radius/typography match only.

### 2. Full shared design system + layout redesign
Extract duplicated primitives into `packages/ui/src/components/` (badge, button, checkbox, dialog, switch, textarea now; input/label/select/sheet/table later), add new pattern components (StatCard, PaginationFooter, SectionHeading, SearchInput, SidebarGroup, Topbar), redesign admin layout (logo+wordmark, grouped nav w/ badges, topbar w/ search+bell+avatar+divider, breadcrumb/title sizing), restyle tables (uppercase headers, row density, optional progress bars) and forms (section headings, 44px fields, date picker) per app; align installer cards to the same tokens.
- Pros: Delivers the full Figma language. Removes ~290+ duplicated lines and the per-app ui forks. One design source of truth for both apps. Test suite is role-based → mostly safe.
- Cons: Biggest blast radius (~70–90 files, ~2,500–4,500 changed lines — **far over the 800-line review budget** → must chain PRs). Higher design-decision load (accent color, dark mode, stat-card data sources). New components need tests.
- Effort: **High**
- Delivers: every Figma pattern; removes duplication.

### 3. Incremental per-app redesign (no shared extraction)
Restyle admin fully in-place, then installer, keeping each app's `components/ui/` folder.
- Pros: Smaller per-app review slices; admin (the visible flagship) lands first; no cross-package refactor risk.
- Cons: Duplication persists (risk of divergence between the two app ui folders over time); patterns built twice; second app re-derives decisions made in the first.
- Effort: **Medium–High** (total similar to 2, without the shared-layer payoff).

## Recommendation
**Approach 2, sequenced as chained slices** (delivery_strategy `ask-on-risk`; budget 800 lines → forecast High):
1. **Slice A — Tokens**: `packages/ui/globals.css` + preset converge (reference palette, accent, card tokens, radius), dedupe both app css files. ~150–250 lines.
2. **Slice B — Shared primitives**: move the 5–6 duplicated components into `packages/ui`, rewire imports. ~600–900 lines.
3. **Slice C — Admin layout shell**: logo/wordmark, grouped sidebar, topbar (search + bell + avatar), PageHeader sizing. ~400–600 lines.
4. **Slice D — Admin tables & forms**: uppercase headers, density, section headings, field sizing, pagination footer + stat-card pattern adoption on list pages. ~700–1,000 lines (may split D1 tables / D2 forms).
5. **Slice E — Installer adoption**: header + cards + tokens. ~150–300 lines.

Dark mode: **keep the toggle**, treat light as the primary deliverable and adapt dark as a best-effort translation of the template (Option A). Do not gate it — removal deletes existing user value and breaks `ThemeToggle.test.tsx`. Define the dark palette in the same pass as Slice A (also fills the empty `.dark` block in `packages/ui/globals.css`).

UI copy stays Spanish — only the visual language changes. All artifacts/commit text in English.

## Risks
- **Review budget**: full redesign is 3–5× the 800-line budget; chaining is mandatory (`Decision needed before apply: Yes`, `Chained PRs recommended: Yes`, `400/800-line budget risk: High`).
- **Sibling collision (`atomic-stock-work-resolution`)**: sibling touches `apps/admin/src/components/tareas/AssignEquipmentDialog.tsx`, `TareaDetailPage.tsx` (+ WIP-modified `TareasTable.tsx`, `TareaFormSheet.tsx`, `useTareas.ts`, `useMutateTarea.ts`). Exclude all `tareas/*` UI files from early slices; restyle them only after the sibling lands.
- **Dark mode ambiguity**: Figma is light-only; an unadapted dark palette may look foreign. Needs an explicit user decision on keep-adapt vs gate.
- **Stat-card data sources**: KPI cards need numbers (counts by status, stock totals). Some queries exist (`useOrdens`, `useProducts`); others may need new hooks or client-side aggregation. Scope must name which cards appear on which pages or defer stat cards.
- **Date pickers**: none exist; adding one is a new dependency decision (Radix popover-based) — may be deferred to a follow-up change.
- **Login pages**: use raw inputs, not the shared Input — either restyle them or leave; scope must say which.
- **Tests**: role/text-based so mostly safe, but `ThemeToggle.test.tsx` and `.animate-pulse` assertions must be honored; new pattern components need tests (strict_tdd: true).
- **`packages/ui/globals.css` missing `--popover`** while the preset references it — fix while converging tokens (both apps define it locally today).

## Ready for Proposal
**Yes.** The orchestrator should tell the user:
- Approach: full shared design system (Approach 2) delivered as chained slices; tokens first, admin shell second, tables/forms third, installer last.
- Decisions needed from the user: (1) accent/brand color for the palette (reference "REduce" template suggests a single strong accent), (2) dark mode keep-adapt vs gate, (3) whether KPI stat cards and pagination are in-scope for this change or a follow-up, (4) confirm deferring date pickers/charts.
