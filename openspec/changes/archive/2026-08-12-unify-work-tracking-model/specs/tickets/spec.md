# Delta for Tickets

## MODIFIED Requirements

### Requirement: No New key_installation Tickets

The system MUST NOT create new `support.tickets` rows with `category = 'key_installation'`. Enforcement:

1. The `support.tickets_resolution_chain` trigger MUST be updated to remove its `key_installation` spawn branch (see next requirement).
2. A BEFORE INSERT trigger on `support.tickets` MUST reject any row with `category = 'key_installation'` with a clear error message referencing this change.
3. The TypeScript `TareaRow.category` union in `apps/admin/src/hooks/useTareas.ts` MUST be updated to remove `key_installation` in the same change batch.

The `support.tickets.category` CHECK constraint MAY keep `key_installation` as an allowed value to grandfather existing (soft-cancelled) rows. Hardening the CHECK to drop the value entirely is deferred as a follow-up once historical rows can be safely purged.

(Previously: the chain trigger spawned `key_installation` tickets on `key_configuration` resolve; no gate prevented other code paths from inserting them.)

#### Scenario: chain trigger no longer spawns key_installation

- GIVEN a `key_configuration` ticket in `open` status
- WHEN it transitions to `resolved` via the configure_key_order_item RPC
- THEN no new `support.tickets` row with `category = 'key_installation'` is created

#### Scenario: direct insert of key_installation is rejected

- GIVEN the write-path guard trigger is in place
- WHEN any process attempts to insert a ticket with `category = 'key_installation'`
- THEN the insert is rejected with an error referencing unify-work-tracking-model

#### Scenario: existing soft-cancelled key_installation rows remain queryable

- GIVEN historical `key_installation` tickets exist with `status = 'cancelled'` after the data migration
- WHEN admin queries `support.tickets` for audit
- THEN those rows are returned normally; the CHECK constraint does not reject them

#### Scenario: Invalid unknown category still rejected

- GIVEN the CHECK constraint is in place
- WHEN a ticket is inserted with `category = 'unknown_type'`
- THEN the DB rejects the insert with a CHECK violation

---

### Requirement: Resolution Chain — key_configuration (terminal)

When a `key_configuration` ticket is resolved (status → `resolved`), the system MUST NOT automatically create any follow-up ticket. The `tickets_resolution_chain` trigger MUST remove the `key_configuration → key_installation` branch. Other category branches in the trigger (if any) remain untouched. When a `key_configuration` ticket is cancelled, no follow-up ticket is created (unchanged).

(Previously: resolving a `key_configuration` ticket automatically created a `key_installation` ticket for the same building and order)

#### Scenario: Resolving key_configuration spawns no follow-up ticket

- GIVEN a `key_configuration` ticket T with building_id=10, order_id=5
- WHEN T.status is set to `resolved`
- THEN no new `support.tickets` row is created

#### Scenario: Cancelling key_configuration still creates no ticket

- GIVEN a `key_configuration` ticket T with building_id=10
- WHEN T.status is set to `cancelled`
- THEN no `key_installation` or any other follow-up ticket is created

#### Scenario: Non-key_configuration resolution chain still fires for other categories

- GIVEN the `tickets_resolution_chain` trigger is installed
- WHEN a ticket of a category that has a defined chain rule (not `key_configuration`) is resolved
- THEN the expected follow-up ticket for that category is created (chain unaffected)

---

## ADDED Requirements

### Requirement: key_authorizations as Sole Installation Record

`operations.key_authorizations` MUST be the sole source of truth for the state of "installer physically installed a key at a reader". No `support.tickets` row SHALL represent a key installation event. The `sync_state` column on `key_authorizations` drives order readiness directly; there is no ticket intermediary.

#### Scenario: Configuring a key does not create a key_installation ticket

- GIVEN a `key_configuration` ticket exists for order_item OI
- WHEN `configure_key_order_item` RPC completes successfully
- THEN the `key_configuration` ticket is resolved
- AND no `support.tickets` row with category=`key_installation` is created

#### Scenario: Installer marking authorization as installed does not create or resolve any ticket

- GIVEN a `key_authorizations` row with `sync_state = 'pending_install'`
- WHEN the installer updates `sync_state` to `installed`
- THEN no `support.tickets` row is created or modified as a side effect
- AND `recompute_order_status` is the mechanism that reacts to the authorization update

---

### Requirement: Data Migration — Soft-Cancel Existing key_installation Tickets

Existing open `support.tickets` rows with category=`key_installation` MUST be soft-cancelled: `status` set to `cancelled`, `cancellation_reason` set to `'superseded by key_authorizations model'`. Hard deletion is prohibited. After cancellation, `recompute_order_status` MUST be invoked for every order that had a cancelled ticket, so that orders stuck behind ghost tickets may promote if all their authorizations are `installed`.

#### Scenario: Existing open key_installation ticket is soft-cancelled

- GIVEN a `support.tickets` row exists with category=`key_installation` and status=`open`
- WHEN the data migration runs
- THEN that row has status=`cancelled`
- AND cancellation_reason=`'superseded by key_authorizations model'`
- AND the row is NOT deleted (audit trail preserved)

#### Scenario: Order recomputed after ticket cancellation may promote

- GIVEN order X was `in_progress` solely because a `key_installation` ghost ticket existed
- AND all `key_authorizations` rows for order X's keys have `sync_state = 'installed'`
- WHEN the migration soft-cancels the ticket and invokes `recompute_order_status` for order X
- THEN order X transitions to `ready_for_pickup`
