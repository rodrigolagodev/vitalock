# Particulares Admin Specification

## Purpose

Admin surface for particulares — unit owners who buy directly from Vitalock. A
particular is a first-class `public.particulares` entity bound 1:1 to a unit
(`unit_id NOT NULL UNIQUE`); building and administration are derived by joining
unit → building → administration. Particulares are searchable and creatable
inline from order and key-pickup flows.

## Requirements

### Requirement: Particular Entity with 1:1 Unit Binding

The system MUST store particulares in `public.particulares` with `unit_id NOT
NULL UNIQUE` (at most one particular per unit) and `dni NOT NULL UNIQUE` (DNI
is the identity). Building and administration MUST be derived via joins from
the bound unit. Phone and email MAY be null.

#### Scenario: Create particular for a free unit

- GIVEN a unit with no particular bound
- WHEN an admin creates a particular for that unit with a new DNI
- THEN a particulares row exists with that unit_id and dni
- AND building/administration resolve through the unit joins

#### Scenario: Second particular on the same unit rejected

- GIVEN a unit already bound to one particular
- WHEN a create attempt targets the same unit_id
- THEN the DB rejects the write with SQLSTATE 23505
- AND a friendly toast explains the unit is already assigned

#### Scenario: Duplicate DNI rejected

- GIVEN a particular already exists with DNI 30111222
- WHEN a create attempt uses that same DNI
- THEN the DB rejects the write with SQLSTATE 23505
- AND a friendly toast explains the DNI already exists

---

### Requirement: Server-Side Search Selector

The system MUST provide a ParticularSelector that searches particulares
server-side by full_name OR dni (ILIKE, `useAdministrations` pattern) with
debounced input. The selector MUST show an empty state when no match exists
and MUST bind the selected particular to the enclosing flow.

#### Scenario: Search by name returns matches

- GIVEN particulares "García Juan" and "Pérez Ana" exist
- WHEN the admin types "garc" in the selector
- THEN only "García Juan" is returned
- AND selecting it binds that particular to the flow

#### Scenario: Search by DNI

- GIVEN a particular with DNI 30111222 exists
- WHEN the admin types "30111222"
- THEN that particular is returned and selectable

#### Scenario: No matches shows empty state

- GIVEN no particular matches the query
- WHEN the debounced search resolves
- THEN an empty state invites creating a new particular
- AND the create dialog opens from that state

---

### Requirement: Inline Create (QuickParticularCreateDialog)

The system MUST provide QuickParticularCreateDialog to create a particular
inline without leaving the enclosing form. It MUST collect full_name
(required), dni (required), and unit (required, 1:1 binding); phone and email
MAY be collected. On success the created particular MUST be selected in the
enclosing flow (onCreated pattern).

#### Scenario: Create particular from the order form

- GIVEN the order form is open with client_type 'particular'
- WHEN the admin creates a particular inline and saves
- THEN a particulares row is created
- AND the new particular is selected in the order form
- AND the order form remains open with no data lost

#### Scenario: Create particular from the pickup section

- GIVEN the pickup section on OrdenDetailPage
- WHEN the admin creates a particular inline as pickup person
- THEN the created particular is selected as pickup person

#### Scenario: Required fields block save

- GIVEN QuickParticularCreateDialog is open
- WHEN the admin attempts to save without full_name, dni, or unit
- THEN validation blocks the save with a required-field error

---

### Requirement: Backfill from Historical Orders

The system MUST backfill particulares from historical orders. The unit MUST be
inferred via `order_items.produced_key_id → rfid_keys.unit_id`; rows sharing a
DNI MUST dedupe keeping the first; the seed DNI `20345678` MUST be skipped
(administration key-request pickup, not a particular); orders whose unit
cannot be inferred MUST keep `particular_id = NULL`.

#### Scenario: Dedupe by DNI keeps the first row

- GIVEN two historical orders with the same DNI and inferable units
- WHEN the backfill migration runs
- THEN exactly one particulares row is created for that DNI

#### Scenario: Seed DNI skipped

- GIVEN a historical order whose flat DNI is 20345678
- WHEN the backfill migration runs
- THEN no particular is created from that order
- AND its particular_id remains NULL

#### Scenario: Unit not inferable leaves order unlinked

- GIVEN a historical order with no produced_key_id on its items
- WHEN the backfill migration runs
- THEN no particular is created
- AND the order keeps particular_id NULL

---

### Requirement: Particular Referenced by key_requests

`sales.key_requests` MUST accept nullable FKs `requester_particular_id` and
`pickup_particular_id` referencing `public.particulares`. The `requester_type`
enum MUST remain `individual` (no rename). No key_requests UI is added this
cycle.

#### Scenario: key_request accepts a particular FK

- GIVEN a valid particulares row
- WHEN a key_request insert supplies requester_particular_id
- THEN the FK is persisted
- AND requester_type stays 'individual'

#### Scenario: Null FKs preserve existing flow

- GIVEN an existing administration key_request
- WHEN no particular FKs are supplied
- THEN the insert succeeds with both FKs null
- AND existing trigger behavior is unchanged
