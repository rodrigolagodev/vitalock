---
name: equipment-installation-ticket
title: Equipment Installation Ticket — Resolution Flow
kind: journey
actors: [admin, installer]
covers_requirements:
  - tickets#category-domain
  - tickets#require-equipment-on-resolve
  - stock-inventory#egress-on-equipment-installation
related_rpcs:
  - resolve_equipment_installation
related_tables:
  - support.tickets
  - operations.equipment
  - public.buildings
  - public.stock_movements
covering_tests:
  pgtap:
    - supabase/tests-sql/test_092_resolve_rpcs_dual_fk.sql
    - supabase/tests-sql/test_110_resolve_dual_fk_ticket_paths.sql
    - supabase/tests-sql/test_120_two_step_configure_resolve.sql
  vitest: []
last_verified: 2026-08-27
---

# Equipment Installation Ticket — Resolution Flow

## Purpose

Installing a **new** physical equipment (RFID reader, controller, etc.)
at a building. The installer arrives with an equipment unit off the
stock and physically wires it up; resolving the ticket mints the
`operations.equipment` row, marks it `active`, and consumes the
reserved stock.

Generated from `technical_order_items.item_type='equipment'` at
`confirm_technical_order` (mapped to `category='equipment_installation'`
at line 308 of the create RPC).

## Actors & preconditions

- **admin** — creates the parent order, must set
  `product_id` (the SKU being installed) and
  `intended_assignee_staff_id`. `intended_equipment_id` is NOT
  required (the equipment does not exist yet).
- **installer** — resolves the ticket in the field, providing the
  serial number of the physical unit and optionally the unit id.
- **preconditions**:
  - `products` row with sufficient `stock_disponible` (checked at
    reservation time).
  - Building context comes from — wait, no: `equipment_installation`
    at confirm time has NO `intended_equipment_id`, so `building_id`
    cannot be derived via the equipment→building join. See Known gap
    below.

## State machine

Standard 3-state: `open → in_progress → resolved`. The
`resolve_equipment_installation` RPC performs both transitions inside
one call (lines 184-197).

## Happy path

1. Parent order confirms → `confirm_technical_order` creates the
   ticket, **only if** `building_id`/`admin_id` can be derived — which
   they cannot when `intended_equipment_id` is null. Verify: an
   `installation` item MUST have `intended_equipment_id` set (perhaps
   the "target" equipment). If null, no ticket is created and the
   order is stuck.
2. Installer opens the ticket in the app → sees description, target
   building, and product info.
3. Installer taps **Resolver** → provides serial and optional unit id
   → `useResolveEquipmentInstallation` → RPC
   `resolve_equipment_installation(p_ticket_id, p_serial, p_unit_id,
   p_note?, p_actor_staff_id?)`
   (`supabase/migrations/20260818000092_resolve_rpcs_dual_fk_aware.sql:40`).
4. RPC steps (inside one transaction):
   - Locks the ticket, validates it is `equipment_installation` and not
     already resolved.
   - INSERTs a new `operations.equipment` row with
     `status='active'`, `serial_number=p_serial`, `building_id`
     (from the ticket), description from the ticket description.
   - UPDATEs the ticket to link `equipment_id = <new equipment.id>` —
     required BEFORE the resolve UPDATE because the
     `tickets_require_equipment_on_resolve` trigger would reject it
     otherwise.
   - Locates the `reserva` movement via `technical_order_item_id`
     (new path, line 138) or `ticket_id` (legacy path, line 149).
   - Emits `egreso_instalacion` (negative) + `liberacion_reserva`
     (positive) → net: reservation converted to definitive out.
   - Transitions the ticket `open → in_progress → resolved` atomically
     (lines 184-197).

## Cross-cutting effects

- **Mints `operations.equipment`** with `status='active'` — this is
  the ONE and only path to create equipment in Vitalock. Adding
  equipment manually via direct INSERT bypasses the ticket lineage.
- **Stock**: consumes the reservation. See [[stock-reservation]].
- **Order recompute**: `tickets_sync_order_status` fires → parent
  order advances via [[recompute-status]].

## Error paths & guards

| Trigger | Guard | Effect |
|---|---|---|
| Empty `serial` | `p_serial IS NULL OR length(trim)=0` check | Raises `serial is required` |
| Wrong category | Category check inside RPC | Raises `ticket is not an equipment_installation` |
| Already resolved | Status check | Raises `already resolved` |
| Resolve without stock reserva (product_id null) | RPC skips stock movements silently | Ticket resolves anyway — order still advances |
| Trigger `tickets_require_equipment_on_resolve` | Would fire if `equipment_id` were still null | RPC sets `equipment_id` first (line 120) |

## Known gaps

1. **`equipment_installation` category assumes `building_id` is
   derivable at confirm time**. The `confirm_technical_order` RPC
   requires `intended_equipment_id` to derive building context. But
   an "equipment installation" item semantically means the equipment
   does NOT exist yet. This tension might mean:
   - The `intended_equipment_id` for an `equipment` item is
     actually the "replacement target" or building anchor — verify
     the UI form.
   - OR: this category has a real coverage gap in the confirm RPC.
2. **No pgTAP coverage listed for the new-path dual-FK resolve**.
   Verify.

## QA checklist

- [ ] Admin creates technical order with `equipment` item →
      `product_id` set + `intended_assignee_staff_id` set +
      `intended_equipment_id` set (whatever the UI requires) →
      confirm → verify:
  - Ticket exists with `category='equipment_installation'`,
    `status='open'`, `equipment_id` set to the intended.
  - `stock_movements` shows a `reserva` for the product.
- [ ] Installer resolves with serial `X-001` → verify:
  - New `operations.equipment` row with `serial_number='X-001'`,
    `status='active'`, correct `building_id`.
  - Ticket `status='resolved'`, `equipment_id` = the new equipment.
  - `stock_movements` has `egreso_instalacion` (`-qty`) +
    `liberacion_reserva` (`+qty`).
  - Parent order advances.
- [ ] Try to resolve with empty serial → RPC rejects.

## Related flows

- [[technical-order-lifecycle]] — parent.
- [[stock-reservation]] — reservation → egress mechanics.
- [[equipment-replacement-ticket]] — the sibling that swaps equipment
  identity.
