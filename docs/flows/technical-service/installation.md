---
name: installation-ticket
title: Installation Ticket — Resolution Flow
kind: journey
actors: [admin, installer]
covers_requirements:
  - tickets#category-domain
  - tickets#require-equipment-on-resolve
related_rpcs:
  - resolve_ticket
related_tables:
  - support.tickets
  - operations.equipment
covering_tests:
  pgtap:
    - supabase/tests-sql/test_resolve_ticket.sql
  vitest:
    - apps/installer/src/hooks/__tests__/useResolveTickets.test.ts
last_verified: 2026-08-27
---

# Installation Ticket — Resolution Flow

## Purpose

`support.tickets.category = 'installation'` is a **generic** installation
task that is NOT the specific `equipment_installation`, `key_installation`
or `equipment_update` categories. Use it when a technical order line
represents installation work not covered by the specialized categories
(e.g., ancillary hardware, cabling, panels).

**Important distinction**: `installation` (generic) vs
`equipment_installation` — the second one mints a new
`operations.equipment` row via `resolve_equipment_installation`; this
generic one does NOT.

## Actors & preconditions

- **admin** — creates the parent order with `item_type='installation'`.
- **installer** — resolves via generic `resolve_ticket`.
- **preconditions**:
  - Same as [[maintenance-ticket]] EXCEPT `intended_equipment_id` is
    OPTIONAL at order creation (installation may pre-exist without a
    specific equipment target).
  - If `intended_equipment_id` IS NULL at confirm time, the ticket may
    NOT be created at all (`confirm_technical_order` skips ticket
    generation when `building_id`/`admin_id` cannot be derived). See
    Known gap #1 in [[technical-order-lifecycle]].

## State machine

Same as [[maintenance-ticket]] — `open → in_progress → resolved` via a
single `resolve_ticket` call.

## Happy path

1. Ticket created by `confirm_technical_order`, category
   `installation`.
2. Installer resolves via `useResolveTickets`
   (`apps/installer/src/hooks/useResolveTickets.ts:13`) → RPC
   `resolve_ticket`.
3. `tickets_require_equipment_on_resolve` trigger (line 213 of
   migration 000052) applies to `installation` category, so the
   installer MUST provide an equipment_id before resolving. If the
   ticket was created without `equipment_id` set, resolving requires
   assigning one first (via the installer's ticket UI — verify this
   exists in the app).
4. Parent order recompute fires.

## Cross-cutting effects

- **No stock movement**. The UI does not expose a product picker for
  `installation` items (`TechnicalOrderForm.tsx:673` returns `null`
  when `item_type === 'installation'`), so `product_id` is always
  NULL and `confirm_technical_order` never creates a `reserva` for
  these items. Nothing to consume.

## Error paths & guards

Same as [[maintenance-ticket]] except this category may be created
without `equipment_id`, in which case the ticket must be assigned an
equipment_id before resolve.

## Known gaps

1. **Ambiguity between `installation` and `equipment_installation`**.
   The mapping in `confirm_technical_order:304` sets:
   - `item_type='installation'` → `ticket.category='installation'`
   - `item_type='equipment'` → `ticket.category='equipment_installation'`
   These are two separate workflows that share the "installation" word.
   The generic `installation` category does NOT mint equipment; only
   `equipment_installation` does (via `resolve_equipment_installation`).
   Consider renaming the generic one to reduce confusion.

## QA checklist

- [ ] Admin creates a technical order with 1 `installation` item that
      has an intended equipment set → confirm → ticket appears with
      `category='installation'`.
- [ ] Installer resolves via `resolve_ticket` → ticket resolves →
      parent order advances.
- [ ] Create an `installation` item WITHOUT `intended_equipment_id`
      → confirm. Does the ticket appear or not?
      (Expected: NO — Known gap #1 in [[technical-order-lifecycle]]).

## Related flows

- [[technical-order-lifecycle]] — parent order.
- [[equipment-installation-ticket]] — the specialized cousin that
  actually mints equipment.
- [[maintenance-ticket]] — same resolution mechanics.
