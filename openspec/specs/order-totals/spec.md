# Order Totals Specification

## Purpose

IVA-inclusive order totals for key and technical orders: one calculation rule
(sum of `quantity × unit_price` over non-cancelled items) shared by the
server-side `total_amount` view column, the detail item tables, the order
forms and the admin order lists.

## Requirements

### Requirement: Order Total Calculation Rule

The order total MUST equal `sum(quantity × unit_price)` over the order's items whose `status` is not `cancelled`. `unit_price` already includes IVA; no tax breakdown MUST be shown or computed. A line subtotal MUST equal `quantity × unit_price` regardless of item status. An order with no items, only cancelled items, or only zero-price items MUST total 0. A fully cancelled order MUST therefore total 0. Zero-price items MUST contribute 0 and MUST display as `$ 0,00`. A null `unit_price` on the client MUST be treated as 0. Client-side sums MUST be computed in integer cents (no floating-point drift) by shared helpers `lineSubtotal` and `orderTotal` in `packages/shared`, which MUST apply the same cancelled-item filter as the server.

#### Scenario: Sum over active items

- GIVEN an order with items (qty 1, $ 100,00) and (qty 2, $ 50,50)
- WHEN the total is computed
- THEN the total is $ 201,00

#### Scenario: Cancelled items excluded

- GIVEN an order with one active item at $ 100,00 and one cancelled item at $ 40,00
- WHEN the total is computed
- THEN the total is $ 100,00

#### Scenario: Fully cancelled order totals zero

- GIVEN an order whose items are all cancelled
- WHEN the total is computed
- THEN the total is $ 0,00

#### Scenario: Zero-price item

- GIVEN an order with a maintenance item at $ 0,00 and no other items
- WHEN the total is computed
- THEN the item displays "$ 0,00" and the total is $ 0,00

#### Scenario: Null price treated as zero client-side

- GIVEN an item whose `unit_price` is null
- WHEN `lineSubtotal` and `orderTotal` run
- THEN the line subtotal is 0 and the item adds 0 to the total

#### Scenario: Cents arithmetic avoids float drift

- GIVEN three items at $ 0,10 each
- WHEN the total is computed
- THEN the total is exactly $ 0,30

### Requirement: Server-side total_amount on Order Views

The views `key_orders_summary`, `technical_orders_summary` and `all_orders` (both UNION branches) MUST expose `total_amount numeric(12,2)` as the LAST column, equal to the order total per the calculation rule, and MUST never be null (0 for orders without qualifying items). The views MUST retain `security_invoker`, existing columns and existing grants. The value MUST be the whole-order total regardless of any building filter applied to the list query.

#### Scenario: View total matches item sum

- GIVEN a key order with several non-cancelled items
- WHEN `key_orders_summary` is queried
- THEN `total_amount` equals the sum of `quantity × unit_price` over those items

#### Scenario: Orders with no qualifying items

- GIVEN an order with no items, an order with only cancelled items, and an order with only zero-price items
- WHEN each view is queried
- THEN `total_amount` is 0 for all three

#### Scenario: all_orders covers both kinds

- GIVEN one key order and one technical order with items
- WHEN `all_orders` is queried
- THEN each row's `total_amount` equals its own order total

#### Scenario: Grants and invoker RLS preserved

- GIVEN the migration is applied
- WHEN existing grant and RLS pgTAP tests run, and a caller without item visibility queries the views
- THEN grants are unchanged and the totals reflect only the items visible to the caller

### Requirement: Detail Items Tables Show Subtotal and Footer Total

The key order items table MUST show a Subtotal column (line subtotal) for every row. The technical order items table MUST show Precio (unit price) and Subtotal columns. Both tables MUST show the order total ONLY in the DataTable `footer` slot, labelled as the total, and MUST NOT show it in a header StatCard. Cancelled rows MUST show their own line subtotal but MUST be excluded from the footer total. Amounts MUST be formatted as ARS (`$ 0,00` style). The footer MUST remain visible on every page of a paginated table.

#### Scenario: Key items table shows subtotal and footer total

- GIVEN a key order with items (qty 1, $ 100,00) and (qty 1, $ 200,00)
- WHEN the detail items table renders
- THEN each row shows its Subtotal
- AND the footer shows $ 300,00

#### Scenario: Technical items table gains price columns

- GIVEN a technical order with an item at $ 80,00
- WHEN the detail items table renders
- THEN the row shows Precio $ 80,00 and Subtotal $ 80,00
- AND the footer shows $ 80,00

#### Scenario: Cancelled row shown but not summed

- GIVEN an order with an active item at $ 100,00 and a cancelled item at $ 40,00
- WHEN the detail items table renders
- THEN the cancelled row shows its Subtotal $ 40,00
- AND the footer total is $ 100,00

#### Scenario: No header StatCard

- GIVEN any order detail page
- WHEN it renders
- THEN no StatCard for the order total appears in the header

#### Scenario: Footer visible on every page

- GIVEN an items table with more rows than one page
- WHEN the user changes page
- THEN the footer total remains visible and unchanged

### Requirement: TechnicalOrderForm Live Total

TechnicalOrderForm MUST display a live total that updates as items are added, removed or repriced, mirroring KeyOrderForm's total (same helper, same formatting). The total MUST follow the calculation rule and treat missing prices as 0.

#### Scenario: Total updates as items change

- GIVEN a technical order form with one item at $ 80,00
- WHEN the user adds a second item at $ 20,00
- THEN the displayed total changes from $ 80,00 to $ 100,00

#### Scenario: Form matches key form behaviour

- GIVEN equivalent item sets in KeyOrderForm and TechnicalOrderForm
- WHEN both render
- THEN both display the same total formatting and value

### Requirement: Order List Total Column

`LlavesTable`, `ServicioTecnicoTable` and `HistorialTable` MUST show a Total column rendering the server `total_amount` (mapped by `createUseOrderList` and `useAllOrders`, coerced to a number) formatted as ARS. Cancelled orders MUST show `$ 0,00`. When the list is filtered by building, the column MUST show the whole-order total, not a building slice. The value MUST NOT be recomputed client-side from embedded items. The installer app MUST NOT show totals.

#### Scenario: List shows server total

- GIVEN a list row with `total_amount` 300
- WHEN the table renders
- THEN the Total column shows $ 300,00

#### Scenario: Cancelled order shows zero

- GIVEN a cancelled order row with `total_amount` 0
- WHEN the table renders
- THEN the Total column shows $ 0,00

#### Scenario: Building filter keeps whole-order total

- GIVEN a key order with items in buildings A and B totalling $ 500,00, of which $ 200,00 is in building A
- WHEN the key list is filtered by building A
- THEN the order's Total column shows $ 500,00

#### Scenario: Total survives the row cap

- GIVEN more than 1000 orders in the view
- WHEN the list loads
- THEN each returned row's total comes from the server column, independent of embedded items
