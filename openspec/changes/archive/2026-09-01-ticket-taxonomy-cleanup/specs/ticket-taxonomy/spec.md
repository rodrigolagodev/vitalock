# Delta for Ticket Taxonomy

**Change**: ticket-taxonomy-cleanup

## MODIFIED Requirements

### Requirement: tickets.category CHECK Constraint — 4-Value Domain

`support.tickets.category` MUST be constrained to exactly the following four values after the migration:

```
{ install_equipment, replace_equipment, update_equipment, maintain_equipment }
```

The previous seven-value domain (`maintenance`, `installation`, `key_configuration`, `key_installation`, `equipment_installation`, `equipment_replacement`, `equipment_update`) MUST be retired. All new values follow a uniform `verb_object` naming convention.

Any INSERT or UPDATE supplying a value outside this four-value set MUST be rejected by the CHECK constraint.

#### Scenario: valid INSERT with new category values is accepted

- GIVEN the new CHECK constraint is in place
- WHEN a row is inserted into `support.tickets` with `category='install_equipment'`
- THEN the insert succeeds without constraint error
- AND the same succeeds for each of `replace_equipment`, `update_equipment`, `maintain_equipment`

#### Scenario: INSERT with any old category value is rejected

- GIVEN the new CHECK constraint is in place
- WHEN a row is inserted with `category='maintenance'`
- THEN the insert is rejected with a CHECK constraint violation
- AND the same rejection applies to `installation`, `equipment_installation`, `equipment_replacement`, `equipment_update`, `key_configuration`, `key_installation`

### Requirement: Dead Categories Dropped — key_configuration and key_installation

`key_configuration` and `key_installation` MUST NOT appear in the `support.tickets.category` CHECK constraint after migration. The trigger `tickets_reject_key_installation_inserts` MUST be dropped; it is redundant once these values are removed from the CHECK.

No data migration is required (zero production rows for both values).

#### Scenario: no rows exist for dropped categories after migration

- GIVEN the migration has committed
- WHEN `SELECT COUNT(*) FROM support.tickets WHERE category IN ('key_configuration', 'key_installation')` is executed
- THEN the result is zero

### Requirement: installation + equipment_installation Fused into install_equipment

`installation` and `equipment_installation` MUST be collapsed into a single value `install_equipment`. After migration, zero rows in `support.tickets` MUST carry either old value; all such rows MUST carry `category='install_equipment'`.

No business logic distinguishes the two former values. All downstream guards that previously listed both MUST be updated to a single `'install_equipment'` reference.

#### Scenario: all former installation/equipment_installation rows become install_equipment

- GIVEN pre-migration there are N rows where `category IN ('installation', 'equipment_installation')`
- WHEN the migration commits
- THEN `SELECT COUNT(*) WHERE category IN ('installation', 'equipment_installation')` returns zero
- AND `SELECT COUNT(*) WHERE category='install_equipment'` returns N

### Requirement: Data Migration Invariants

The migration MUST satisfy all of the following atomically:

1. **Pre-count equals post-count**: total rows in `support.tickets` before and after the migration transaction MUST be identical.
2. **All rows in new set**: after commit, every row MUST have `category IN ('install_equipment', 'replace_equipment', 'update_equipment', 'maintain_equipment')`.
3. **Zero rows in old set**: after commit, zero rows MUST have a category outside that set.
4. **Trigger bypass is transactional**: `tickets_validate` enforces `category IS IMMUTABLE`. The migration MUST execute `ALTER TABLE support.tickets DISABLE TRIGGER ALL` before the UPDATE and `ENABLE TRIGGER ALL` after, inside the same transaction. If the transaction rolls back, PostgreSQL restores trigger state automatically.
5. **Runtime immutability restored post-migration**: after commit, `tickets_validate` MUST be active and MUST continue to enforce `category IS IMMUTABLE` for all runtime operations.

#### Scenario: migration preserves total row count

- GIVEN `support.tickets` has N rows before migration
- WHEN the migration commits
- THEN `support.tickets` has exactly N rows

#### Scenario: no row retains an old category value after migration

- GIVEN the migration has committed
- WHEN `SELECT COUNT(*) FROM support.tickets WHERE category NOT IN ('install_equipment','replace_equipment','update_equipment','maintain_equipment')` is executed
- THEN the result is zero

#### Scenario: runtime immutability is preserved after migration

- GIVEN the migration has committed and triggers are re-enabled
- WHEN a runtime caller attempts `UPDATE support.tickets SET category='install_equipment' WHERE id=<existing-id>` without `DISABLE TRIGGER ALL`
- THEN `tickets_validate` raises `SQLSTATE P0001` and the UPDATE is rejected

### Requirement: technical_order_items.item_type CHECK Constraint — 3-Value Domain

`technical_order_items.item_type` MUST be constrained to exactly three values after migration:

```
{ install_equipment, replace_equipment, maintain_equipment }
```

The previous four-value domain (`equipment`, `maintenance`, `installation`, `equipment_replacement`) MUST be retired. There is no immutability trigger on this column; a plain `UPDATE` inside the migration transaction suffices.

#### Scenario: valid INSERT with new item_type values is accepted

- GIVEN the new CHECK constraint on `technical_order_items` is active
- WHEN a row is inserted with `item_type='install_equipment'`
- THEN the insert succeeds
- AND the same succeeds for `replace_equipment` and `maintain_equipment`

#### Scenario: INSERT with any old item_type value is rejected

- GIVEN the new CHECK constraint is active
- WHEN a row is inserted with `item_type='equipment'`
- THEN the insert is rejected with a CHECK constraint violation
- AND the same applies to `maintenance`, `installation`, `equipment_replacement`

#### Scenario: zero rows retain old item_type values after migration

- GIVEN the migration has committed
- WHEN `SELECT COUNT(*) FROM technical_order_items WHERE item_type IN ('equipment','maintenance','installation','equipment_replacement')` is executed
- THEN the count is zero

### Requirement: add_technical_order_item RPC Validates New item_type Domain

`add_technical_order_item` MUST validate `item_type` against the new 3-value set in lockstep with the CHECK constraint change. Callers passing old values MUST receive a clear validation error.

#### Scenario: add_technical_order_item rejects old item_type value

- GIVEN the updated RPC is deployed
- WHEN `add_technical_order_item` is called with `item_type='equipment'`
- THEN the RPC raises an error referencing the invalid item_type
- AND no row is inserted into `technical_order_items`

#### Scenario: add_technical_order_item accepts new item_type values

- GIVEN the updated RPC is deployed
- WHEN `add_technical_order_item` is called with `item_type='install_equipment'`
- THEN the call succeeds and inserts the row

### Requirement: No Old Category or item_type String Literals in Monorepo

After the apply phase, zero files in the monorepo MUST reference any of the following as a DB category or item_type literal:

- `equipment_installation`, `equipment_replacement`, `equipment_update`
- `key_configuration`, `key_installation`
- `maintenance` or `installation` as DB category values (occurrences in natural-language comments are acceptable)

A post-apply `rg` gate for old strings is a mandatory merge prerequisite.

#### Scenario: grep gate finds zero occurrences of old category strings

- GIVEN the apply phase has completed
- WHEN `rg 'equipment_installation|equipment_replacement|equipment_update|key_configuration|key_installation'` is run across the repo (excluding migration history and archived specs)
- THEN zero matches are found
