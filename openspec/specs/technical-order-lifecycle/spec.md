# Technical Order Lifecycle

**Changes**:
- technical-installation-stock-lifecycle (2026-08-31)
- ticket-taxonomy-cleanup (2026-09-01)

---

## MODIFIED Requirements

### Requirement: confirm_technical_order item_type→category Mapping Is Identity

`public.confirm_technical_order` MUST map each `technical_order_items.item_type` value to the corresponding `support.tickets.category` value via a trivial 1-to-1 mapping. After the taxonomy cleanup, the CASE expression (or equivalent) inside the function MUST implement:

```
install_equipment  → install_equipment
replace_equipment  → replace_equipment
maintain_equipment → maintain_equipment
```

The previous multi-way CASE (which mapped `equipment` → `equipment_installation`, `installation` → `installation`, `equipment_replacement` → `equipment_replacement`, `maintenance` → `maintenance`) MUST be replaced. No cross-value translation is required; the function merely passes `item_type` through as `category`.

#### Scenario: confirm creates install_equipment ticket for install_equipment item

- GIVEN a draft technical order O with one item of `item_type='install_equipment'`
- WHEN `public.confirm_technical_order(O.id, actor_id)` is called
- THEN a `support.tickets` row is created with `category='install_equipment'`

#### Scenario: confirm creates replace_equipment ticket for replace_equipment item

- GIVEN a draft technical order O with one item of `item_type='replace_equipment'`
- WHEN `public.confirm_technical_order(O.id, actor_id)` is called
- THEN a `support.tickets` row is created with `category='replace_equipment'`

#### Scenario: confirm creates maintain_equipment ticket for maintain_equipment item

- GIVEN a draft technical order O with one item of `item_type='maintain_equipment'`
- WHEN `public.confirm_technical_order(O.id, actor_id)` is called
- THEN a `support.tickets` row is created with `category='maintain_equipment'`

#### Scenario: confirm with old item_type values is rejected by CHECK constraint

- GIVEN a `technical_order_items` row (hypothetically) with `item_type='equipment'`
- WHEN `public.confirm_technical_order` attempts to process it
- THEN the operation fails because the new CHECK constraint on `technical_order_items.item_type` rejects that value — it MUST NOT reach the CASE mapping at all

### Requirement: confirm_technical_order Reservation for install_equipment Items

`public.confirm_technical_order` MUST emit a `reserva` stock movement for `install_equipment` items when `technical_order_items.product_id IS NOT NULL`. This was previously documented for both `equipment_installation` and `installation`; after the fusion, the single `install_equipment` value covers both.

After `confirm_technical_order` is called on an order containing an `install_equipment` item with `product_id=P` and `quantity=Q`:

- A `stock_movements` row MUST exist with `type='reserva'`, `product_id=P`, `quantity=Q`, and the corresponding `ticket_id` and `order_item_id`.
- `products.stock_reservado` MUST have increased by Q.

The reservation path is conditional on `product_id IS NOT NULL` with no category filter — unchanged in logic, only the category name changes.

#### Scenario: confirm with install_equipment item (product_id set) emits reserva

- GIVEN a draft order O with one `install_equipment` item, `product_id=P`, `quantity=2`
- WHEN `public.confirm_technical_order(O.id, actor_id)` is called
- THEN `stock_movements` contains one row with `type='reserva'`, `product_id=P`, `quantity=2`, `order_item_id=OI.id`
- AND `products.stock_reservado` for P increases by 2

#### Scenario: confirm with install_equipment item (product_id null) emits no reserva

- GIVEN a draft order O with one `install_equipment` item, `product_id=NULL`
- WHEN `public.confirm_technical_order(O.id, actor_id)` is called
- THEN no `stock_movements` row is inserted for that item
- AND `products.stock_reservado` is unchanged

### Requirement: configure_technical_ticket_equipment Category Guard — install_equipment + replace_equipment

`public.configure_technical_ticket_equipment` MUST accept tickets whose `support.tickets.category` is `'install_equipment'` or `'replace_equipment'`. The previous guard included `'equipment_installation'`, `'equipment_replacement'`, and `'installation'` as separate values. After the cleanup, the guard MUST reference:

```
category IN ('install_equipment', 'replace_equipment')
```

`'update_equipment'` does not pass through a configure step; `'maintain_equipment'` does not require equipment configuration.

Any ticket with `category='install_equipment'` MUST be treated identically to the former `equipment_installation`/`installation` path: the call writes `pending_new_serial` and `pending_new_model` and returns success.

#### Scenario: configure succeeds for install_equipment ticket

- GIVEN a `support.tickets` row T with `category='install_equipment'` and `status='open'`
- WHEN `public.configure_technical_ticket_equipment(T.id, serial, model, actor_id)` is called
- THEN the call succeeds (no `P0001` raised)
- AND `T.pending_new_serial` is set to the provided serial value
- AND `T.pending_new_model` is set to the provided model value

#### Scenario: configure succeeds for replace_equipment ticket

- GIVEN a `support.tickets` row T with `category='replace_equipment'` and `status='open'`
- WHEN `public.configure_technical_ticket_equipment(T.id, serial, model, actor_id)` is called
- THEN the call succeeds
- AND `T.pending_new_serial` and `T.pending_new_model` are set

#### Scenario: configure rejects maintain_equipment and update_equipment tickets

- GIVEN a `support.tickets` row T with `category='maintain_equipment'`
- WHEN `public.configure_technical_ticket_equipment(T.id, serial, model, actor_id)` is called
- THEN the RPC raises `SQLSTATE P0001` with a category-guard error message
- AND no fields on T are mutated
- AND the same rejection applies to `category='update_equipment'`

### Requirement: resolve_ticket Side-Effect Block Uses install_equipment

`public.resolve_ticket` MUST execute the equipment-creation and stock-closure path for `category='install_equipment'` tickets. The previous guard covered both `'installation'` and `'equipment_installation'` as separate values; after the fusion, a single `'install_equipment'` guard covers both.

When a ticket with `category='install_equipment'` is resolved and its originating `technical_order_items` row has `product_id IS NOT NULL`, the RPC MUST atomically:

1. Insert a new row into `operations.equipment`.
2. Update `support.tickets.equipment_id` to the new equipment UUID.
3. Insert a `stock_movements` row with `type='egreso_instalacion'` and `quantity = -(reserved_qty)`.
4. Insert a `stock_movements` row with `type='liberacion_reserva'` and `quantity = +(reserved_qty)`.
5. Write `technical_order_items.intended_equipment_id` via the `app.allow_resolve_equipment_id_write` GUC bypass (unchanged from prior spec).
6. Resolve the ticket through the `open → in_progress → resolved` state machine.

All six steps MUST execute inside a single transaction. If any step fails the entire transaction is rolled back.

#### Scenario: resolve_ticket creates equipment and emits stock movements for install_equipment ticket

- GIVEN a confirmed order with one `install_equipment` item, `product_id=P`, `quantity=1`
- AND a `reserva` movement exists with `ticket_id=T.id`, `product_id=P`, `quantity=1`
- WHEN `public.resolve_ticket(T.id, note, actor_id)` is called after the ticket was configured with serial/model
- THEN a new `operations.equipment` row is inserted
- AND `support.tickets.equipment_id` is updated to the new equipment UUID
- AND a `stock_movements` row with `type='egreso_instalacion'`, `quantity=-1`, `product_id=P` is inserted
- AND a `stock_movements` row with `type='liberacion_reserva'`, `quantity=+1`, `product_id=P` is inserted
- AND `technical_order_items.intended_equipment_id` is set to the new equipment UUID
- AND `T.status = 'resolved'`

#### Scenario: resolve_ticket for install_equipment — no product_id means no stock movement

- GIVEN a ticket T with `category='install_equipment'` and its order_item has `product_id IS NULL`
- WHEN `public.resolve_ticket` is called for T
- THEN the ticket transitions to `resolved`
- AND no `stock_movements` rows are inserted
- AND `technical_order_items.intended_equipment_id` is still written if an equipment row is created

### Requirement: Intent-Immutable GUC Bypass Unchanged (install_equipment Path Only)

The `app.allow_resolve_equipment_id_write` GUC bypass documented in the prior spec remains in effect. It now applies exclusively to `install_equipment` tickets (the only category that writes `intended_equipment_id`). No change to the GUC mechanics is required; the category string it implicitly guards changes from `'installation'/'equipment_installation'` to `'install_equipment'`.

All scenarios from the prior spec for this bypass remain valid with `install_equipment` substituted for the former dual-value set.

