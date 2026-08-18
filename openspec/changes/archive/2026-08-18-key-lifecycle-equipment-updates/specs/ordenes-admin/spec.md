# Delta for Ordenes Admin

## MODIFIED Requirements

### Requirement: Order Status State Machine

Orders MUST follow the state machine:
`draft → confirmed → in_progress → ready_for_pickup → completed → invoiced`;
any non-terminal state → `cancelled`.

The `in_preparation` enum value MUST be removed. The DB MUST enforce that status
transitions are legal (no skip, no reverse from terminal). Specific rules:

- `draft → confirmed`: admin clicks "Confirmar orden" on OrdenDetailPage.
- `confirmed → in_progress`: auto-transition via `recompute_order_status` when
  work begins — for keys orders: first key item reaches `configured`; for
  technical orders: first ticket enters `in_progress`.
- `in_progress → ready_for_pickup`: auto-transition when ALL of the following
  hold for a keys order: (a) every non-cancelled key `order_item` has
  `produced_key_id` IS NOT NULL, AND (b) every `key_authorizations` row whose
  `rfid_key_id` belongs to those items has `sync_state IN ('installed',
  'cancelled')`. `sync_state = 'pending_install'` blocks readiness. The
  `key_authorizations` rows themselves are now created at `equipment_update`
  resolution, not at `key_configuration`. An order MUST NOT promote to
  `ready_for_pickup` until the relevant `equipment_update` task has resolved
  and minted the `key_authorizations` rows.
- `ready_for_pickup → in_progress` (demotion): if an order is `ready_for_pickup`
  and any `key_authorizations` row for its keys transitions to `pending_install`,
  `recompute_order_status` MUST demote the order back to `in_progress`.
- `ready_for_pickup → completed`: auto-transition when all non-cancelled key
  items have `picked_up_at` set.
- `completed → invoiced`: manual admin action.
- Any non-terminal → `cancelled`: manual "Cancelar orden" button.

(Previously: `in_progress → ready_for_pickup` could trigger as soon as
`key_authorizations` rows were inserted at `configure_key_order_item` time
with `sync_state = 'pending_install'`. Under the new lifecycle, `key_authorizations`
are never created at configure time — they are created only at
`equipment_update` resolution, at which point `sync_state` reflects the
physically-confirmed installation state. `ready_for_pickup` therefore fires
only after the installer has completed and resolved the `equipment_update` task.)

#### Scenario: Order does NOT reach ready_for_pickup after configure only

- GIVEN a keys order in `in_progress` with a configured key item (produced_key_id set)
- AND the relevant `equipment_update` task has NOT yet been resolved
- WHEN `recompute_order_status` runs
- THEN the order stays `in_progress`
- AND no `key_authorizations` row exists yet (none were created at configure time)

#### Scenario: Order promotes to ready_for_pickup after equipment_update resolves

- GIVEN a keys order in `in_progress` with all non-cancelled key items configured
- AND the relevant `equipment_update` task resolves, minting `key_authorizations`
  with `sync_state = 'installed'`
- WHEN `recompute_order_status` runs (triggered by the resolution)
- THEN the order status becomes `ready_for_pickup`

#### Scenario: Confirm order transitions draft to confirmed

- GIVEN an order with status `draft`
- WHEN the admin clicks "Confirmar orden"
- THEN order status becomes `confirmed`
- AND the status badge updates on the detail page

#### Scenario: confirmed auto-advances to in_progress on first key configured

- GIVEN a keys order with status `confirmed`
- WHEN the first key item reaches status `configured`
- THEN `recompute_order_status` transitions the order to `in_progress`

#### Scenario: Unconfigured key item blocks ready_for_pickup

- GIVEN a keys order in `in_progress` with 2 key items
- AND item A has `produced_key_id` set; item B has `produced_key_id IS NULL`
- WHEN `recompute_order_status` runs
- THEN the order stays `in_progress`

#### Scenario: pending_install authorization blocks ready_for_pickup

- GIVEN a keys order in `in_progress` with all key items configured
- AND a `key_authorizations` row exists with `sync_state = 'pending_install'`
- WHEN `recompute_order_status` runs
- THEN the order stays `in_progress`

#### Scenario: ready_for_pickup demotes to in_progress when authorization flips to pending_install

- GIVEN an order with status `ready_for_pickup`
- WHEN an existing `key_authorizations` row transitions to `sync_state = 'pending_install'`
- THEN `recompute_order_status` sets order status back to `in_progress`

#### Scenario: All keys picked up completes the order

- GIVEN an order in `ready_for_pickup` with 2 configured key items
- WHEN the last pickup is registered
- THEN the order status becomes `completed`

#### Scenario: Cancel order from any non-terminal state

- GIVEN order status is `draft`, `confirmed`, `in_progress`, or `ready_for_pickup`
- WHEN the admin clicks "Cancelar orden" and confirms
- THEN order status becomes `cancelled`
