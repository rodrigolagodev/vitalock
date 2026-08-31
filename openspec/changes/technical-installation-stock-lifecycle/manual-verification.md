# Manual Verification Checklist

**Change**: technical-installation-stock-lifecycle
**Date**: 2026-08-31
**Prerequisites**: local Supabase stack running (`supabase start`) with migration
`20260901120000_extend_installation_category_lifecycle.sql` applied (`supabase migration up`).

---

## Step 1: Seed

Ensure at least one active `products` row with `category='equipment'` and positive `stock_total`.

```sql
-- Verify seed product exists
SELECT id, name, category, stock_total, stock_reservado, stock_disponible
  FROM public.products
 WHERE category = 'equipment' AND stock_total > 0
 LIMIT 1;
-- Expected: at least one row
```

Record the `<product_id>` and its building to use in subsequent steps.

---

## Step 2: Create Order

As an admin, create a technical order via the UI (or directly via the API) with:
- `item_type = 'installation'`
- A valid `building_id`
- `quantity = 1`
- The seeded `product_id` from Step 1
- An assigned `intended_assignee_staff_id`

**Assert**: The form renders a product selector for `item_type='installation'`
**Assert**: Submitting without `product_id` is blocked by a validation error
**Assert**: With `product_id` set, the order is created and remains in `draft`

```sql
-- Verify order in draft with correct item
SELECT o.id AS order_id, o.status AS order_status,
       i.id AS item_id, i.item_type, i.product_id, i.quantity, i.status AS item_status
  FROM public.technical_orders o
  JOIN public.technical_order_items i ON i.order_id = o.id
 WHERE o.status = 'draft'
   AND i.item_type = 'installation'
   AND i.product_id = '<product_id>'
 ORDER BY o.created_at DESC
 LIMIT 1;
-- Expected: order_status='draft', item_type='installation', product_id set, item_status='pending'
```

Record `<order_id>` and `<item_id>`.

---

## Step 3: Confirm Order

Invoke `confirm_technical_order(<order_id>)`.

```sql
SELECT public.confirm_technical_order('<order_id>');
```

**Assert 3a**: Exactly one `support.tickets` row with `category='installation'`, `status='open'`,
`technical_order_item_id = <item_id>`.

```sql
SELECT id AS ticket_id, category, status, technical_order_item_id, building_id
  FROM support.tickets
 WHERE technical_order_item_id = '<item_id>';
-- Expected: 1 row, category='installation', status='open'
```

Record `<ticket_id>`.

**Assert 3b**: Exactly one `stock_movements` row with `type='reserva'`, `product_id='<product_id>'`,
`quantity=-1`, `order_item_id='<item_id>'`, `order_kind='technical'`.

```sql
SELECT type, quantity, product_id, order_item_id, order_kind
  FROM public.stock_movements
 WHERE order_item_id = '<item_id>' AND type = 'reserva';
-- Expected: type='reserva', quantity=-1, product_id=<seeded>, order_kind='technical'
```

**Assert 3c**: `products.stock_reservado` incremented by 1 for `<product_id>`.

```sql
SELECT stock_total, stock_reservado, stock_disponible
  FROM public.products
 WHERE id = '<product_id>';
-- Expected: stock_reservado = prior + 1
```

---

## Step 4: Configure Equipment

As an assigned installer (or admin via `ConfigureEquipmentPanel`), call
`configure_technical_ticket_equipment`.

**Assert 4a**: Admin `TareaDetailPage` renders `ConfigureEquipmentPanel` for the
`installation` ticket (not `AssignEquipmentDialog`).

**Assert 4b**: Installer `TaskDetailPage` renders `ConfigureEquipmentInline` for the
`installation` ticket.

```sql
SELECT public.configure_technical_ticket_equipment(
  '<ticket_id>',
  'SN-TEST-INSTALL',
  'Model-M1'
);
```

**Assert 4c**: RPC returns without raising.

```sql
SELECT id, category, status, pending_new_serial, pending_new_model
  FROM support.tickets
 WHERE id = '<ticket_id>';
-- Expected: status='in_progress', pending_new_serial='SN-TEST-INSTALL', pending_new_model='Model-M1'
```

---

## Step 5: Resolve Ticket

Call `resolve_ticket(<ticket_id>)`.

```sql
SELECT public.resolve_ticket('<ticket_id>');
```

**Assert 5a**: One new `operations.equipment` row with `serial_number='SN-TEST-INSTALL'`,
`model='Model-M1'`, `building_id=<from ticket>`, `status='active'`.

```sql
SELECT id AS new_equipment_id, serial_number, model, building_id, status
  FROM operations.equipment
 WHERE serial_number = 'SN-TEST-INSTALL';
-- Expected: 1 row, status='active'
```

Record `<new_equipment_id>`.

**Assert 5b**: `support.tickets.equipment_id` set to `<new_equipment_id>`.

```sql
SELECT equipment_id, status
  FROM support.tickets
 WHERE id = '<ticket_id>';
-- Expected: equipment_id=<new_equipment_id>, status='resolved'
```

**Assert 5c**: `technical_order_items.intended_equipment_id` set to `<new_equipment_id>`.

```sql
SELECT intended_equipment_id, status
  FROM public.technical_order_items
 WHERE id = '<item_id>';
-- Expected: intended_equipment_id=<new_equipment_id>
```

**Assert 5d**: One `stock_movements` row with `type='egreso_instalacion'`, `quantity=-1`.

```sql
SELECT type, quantity, product_id
  FROM public.stock_movements
 WHERE order_item_id = '<item_id>' AND type = 'egreso_instalacion';
-- Expected: quantity=-1, product_id=<seeded>
```

**Assert 5e**: One `stock_movements` row with `type='liberacion_reserva'`, `quantity=+1`.

```sql
SELECT type, quantity, product_id
  FROM public.stock_movements
 WHERE order_item_id = '<item_id>' AND type = 'liberacion_reserva';
-- Expected: quantity=+1, product_id=<seeded>
```

**Assert 5f**: `products.stock_total` decreased by 1; `products.stock_reservado` back to prior value.

```sql
SELECT stock_total, stock_reservado, stock_disponible
  FROM public.products
 WHERE id = '<product_id>';
-- Expected: stock_total = prior - 1, stock_reservado = Step 2 baseline (reserva released)
```

---

## Step 6: Intent-Immutability Negative Tests

**Test 6a**: Attempt a direct UPDATE changing `intended_assignee_staff_id` on the resolved item
— must fail with `TECHNICAL_ORDER_ITEM_INTENT_LOCKED`.

```sql
UPDATE public.technical_order_items
   SET intended_assignee_staff_id = gen_random_uuid()
 WHERE id = '<item_id>';
-- Expected: ERROR P0001 — TECHNICAL_ORDER_ITEM_INTENT_LOCKED
```

**Test 6b**: Attempt a direct UPDATE changing `intended_equipment_id` without the GUC
— must also fail (the GUC is not set outside `resolve_ticket`).

```sql
UPDATE public.technical_order_items
   SET intended_equipment_id = gen_random_uuid()
 WHERE id = '<item_id>';
-- Expected: ERROR P0001 — TECHNICAL_ORDER_ITEM_INTENT_LOCKED
```

**Test 6c**: Verify the GUC does not persist between calls — new transaction starts without bypass.

```sql
-- In a fresh psql connection (no SET LOCAL in scope):
SHOW app.allow_resolve_equipment_id_write;
-- Expected: either 'false' or "unrecognized configuration parameter" (GUC never set globally)
```

---

## Rollback Procedure

If defects are found after applying the migration:

1. Re-run the three original function bodies from `supabase/migrations/20260831000000_baseline.sql`
   (lines 1087, 2975, and 3534) as a rollback migration, e.g.:
   `supabase/migrations/20260901130000_rollback_installation_lifecycle.sql`
2. Revert the five TypeScript files (the migration stays compatible with the old client code).
3. No data rollback is required — the new SQL logic only affects newly-created tickets and
   equipment; already-inserted rows are compatible with either code version.
