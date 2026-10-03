# Delta for design-system

## MODIFIED Requirements

### Requirement: Pagination on Every Table

Every DataTable instance MUST render the pagination footer (`paginated` defaults true): "start–end de total", rows-per-page select, prev/next with aria-labels; prev disabled on the first page, next on the last; small lists still render the footer with disabled navigation. Page-reset on data change MUST be built in: when `rows` change (filter/search), page resets to 1 and page size to DEFAULT_PAGE_SIZE.

DataTable MUST additionally accept an optional `footer` slot (ReactNode). When provided, the slot MUST render inside the table as a footer region OUTSIDE the paginated body: it MUST NOT be sliced, counted or reordered by pagination, and it MUST remain visible on every page, including when `rows` is empty. When `footer` is omitted, DataTable output MUST be unchanged. The slot MUST be independent of the pagination footer (both render when both apply).

#### Scenario: Page resets when the filter changes

- GIVEN a table with 25 rows on page 3 with an active filter
- WHEN the filter changes the row set
- THEN the page resets to 1 and the page size resets to the default

#### Scenario: Footer slot stays visible across pages

- GIVEN a paginated DataTable with 25 rows and a `footer` slot
- WHEN the user navigates from page 1 to page 2
- THEN the footer content is rendered on both pages
- AND the footer is not part of the paginated row count ("start–end de total" counts rows only)

#### Scenario: Footer slot renders with no rows

- GIVEN a DataTable with zero rows and a `footer` slot
- WHEN it renders
- THEN the footer content is still rendered

#### Scenario: No footer slot leaves output unchanged

- GIVEN a DataTable without a `footer` prop
- WHEN it renders
- THEN no footer region is added and the pagination footer behaves as before
