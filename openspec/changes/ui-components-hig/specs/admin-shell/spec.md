# Delta for Admin Shell

**Change**: ui-components-hig
**Date**: 2026-10-05

## MODIFIED Requirements

### Requirement: PageHeader Sizing

PageHeader MUST render breadcrumbs and the page title on the F0 type ladder: the title MUST use `text-title-1` (no `text-[32px]` or `leading-[40px]` arbitrary values) in the foreground colour, and the breadcrumb text MUST keep its small size with chevron-right separators sized `h-3.5 w-3.5` (14px) so they sit in proportion with the `text-footnote` breadcrumb text. The breadcrumb nav (`aria-label="Breadcrumb"`) and the `h1` heading MUST be preserved.

(Previously: title `text-[32px] font-bold leading-[40px]`, breadcrumb `text-[14px]`, chevrons `h-6`.)

#### Scenario: Header title uses the ladder

- GIVEN a page uses PageHeader with a title
- WHEN the `h1` renders
- THEN its class list includes `text-title-1`
- AND it includes no `text-[32px]` or `leading-[40px]`

#### Scenario: Breadcrumb chevrons are proportionate

- GIVEN a PageHeader renders with two or more breadcrumb segments
- WHEN the separator icons are inspected
- THEN each includes `h-3.5` and `w-3.5` and none includes `h-6`

#### Scenario: Existing PageHeader roles survive

- GIVEN the sizing change is applied
- WHEN PageHeader renders
- THEN the `aria-label="Breadcrumb"` nav and `h1` roles are unchanged
- AND existing PageHeader tests pass
