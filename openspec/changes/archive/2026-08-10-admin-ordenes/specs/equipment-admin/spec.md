# Delta for Equipment Admin

## ADDED Requirements

### Requirement: createKey Accepts order_item_id

`useMutateKey.createKey` input type MUST accept an optional `order_item_id`
field. When `order_item_id` is provided, the INSERT into `rfid_keys` MUST
include that value. When omitted, the existing behaviour (null `order_item_id`)
MUST be preserved. The DB CHECK constraint (`key_request_item_id IS NULL OR
order_item_id IS NULL`) MUST be respected; callers are responsible for not
supplying both FKs simultaneously.

#### Scenario: createKey with order_item_id persists the FK

- GIVEN a configure-key flow provides a valid order_item_id
- WHEN createKey is called with that order_item_id
- THEN the rfid_keys row is inserted with order_item_id set to the provided value
- AND key_request_item_id remains null on that row

#### Scenario: createKey without order_item_id preserves existing behaviour

- GIVEN a legacy key creation flow does not provide order_item_id
- WHEN createKey is called without order_item_id
- THEN the rfid_keys row is inserted with order_item_id = null
- AND existing key_request_item_id semantics are unaffected
