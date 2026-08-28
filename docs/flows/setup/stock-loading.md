---
name: stock-loading
title: Stock — Product Creation & Manual Movements
kind: journey
actors: [admin]
covers_requirements:
  - stock-inventory#manual-movement-types
  - stock-inventory#product-with-initial-stock
  - stock-inventory#sign-matches-type
related_rpcs:
  - create_stock_movement
  - create_product_with_initial_stock
related_tables:
  - public.products
  - public.stock_movements
covering_tests:
  pgtap: []
  vitest:
    - apps/admin/src/hooks/__tests__/useMutateStockMovement.test.ts
    - apps/admin/src/hooks/__tests__/useStockMovements.test.ts
    - apps/admin/src/components/stock/__tests__/AjusteStockSheet.test.tsx
    - apps/admin/src/routes/stock/__tests__/StockPage.test.tsx
last_verified: 2026-08-27
---

# Stock — Product Creation & Manual Movements

## Purpose

Stock in Vitalock is modeled as an **append-only movement ledger**
(`stock_movements`) tied to global SKUs (`products`). Available stock is
NEVER a stored column — it is a computed sum of movements filtered by type
and sign. This doc describes how an admin loads new inventory, adjusts
existing quantities, and creates a brand-new SKU.

The append-only design has one big consequence: no operation ever
"decreases inventory" directly. Every consumption or write-off is a new
row with a negative `quantity`. This is why the type/sign constraint
matters — the sign encodes the semantic direction.

For the automatic movements that key/technical orders emit, see
[[stock-reservation]] (this doc covers ONLY the operator-driven manual
movements).

## Actors & preconditions

- **admin** — creates products, records movements. The RPC rejects any
  caller without admin role.
- **preconditions**: none (products are global; no building/administration
  linkage on SKUs).

## Stock movement type catalog

The `stock_movements.type` CHECK constraint allows exactly 10 values
(`supabase/migrations/20260812000061_atomic_stock_work_resolution.sql:29`):

| Type | Origin | Sign | Meaning |
|---|---|---|---|
| `compra` | manual (this flow) | positive | Purchase from supplier |
| `devolucion` | manual (this flow) | positive | Return to inventory |
| `ajuste_manual` | manual (this flow) | any | Corrective adjustment (± or 0) |
| `baja_defectuoso` | manual (this flow) | negative | Write-off — defective unit |
| `baja_perdida` | manual (this flow) | negative | Write-off — lost unit |
| `reserva` | auto (key/technical orders) | negative | Reservation at order confirm |
| `liberacion_reserva` | auto (RPCs and triggers) | positive | Release the reservation |
| `egreso_grabacion` | auto (`configure_key_order_item`) | negative | Definitive out at RFID configuration |
| `egreso_instalacion` | auto (`resolve_equipment_installation`) | negative | Definitive out at equipment install |
| `egreso_reemplazo` | auto (`resolve_equipment_replacement`) | negative | Definitive out at equipment replacement |

The **sign** is enforced by
`stock_movements_sign_matches_type` (line 52 of the same migration). Any
INSERT that violates the sign expectation for its type is rejected.

## Happy path

### Option A — Load stock into an existing product

1. Admin lands on `/stock` → `apps/admin/src/routes/stock/StockPage.tsx`.
2. Clicks **Cargar producto** → opens `CargarProductoSheet.tsx:67`.
3. Selects mode `existing` (default). Picks a product from the Select,
   enters `quantity > 0`, optional `unit_cost`, optional `note`.
4. Submits →
   `useMutateStockMovement.createMovement`
   (`apps/admin/src/hooks/useMutateStockMovement.ts:32`) → RPC
   `create_stock_movement(p_product_id, p_type='compra', p_quantity,
   p_unit_cost?, p_note?, p_actor_staff_id?)`
   (`supabase/migrations/20260811000046_stock_compra_optional_cost.sql:15`).
5. RPC validates:
   - Caller role is admin.
   - Type is in the manual set (`compra`, `devolucion`, `ajuste_manual`,
     `baja_defectuoso`, `baja_perdida`).
   - `p_quantity != 0`.
   - Sign matches the type per the CHECK.
6. INSERTs into `stock_movements` with the right sign and links
   `created_by = p_actor_staff_id`. If type is `compra` and
   `unit_cost > 0`, also updates `products.cost_price` (this is the only
   place products.cost_price mutates from user input).
7. Toast: "Movimiento de stock registrado."

### Option B — Create a new product with initial stock

8. In `CargarProductoSheet`, admin toggles to mode `new`.
9. Fills `name`, `category` (from `ProductFormFields`), `unit_cost >= 0.01`
   (required, unlike existing mode), `quantity >= 1`, optional `note`.
10. Submits →
    `useMutateStockMovement.createProductWithStock`
    (`apps/admin/src/hooks/useMutateStockMovement.ts:53`) → RPC
    `create_product_with_initial_stock(p_name, p_category, p_cost_price?,
    p_quantity, p_note?, p_actor_staff_id?)`.
11. RPC inserts a `products` row and — atomically — a single `compra`
    movement for the initial stock, in one transaction.
12. On DB unique-violation (code `23505`) the sheet catches and shows an
    inline error suggesting the admin switch to `existing` mode
    (`CargarProductoSheet.tsx:149`).

### Option C — Adjust or write-off existing stock

13. Admin lands on `/stock/:productId` → `StockDetailPage.tsx`.
14. Clicks **Nuevo movimiento** → opens `AjusteStockSheet.tsx:100`.
15. Picks a movement type from `MANUAL_TYPES`
    (`ajuste_manual`, `baja_defectuoso`, `baja_perdida`, `compra`,
    `devolucion`).
16. Enters `quantity`. UI projects `stockDisponible + quantity` live and
    disables submit if the result would be negative
    (`AjusteStockSheet.tsx:141`).
17. Submits → same `createMovement` mutation → same RPC.

## Cross-cutting effects

- **Availability is computed**: `products.stock_disponible`,
  `stock_total`, and `stock_reservado` are read from the
  view/materialized aggregation (not a stored column). Every movement
  invalidates `productsKey()` and `stockMovementsKey(productId)`.
- **`cost_price` updates only on `compra`**: no other manual type
  mutates it. A `devolucion` movement carries a `unit_cost` for audit
  but the product's cost stays put.
- **RPC gate**: `create_stock_movement` REJECTS any type outside the
  manual set (line 49). This is why the auto-emitted types
  (`reserva`, `egreso_*`, `liberacion_reserva`) can ONLY be created by
  the trusted RPCs (`configure_key_order_item`, `confirm_key_order`, the
  cancel trigger, `resolve_equipment_installation`, etc.), never by the
  operator UI.

## Error paths & guards

| Trigger | Guard | Effect |
|---|---|---|
| Non-admin caller | `identity.is_admin()` check inside `create_stock_movement` | Raises `create_stock_movement: admin role required` |
| Manual RPC with an auto type | Type check inside RPC | Raises `not a manual stock movement type` |
| `quantity = 0` | Zero-guard inside RPC | Raises `quantity must not be zero` |
| Positive quantity for a negative-only type | Sign check inside RPC + CHECK constraint | Raises inside RPC or at DB layer |
| New product with existing `(name, category)` | DB UNIQUE constraint on products | Returns `23505`, sheet shows friendly message |
| Movement that would leave availability negative | UI-side projection in `AjusteStockSheet:142` | Submit button disabled |

## Known gaps

1. **The negative-availability guard is client-side only**. If the RPC
   is invoked directly (via curl or a script) with a quantity that
   drops availability below zero, the DB will accept it — no DB-side
   trigger enforces this. Consider adding a trigger that computes
   post-movement availability and rejects negative results, or an
   opt-in reserve/consume workflow that is invariant to caller ordering.
2. **Product delete has no UI**. Products are effectively immutable
   post-creation (only `cost_price` mutates via `compra` movements). If
   a wrong SKU is created, an admin must fix it in DB directly. There
   is no `deleteProduct` mutation or soft-delete status column visible
   in `useMutateStockMovement`.
3. **No pgTAP coverage listed**. The Vitest tests are strong but there
   is no dedicated pgTAP suite for `create_stock_movement` and
   `create_product_with_initial_stock` in `supabase/tests-sql/`. Verify
   before shipping cost-related changes.

## QA checklist

- [ ] Login as admin → `/stock` → **Cargar producto** → mode `new` →
      fill name, pick a category, cost 100, quantity 10 → row appears
      with `stock_total=10`, `stock_disponible=10`, `cost_price=100`.
- [ ] Try to create the same `(name, category)` again → sheet shows the
      inline duplicate error.
- [ ] Switch to `existing` mode → pick the product → quantity 5, cost 0
      → confirm `stock_disponible=15` and `cost_price` unchanged.
- [ ] Same as above but cost 120 → confirm `stock_disponible=20` and
      `cost_price=120`.
- [ ] On the detail page, register an `ajuste_manual` of `-3` →
      confirm `stock_disponible=17` and a ledger row with the note.
- [ ] Try `ajuste_manual` of `-1000` → the submit button disables and
      shows "el movimiento dejaría el stock en negativo".
- [ ] Register `baja_defectuoso` of `+5` → RPC rejects (sign mismatch).
- [ ] Login as installer → `/stock` route not reachable (RLS + no
      sidebar entry).

## Related flows

- [[stock-reservation]] — the auto `reserva` / `liberacion_reserva` /
  `egreso_*` mechanics fired by orders. Everything the operator does not
  do manually.
- [[administration-creation]] — orthogonal (stock is global).
- [[key-order-lifecycle]] — the primary consumer via
  `egreso_grabacion`.
- [[equipment-installation]] — via `egreso_instalacion`.
- [[equipment-replacement]] — via `egreso_reemplazo`.
