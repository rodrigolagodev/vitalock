# Tasks: Collapsible Admin Sidebar

## Review Workload Forecast

Decision needed before apply: Yes
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: Low

| Field | Value |
|-------|-------|
| Estimated changed lines | 350–450 |
| Suggested split | Single PR |
| Delivery strategy | single-pr |

### Suggested Work Units

| Unit | Goal | PR | Test command | Runtime harness | Rollback boundary |
|------|------|----|-------------|-----------------|-------------------|
| 1 | Collapsible sidebar (all) | Single | `pnpm --filter @vitalock/ui test && pnpm --filter admin test` | `pnpm --filter admin dev` | All files + `@radix-ui/react-tooltip` in package.json |

## Phase 1: Tooltip + Dependency

- [x] 1.1 Add `@radix-ui/react-tooltip` to `packages/ui/package.json`, run `pnpm install`
- [x] 1.2 Create `packages/ui/src/components/tooltip.tsx` — Radix Tooltip wrapper: `content`, `children`, `side` (default `"right"`), `sideOffset={8}`, `delayDuration={300}`
- [x] 1.3 Export `Tooltip, TooltipTrigger, TooltipContent, TooltipProvider` from `packages/ui/src/index.ts`
- [x] 1.4 Test: `packages/ui/src/components/__tests__/tooltip.test.tsx` — renders, shows content, respects `side`

## Phase 2: Hook

- [x] 2.1 Create `apps/admin/src/hooks/useSidebarCollapsed.ts` — `[collapsed, toggle]`; localStorage read/write; catches errors; `Ctrl+\` global shortcut
- [x] 2.2 Test: `apps/admin/src/hooks/__tests__/useSidebarCollapsed.test.ts` — default false, persists, restores, shortcut, error fallback

## Phase 3: SidebarGroup

- [x] 3.1 Add `collapsed?: boolean` to `SidebarGroupProps` in `packages/ui/src/components/patterns/SidebarGroup.tsx`
- [x] 3.2 Conditionally hide `<p>` label when `collapsed={true}`
- [x] 3.3 Add/verify tests: labels visible expanded, hidden collapsed

## Phase 4: NavItem

- [x] 4.1 Add `collapsed?: boolean` to `NavItemProps` in `apps/admin/src/components/layout/NavItem.tsx`
- [x] 4.2 Hide `<span>{label}</span>` and badge via conditional render when collapsed
- [x] 4.3 Wrap `<NavLink>` in `Tooltip` when collapsed: `content={label}`, `side="right"`, `sideOffset={8}`
- [x] 4.4 Adjust NavLink for collapsed: center icon, `justify-center`, `w-12 h-12`

## Phase 5: UserMenu

- [x] 5.1 Add `collapsed?: boolean` to `UserMenu` in `apps/admin/src/components/layout/UserMenu.tsx`
- [x] 5.2 When collapsed: hide name/email/ChevronsUpDown, avatar-only, center initials, fit 64px width

## Phase 6: Sidebar + SidebarNav

- [x] 6.1 Add `collapsed?: boolean` to `SidebarProps` and `SidebarNavProps` in `apps/admin/src/components/layout/Sidebar.tsx`
- [x] 6.2 `Sidebar`: `w-[64px]` collapsed / `w-[240px]` expanded; `transition-[width] duration-300 ease-in-out motion-reduce:transition-none`; `aria-expanded` on `<aside>`
- [x] 6.3 `SidebarNav`: pass `collapsed` to `SidebarGroup`, `NavItem`, `UserMenu`; adjust brand header for collapsed
- [x] 6.4 `SidebarNav`: add toggle button — `ChevronLeft` icon, rotate when collapsed, `aria-label="Toggle sidebar"`, `aria-pressed={collapsed}`
- [x] 6.5 `SidebarNav`: adjust nav `px-4` to `px-2` when collapsed; verify `MobileSidebar` unaffected (no prop)

## Phase 7: AppShell

- [x] 7.1 In `apps/admin/src/components/layout/AppShell.tsx`: call `useSidebarCollapsed()`, pass `collapsed` to `<Sidebar>`
- [x] 7.2 Verify `<MobileSidebar />` receives no collapsed prop

## Phase 8: Tests

- [x] 8.1 `Sidebar.test.tsx`: collapsed has `w-[64px]`, expanded `w-[240px]`, `aria-expanded`, labels hidden collapsed, toggle button with `aria-pressed`
- [x] 8.2 `AppShell.test.tsx`: defaults expanded, toggle collapses
- [x] 8.3 Run `pnpm --filter @vitalock/ui test && pnpm --filter admin test` — all pass

## Phase 9: Manual Verification

- [ ] 9.1 `pnpm --filter admin dev` — toggle, width transition, tooltips, avatar-only, `Ctrl+\`
- [ ] 9.2 Mobile sidebar unaffected; `prefers-reduced-motion` disables transition
