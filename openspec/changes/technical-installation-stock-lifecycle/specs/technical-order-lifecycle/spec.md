# Delta for Technical Order Lifecycle

**Change**: technical-installation-stock-lifecycle
**Date**: 2026-08-31

---

## MODIFIED Requirements

### Requirement: configure_technical_ticket_equipment Category Guard

`public.configure_technical_ticket_equipment` MUST accept tickets whose `support.tickets.category` is `'installation'` in addition to the existing `'equipment_installation'` and `'equipment_replacement'` values.

Previously, the guard was:

```
category IN ('equipment_installation', 'equipment_replacement')
```

After this change it MUST be:

```
category IN ('equipment_installation', 'equipment_replacement', 'installation')
```

Any ticket with category `'installation'` MUST be treated identically to `'equipment_installation'` within this RPC: the call writes `support.tickets.pending_new_serial` and `support.tickets.pending_new_model` and returns success. No new column or movement is emitted at configure time.

#### Scenario: configure succeeds for installation ticket

- GIVEN a `support.tickets` row T with `category='installation'` and `status='open'`
- WHEN `public.configure_technical_ticket_equipment(T.id, serial, model, actor_id)` is called
- THEN the call succeeds (no `P0001` raised)
- AND `T.pending_new_serial` is set to the provided serial value
- AND `T.pending_new_model` is set to the provided model value

#### Scenario: configure still rejects unknown categories

- GIVEN a `support.tickets` row T with `category='maintenance'`
- WHEN `public.configure_technical_ticket_equipment(T.id, serial, model, actor_id)` is called
- THEN the RPC raises `SQLSTATE P0001` with a category-guard error message
- AND no fields on T are mutated

---

### Requirement: resolve_ticket Side-Effect Block for Installation Category

`public.resolve_ticket` MUST execute the equipment-creation and stock-closure path for `category='installation'` tickets in addition to `'equipment_installation'`.

When a ticket with `category='installation'` is resolved and its originating `technical_order_items` row has `product_id IS NOT NULL`, the RPC MUST atomically:

1. Insert a new row into `operations.equipment` (serial, model, description, building_id, access_type, installed_at).
2. Update `support.tickets.equipment_id` to the new equipment UUID.
3. Insert a `stock_movements` row with `type='egreso_instalacion'` and `quantity = -(reserved_qty)`.
4. Insert a `stock_movements` row with `type='liberacion_reserva'` and `quantity = +(reserved_qty)`.
5. Write `technical_order_items.intended_equipment_id` to the new equipment UUID (see bypass GUC requirement below).
6. Resolve the ticket through the `open → in_progress → resolved` state machine.

All six steps MUST execute inside a single transaction. If any step fails the entire transaction is rolled back.

#### Scenario: resolve_ticket creates equipment and emits stock movements for installation ticket

- GIVEN a technical order confirmed with one `installation` item, `product_id=P`, `quantity=1`
- AND a `reserva` movement exists in `stock_movements` with `ticket_id=T.id`, `product_id=P`, `quantity=1`
- WHEN `public.resolve_ticket(T.id, serial, model, description, building_id, access_type, note, actor_id)` is called
- THEN a new `operations.equipment` row is inserted with `serial_number=serial`
- AND `support.tickets.equipment_id` is updated to the new equipment UUID
- AND a `stock_movements` row with `type='egreso_instalacion'`, `quantity=-1`, `ticket_id=T.id`, `product_id=P` is inserted
- AND a `stock_movements` row with `type='liberacion_reserva'`, `quantity=+1`, `ticket_id=T.id`, `product_id=P` is inserted
- AND `technical_order_items.intended_equipment_id` is set to the new equipment UUID
- AND `T.status = 'resolved'`

#### Scenario: resolve_ticket with installation ticket — no product_id means no stock movement

- GIVEN a `support.tickets` row T with `category='installation'` and its originating order_item has `product_id IS NULL`
- WHEN `public.resolve_ticket` is called for T
- THEN the ticket transitions to `resolved`
- AND no `stock_movements` rows are inserted (no egreso_instalacion, no liberacion_reserva)
- AND `technical_order_items.intended_equipment_id` is still written if an equipment row is created

#### Scenario: second call on already-resolved installation ticket is idempotent

- GIVEN T is already `resolved` after a first successful `resolve_ticket` call
- WHEN `public.resolve_ticket` is called again for T
- THEN the RPC raises `SQLSTATE P0001`
- AND no duplicate `stock_movements` rows or `operations.equipment` rows are inserted

---

### Requirement: Intent-Immutable Trigger Bypass via `app.allow_resolve_equipment_id_write` GUC

The `technical_order_items_intent_immutable` trigger MUST recognize a new PostgreSQL session-level GUC `app.allow_resolve_equipment_id_write` as a bypass for writes to `technical_order_items.intended_equipment_id` on rows whose parent order is no longer in `draft` status.

Rules for this bypass:

1. `resolve_ticket` MUST set `app.allow_resolve_equipment_id_write = 'true'` in a `SET LOCAL` call immediately before the `UPDATE technical_order_items SET intended_equipment_id = ...` statement.
2. `resolve_ticket` MUST reset the GUC to `'false'` (or let `SET LOCAL` scope expire naturally at transaction end) immediately after the UPDATE.
3. The trigger MUST check `current_setting('app.allow_resolve_equipment_id_write', true) = 'true'` as its bypass condition and skip the immutability check only when that condition holds.
4. No client-side code path (admin or installer apps) MUST set this GUC. It is a server-side-only, scoped-transaction-only bypass.
5. All other writes to `intended_equipment_id` outside the GUC bypass window MUST continue to be rejected by the trigger when the order is not in `draft`.

This pattern mirrors the existing `app.allow_installer_equipment_swap` GUC used by `resolve_equipment_replacement`.

#### Scenario: bypass allows intended_equipment_id write during resolve_ticket

- GIVEN a technical order item OI whose order is in status `confirmed` (not draft)
- AND `resolve_ticket` sets `app.allow_resolve_equipment_id_write = 'true'` before the UPDATE
- WHEN `UPDATE technical_order_items SET intended_equipment_id = <uuid> WHERE id = OI.id` executes
- THEN the trigger allows the write and `OI.intended_equipment_id` is updated

#### Scenario: trigger still blocks unauthorized writes to intended_equipment_id

- GIVEN a technical order item OI whose order is in status `confirmed`
- AND no `SET LOCAL app.allow_resolve_equipment_id_write = 'true'` has been executed in the session
- WHEN `UPDATE technical_order_items SET intended_equipment_id = <uuid> WHERE id = OI.id` executes
- THEN the trigger raises an exception and the UPDATE is rejected
- AND `OI.intended_equipment_id` remains unchanged

#### Scenario: GUC scoped to single transaction — does not persist across calls

- GIVEN `resolve_ticket` completed successfully for ticket T1 (GUC was set and then reset)
- WHEN `public.resolve_ticket` is called for a different ticket T2 in a new transaction
- THEN the GUC is not set from the previous call
- AND the bypass does not apply to T2 until the RPC sets it again within T2's transaction

---

### Requirement: confirm_technical_order Reservation for Installation Items

`public.confirm_technical_order` MUST emit a `reserva` stock movement for `installation` items when `technical_order_items.product_id IS NOT NULL`. This behavior is already implemented (the existing guard is `product_id IS NOT NULL` with no category filter). This requirement documents the expected invariant explicitly:

After `confirm_technical_order` is called on an order containing an `installation` item with `product_id=P` and `quantity=Q`:

- A `stock_movements` row MUST exist with `type='reserva'`, `product_id=P`, `quantity=Q`, and the corresponding `ticket_id` and `order_item_id` set.
- `products.stock_reservado` MUST have increased by Q.

The RPC MUST NOT require any change to implement this — it is the admin form that currently withholds `product_id` for installation items. This requirement is satisfied by the form change (see `admin-technical-order-form` spec).

#### Scenario: confirm with installation item (product_id set) emits reserva

- GIVEN a draft technical order O containing one `installation` item with `product_id=P`, `quantity=2`
- WHEN `public.confirm_technical_order(O.id, actor_id)` is called
- THEN `stock_movements` contains one row with `type='reserva'`, `product_id=P`, `quantity=2`, `order_item_id=OI.id`
- AND `products.stock_reservado` for P increases by 2

#### Scenario: confirm with installation item (product_id null) emits no reserva

- GIVEN a draft technical order O containing one `installation` item with `product_id=NULL`
- WHEN `public.confirm_technical_order(O.id, actor_id)` is called
- THEN no `stock_movements` row is inserted for that item
- AND `products.stock_reservado` is unchanged

## Key Learnings

1. All four production bugs (silent stock drift, silent ledger drift, broken configure UX, cross-app visibility gap) collapse to a single root cause: the `installation` → `category='installation'` mapping is not included in any downstream category guard.
2. The `confirm_technical_order` RPC requires no SQL change — the reservation path is already conditional on `product_id IS NOT NULL`. The gap is entirely in the form layer.
3. The `technical_order_items_intent_immutable` trigger must gain a GUC bypass (`app.allow_resolve_equipment_id_write`) before `resolve_ticket` can write `intended_equipment_id`; this is the highest-risk change in the delta.
4. The bypass GUC MUST be set via `SET LOCAL` (not `SET`) so it is automatically scoped to the current transaction and cannot leak to other sessions.
5. Extending guards with explicit `IN` lists rather than fall-through defaults keeps future divergence between `installation` and `equipment_installation` a visible, single-point edit.
