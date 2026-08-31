# Delta for Design System

## MODIFIED Requirements

### Requirement: Pattern Components

`packages/ui` MUST provide SidebarGroup, SectionHeading, SearchInput, Topbar, and Tooltip as reusable components, each covered by a Vitest test (strict_tdd). SidebarGroup MUST accept an optional `collapsed` boolean prop; when `true`, section labels inside the group MUST be hidden. Tooltip MUST be a Radix-based primitive accepting `content`, `children`, and `side` (default `"right"`).
(Previously: SidebarGroup had no `collapsed` prop; Tooltip did not exist)

#### Scenario: Pattern suite passes

- GIVEN pattern components are implemented
- WHEN `pnpm test` runs
- THEN each has at least one passing test

#### Scenario: SidebarGroup hides labels when collapsed

- GIVEN a SidebarGroup with `collapsed={true}`
- WHEN the component renders
- THEN section label text is hidden
- AND nav items remain visible as icon-only

#### Scenario: SidebarGroup shows labels when expanded

- GIVEN a SidebarGroup with `collapsed={false}`
- WHEN the component renders
- THEN section label text is visible above nav items
