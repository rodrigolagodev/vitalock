# Delta for Equipment Admin

## ADDED Requirements

### Requirement: Order-Key Pickup Registration

The system MUST allow registering the pickup of an order-produced key. The
`rfid_keys_validate_pickup` trigger MUST accept the `order_item_id` origin
path, recording `picked_up_by_name/surname/dni`, `picked_up_at`, and
`delivered_by_staff_id`. On that path, `picked_up_by_dni` MUST match the
order's authorized particular — the buyer (`orders.particular_id`) or the
explicit pickup person (`orders.pickup_particular_id`). The existing
`key_request_item_id` branch MUST remain unchanged, and the already-set
key_requests and rfid_keys triggers MUST NOT be modified (immutability).

#### Scenario: Pickup by buyer DNI succeeds

- GIVEN an order key item whose buyer particular is authorized
- WHEN a pickup registers with picked_up_by_dni equal to the buyer's DNI
- THEN picked_up_at, picked_up_by_*, and delivered_by_staff_id are recorded

#### Scenario: Pickup by explicit pickup person succeeds

- GIVEN the order has pickup_particular_id set to particular Q
- WHEN a pickup registers with picked_up_by_dni equal to Q's DNI
- THEN the pickup is accepted and recorded

#### Scenario: Unauthorized DNI rejected

- GIVEN the authorized DNIs are the buyer and the explicit pickup person
- WHEN a pickup registers with a different DNI
- THEN the write is rejected with an error
- AND picked_up_at is not set

#### Scenario: Order without a particular cannot use the order path

- GIVEN an administration order (no particular) with an order-produced key
- WHEN a pickup attempts to register via the order_item_id path
- THEN the write is rejected (no authorized particular exists)

#### Scenario: key_requests path regression-free

- GIVEN a key produced via key_requests
- WHEN its pickup is registered as before
- THEN the pickup succeeds with identical trigger behavior
- AND the order path changes do not affect it
