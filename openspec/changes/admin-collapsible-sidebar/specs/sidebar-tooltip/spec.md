# Sidebar Tooltip Specification

## Purpose

Radix Tooltip primitive for collapsed sidebar nav item hover labels. Provides accessible, controlled tooltip positioning that respects reduced-motion preferences.

## Requirements

### Requirement: Tooltip Primitive

`packages/ui` MUST export a Tooltip component wrapping `@radix-ui/react-tooltip`. It MUST accept `content` (rendered label), `children` (trigger), and `side` (default `"right"`). It MUST portal to document body with a z-index above sidebar overlays. It SHOULD support `delayDuration` (default 300ms).

#### Scenario: Tooltip appears on hover

- GIVEN a Tooltip wraps a nav icon with content "Administraciones"
- WHEN the user hovers for 300ms
- THEN the tooltip renders in a portal showing "Administraciones"
- AND it positions to the right of the trigger

#### Scenario: Tooltip hidden on reduced motion

- GIVEN the user has `prefers-reduced-motion: reduce`
- WHEN the user hovers over a Tooltip trigger
- THEN the tooltip appears immediately without animation
