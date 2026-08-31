# Proposal: Collapsible Admin Sidebar

## Intent

The admin sidebar is fixed at 240px and cannot be collapsed. On smaller desktop viewports or when working in data-heavy tables, users lose ~180px of content width with no way to reclaim it. This change makes the sidebar collapsible between 240px (expanded: icons + labels) and 64px (collapsed: icons only + tooltips), giving users control over their workspace layout.

## Scope

### In Scope
- Icon Rail pattern: sidebar toggles between 240px and 64px
- Toggle button at the bottom of the sidebar (chevron icon rotates)
- `useSidebarCollapsed` hook with localStorage persistence and `Ctrl+\` keyboard shortcut
- Tooltip component (`@radix-ui/react-tooltip`) for collapsed nav items
- Collapsed state hides: nav labels, badge pills, section group labels, user menu text (avatar-only)
- Accessibility: `aria-pressed`, `aria-expanded`, `aria-label` on toggle, `motion-reduce:transition-none`
- Tests for collapsed and expanded states

### Out of Scope
- Installer app sidebar (different layout, separate concern)
- Responsive behavior at `md` breakpoint (sidebar already hidden on mobile)
- Sidebar width customization beyond the two fixed states
- Animation/transitions beyond the width toggle (e.g., staggered label fade)

## Capabilities

### New Capabilities
- `sidebar-tooltip`: Radix Tooltip primitive for collapsed nav item hover labels

### Modified Capabilities
- `admin-shell`: Persistent Sidebar Layout requirement gains collapsed/expanded states, toggle button, and keyboard shortcut
- `design-system`: SidebarGroup pattern component gains `collapsed` prop to hide section labels

## Approach

Icon Rail pattern — explicit user-controlled toggle, not automatic responsive collapse.

1. **Hook** (`useSidebarCollapsed`): reads/writes `localStorage("vitalock-sidebar-collapsed")`, returns `[collapsed, toggle]`. Catches localStorage errors silently. Registers `Ctrl+\` global shortcut.
2. **Sidebar.tsx**: accepts `collapsed` prop, applies `w-[240px]` or `w-[64px]` with `transition-[width]`. Renders a toggle button at the bottom. Passes `collapsed` down to `SidebarNav` and `UserMenu`.
3. **NavItem.tsx**: when `collapsed`, hides label and badge, wraps icon in a `Tooltip` with the label as content.
4. **UserMenu.tsx**: when `collapsed`, renders avatar-only (no name/email text).
5. **SidebarGroup.tsx**: when `collapsed`, hides the group label text.
6. **AppShell.tsx**: calls `useSidebarCollapsed()` and passes state to `Sidebar`.
7. **New Tooltip** (`packages/ui`): shadcn-style Radix Tooltip, exported from `@vitalock/ui`.
8. **New dependency**: `@radix-ui/react-tooltip` added to `packages/ui`.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `apps/admin/src/components/layout/Sidebar.tsx` | Modified | Conditional width, toggle button, prop passthrough |
| `apps/admin/src/components/layout/NavItem.tsx` | Modified | Hide label/badge when collapsed, wrap in Tooltip |
| `apps/admin/src/components/layout/UserMenu.tsx` | Modified | Avatar-only variant when collapsed |
| `apps/admin/src/components/layout/AppShell.tsx` | Modified | Use hook, pass collapsed to Sidebar |
| `packages/ui/src/components/patterns/SidebarGroup.tsx` | Modified | Hide group labels when collapsed |
| `packages/ui/src/index.ts` | Modified | Export Tooltip |
| `apps/admin/src/components/layout/__tests__/Sidebar.test.tsx` | Modified | Collapsed state tests |
| `apps/admin/src/components/layout/__tests__/AppShell.test.tsx` | Modified | Layout tests for both states |
| `apps/admin/src/hooks/useSidebarCollapsed.ts` | New | Hook with localStorage + Ctrl+\ shortcut |
| `packages/ui/src/components/tooltip.tsx` | New | Radix Tooltip primitive |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| localStorage unavailable (SSR, private browsing quota) | Low | `useSidebarCollapsed` catches errors, defaults to expanded |
| Ctrl+\ conflicts with other shortcuts | Low | Standard toggle shortcut; users can override via browser |
| Tooltip z-index conflicts with sidebar overlays | Low | Use Radix Tooltip's built-in portal + z-index management |
| rapid toggle causes layout jitter | Low | CSS transition on width only, no JS layout recalc |

## Rollback Plan

1. Revert the commit(s) introducing the change
2. Remove `@radix-ui/react-tooltip` from `packages/ui/package.json` if added
3. No database migrations involved — purely frontend, zero data risk
4. localStorage key `vitalock-sidebar-collapsed` is inert without the hook

## Dependencies

- `@radix-ui/react-tooltip` — new runtime dependency for `packages/ui`

## Success Criteria

- [ ] Sidebar collapses to 64px and expands to 240px with a smooth width transition
- [ ] Toggle button rotates chevron icon to indicate state
- [ ] Nav labels and badge pills hide when collapsed, show when expanded
- [ ] Collapsed nav items show Radix Tooltip with label on hover
- [ ] User menu shows avatar-only when collapsed
- [ ] Section group labels hide when collapsed
- [ ] `Ctrl+\` toggles sidebar from anywhere in the admin app
- [ ] State persists across page reloads via localStorage
- [ ] `aria-pressed` on toggle, `aria-expanded` on sidebar, `aria-label` on toggle button
- [ ] `motion-reduce:transition-none` disables transition for reduced-motion users
- [ ] Existing sidebar tests pass; new collapsed-state tests pass
- [ ] No regression on mobile (sidebar remains hidden at `md` breakpoint)
