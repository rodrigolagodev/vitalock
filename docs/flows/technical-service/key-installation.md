---
name: key-installation-ticket
title: Key Installation Ticket — Resolution Flow
kind: journey
actors: [admin, installer]
covers_requirements:
  - tickets#category-domain
  - key-lifecycle#pending-installation-to-active
related_rpcs:
  - resolve_ticket
  - mark_key_order_item_installed
related_tables:
  - support.tickets
  - public.rfid_keys
  - public.key_order_items
covering_tests:
  pgtap: []
  vitest: []
last_verified: 2026-08-27
---

# Key Installation Ticket — Resolution Flow

## Purpose

`support.tickets.category = 'key_installation'` represents the physical
step of installing a **programmed** RFID key at a building reader —
transitioning `rfid_keys.status` from `pending_installation` to
`active`.

**Category status: retired producer, retained for historical rows.**
The category had an active producer through migration
`20260811000039_ticket_chain_and_stock_resolution.sql` (which chained
these tickets automatically after key_configuration resolution) and
`20260811000057_keys_ready_for_pickup_requires_installation.sql`
(which enforced their presence as a gate). Migration
`20260812000060_unify_work_tracking_model.sql:194-249` **explicitly
retired the producer** while keeping the category value in the CHECK
constraint so historical tickets from the pre-retirement period
remain valid. The comment at lines 235-249 of that migration
documents the decision: dropping `key_installation` from the CHECK
would reject archived rows, so the category is kept but no new rows
are emitted through the current flow.

## Actors & preconditions

- **installer** — would be the actor if the ticket were being emitted;
  the ticket would live in the installer app.
- **preconditions**: an `rfid_keys` row exists with
  `status='pending_installation'` and a `key_order_items.produced_key_id`
  linkage.

## State machine

Standard 3-state: `open → in_progress → resolved`.

## Happy path (as-designed, NOT wired)

1. A future flow would create a `key_installation` ticket when
   configuration completes, linked to
   `key_order_items.produced_key_id`.
2. Installer resolves via `resolve_ticket`.
3. On resolve, `rfid_keys.status` advances from `pending_installation`
   → `active` and `key_order_items.status` → `installed`, then
   `recompute_key_order_status` advances the parent to
   `ready_for_pickup`.

**This wiring is currently absent from the code base.** The only path
that advances `rfid_keys.status → active` is either:
- `mark_key_order_item_installed`
  (`supabase/migrations/20260823000097_key_orders_installation_stage.sql:153`)
  — has no UI caller (Known gap #1 in [[key-order-lifecycle]]).
- `resolve_equipment_update` (see [[equipment-update-ticket]]) — which
  activates ALL keys in the `keys_to_activate` array, not one at a time.

## Cross-cutting effects (as-designed)

- Would fire the key lifecycle transition
  `pending_installation → active`.
- Would emit `key_events(event_type='installed')`.

## Error paths & guards

Same as [[maintenance-ticket]].

## Known gaps

1. **The retirement left the key installation step under-covered**.
   The producer was removed on the assumption that
   `resolve_equipment_update` would cover
   `pending_installation → active` in batch. That path works for
   equipment sync but does NOT drive `key_order_items.status` to
   `installed` — which means new-path key orders still cannot reach
   `ready_for_pickup` without `mark_key_order_item_installed` being
   called (which has no UI caller — Known gap #1 in
   [[key-order-lifecycle]]). Consider one of:
   - Re-emitting `key_installation` tickets as a follow-up to
     `configure_key_order_item`, with a `resolve_key_installation`
     RPC.
   - Wiring `mark_key_order_item_installed` into an existing UI
     surface (installer worklist most likely).
   - Piggy-backing on `resolve_equipment_update` to advance the
     linked `key_order_items.status` when it processes a
     `keys_to_activate` list.

## QA checklist

- [ ] Verify no NEW ticket of `category='key_installation'` is created
      by the current flow. Historical rows may exist and should
      remain valid.
- [ ] If an archived `key_installation` ticket surfaces in the admin
      UI (`TareasTable.tsx:13` and `TareaFormSheet.tsx:99` DO handle
      the label), the resolve path is `resolve_ticket` — verify the
      `tickets_require_equipment_on_resolve` guard behavior.

## Related flows

- [[key-order-lifecycle]] — the parent flow that would benefit from
  wiring this ticket.
- [[equipment-update-ticket]] — the working path that currently
  handles `pending_installation → active`.
- [[key-configuration-ticket]] — the sibling legacy category.
