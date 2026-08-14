# Tasks: UI Visual Language

> **Delivery note (2026-08-13)**: User chose **direct-to-main delivery** ("mergear todo a master") — no GitHub repo/remote exists, so the chained-PR plan collapses to direct work-unit commits on `main`. Slices A–E infrastructure already applied under the OLD dark-first design and merged (`2fda751..19c0f10`). **This regeneration is a CORRECTION delta**: the design was rewritten LIGHT-FIRST (Figma-verified: primary `#5d5fef`, nav active `#7364ff`, content `#f5f5fa`, 32px titles, 52px buttons, pill badges, table-in-card). Tasks below mark already-correct work `[x]` and the light-first correction work `[ ]`.
> **Strict TDD**: RED → GREEN per module; run `pnpm --filter @vitalock/ui test` for ui changes, full admin/installer suites for app changes.

## Review Workload Forecast

Estimated changed lines: ~400–650 (correction delta, NOT the original 2,000–3,050).
Decision needed before apply: Yes (400-line budget risk: Medium)
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: Medium
Delivery strategy: ask-on-risk (passes to apply).

### Suggested Work Units

| Unit | Goal | PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|----|----------------------|-----------------|-------------------|
| A | Tokens light-first | 1 | `pnpm --filter @vitalock/ui test` | `pnpm dev` both; light default, dark opt-out | Revert → old palette |
| C | Shell correction | 2 | ui+admin suites | `pnpm dev` admin; topbar scoped, bg #f5f5fa | Revert → old shell |
| D | Buttons/pills/card tables | 3 | ui+admin suites | `pnpm dev`; status pills, buttons 52px | Revert → old sizes |
| E | Installer spot-check | 4 | `pnpm typecheck && pnpm lint` | `pnpm dev` installer | Revert PR 4 |

Threat matrix N/A (design); strict_tdd RED→GREEN per module.

## Slice A · Tokens light-first · PR 1

- [x] A1 ui test bootstrap (devDeps vitest/testing-library/jest-dom/jsdom, `test` script, `vite.config.ts`, `src/test/setup.ts`) — applied.
- [x] A2 UPDATE `tokens.test.ts` to assert LIGHT-FIRST values: primary `239.2 82% 65.1%` (#5d5fef), content background `240 33.3% 97.1%` (#f5f5fa), `.dark` non-empty, popover/card defined. Current test asserts old `251.9 66.5% 49.2%` → RED after token change.
- [x] A3 UPDATE `packages/ui/globals.css` (D2 light-first): `--primary`/`--ring` → `239.2 82% 65.1%` (#5d5fef); `--accent` → `245.8 100% 69.6%` (#7364ff); `--background` light → `240 33.3% 97.1%` (#f5f5fa); `--border` light → `214.3 31.8% 91.4%` (#e2e8f0); keep `.dark` filled as opt-out adaptation (D12) — toggle/tests preserved. A2 passes.
- [x] A4 UPDATE `packages/ui/tailwind.preset.js`: `card: { DEFAULT, foreground }` mapping (add if missing).
- [x] A5 Pipeline green both apps+ui; `tareas/*` untouched.

## Slice B · Primitives · PR 2 — already applied under old design

- [x] B1 Deps (react, react-dom, radix {checkbox,dialog,switch,slot}, cva, lucide-react) — applied.
- [x] B2 `primitives.test.tsx` — applied.
- [x] B3 7 shared primitives + `index.ts` re-export — applied.
- [x] B4 Rewire ~40 imports `@/components/ui/X` → `@vitalock/ui` — applied.
- [x] B5 Delete per-app copies (admin 7, installer 6; installer keeps card/collapsible/separator/skeleton/sonner) — applied.
- [x] B6 Pipeline green; ThemeToggle.test.tsx + role/text/href suites pass — applied.
- [x] B7 VERIFY button sizing per D11: `button.tsx` default `h-10 rounded-md` → `h-[52px] rounded-[9px]` (keep variants; size map updated: default `h-[52px] px-6`, sm `h-11`, lg `h-[52px] px-8`, icon `h-[52px] w-[52px]`). Existing Button tests updated if they assert heights.

## Slice C · Admin shell correction · PR 3

- [x] C1 `patterns/{SidebarGroup,SearchInput,Topbar}.tsx` + tests — applied (under old sizes).
- [x] C2 UPDATE `Topbar.tsx`: `h-16 ... bg-background px-6` → Figma D6: `h-[100px] bg-white` scoped over content (AppShell must render Topbar INSIDE the content column, NOT above the sidebar); search `w-[372px] h-12 rounded-[8px] bg-[#f5f5fa]`; bell/avatar in `h-11 w-11 rounded-full bg-[#f1f5f9]`; user chip `text-[18px] font-medium text-[#40444d]`; divider `h-[52px] w-px bg-[#e2e8f0]`. Tests updated to assert new structure roles only (bell `aria-label="Notificaciones"`, divider, children).
- [x] C3 UPDATE `AppShell.tsx`: main content column → `bg-[#f5f5fa]` (was white); Topbar placed inside content column so it does not span above sidebar; keep `flex h-screen flex-col` shell with Sidebar sibling.
- [x] C4 UPDATE `Sidebar.tsx`/`NavItem.tsx` (D5): nav items `h-12 rounded-md px-3 text-sm` → Figma `text-[18px] font-medium text-[#3b424a] px-12 py-12 rounded-[4px] w-[242px]`; ACTIVE item `bg-[#7364ff] rounded-[9px] text-white` (NOT `bg-accent`/`text-accent-foreground`); group labels `text-[13px] uppercase text-[#7b8190]`; badge pill `rounded-[20px] bg-[#10b981] text-white text-[14px]`. Keep brand header + 5 groups + Ordenes in-progress badge + navigation behavior (hard constraint: NavLink hrefs unchanged).
- [x] C5 UPDATE `PageHeader.tsx` (D9): title `text-[40px] font-semibold` → `text-[32px] font-bold leading-[40px] text-[#1e293b]`; breadcrumb `text-sm` → `text-[14px] text-[#4d515a]` with `ChevronRight` separators between segments (NOT `/`); preserve `aria-label="Breadcrumb"` nav + `h1` roles; existing PageHeader tests updated to new roles/sizes or asserted not to pin 40px.
- [x] C6 Pipeline green; PageHeader/ThemeToggle tests pass.

## Slice D1 · Tables correction · PR 4

- [x] D1.1 `patterns/{pagination.ts,StatCard,PaginationFooter}.tsx` + `getPageSlice`/constants + tests — applied.
- [x] D1.2 `apps/admin/src/lib/statThresholds.ts` + test — applied.
- [x] D1.3 `table.tsx` rows `h-[71px]` + TableHead `text-xs uppercase tracking-wider` — applied.
- [x] D1.4 Client-side pagination on 3 list tables — applied.
- [x] D1.5 StatCards on Administraciones/Ordenes/Stock — applied.
- [x] D1.6 UPDATE table surface (D10): the 3 list tables + OrdenDetail technical table must render INSIDE a white card `rounded-[12px]` (shared `Card` or per-page wrapper) with TableHead `bg-[#f8fafc]`/`bg-muted/50` — verify current state; add card wrapper where missing.
- [x] D1.7 UPDATE PaginationFooter layout to Figma (D8): "Rows per page: 10" + "1-10 of 87" on LEFT, prev/next arrows on RIGHT (was justify-between). Tests updated if they assert positions.
- [x] D1.8 Pipeline green.

## Slice D2 · Forms + logins + status correction · PR 5

- [x] D2.1 `input.tsx` + admin `select.tsx` trigger `h-11` — applied.
- [x] D2.2 `patterns/SectionHeading.tsx` + test — applied.
- [x] D2.3 `OrdenForm.tsx` uses SectionHeading — applied.
- [x] D2.4 Both `LoginPage.tsx` use shared Input/Button — applied.
- [x] D2.5 UPDATE status pill (D11): Badge `rounded-full px-2.5` → status pills `rounded-[20px]` with per-status tinted backgrounds (e.g. listo/entregado `text-[#059691]` on `rgba(209,250,229,0.5)`), label `text-[16px]`. Apply to the status/state Badges rendered across list + detail pages; keep text labels unchanged (Spanish).
- [x] D2.6 UPDATE Input/Select to Figma field style (D11): `border-[#d0d5dd]`, value/placeholder `text-[16px] text-[#667085]` (implement via token classes; keep h-11 rounded-md).
- [x] D2.7 Pipeline green; login + role/text suites pass.

## Slice E · Installer correction · PR 6

- [x] E1 `App.tsx` header wordmark on tokens — applied.
- [x] E2 `card.tsx` `rounded-xl border-border shadow-sm` + `BuildingWorkCard.tsx` polish — applied.
- [x] E3 `ThemeToggle.tsx` Switch from `@vitalock/ui` — applied.
- [x] E4 VERIFY installer adopts corrected tokens automatically via shared globals.css (bg `#f5f5fa`, accent `#5d5fef`); spot-check BuildingWorkCard/status pills pick up corrected palette; no per-app hex overrides remain (grep `#4B2AD1`, `#251.9`, `40px` across both apps → clean).
- [x] E5 Pipeline green; `tareas/*` untouched.
