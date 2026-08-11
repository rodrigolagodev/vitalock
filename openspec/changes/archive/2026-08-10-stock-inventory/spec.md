# Stock Inventory — Change Spec

**Change**: stock-inventory
**Date**: 2026-08-10
**Delivery**: single-pr (800-line budget)

## Capabilities

| Capability | Type | Spec file |
|---|---|---|
| stock-inventory | New | specs/stock-inventory/spec.md |
| support-tickets | Delta | specs/support-tickets/spec.md |
| sales-orders | Delta | specs/sales-orders/spec.md |
| key-configuration | Delta | specs/key-configuration/spec.md |

## Non-Goals (Explicit)

The following are explicitly OUT OF SCOPE for this change:

- Minimum stock thresholds and low-stock alerts
- Supplier or purchase-order management
- Multiple warehouse locations
- Stock reports and analytics dashboards
- Delivery notes / shipping documents
- Lot tracking, expiration dates, serial-number-per-unit ledger (beyond equipment serial at installation)

## Requirement Summary

### New: stock-inventory

| # | Requirement | Scenarios |
|---|---|---|
| R1 | Product Catalog | 4 |
| R2 | Stock Movement Ledger | 3 |
| R3 | Derived Counters | 3 |
| R4 | Reservation Idempotency | 1 |
| R5 | Cargar Producto Sidesheet (UI) | 3 |
| R6 | Product List View | 2 |
| R7 | Product Detail View | 2 |
| R8 | RLS for Stock Tables | 2 |
| R9 | Audit Trail | 1 |
| R10 | Sidebar and Route Integration | 2 |

### Delta: support-tickets

| # | Requirement | Change | Scenarios |
|---|---|---|---|
| A1 | Extended Ticket Categories | ADDED | 2 |
| A2 | Key Configuration Task Auto-Creation | ADDED | 3 |
| A3 | Equipment Installation Task Auto-Creation | ADDED | 1 |
| A4 | Resolution Chain (key_configuration → key_installation) | ADDED | 3 |
| A5 | Equipment Installation Resolution Side-Effect | ADDED | 2 |

### Delta: sales-orders

| # | Requirement | Change | Scenarios |
|---|---|---|---|
| A1 | order_items.product_id Nullable FK | ADDED | 2 |
| A2 | Reservation Lifecycle on Order Events | ADDED | 4 |

### Delta: key-configuration

| # | Requirement | Change | Scenarios |
|---|---|---|---|
| M1 | Configure Key Item (ConfigureKeyItemSheet) | MODIFIED | 7 |

## Total: 10 new requirements, 5 ticket additions, 2 order additions, 1 modified requirement. 46 scenarios.
