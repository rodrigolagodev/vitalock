# Stock Inventory Specification

**Change**: stock-inventory
**Domain**: stock-inventory
**Type**: New (no prior spec)
**Date**: 2026-08-10

## Purpose

Defines the product catalog, stock movement ledger, reservation lifecycle, and the admin inventory UI (`/stock`). This is the authoritative source of truth for every unit that enters or exits the warehouse.

## Requirements

### Requirement: Product Catalog

The system MUST maintain a `public.products` catalog table with columns: `id`, `name`, `category` (enum: `rfid_key`, `equipment`), `cost_price` (current unit cost), `stock_total` (derived), `stock_reservado` (derived), `updated_at`. Product names MUST be unique per category (composite UNIQUE constraint). Deleting a product MUST be blocked while any `stock_movements` row references it.

#### Scenario: Create product — unique name per category

- GIVEN no product named "RFID-A" exists in category `rfid_key`
- WHEN admin creates a product with name "RFID-A", category `rfid_key`
- THEN the product is persisted with `stock_total = 0`, `stock_reservado = 0`
- AND the product appears in the product list

#### Scenario: Duplicate name within same category is rejected

- GIVEN a product named "RFID-A" in `rfid_key` already exists
- WHEN admin attempts to create another product named "RFID-A" in `rfid_key`
- THEN the DB returns a uniqueness error (SQLSTATE 23505)
- AND a toast describes the conflict in Spanish

#### Scenario: Same name allowed in different category

- GIVEN a product named "Kit X" exists in category `rfid_key`
- WHEN admin creates a product named "Kit X" in category `equipment`
- THEN the product is persisted successfully

#### Scenario: Delete blocked while movements exist

- GIVEN a product has at least one `stock_movements` row
- WHEN admin attempts to delete the product
- THEN the DB blocks the deletion (FK or trigger guard)
- AND the product remains in the catalog

---

### Requirement: Stock Movement Ledger

The system MUST maintain `public.stock_movements` as an append-only ledger. Every insert MUST record: `id`, `product_id`, `type`, `quantity` (absolute, positive integer), `unit_cost` (nullable), `order_item_id` (nullable FK), `ticket_id` (nullable FK), `note` (nullable), `created_by` (staff_id from JWT), `created_at`. Movements MUST NOT be updated or deleted — a DB trigger MUST reject any UPDATE or DELETE attempt.

Movement types and their sign semantics:

| Type | Semantic | `unit_cost` required |
|---|---|---|
| `compra` | ingreso + | YES |
| `devolucion` | ingreso + | YES |
| `ajuste_manual` (positive qty) | ingreso + | NO |
| `egreso_grabacion` | egreso − | NO |
| `egreso_instalacion` | egreso − | NO |
| `ajuste_manual` (negative qty) | egreso − | NO |
| `baja_defectuoso` | egreso − | NO |
| `baja_perdida` | egreso − | NO |
| `reserva` | reserves stock | NO |
| `liberacion_reserva` | releases reservation | NO |

#### Scenario: Ingreso movement emitted via Cargar producto

- GIVEN a product exists with `stock_total = 5`
- WHEN admin submits a `compra` with qty=10, unit_cost=150
- THEN a `stock_movements` row is created with type=`compra`, quantity=10, unit_cost=150
- AND `products.stock_total` becomes 15
- AND `products.updated_at` is refreshed

#### Scenario: Movement immutability enforced

- GIVEN a `stock_movements` row exists
- WHEN any process attempts UPDATE or DELETE on that row
- THEN the DB trigger rejects the operation
- AND the row remains unchanged

#### Scenario: Ajuste manual with negative quantity recorded as egreso

- GIVEN a product has `stock_total = 10`
- WHEN admin emits `ajuste_manual` with quantity = -3
- THEN `products.stock_total` becomes 7

---

### Requirement: Derived Counters

`products.stock_total` MUST equal the signed sum of all movements for that product (`ingresos` + `ajuste_manual(+)` − `egresos` + `ajuste_manual(−)`). `products.stock_reservado` MUST equal `SUM(reserva) − SUM(liberacion_reserva) − SUM(definitive egresos that consumed a reservation)`. Both counters MUST be maintained by a trigger on `stock_movements` inserts. `disponible` (= `stock_total − stock_reservado`) MUST NEVER go negative: a manual adjustment that would drive it negative MUST be rejected by the DB (`products_reservado_le_total` CHECK) and surfaced to the admin as a friendly error — oversell is blocked by design (decision recorded in `design.md`).

#### Scenario: Counters reconcile after multiple movements

- GIVEN product P has 2 `compra` (qty 10 each) and 1 `egreso_grabacion` (qty 3)
- WHEN the UI loads the product detail
- THEN `stock_total = 17`, `stock_reservado = 0`, `disponible = 17`

#### Scenario: Reservation reduces disponible

- GIVEN product P has `stock_total = 10`, `stock_reservado = 0`
- WHEN a `reserva` movement of qty=2 is inserted
- THEN `stock_reservado = 2` and `disponible = 8`

#### Scenario: Ajuste that would drive disponible negative is rejected

- GIVEN product P has `stock_total = 5`, `stock_reservado = 5`, `disponible = 0`
- WHEN admin emits `ajuste_manual` with quantity = -2
- THEN the movement is NOT inserted (CHECK `products_reservado_le_total` blocks it)
- AND the admin sees a friendly error explaining the operation was rejected because it would make disponible negative (oversell is blocked by design)

---

### Requirement: Reservation Idempotency

A `reserva` movement MUST be idempotent per `(order_item_id, type)`. A partial UNIQUE index on `stock_movements(order_item_id, type) WHERE type = 'reserva'` MUST prevent a second `reserva` for the same order_item. Duplicate trigger fires MUST NOT double-count.

#### Scenario: Duplicate reserva trigger is a no-op

- GIVEN a `reserva` movement already exists for order_item 42
- WHEN the reservation trigger fires again for the same order_item
- THEN no new `stock_movements` row is inserted (UNIQUE conflict silently absorbed)
- AND `stock_reservado` is unchanged

---

### Requirement: Cargar Producto Sidesheet (UI)

The admin MUST be able to open a `CargarProductoSheet` in two modes:
1. **Existing product**: select product by name/id, enter qty + unit_cost → emits `compra` movement.
2. **New product**: enter name + category + qty + unit_cost → creates product row + first `compra` movement in one atomic operation.

Product name uniqueness per category MUST be validated client-side (immediate) and server-side (on submit). The form MUST reject qty ≤ 0 and unit_cost ≤ 0.

#### Scenario: Load compra into existing product

- GIVEN admin opens CargarProductoSheet in "existing" mode
- WHEN admin selects product "RFID-A", enters qty=5, unit_cost=200 and submits
- THEN a `compra` movement is created
- AND `products.stock_total` increments by 5

#### Scenario: New product created with first compra

- GIVEN no product named "Lector-Z" exists in `equipment`
- WHEN admin enters name "Lector-Z", category `equipment`, qty=3, unit_cost=500 and submits
- THEN a `products` row is created
- AND a `compra` movement of qty=3 is created atomically
- AND the new product appears in the list

#### Scenario: Duplicate name client-side warning

- GIVEN product "RFID-A" in `rfid_key` exists
- WHEN admin types "RFID-A" in the new-product name field and selects `rfid_key`
- THEN a client-side warning is shown before submit
- AND the form is still submittable (server is the authoritative gate)

---

### Requirement: Product List View

`/stock` MUST display a product list table with columns: name, category badge, `stock_total`, `stock_reservado`, `disponible`, `updated_at`, edit button. The list MUST support:
- Category filter (single-select pill)
- Name search (client-side substring match, no debounce required)

The list MUST show a skeleton during loading and distinguish "no products" from "no filter results".

#### Scenario: Category filter narrows list

- GIVEN products exist in both `rfid_key` and `equipment`
- WHEN admin selects the `rfid_key` filter pill
- THEN only `rfid_key` products are shown

#### Scenario: Name search filters inline

- GIVEN products "RFID-A" and "RFID-B" and "Lector-Z" are in the list
- WHEN admin types "RFID" in the search input
- THEN only "RFID-A" and "RFID-B" are displayed

---

### Requirement: Product Detail View

`/stock/:productId` MUST display:
- Editable product form: name, category, cost_price (submit updates the product row)
- Movement history table with columns: type, quantity (signed), unit_cost (if applicable), reference (order/ticket/staff link), note, created_at, created_by
- Client-side filters on the history table: by movement type (multi-select), by date range

#### Scenario: Edit product name and save

- GIVEN admin is on `/stock/123`
- WHEN admin changes the product name to "RFID-A v2" and submits
- THEN `products.name` is updated
- AND `products.updated_at` is refreshed

#### Scenario: Movement history filter by type

- GIVEN product P has movements of types `compra`, `reserva`, `egreso_grabacion`
- WHEN admin filters history by type=`compra`
- THEN only `compra` rows are shown

---

### Requirement: RLS for Stock Tables

`public.products` and `public.stock_movements` MUST be readable by any authenticated admin role. Inserts into `stock_movements` and updates to `products` MUST require admin or staff role (using `identity.is_admin()` as the RLS guard, mirroring `support.tickets` RLS from migration `20260808000015_rls_real_policies.sql`). Installer role MUST NOT have SELECT access to either table.

#### Scenario: Admin reads product list

- GIVEN a user authenticated as admin
- WHEN they query `public.products`
- THEN rows are returned

#### Scenario: Installer denied access to products

- GIVEN a user authenticated as installer
- WHEN they query `public.products`
- THEN zero rows are returned (RLS filters all)

---

### Requirement: Audit Trail

Every `stock_movements` row MUST record `created_by` (staff_id extracted from JWT). `products.updated_at` MUST be refreshed by a trigger on every product mutation. Movements MUST be immutable (enforced by trigger — see Movement Ledger requirement).

#### Scenario: created_by captured on movement insert

- GIVEN staff member S (id=99) is authenticated
- WHEN S submits a `compra` movement
- THEN `stock_movements.created_by = 99`

---

### Requirement: Reservation Lifecycle on Order Events

The system MUST automatically manage stock reservations tied to order lifecycle events:

1. **On `confirm_order` RPC** (not on item insert): emit a `reserva` movement for every order_item with item_type `key` or `equipment` and a non-null `product_id`.
2. **On order cancel** (from `confirmed` or `in_progress`): emit `liberacion_reserva` for every `reserva` movement with no paired definitive egreso (pending reservations only). Cancellation from `draft` requires no cleanup.
3. Reservations MUST be idempotent: a duplicate trigger fire MUST NOT produce a second `reserva` (enforced by partial UNIQUE index on `(order_item_id, type) WHERE type = 'reserva'`).

(Previously: reservations were emitted by the `order_items_create_tarea` trigger on item INSERT, regardless of parent order status. Now they are emitted only on explicit confirmation.)

#### Scenario: Reservation emitted on confirm_order for key item

- GIVEN product P has `stock_reservado = 0`
- WHEN `confirm_order` is called on a draft order containing a key item with product_id=P.id, quantity=2
- THEN a `reserva` movement of qty=2 is created for product P
- AND `stock_reservado` becomes 2

#### Scenario: No reservation emitted on order_item insert into draft order

- GIVEN a draft order and product P with `stock_reservado = 0`
- WHEN an order_item with item_type=`key`, product_id=P.id is inserted into the draft order
- THEN no `reserva` movement is created
- AND `stock_reservado` remains 0

#### Scenario: Particular order item reservation emitted on confirm

- GIVEN a draft order with `administration_id = NULL` (particular) and a key item with product_id=P.id
- WHEN `confirm_order` is called
- THEN a `reserva` movement is created (particular orders are NOT exempt)

#### Scenario: Order cancellation from confirmed releases pending reservations

- GIVEN order O has status `confirmed` and an order_item with a `reserva` movement and no paired egreso
- WHEN order O status is set to `cancelled`
- THEN a `liberacion_reserva` movement is created for each pending reserva
- AND `stock_reservado` decrements accordingly

#### Scenario: Egreso-consumed reservations are NOT re-released on cancel

- GIVEN an order_item has a `reserva` and a paired `egreso_grabacion`
- WHEN the parent order is cancelled
- THEN no `liberacion_reserva` is emitted for that item (already consumed)

#### Scenario: Idempotent confirm — duplicate reserva blocked

- GIVEN a `reserva` movement already exists for order_item 42 (from a prior confirm attempt)
- WHEN the confirm transaction fires the reservation trigger again for the same order_item
- THEN no new `stock_movements` row is inserted (UNIQUE conflict silently absorbed)
- AND `stock_reservado` is unchanged

---

### Requirement: Sidebar and Route Integration

The admin sidebar MUST include a new "Stock" section (or "Inventario > Stock" sub-item) with a NavItem pointing to `/stock`. The sidebar sections MUST follow the established `NavSection` + `NavItem` pattern from `Sidebar.tsx`. `/stock` and `/stock/:productId` MUST be registered in `main.tsx` route tree as authenticated-only routes.

#### Scenario: Stock link visible in sidebar

- GIVEN an admin is authenticated
- WHEN they view the sidebar
- THEN a "Stock" or "Inventario" NavItem is present and navigates to `/stock`

#### Scenario: Deep link to product detail

- GIVEN a user navigates directly to `/stock/123`
- WHEN the route resolves
- THEN StockDetailPage renders with the sidebar visible
