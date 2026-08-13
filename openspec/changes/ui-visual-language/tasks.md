# Tasks: UI Visual Language

> **Delivery note (2026-08-13)**: User chose **direct-to-main delivery** ("mergear todo a master") — no GitHub repo/remote exists, so the chained-PR plan collapses to direct work-unit commits on `main`. Slice A merged via fast-forward (`2fda751..1cdf8fa`). PR columns below are reference only; each slice lands on `main` directly.

## Review Workload Forecast

Estimated changed lines: ~2,000–3,050 (6 slices).
Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High
Delivery strategy: ask-on-risk (passes to apply).

### Suggested Work Units

| Unit | Goal | PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|----|----------------------|-----------------|-------------------|
| A | Tokens | 1 | `pnpm --filter @vitalock/ui test` | `pnpm dev` both; dark+reload | Revert → per-app palettes |
| B | Primitives+rewiring | 2 (2a/2b if >800) | `pnpm --filter @vitalock/ui test` | `pnpm dev`; render primitives | Revert → re-point imports |
| C | Admin shell | 3 | ui+admin suites | `pnpm dev` admin | Revert → flat shell |
| D1 | Tables | 4 | `pnpm --filter @vitalock/ui test` | `/stock` low-stock row | Revert → un-paginated |
| D2 | Forms+logins | 5 | ui+admin suites | `pnpm dev`; login submit | Revert → raw inputs |
| E | Installer | 6 | `pnpm typecheck && pnpm lint` | `pnpm dev` installer | Revert PR 6 |

Threat matrix N/A (design); strict_tdd RED→GREEN per module.

## Slice A · Tokens · PR 1 · ≤400 ✓

- [x] A1 Bootstrap ui tests: devDeps (vitest, @testing-library/react, jest-dom, jsdom)+`test` script; `vite.config.ts`; `src/test/setup.ts`. Verify `pnpm --filter @vitalock/ui test`.
- [x] A2 RED `tokens.test.ts`: primary `251.9 66.5% 49.2%`, ring, accent; `.dark` filled; popover/card → fails on zinc.
- [x] A3 GREEN `globals.css` (D2 light+dark, `--popover(-fg)`, `--card(-fg)`)+preset `card` map. A2 passes.
- [x] A4 Both app `styles/globals.css` → `@import '@vitalock/ui/globals.css'`; palettes deleted.
- [x] A5 Pipeline green both apps+ui; `tareas/*` untouched.

## Slice B · Primitives · PR 2 · >400 ✗ · >800 → 2a(deps+components)/2b(rewiring+deletes)

- [x] B1 Deps (D3 ratified): react, react-dom, radix {checkbox,dialog,switch,slot}, cva, lucide-react; `pnpm install` dedupes.
- [x] B2 RED `primitives.test.tsx`: button/switch/checkbox/dialog/input/textarea/badge roles from `@vitalock/ui`.
- [x] B3 GREEN 7 primitives (D4 canonical; `cn`=`../lib/utils`; `"use client"` verbatim)+`index.ts` re-export.
- [x] B4 Rewire ~40 imports `@/components/ui/X` → `@vitalock/ui`; grep clean (54 files; only off-limits WIP tareas files remain on local aliases).
- [x] B5 Delete per-app copies (admin 7, installer 6); installer keeps card/collapsible/separator/skeleton/sonner; admin keeps 5 re-export shims for WIP.
- [x] B6 Pipeline green; ThemeToggle.test.tsx+role/text/href suites pass; `tareas/*` untouched.

## Slice C · Admin shell · PR 3 · >400 ✗

- [ ] C1 RED: SidebarGroup label/children; SearchInput placeholder, no query/nav; Topbar bell(`Notificaciones`)+avatar+divider+children.
- [ ] C2 GREEN `patterns/{SidebarGroup,SearchInput,Topbar}.tsx` (router-free; `lg`=h-12 w-[372px]).
- [ ] C3 `Sidebar.tsx`+`NavItem.tsx` badge: brand header; 5 groups (D5; `/personal`,`/stock` live; "Personal" wins); Ordenes badge `useOrdens({status:'in_progress'})`, hidden when 0.
- [ ] C4 `AppShell.tsx`→Topbar (slot=ThemeToggle+Salir); `PageHeader.tsx` breadcrumb `text-sm`+title `text-[40px]`, keep `aria-label="Breadcrumb"`+`h1`.
- [ ] C5 Pipeline green; PageHeader/ThemeToggle tests pass.

## Slice D1 · Tables · PR 4 · >400 ✗

- [ ] D1.1 RED: `getPageSlice`/constants (10; [10,20,50]); StatCard empty→"—"; PaginationFooter "1-10 of 25", prev/next disabled, callbacks fire.
- [ ] D1.2 GREEN `patterns/{pagination.ts,StatCard,PaginationFooter}.tsx` (native select+ChevronDown; `aspect-[350/176] max-w-[350px]` chip)+index export.
- [ ] D1.3 `apps/admin/src/lib/statThresholds.ts`+test: `LOW_STOCK_THRESHOLD=5`, `ACTIVE_STATUS='active'`.
- [ ] D1.4 `table.tsx` (TableHead `text-xs uppercase`; rows `h-[71px]`)+3 tables client-side pagination (page state, reset on filter).
- [ ] D1.5 Pages add StatCards from loaded rows: Administraciones Total/Activas; Ordenes Total/En proceso/Listo para retirar; Stock Total/Stock bajo.
- [ ] D1.6 Pipeline green.

## Slice D2 · Forms+logins · PR 5 · borderline ≤400

- [ ] D2.1 `input.tsx`+admin `select.tsx` trigger `h-10`→`h-11`.
- [ ] D2.2 RED SectionHeading test (h2 title/description/action).
- [ ] D2.3 GREEN `patterns/SectionHeading.tsx` (h2 ~28px)+export.
- [ ] D2.4 `OrdenForm.tsx`: section/h2 → SectionHeading.
- [ ] D2.5 Both `LoginPage.tsx`: `<input>` → shared Input; submit → Button; copy unchanged.
- [ ] D2.6 Pipeline green.

## Slice E · Installer · PR 6 · ≤400 ✓

- [ ] E1 `App.tsx` header wordmark on tokens.
- [ ] E2 `card.tsx` `rounded-xl border-border shadow-sm`+`BuildingWorkCard.tsx` polish.
- [ ] E3 `ThemeToggle.tsx` Switch from `@vitalock/ui`.
- [ ] E4 Pipeline green; `tareas/*` untouched.
