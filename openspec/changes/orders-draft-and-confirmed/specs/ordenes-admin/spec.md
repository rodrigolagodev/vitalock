# Delta for Ordenes Admin

## MODIFIED Requirements

### Requirement: Order Status State Machine

Orders MUST follow the state machine:
`draft → confirmed → in_progress → ready_for_pickup → completed → invoiced`;
any non-terminal state → `cancelled`.

The `in_preparation` enum value MUST be removed. The DB MUST enforce that status
transitions are legal (no skip, no reverse from terminal). Specific rules:

- `draft → confirmed`: admin clicks "Confirmar orden" on OrdenDetailPage (keys and technical order types).
- `confirmed → in_progress`: auto-transition via `recompute_order_status` when work begins — for keys orders: first key item reaches `configured`; for technical orders: first ticket enters `in_progress`.
- `in_progress → ready_for_pickup`: auto-transition when all non-cancelled key items reach `status='configured'` (keys orders); technical orders skip this state.
- `ready_for_pickup → completed`: auto-transition when all non-cancelled key items have `picked_up_at` set.
- `completed → invoiced`: manual admin action (unchanged).
- Any non-terminal → `cancelled`: manual "Cancelar orden" button.

(Previously: `draft → in_preparation → ready_for_pickup → completed`; transition from draft was "Iniciar preparación"; `in_preparation` was a valid enum value; `confirmed` and `in_progress` states did not exist in this shape)

#### Scenario: Confirm order transitions draft to confirmed

- GIVEN an order with status `draft`
- WHEN the admin clicks "Confirmar orden"
- THEN order status becomes `confirmed`
- AND the status badge updates on the detail page

#### Scenario: confirmed auto-advances to in_progress on first key configured

- GIVEN a keys order with status `confirmed`
- WHEN the first key item reaches status `configured`
- THEN `recompute_order_status` transitions the order to `in_progress`

#### Scenario: confirmed auto-advances to in_progress on first technical ticket

- GIVEN a technical order with status `confirmed`
- WHEN the first assigned ticket transitions to status `in_progress`
- THEN `recompute_order_status` transitions the order to `in_progress`

#### Scenario: Auto-transition to ready_for_pickup

- GIVEN a keys order in `in_progress` with 2 key items both non-cancelled
- WHEN the last key item reaches `configured`
- THEN the DB trigger fires and order status becomes `ready_for_pickup`
- AND no manual admin action is required

#### Scenario: Cancelled item excluded from auto-transition check

- GIVEN an order in `in_progress` with 1 configured key item and 1 cancelled key item
- WHEN the trigger recomputes
- THEN the order transitions to `ready_for_pickup` (cancelled item excluded)

#### Scenario: All keys picked up completes the order

- GIVEN an order in `ready_for_pickup` with 2 configured key items
- WHEN the last pickup is registered (all items have `picked_up_at` set)
- THEN the order status becomes `completed`

#### Scenario: Cancel order from any non-terminal state

- GIVEN order status is `draft`, `confirmed`, `in_progress`, or `ready_for_pickup`
- WHEN the admin clicks "Cancelar orden" and confirms
- THEN order status becomes `cancelled`

#### Scenario: Cancel blocked on terminal state

- GIVEN order status is `completed`, `invoiced`, or `cancelled`
- WHEN the admin attempts to cancel
- THEN the cancel button is absent or disabled

---

### Requirement: Order List with Filters and Search

OrdenesPage MUST display all orders in a table with columns: order_number,
client name/type, item count, status badge, created_at. The page MUST provide:
(a) status filter pills (`all | draft | confirmed | in_progress | ready_for_pickup |
completed | cancelled`) and (b) a text search input (debounced 300 ms) that
matches `order_number` OR administration `company_name` OR
`particular_full_name` server-side (ILIKE). The table MUST show a skeleton
during loading. The page MUST distinguish "no records exist" from "no results
match the current filter".

(Previously: status filter pills included `in_preparation` and excluded `confirmed` and `in_progress`)

#### Scenario: Status filter narrows list

- GIVEN orders exist in multiple statuses
- WHEN the admin clicks the "confirmed" pill
- THEN only orders with status=`confirmed` are shown

#### Scenario: Text search with debounce

- GIVEN orders exist for "Administración ABC" and "Particular García"
- WHEN the admin types "ABC" and waits 300 ms
- THEN only the matching order is shown
- AND no request fires before 300 ms elapses

#### Scenario: Empty state — no records

- GIVEN no orders exist
- WHEN OrdenesPage loads with no filters active
- THEN an empty state with dashed border is shown (not a zero-row table)

#### Scenario: Empty state — no results

- GIVEN orders exist but none match the active filter/search
- WHEN the filtered list resolves
- THEN a "no results" empty state is shown distinguishable from the no-records state

---

## ADDED Requirements

### Requirement: Draft Order Editability

Orders in `draft` status MUST be fully editable via a dedicated edit route
(`/ordenes/:id/editar`). The `update_draft_order_with_items` RPC MUST accept a
header patch and a full items diff (add/remove/update) in a single atomic
transaction. The edit route MUST reuse the `OrdenForm` component shared with
`/ordenes/nueva`. The edit action MUST be absent or disabled for orders in any
status other than `draft`.

#### Scenario: Admin edits a draft order header and items

- GIVEN an order with status `draft`
- WHEN the admin navigates to `/ordenes/:id/editar`, changes the notes field, removes one item, adds another, and saves
- THEN the order header and item list are updated atomically
- AND a success toast is shown
- AND the detail page reflects the changes

#### Scenario: Edit action absent for confirmed order

- GIVEN an order with status `confirmed`
- WHEN OrdenDetailPage renders
- THEN no "Editar" button is visible or enabled

#### Scenario: Partial edit failure leaves order unchanged

- GIVEN the `update_draft_order_with_items` RPC returns an error mid-transaction
- WHEN the mutation completes with failure
- THEN the order and its items are unchanged
- AND an error toast is shown

---

### Requirement: Confirm Order RPC — Atomic Commitment

The `confirm_order(order_id uuid)` RPC MUST:
1. Validate that the order is in `draft` status; reject otherwise.
2. Atomically transition status to `confirmed`.
3. Create `support.tickets` rows for all technical order items.
4. Write negative `reserva` movements to `stock_movements` for all key items
   with a non-null `product_id`.
5. Roll back the entire transaction on any failure.

The RPC MUST be idempotent-safe: a second call on the same order MUST fail with
a clean error (not create duplicate tickets or reservations).

#### Scenario: Confirm order creates tickets and reservations atomically

- GIVEN a draft order with 1 technical item and 1 key item (product_id non-null)
- WHEN `confirm_order` is called
- THEN order status becomes `confirmed`
- AND a `support.tickets` row is created for the technical item
- AND a `reserva` movement is created for the key item
- AND all three writes are in the same transaction

#### Scenario: Confirm rejected for non-draft order

- GIVEN an order with status `confirmed`
- WHEN `confirm_order` is called again
- THEN the RPC returns an error
- AND no duplicate tickets or reservations are created

#### Scenario: Confirm rolls back on ticket creation failure

- GIVEN a draft order where ticket creation would fail (e.g., FK violation)
- WHEN `confirm_order` executes
- THEN no status change, no ticket, and no reservation are persisted

---

### Requirement: No Side Effects in Draft

Orders in `draft` status MUST NOT have associated `support.tickets` rows or
`stock_movements` reservation rows. The `order_items_create_tarea` trigger MUST
NOT create tickets or reservations when the parent order's status is `draft`.

#### Scenario: Item inserted into draft order produces no tickets

- GIVEN a draft order
- WHEN an order_item is inserted
- THEN no `support.tickets` row is created for that item

#### Scenario: Item inserted into draft order produces no reservation

- GIVEN a draft order with an item with item_type=`key` and product_id non-null
- WHEN the item is inserted
- THEN no `reserva` movement is created for that item

---

### Requirement: Cancellation Cleanup by Status

Cancellation from `draft` MUST require no cleanup (no side effects exist).
Cancellation from `confirmed` or `in_progress` MUST release all pending stock
reservations via the existing `cancel_order_releases_reservations` mechanism.

#### Scenario: Cancel draft order requires no reservation cleanup

- GIVEN an order with status `draft` and one key item (product_id non-null)
- WHEN the order is cancelled
- THEN no `liberacion_reserva` movement is created
- AND order status becomes `cancelled`

#### Scenario: Cancel confirmed order releases reservations

- GIVEN an order with status `confirmed` and one key item with a `reserva` movement
- WHEN the order is cancelled
- THEN a `liberacion_reserva` movement is created for that item
- AND `stock_reservado` decrements accordingly
- AND order status becomes `cancelled`

---

### Requirement: OrdenDetailPage Action Visibility

OrdenDetailPage MUST display actions conditionally based on order status:

| Action | Visible when |
|---|---|
| "Confirmar orden" | status = `draft` |
| "Editar" | status = `draft` |
| "Cancelar orden" | status is non-terminal |
| "Marcar facturada" | status = `completed` |

The "Iniciar preparación" action MUST be removed.

#### Scenario: Draft order shows confirm and edit actions

- GIVEN an order with status `draft`
- WHEN OrdenDetailPage renders
- THEN "Confirmar orden" and "Editar" buttons are visible
- AND "Iniciar preparación" is absent

#### Scenario: Confirmed order shows only cancel action

- GIVEN an order with status `confirmed`
- WHEN OrdenDetailPage renders
- THEN "Cancelar orden" is visible
- AND "Confirmar orden" and "Editar" are absent

---

### Requirement: Draft Edit Concurrency Guard

The `update_draft_order_with_items` RPC MUST accept an `updated_at` timestamp parameter and reject the update if the order's current `updated_at` does not match (optimistic concurrency). A mismatch MUST return a clean conflict error — not silently overwrite concurrent changes.

#### Scenario: Concurrent edit rejected on stale updated_at

- GIVEN admin A and admin B both open the same draft order at the same `updated_at = T`
- WHEN admin A saves first (advancing `updated_at` to T+1)
- AND admin B submits with the original `updated_at = T`
- THEN the RPC returns a conflict error
- AND admin B sees an error toast indicating the order was modified concurrently

#### Scenario: Edit accepted when updated_at matches

- GIVEN an admin opens a draft order with `updated_at = T`
- WHEN the admin saves without concurrent modification (order still at `updated_at = T`)
- THEN the update is applied and `updated_at` advances

---

### Requirement: Enum Backfill Safety

The migration MUST atomically:
1. Delete all orders with `status = 'draft'` (cascade-deleting associated order_items, tickets, and reservations).
2. Update all orders with `status = 'in_preparation'` to `status = 'in_progress'`.
3. Remove the `in_preparation` value from the `order_status` enum.

No window MUST exist between the trigger rewrite and the enum change where item inserts into `draft` orders can produce partial side effects.

#### Scenario: in_preparation rows migrated to in_progress

- GIVEN the DB contains orders with `status = 'in_preparation'` before migration
- WHEN the backfill migration runs
- THEN all such rows have `status = 'in_progress'`
- AND no `in_preparation` value exists in the enum

#### Scenario: draft orders deleted by backfill

- GIVEN the DB contains orders with `status = 'draft'` before migration (confirmed as test data)
- WHEN the backfill migration runs
- THEN all such orders and their child rows (order_items, tickets, reservations) are removed

---

## REMOVED Requirements

### Requirement: (implicit) in_preparation transition via "Iniciar preparación"

(Reason: `in_preparation` status is removed from the enum; the transition `draft → in_preparation` is replaced by `draft → confirmed` via "Confirmar orden".)
(Migration: All existing `in_preparation` rows MUST be migrated to `in_progress` in the backfill migration. All existing `draft` rows MUST be deleted — confirmed as test data. The "Iniciar preparación" button MUST be removed from OrdenDetailPage.)
