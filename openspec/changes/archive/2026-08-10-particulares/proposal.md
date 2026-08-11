# Proposal: particulares

## Intent

Particulares (unit owners who buy directly from Vitalock, no administration) exist only as flat fields on `orders` (`particular_full_name/dni/phone/email`) — no entity, no legal 1:1 traceability to a unit, and no way to register who picked up an order-produced key. This change promotes particulares to a first-class `public` entity, wires them into order creation and pickup flows, and unblocks key-pickup registration for order-produced keys.

## Scope

### In Scope

- `public.particulares` table: `unit_id NOT NULL UNIQUE` (1:1), `dni NOT NULL UNIQUE`, contact fields, timestamps
- Orders: `orders.particular_id` FK + flat `particular_*` kept as audit snapshot; `orders.pickup_particular_id` nullable FK (authorized pickup person; checkbox "usar mismos datos" → equals `particular_id`)
- Pickup registration for order-produced keys: extend `rfid_keys_validate_pickup` for the `order_item_id` path, validating `picked_up_by_dni` against the order's authorized particular
- `key_requests`: add `requester_particular_id` + `pickup_particular_id` FKs only; `requester_type` enum stays `individual`
- Frontend: `ParticularSelector` (server-side search, `useAdministrations` pattern), `QuickParticularCreateDialog` (inline create), pickup section in OrdenDetailPage, snapshot autocomplete from entity
- Backfill from historical orders (unit inferred via `order_items.produced_key_id → rfid_keys.unit_id`), DNI dedupe

### Out of Scope

- Full sales/key_requests flow integration for particulares (no UI exists; FKs added only)
- Renaming `key_requests.requester_type` enum (state machine + triggers, no benefit)
- Porters/caretakers (administration-key flow, separate)
- Dropping legacy flat `particular_*` columns

## Capabilities

### New Capabilities

- `particulares-admin`: entity management — server-side search selector, inline create, 1:1 unit binding

### Modified Capabilities

- `ordenes-admin`: client becomes entity-backed (`particular_id` + snapshot), pickup section with checkbox, key pickup registration (`ready_for_pickup → completed` UI path)
- `equipment-admin`: `rfid_keys` pickup validation extended to the `order_item_id` origin

## Requirements Overview

- **1:1 enforced by DB**: `unit_id` and `dni` UNIQUE — one particular per unit; DNI is the identity
- **Inline create**: in order form, search existing particular or create one (QuickParticularCreateDialog, `onCreated` pattern)
- **Pickup person**: search existing / create / "same as buyer" checkbox
- **Pickup registration**: `rfid_keys_validate_pickup` accepts `order_item_id`; `picked_up_by_dni` must match order buyer or `pickup_particular_id`
- **Auto-complete (confirmed by user)**: when all non-cancelled key items have `picked_up_at`, order → `completed`; checked at pickup time, no recompute trigger this cycle

## Implementation Notes

- Migrations `20260810HHMMSS_*.sql`: table, FK columns, trigger extension, RLS policy (public tables: policy only, no explicit grants)
- RPC: extend `create_order_with_items` to set `particular_id` (DNI match or new row) while keeping the flat snapshot
- Backfill: skip seed.sql DNI `20345678` (administration key-request pickup — not a particular)
- Frontend: `apps/admin/src/components/particulares/` (selector + quick-create), OrdenDetailPage pickup section; types via `npm run gen:types`

## Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Trigger change breaks existing key_request pickup path | High | Keep `key_request_item_id` branch intact; tests for both origins |
| Backfill wrong unit association | Med | Best-effort: un-inferable rows get `particular_id = NULL`; DNI dedupe keeps first |
| Legacy flat data orphaned from entity | Med | Snapshot preserved; backfill links when unit inferable |
| Scope creep into sales flow | Med | FKs only; no key_requests UI |

## Rollback Plan

- Migrations: inverse migration drops FK columns and table; trigger reverted to prior body (origin paths are nullable)
- Frontend: revert commits; legacy `particular_*` fields remain functional

## Dependencies

- `packages/supabase/src/database.types.ts` regeneration blocks hooks — first deliverable
- `public.units`, `public.orders`, `public.rfid_keys` from prior cycles

## Success Criteria

- [ ] Admin creates an order for a particular with entity linkage (search or inline create)
- [ ] Pickup of an order-produced key registers `picked_up_*` (explore blocker removed)
- [ ] Backfill links historical orders with inferable units; no seed DNI pollution
- [ ] Existing administration and key_requests flows unaffected
