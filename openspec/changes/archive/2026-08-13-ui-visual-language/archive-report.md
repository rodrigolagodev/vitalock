# Archive Report — ui-visual-language

- **Change**: ui-visual-language
- **Archived**: 2026-08-13
- **Destination**: `openspec/changes/archive/2026-08-13-ui-visual-language/`
- **Persistence mode**: openspec
- **Route**: ORGANIC (non-dispatcher) — runtime ledger and sub-agent transport failed this session; dispatcher commands (`sdd-continue`/`sdd-status`) and sdd-* sub-agent phases were NOT run. No `verify-report.md` or `apply-progress.md` files exist for this change (never produced); the archive relies on the orchestrator launch prompt as final-state authority (see below).

## Final-State Summary (at close)

The light-first correction delta for `ui-visual-language` is fully applied on `main` as 6 work-unit commits:

- `da8c7fd` style(ui): light-first token palette per Figma reference
- `effda3b` feat(ui): 52px button scale per Figma D11
- `62a706c` refactor(admin): content-scoped topbar with light surfaces
- `9457868` style(admin): figma-aligned sidebar, nav item, and page header
- `222c16e` style(admin): table card surfaces and figma pagination footer
- `326edaf` style(admin): status pills and figma field polish

Earlier infrastructure slices A–E (shared tokens, primitives, shell, tables, installer alignment) were applied and merged under the OLD dark-first design (`2fda751..19c0f10`), then corrected light-first by the commits above. `tareas/*` remained untouched per the sibling `atomic-stock-work-resolution` constraint.

## Verification Evidence (post-apply, all green)

| Suite | Result |
|---|---|
| packages/ui | 41/41 tests pass |
| apps/admin | 322/322 (8 pre-existing warnings, 0 errors) |
| installer | 20/20 pass |
| root `pnpm typecheck && pnpm lint` | 5/5 pass |
| Stale-token grep (`251.9`, `#4B2AD1`, `40px` font-size across both apps) | clean |

Source of the counts: orchestrator final-state facts (launch prompt). No native review gate exists (review disabled in this repo); no CRITICAL verification issues were ever recorded for this change.

## Task Completion Gate

`tasks.md` (now archived) has **38/38 tasks checked `[x]`, 0 unchecked** — both the original infra slices A–E and the 15 light-first correction items. Gate passes; no stale-checkbox reconciliation was required.

## Spec Sync (Step 2)

Delta specs were corrected to the LIGHT-FIRST final state (per design D13) BEFORE syncing, so both the archived delta specs and the live main specs describe the final state:

| Domain | Action | Details |
|---|---|---|
| `design-system` | Created (main spec did not exist) | Full spec synced mechanically; stale dark-first text (`#4B2AD1`, violet framing) replaced with authoritative tokens: primary `#5d5fef` (`239.2 82% 65.1%`), nav active `#7364ff` (`245.8 100% 69.6%`), content bg `#f5f5fa` (`240 33.3% 97.1%`), border `#e2e8f0` (`214.3 31.8% 91.4%`), white card, foreground `#1e293b`, table head `#f8fafc`, muted-foreground `#a9b0ba`. Added "Light-first Sizing Language" requirement (52px buttons `rounded-[9px]`, pills `rounded-[20px]`, tables in card `rounded-[12px]`); Shared Primitives now lists 7 primitives incl. Input (D7). |
| `admin-shell` | Updated (merge) | "Persistent Sidebar Layout" MODIFIED (brand header + section labels + badge pills); "Topbar Layout" ADDED (h-[100px] bg-white, scoped over content, search w-[372px]); "PageHeader Sizing" ADDED (32px bold title `#1e293b`, 14px chevron breadcrumb — corrected from the stale 40px diagnosis). Root Route Redirect, Route Tree, and Query Keys for Ordenes preserved unchanged. |

Merge readback: `diff -r` between delta and new main spec for `design-system` was empty (passing). Admin-shell main spec verified by read; non-delta requirements preserved.

## Archive Contents (Step 3/4)

- `proposal.md` ✅ (historical — still references the pre-correction `#4B2AD1` plan; the correction is documented in `design.md`)
- `specs/design-system/spec.md` ✅ (light-first corrected)
- `specs/admin-shell/spec.md` ✅ (light-first corrected)
- `design.md` ✅ (227 lines, rewritten light-first, D1–D13; D13 mandates this archive-time spec sync)
- `explore.md` ✅
- `tasks.md` ✅ (38/38 complete)
- `archive-report.md` ✅ (this file — additive, excluded from the mechanical readback)

Mechanical move used `git mv` (fallback to `mv` available). Readback `diff -r` (pre-move snapshot vs archived folder) was EMPTY — byte-identical. Active changes directory no longer contains this change.

## Files NOT Touched (compliance)

- `apps/admin/src/components/tareas/*`
- `openspec/changes/atomic-stock-work-resolution/`
- `openspec/changes/archive/2026-08-12-unify-work-tracking-model/`
- `supabase/migrations/20260812000059_*` and `20260812000060_*`
- `openspec/specs/ordenes-admin/spec.md`, `openspec/specs/tickets/spec.md` (sibling unify-work-tracking changes)

No git commit was created for the archive — the working tree is left for the user's review (staged rename of `tasks.md` from `git mv` included; no commit).

## Open Items (carried from design.md, not blockers)

- D3 ratification: packages/ui dependency entries are a relocation, not new third-party libraries.
- Ordenes in-progress badge: single cached shell query confirmed as the minimal count.
- D12 accepted: dark stays as opt-out; light-first is the system.
- Tareas table class alignment deferred to sibling `atomic-stock-work-resolution`.

## Next

`ui-visual-language` cycle complete (planned → implemented → verified → archived). Next candidate: `atomic-stock-work-resolution` (currently active, untouched).
