# Design: UI Visual Language — Shared Design System

## Technical Approach

Token-first shared design system in `packages/ui`, aligned to the Figma CRM Dashboard reference (file `dWGVfiKpzUoD7l2K4yqG7D`, canvas `3:2245`): converge tokens (LIGHT-first per the reference — 7 of 8 frames are light; dark is an opt-out adaptation) in one `globals.css` consumed by both apps; extract the 6 duplicated primitives plus Input into `@vitalock/ui`; add pattern components (SidebarGroup, SectionHeading, SearchInput, Topbar, StatCard, PaginationFooter); restructure the admin shell (grouped sidebar, content-scoped topbar, breadcrumb + title scale); adopt patterns on the 3 list pages and both logins; align installer onto shared tokens. Chained slices A–E (budget forecast High). `tareas/*` untouched.

This design REPLACES the previous one (2026-08-13, dark-first, violet `#4B2AD1`): the user audited the Figma source and corrected the diagnosis — the reference is LIGHT-FIRST. The authoritative Figma tokens (below) come from direct measurement of the frames; the old `#4B2AD1` accent and the 40px page title are NOT in the reference and are replaced.

## Architecture Decisions

### D1 Token ownership — one source, apps import it

| Option | Tradeoff | Decision |
|---|---|---|
| Apps keep per-app palettes | duplication persists, divergence risk | Rejected |
| Shared `globals.css`; app files become `@import '@vitalock/ui/globals.css'` | single source; PostCSS inlines via package exports map | **Chosen** |

Both app CSS files shrink to the single import (shared file already carries the `@tailwind` directives). App tailwind configs unchanged — they already scan `packages/ui/src`.

### D2 Exact palette values — LIGHT-FIRST from Figma measurement

Light tokens measured from the reference frames (`#5d5fef` primary buttons on New Order 3:7034 / Invoices 3:7344; `#7364ff` active nav; `#f5f5fa` content bg; white cards; `#e2e8f0` borders; `#172d43` brand). Dark is an opt-out adaptation derived from the same accent family (D12) — NOT the previous violet `#4B2AD1` system.

| Variable | Light (Figma) | Dark (opt-out adaptation) |
|---|---|---|
| background | `#f5f5fa` content / `#ffffff` shell | `224 40% 6%` |
| foreground | `#1e293b` | `224 20% 95%` |
| card / card-foreground | `#ffffff` / `#1e293b` | `224 40% 6%` / `224 20% 95%` |
| popover / popover-foreground | `0 0% 100%` / `224 50% 8%` | `224 35% 10%` / `224 20% 95%` |
| primary / primary-foreground | `#5d5fef` / white | `#5d5fef` / white |
| accent (nav active) | `#7364ff` | `#7364ff` |
| secondary / secondary-foreground | `#f8fafc` / `#4d515a` | `224 30% 14%` / `224 20% 95%` |
| muted / muted-foreground | `#f1f5f9` / `#a9b0ba` | `224 30% 14%` / `224 12% 68%` |
| destructive / destructive-foreground | `0 84.2% 60.2%` / `210 20% 98%` | `0 62.8% 30.6%` / `210 20% 98%` |
| border / input | `#e2e8f0` / `#d0d5dd` | `224 30% 14%` |
| ring | `#5d5fef` | `#5d5fef` |
| radius | `0.625rem` | `0.625rem` |

Preset change: add `card: { DEFAULT, foreground }` color mapping (missing today, though the preset references popover).

Note: this corrects the earlier spec text naming accent `#4B2AD1` and the 40px title — the delta specs are synced at archive; this design is authoritative for implementation.

### D3 Primitive dependencies

| Option | Tradeoff | Decision |
|---|---|---|
| packages/ui declares react, radix (checkbox/dialog/switch/slot), cva, lucide-react as `dependencies` | packages/ui manifest gains entries — no NEW library (all already shipped by both apps); pnpm dedupes to the same store nodes | **Chosen** |
| peerDependencies | pnpm 9 auto-installs peers anyway; more friction | Rejected |

Spec scenario "manifest unchanged" reads as *no new third-party library* (date pickers/charts). Flag for orchestrator ratification at tasks phase.

### D4 Canonical primitive files

Five are byte-identical across apps; **checkbox** differs (installer adds `grid place-content-center` to root + indicator). Canonical = admin classes + installer centering; `peer` retained. All 7 moved files change only `cn` import to relative `../lib/utils` (avoid package self-import); `"use client"` directives kept verbatim.

### D5 Sidebar grouping reconciliation

| Current item | Section | Status |
|---|---|---|
| Administraciones | Infraestructura | active |
| Particulares | Infraestructura | active |
| Ordenes | Ordenes | active |
| Tareas | Ordenes | active |
| Staff | Personal | item live — label **"Personal"** wins (route stays `/personal`) |
| Stock | Ventas | item live (route `/stock`) |
| — | Tickets | empty placeholder |

"Non-interactive" = section level (plain label, no chevron/accordion; Tickets has no items). Items with existing routes remain real NavLinks — navigation behavior unchanged (hard constraint). Badge pills: one live count — Ordenes renders `useOrdens({ status: 'in_progress' }).data?.length` (single cached shell query; pill hidden when 0). NavItem gains `badge?: number`.

Visual alignment to Figma (frame `3:7877`): sidebar `w-[322px] bg-white` full height; nav group labels `text-[13px] uppercase text-[#7b8190]`; nav items `text-[18px] font-medium text-[#3b424a] px-12 py-12 rounded-[4px]`, ACTIVE item `bg-[#7364ff] rounded-[9px] text-white`. Brand header (D6) above nav.

### D6 Topbar placement

`Topbar` in packages/ui, router-free: SearchInput + bell (`aria-label="Notificaciones"`) + avatar initials + divider + `children` slot. AppShell renders it on every authenticated admin route; slot carries ThemeToggle + Salir (existing bindings). Wordmark moves into the Sidebar brand header. Search = uncontrolled SearchInput placeholder — no state, no queries, cannot navigate.

Figma alignment (frames `3:7877`/`3:8502`): topbar `h-[100px] bg-white`, scoped over the content area (after the 322px sidebar), NOT spanning above the sidebar. Search `w-[372px] h-12 rounded-[8px] bg-[#f5f5fa]` placeholder `text-[18px] text-[#cacedc]`. Bell + avatar wrapped in `h-11 w-11 rounded-full bg-[#f1f5f9] flex items-center justify-center`; user chip `text-[18px] font-medium text-[#40444d]`; divider `h-[52px] w-px bg-[#e2e8f0]`.

### D7 Input becomes the 7th shared primitive

Both logins must use shared Input; installer has none today. Moving admin's Input (react + cn only, no new deps) beats an installer fork. Default height `h-11` (44px per reference; Figma fields are `h-44` px, `rounded-[8px]`, `border-[#d0d5dd]`, value/placeholder `text-[16px] text-[#667085]`).

### D8 Constants split

Pagination constants (`DEFAULT_PAGE_SIZE = 10`, `ROWS_PER_PAGE_OPTIONS = [10, 20, 50]`, pure helper `getPageSlice(rows, page, pageSize)`) live in packages/ui (design system). Stat thresholds (`LOW_STOCK_THRESHOLD = 5`, `ACTIVE_STATUS = 'active'`) live in `apps/admin/src/lib/statThresholds.ts` (domain). Both exported + tested.

### D9 Breadcrumb + page title scale — corrected to Figma

| Current | Figma reference | Decision |
|---|---|---|
| PageHeader title `text-[40px] font-semibold`, breadcrumb `text-sm` | Title Inter Bold `32px` / `leading-40px` `#1e293b`; breadcrumb `text-[14px]` `#4d515a` with 24px chevron-right separators | **32px bold + chevron breadcrumb** |
| Ordenes/Nueva/Editar/Detail + TareaDetail inline `text-2xl font-bold`, no breadcrumb | Same page-header language on every page | Adopt PageHeader on those pages (breadcrumb `aria-label="Breadcrumb"` + `h1` preserved) |

PageHeader keeps its `aria-label="Breadcrumb"` nav and `h1` roles (existing tests must pass); only sizing and the separator icon change (`ChevronRight` between segments instead of `/`).

### D10 Table surface — card container + Figma density

| Current | Figma reference (Orders 3:8502 / Invoices 3:7344) | Decision |
|---|---|---|
| Bare `<table>` on white page bg | Table inside white card `rounded-[12px]` | Wrap tables in a card surface (shared pattern or per-page card) |
| TableHead default | `bg-[#f8fafc]`, uppercase 12.78px semibold `#4d515a`, px-24, h-58 | TableHead `bg-muted/50 uppercase text-xs font-semibold` |
| Rows default density | h-64/71, `border-t border-[#e2e8f0]`, px-24 py-10; primary text 18px Medium `#40444d`; secondary 16px `#a9b0ba` | rows `h-[71px]`, `border-t`, primary/secondary text classes |

Raw `<table>` in OrdenDetail technical section and Tareas sections: keep semantic table, adopt the same header/row classes (Tareas excluded from restyle per sibling constraint — only if it moves within this change; see Open Questions).

### D11 Buttons, badges, inputs scale

| Control | Figma reference | Decision |
|---|---|---|
| Button | h-52px, `rounded-[9px]`, px-26; primary `bg-[#5d5fef] text-white` 18px Medium; secondary `bg-white border-[#e2e8f0] text-[#5d5fef]` | Button `h-[52px] rounded-[9px]` (keep shadcn variants); primary bg `--primary` (#5d5fef) |
| Badge / status pill | `rounded-[20px]` tinted pill (e.g. Approved: text `#059691` on `rgba(209,250,229,0.5)`), 16px | Status pills `rounded-full` → `rounded-[20px]` with tinted bg per status; keep label text |
| Input / Select | field h-44px `rounded-[8px]` `border-[#d0d5dd]` | Input `h-11 rounded-md`; Select trigger `h-11` |

### D12 Dark mode — explicit architecture decision

| Option | Tradeoff | Decision |
|---|---|---|
| Drop dark entirely, remove ThemeToggle | Cleanest light-only match to Figma; but breaks ThemeToggle.test.tsx + spec "Dark mode toggle persists", deletes shipped feature | Rejected |
| **Keep dark as opt-out feature** (default light, toggle persists) | Figma is light-first; dark becomes a derived adaptation, not the design's center of gravity; ThemeToggle.test keeps passing | **Chosen** |

Light is the system and the default. Dark is an opt-out adaptation derived from the same accent family (D2) so the toggle keeps working and the existing tests pass; the Figma light tokens are the source of truth for every light-surface decision.

### D13 Spec/diagnosis correction ownership

The earlier spec text (accent `#4B2AD1`, 40px title, dark-first framing) was written under the wrong diagnosis. This design corrects it. The delta specs (`admin-shell`, `design-system`) are synced at archive per the SDD archive flow; the design is authoritative for tasks/apply now.

## Data Flow

```
packages/ui/globals.css ──► tailwind.preset.js ──► both apps (tokens, no local palettes)
@vitalock/ui (primitives + patterns) ◄── admin & installer imports
useAdministrations/useOrdens/useProducts ──► client-side reduce ──► StatCard values
table rows ──► getPageSlice(rows, page, pageSize) ──► visible rows + PaginationFooter
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| **Slice A — Tokens** | | |
| `packages/ui/globals.css` | Modify | Light-first palette per D2, filled `.dark` opt-out (D12), `--popover`/`--popover-foreground`, `--card` |
| `packages/ui/tailwind.preset.js` | Modify | Add `card` color mapping |
| `packages/ui/package.json` | Modify | Vitest + testing-library + jsdom devDeps, `test` script |
| `packages/ui/vite.config.ts` | Create | jsdom test env + react plugin (mirrors admin) |
| `packages/ui/src/test/setup.ts` | Create | jest-dom import |
| `packages/ui/src/lib/__tests__/tokens.test.ts` | Create | Parses globals.css: primary `#5d5fef`, content bg `#f5f5fa`, `.dark` non-empty, popover/card defined |
| `apps/{admin,installer}/src/styles/globals.css` | Modify | Shrink to `@import '@vitalock/ui/globals.css'` |
| **Slice B — Primitives** | | |
| `packages/ui/src/components/{badge,button,checkbox,dialog,input,switch,textarea}.tsx` | Create | 7 shared primitives (D4, D7) |
| `packages/ui/src/components/__tests__/primitives.test.tsx` | Create | Smoke: roles (button, switch, checkbox, dialog title) render from `@vitalock/ui` |
| `packages/ui/package.json` | Modify | Add react/react-dom/radix/cva/lucide deps (D3) |
| `packages/ui/src/index.ts` | Modify | Re-export primitives + patterns + pagination constants |
| `apps/admin/src/components/ui/{badge,button,checkbox,dialog,input,switch,textarea}.tsx` | Delete | Replaced by `@vitalock/ui` |
| `apps/installer/src/components/ui/{badge,button,checkbox,dialog,switch,textarea}.tsx` | Delete | Same (installer keeps card/collapsible/separator/skeleton/sonner) |
| ~40 importing files in both apps | Modify | `@/components/ui/X` → `@vitalock/ui` (mechanical) |
| **Slice C — Admin shell** | | |
| `packages/ui/src/components/patterns/{SidebarGroup,SearchInput,Topbar}.tsx` | Create | Patterns + tests (SidebarGroup label/children; SearchInput placeholder + no nav; Topbar search/bell/avatar/divider + children) |
| `apps/admin/src/components/layout/AppShell.tsx` | Modify | Content-scoped Topbar (D6) — topbar over content area, main bg `bg-[#f5f5fa]` |
| `apps/admin/src/components/layout/Sidebar.tsx` | Modify | Brand header (logo+wordmark) + 5 SidebarGroups (D5) + Ordenes badge + Figma sizing (w-322, active `#7364ff`) |
| `apps/admin/src/components/layout/NavItem.tsx` | Modify | `badge?: number` pill prop + Figma item styles |
| `apps/admin/src/components/layout/PageHeader.tsx` | Modify | Title `text-[32px] font-bold leading-[40px] text-[#1e293b]`, breadcrumb `text-sm text-[#4d515a]` + ChevronRight separators (D9) |
| **Slice D1 — Tables** | | |
| `packages/ui/src/components/patterns/{StatCard,PaginationFooter}.tsx`, `patterns/pagination.ts` | Create | Patterns + `getPageSlice` + constants + tests |
| `apps/admin/src/lib/statThresholds.ts` (+test) | Create | `LOW_STOCK_THRESHOLD`, `ACTIVE_STATUS` |
| `apps/admin/src/components/ui/table.tsx` | Modify | TableHead `bg-muted/50 text-xs uppercase tracking-wider`; rows `h-[71px] border-t` (D10) |
| `apps/admin/src/routes/{administraciones/AdministrationsPage,ordenes/OrdenesPage,stock/StockPage}.tsx` | Modify | StatCards (Total/Activas; Total/En proceso/Listo para retirar; Total/Stock bajo) from loaded rows + card surface |
| `apps/admin/src/components/{administrations/AdministrationsTable,ordenes/OrdenesTable,stock/ProductsTable}.tsx` | Modify | Client-side pagination (page state, reset on filter change, PaginationFooter) |
| **Slice D2 — Forms + logins** | | |
| `packages/ui/src/components/input.tsx` | Modify | `h-10` → `h-11` |
| `apps/admin/src/components/ui/select.tsx` | Modify | Trigger `h-10` → `h-11` |
| `packages/ui/src/components/patterns/SectionHeading.tsx` (+test) | Create | `h2` ~28px + optional description/action slot |
| `apps/admin/src/components/ordenes/OrdenForm.tsx` | Modify | Bordered `section`/`h2` → SectionHeading |
| `apps/{admin,installer}/src/routes/LoginPage.tsx` | Modify | Raw `<input>` → shared Input; submit → shared Button; labels/placeholders/copy unchanged |
| **Slice E — Installer** | | |
| `apps/installer/src/App.tsx` | Modify | Header wordmark (logo mark + label) on shared tokens |
| `apps/installer/src/components/ui/card.tsx` | Modify | `rounded-xl border-border shadow-sm` |
| `apps/installer/src/components/work/BuildingWorkCard.tsx` | Modify | Spacing/typography polish on tokens |
| `apps/installer/src/components/common/ThemeToggle.tsx` | Modify | Import Switch from `@vitalock/ui` |

## Interfaces / Contracts

```ts
// packages/ui/src/components/patterns
interface SidebarGroupProps { label: string; children: ReactNode; className?: string }
interface SectionHeadingProps { title: string; description?: string; children?: ReactNode }
interface SearchInputProps extends InputHTMLAttributes<HTMLInputElement> { size?: 'default' | 'lg' } // lg: h-12 w-[372px]
interface TopbarProps { children?: ReactNode } // right slot: ThemeToggle + sign-out
interface StatCardProps { label: string; value: number | string | null | undefined; icon?: ReactNode; className?: string } // empty → "—"
interface PaginationFooterProps {
  total: number; page: number; pageSize: number;
  onPageChange: (p: number) => void; onPageSizeChange: (s: number) => void;
}
const DEFAULT_PAGE_SIZE = 10;
const ROWS_PER_PAGE_OPTIONS = [10, 20, 50] as const;
function getPageSlice<T>(rows: T[], page: number, pageSize: number): T[];

// apps/admin/src/lib/statThresholds.ts
export const LOW_STOCK_THRESHOLD = 5;  // stock_disponible <= 5
export const ACTIVE_STATUS = 'active'; // administrations.status
```

StatCard renders `aspect-[350/176] max-w-[350px]` card: icon chip (`h-12 w-12 rounded-lg bg-primary/10 text-primary`), value `text-3xl font-semibold`, label `text-sm text-muted-foreground`. PaginationFooter: summary "1-10 of 30" (`(page-1)*pageSize+1`–`min(page*pageSize,total)`), native `<select>` (avoids Radix select dep in packages/ui) + ChevronDown, prev/next buttons disabled at boundaries. Figma footer layout: "Rows per page: 10" + "1-10 of 87" on the LEFT, prev/next arrows on the RIGHT.

## Testing Strategy

| Layer | What | Approach |
|-------|------|----------|
| Unit (packages/ui) | tokens test: primary `#5d5fef`, content bg `#f5f5fa`, `.dark` filled, popover/card defined | Parse globals.css in Vitest |
| Unit (packages/ui) | Primitives smoke: roles render from `@vitalock/ui` | RTL render + roles |
| Unit (packages/ui) | SidebarGroup, SectionHeading, SearchInput, Topbar, StatCard, PaginationFooter + `getPageSlice` | ≥1 test each (strict_tdd): label/children; title/action; placeholder + no navigation; bell/avatar/divider/children; empty → "—"; summary "1-10 of 25", prev/next disabled at boundaries, callbacks fire |
| Unit (admin) | `statThresholds` constants | Trivial value assertions |
| Regression | `ThemeToggle.test.tsx` (Switch role, `.dark`, localStorage), `.animate-pulse` skeleton assertions, PageHeader breadcrumb/`h1` roles, all role/text/href suites | Must keep passing unchanged; only import rewiring + PageHeader sizing |
| Build | typecheck/lint/build both apps + packages/ui | Pipeline green per slice |

## Threat Matrix

N/A — no routing, shell, subprocess, VCS/PR automation, executable-file classification, or process-integration boundary. Route map and hrefs are unchanged; restyle is class/token-level.

## Migration / Rollout

Each slice = one chained PR (base = previous slice branch), independently revertible via `git revert`. Order matters: A first (tokens) makes every later slice purely visual; B is mechanical rewiring (split if >800 lines — forecast already High); C depends on B (Topbar/SidebarGroup import shared Button/Input); D1/D2 depend on C (shell + pagination constants); E last. No data migration; no feature flags; both apps deploy together.

## Open Questions

- [ ] Ratify D3: packages/ui gaining react/radix/cva/lucide entries is a relocation, not a new dependency — confirm the spec scenario "manifest unchanged" reads as "no new third-party libraries".
- [ ] Confirm the single Ordenes in-progress badge (one cached shell query) is the desired minimal count, or drop badges entirely.
- [ ] Dark mode stays as opt-out (D12): confirm the team accepts the light-first Figma match with a derived dark adaptation (existing toggle/tests preserved) rather than removing the toggle.
- [ ] Tareas table (sibling `atomic-stock-work-resolution` owns it): if it stays out of this change, the raw-`<table>` class alignment there is deferred; confirm.
