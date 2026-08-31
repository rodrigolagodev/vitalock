# Delta for Admin Technical Order Form

**Change**: technical-installation-stock-lifecycle
**Date**: 2026-08-31

---

## MODIFIED Requirements

### Requirement: product_id Is Required for Installation Items in TechnicalOrderForm

`TechnicalOrderForm` MUST require a `product_id` value when the user sets `item_type = 'installation'` on a technical order item. This closes the gap where the form currently returns `null` for `product_id` on installation items, preventing `confirm_technical_order` from emitting the stock reservation.

**Field behaviour:**

- `TechnicalItemEquipmentField` (or its equivalent for installation items) MUST render a product selector when `itemType === 'installation'`.
- The selector MUST be filtered to products whose `category = 'equipment'` (matching the filter already applied for `equipment_installation` items).
- The Zod schema for the form MUST mark `product_id` as required (non-nullable) when `item_type === 'installation'`.
- Submitting the form without selecting a product for an installation item MUST raise a validation error and MUST NOT call the confirm RPC.

**No change to `intended_equipment_id` on the form.** The form does not need to supply `intended_equipment_id` for installation items — that value is written by `resolve_ticket` at resolution time.

#### Scenario: product_id selector renders for installation items

- GIVEN an admin is creating a technical order item and selects `item_type = 'installation'`
- WHEN the form field for that item renders
- THEN a product selector is visible
- AND the selector is filtered to products with `category = 'equipment'`

#### Scenario: form submission blocked without product_id for installation item

- GIVEN the admin has set `item_type = 'installation'` on an order item
- AND the product_id field is left empty
- WHEN the admin submits the form
- THEN a Zod validation error is surfaced (e.g. "Product is required")
- AND no RPC call is made to `public.confirm_technical_order`

#### Scenario: form submits successfully when product_id is provided for installation item

- GIVEN the admin has set `item_type = 'installation'` on an order item
- AND has selected a product with `category = 'equipment'`
- WHEN the admin submits the form
- THEN the form calls `public.confirm_technical_order` with the item's `product_id` set
- AND a `reserva` movement is emitted for that product

#### Scenario: product_id remains optional for non-installation item types

- GIVEN the admin sets `item_type = 'maintenance'` or `item_type = 'equipment'`
- WHEN the form renders
- THEN the product selector for those item types follows the existing behaviour (no new required constraint imposed by this change)

## Key Learnings

1. The admin form — not the RPC — is the reason installation items carry `product_id = null` today. The fix is entirely in the TypeScript layer.
2. The product filter (`category = 'equipment'`) must match the existing filter for `equipment_installation` to keep the UI consistent and to avoid exposing non-equipment SKUs.
3. Making `product_id` required is a breaking form contract change for any admin currently in a draft order with an installation item — since draft orders are user-owned and short-lived, no data migration is needed.
