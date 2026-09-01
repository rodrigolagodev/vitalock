# Delta for Admin Tarea Form — Standalone Create

**Change**: ticket-taxonomy-cleanup

## MODIFIED Requirements

### Requirement: TareaFormSheet Standalone Create Offers Only maintain_equipment

`TareaFormSheet` in standalone create mode (no `technical_order_item_id`) MUST offer only `maintain_equipment` as a selectable category. This is a strict reduction from the previous set which included `maintenance` (now `maintain_equipment`) and `installation`.

After this change:

```ts
const CREATE_CATEGORY_LABELS = {
  maintain_equipment: 'Mantenimiento',
}
```

The form MUST NOT present `install_equipment`, `replace_equipment`, or `update_equipment` as options in standalone create mode. Installation tickets MUST originate exclusively from a confirmed technical order.

The default value for the category field in standalone create mode MUST be `'maintain_equipment'`.

#### Scenario: standalone create form offers only maintain_equipment

- GIVEN an admin opens TareaFormSheet in standalone create mode (no order item context)
- WHEN the category selector renders
- THEN exactly one option is presented: `maintain_equipment`
- AND no other category value is selectable or submittable via this form

#### Scenario: standalone create form defaults to maintain_equipment

- GIVEN an admin opens TareaFormSheet in standalone create mode
- WHEN the form renders without a pre-selected category
- THEN the category field value is `'maintain_equipment'`

#### Scenario: submitting the standalone form creates a maintain_equipment ticket

- GIVEN an admin fills out TareaFormSheet in standalone mode with all required fields
- AND category is `maintain_equipment` (the only option)
- WHEN the form is submitted
- THEN `support.tickets` receives a new row with `category='maintain_equipment'`

## ADDED Requirements

### Requirement: Standalone Tickets MUST Have maintain_equipment Category — DB Invariant

Any `support.tickets` row with `technical_order_item_id IS NULL` (standalone ticket) MUST have `category='maintain_equipment'`. Enforced by DB CHECK constraint:

```sql
CONSTRAINT tickets_equipment_required
CHECK (technical_order_item_id IS NOT NULL OR category = 'maintain_equipment')
```

This closes the latent bug where a standalone `installation` ticket silently skipped stock movements. After the constraint is installed, any INSERT (from any client, RPC, or manual SQL) with `technical_order_item_id IS NULL` and `category <> 'maintain_equipment'` is rejected by the DB.

#### Scenario: DB rejects standalone install_equipment ticket

- GIVEN the `tickets_equipment_required` CHECK is installed
- WHEN a caller attempts `INSERT INTO support.tickets (..., category, technical_order_item_id) VALUES (..., 'install_equipment', NULL)`
- THEN the INSERT is rejected with a CHECK constraint violation

#### Scenario: DB accepts standalone maintain_equipment ticket

- GIVEN the `tickets_equipment_required` CHECK is installed
- WHEN a caller inserts a row with `category='maintain_equipment'` and `technical_order_item_id IS NULL`
- THEN the INSERT succeeds

#### Scenario: DB accepts install_equipment ticket linked to an order item

- GIVEN the CHECK is installed
- WHEN a row with `category='install_equipment'` and `technical_order_item_id=<uuid>` is inserted
- THEN the INSERT succeeds
