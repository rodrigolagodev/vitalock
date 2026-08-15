# Delta for Ordenes Admin

## MODIFIED Requirements

### Requirement: Order Status State Machine

Orders MUST follow the state machine:
`draft → confirmed → in_progress → ready_for_pickup → completed → invoiced`;
any non-terminal state → `cancelled`.

The `in_preparation` enum value MUST be removed. The DB MUST enforce that status
transitions are legal (no skip, no reverse from terminal). Specific rules:

- `draft → confirmed`: admin clicks "Confirmar orden" on OrdenDetailPage.
- `confirmed → in_progress`: auto-transition via `recompute_order_status` — for keys orders: first key item reaches `configured`; for technical orders: first ticket enters `in_progress`.
- `in_progress → ready_for_pickup`: auto-transition when ALL of the following hold for a keys order: (a) every non-cancelled key `order_item` has `produced_key_id` IS NOT NULL, AND (b) every `key_authorizations` row whose `rfid_key_id` belongs to those items has `sync_state IN ('installed', 'cancelled')`. `sync_state = 'pending_install'` blocks readiness. `sync_state = 'pending_removal'` does NOT block. Key items with `produced_key_id IS NULL` are unresolved and keep the order in `in_progress`. Technical orders skip this state.
- `ready_for_pickup → in_progress` (demotion): if an order is `ready_for_pickup` and any `key_authorizations` row for its keys transitions to `pending_install`, `recompute_order_status` MUST demote the order back to `in_progress`.
- `ready_for_pickup → completed`: auto-transition when all non-cancelled key items have `picked_up_at` set.
- `completed → invoiced`: manual admin action (unchanged).
- Any non-terminal → `cancelled`: manual "Cancelar orden" button.

(Previously: `in_progress → ready_for_pickup` was gated on all key items having status=`configured` AND no unresolved `key_installation` support ticket; it did not use `key_authorizations.sync_state` as the gate and did not have an explicit demotion rule tied to authorization state)

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

#### Scenario: Unconfigured key item (produced_key_id NULL) blocks ready_for_pickup

- GIVEN a keys order in `in_progress` with 2 key items
- AND item A has `produced_key_id` set; item B has `produced_key_id IS NULL`
- WHEN `recompute_order_status` runs
- THEN the order stays `in_progress` (NULL produced_key_id is unresolved)

#### Scenario: All keys configured, all authorizations installed — order promotes

- GIVEN a keys order in `in_progress`
- AND every non-cancelled key item has `produced_key_id` set
- AND every `key_authorizations` row for those keys has `sync_state = 'installed'`
- WHEN `recompute_order_status` runs (e.g. on the last authorization update)
- THEN the order status becomes `ready_for_pickup`

#### Scenario: pending_install authorization blocks ready_for_pickup

- GIVEN a keys order in `in_progress`
- AND every non-cancelled key item has `produced_key_id` set
- AND at least one `key_authorizations` row has `sync_state = 'pending_install'`
- WHEN `recompute_order_status` runs
- THEN the order stays `in_progress`

#### Scenario: pending_removal authorization does NOT block ready_for_pickup

- GIVEN a keys order in `in_progress`
- AND every non-cancelled key item has `produced_key_id` set
- AND one `key_authorizations` row has `sync_state = 'pending_removal'`
- AND all other authorizations have `sync_state IN ('installed', 'cancelled')`
- WHEN `recompute_order_status` runs
- THEN the order promotes to `ready_for_pickup` (pending_removal is not a blocker)

#### Scenario: ready_for_pickup demotes to in_progress when authorization flips to pending_install

- GIVEN an order with status `ready_for_pickup`
- WHEN an existing `key_authorizations` row for one of its keys transitions to `sync_state = 'pending_install'`
- THEN `recompute_order_status` sets the order status back to `in_progress`

#### Scenario: Cancelled item excluded from auto-transition check

- GIVEN an order in `in_progress` with 1 configured key item and 1 cancelled key item
- AND the configured item's authorizations all have `sync_state = 'installed'`
- WHEN `recompute_order_status` runs
- THEN the order transitions to `ready_for_pickup` (cancelled item and its authorizations are excluded)

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
