# Exploration: admin-ordenes

**Change**: admin-ordenes
**Phase**: explore
**Date**: 2026-08-10
**Persistence**: openspec + engram (`sdd/admin-ordenes/explore`)

## Summary

Build the Ordenes system in the admin app — the entry point that triggers all downstream work (key creation, installer tickets, customer pickup). Scope this cycle: CRUD + preparation phase (admin configures each key item → produces `rfid_keys` row).

## Locked user decisions

- Particular = embedded columns on `orders` (name/dni/phone/email)
- `rfid_keys.order_item_id` FK → `order_items.id` (new column)
- `order_items` is a NEW table, separate from `support.tickets`
- Scope this cycle: CRUD + preparation. Installer worklist reading order_items is a follow-up.

## DB State discovered

- `rfid_keys.key_request_item_id` already exists (legacy `sales.key_requests` system). NEW `order_item_id` column must coexist; mutual-exclusion CHECK prevents dual-linking.
- `rfid_keys_prevent_reassignment` trigger enforces immutability on `key_request_item_id` — must be extended to lock `order_item_id` once set.
- `sales.recompute_request_status()` is the established DB idiom for auto-transitioning parent status from child items — reuse the pattern for order status.
- RLS pattern: `identity.is_admin()` FOR ALL, `identity.is_installer()` targeted SELECT/UPDATE.

## Schema Design

**`public.orders`**
- id (uuid), order_number (text, unique — via sequence `ORD-YYYY-NNNNNN`)
- client_type ('administration'|'particular')
- administration_id (nullable FK)
- particular_full_name / dni / phone / email (nullable — populated when particular)
- status ('draft'|'in_preparation'|'ready_for_pickup'|'completed'|'cancelled')
- notes, created_by_staff_id, created_at, updated_at
- CHECK: consistent client_type + required fields

**`public.order_items`**
- id, order_id (FK, ON DELETE RESTRICT), item_type ('key'|'equipment'|'maintenance'|'installation')
- quantity (>0), description, status ('pending'|'configured'|'in_progress'|'completed'|'cancelled')
- building_id (nullable — required for key/equipment items)
- equipment_id (nullable — for maintenance/installation)
- produced_key_id (nullable FK — set when key is configured)
- assigned_to_staff_id (nullable), notes, created_at, updated_at

**`rfid_keys.order_item_id`** (new column, nullable, FK to order_items, mutual-exclusion with key_request_item_id)

## Order status state machine

```
draft ──▶ in_preparation ──▶ ready_for_pickup ──▶ completed
   │            │                     │
   └── cancelled ◀──────────────────  ┘
```

- `draft → in_preparation`: manual button
- `in_preparation → ready_for_pickup`: auto via trigger when all non-cancelled `key` items reach status='configured'
- `ready_for_pickup → completed`: manual (retiro flow — out of scope)
- Any non-terminal → cancelled: manual

## Item type semantics (this cycle)

| type | this cycle behavior |
|---|---|
| `key` | Admin "Configurar": creates `rfid_keys` row (order_item_id set) + optional `key_authorizations` for target equipment. Item status → 'configured'. |
| `equipment` / `maintenance` / `installation` | Item created + visible in order detail as pending. Installer-side integration deferred to next cycle. |

## Atomic create-order-with-items

Supabase client has no multi-statement transaction. Use PL/pgSQL RPC `create_order_with_items(order_data jsonb, items jsonb[]) returns uuid` to guarantee atomicity.

## Affected files

**Migrations (3)**: orders, order_items, rfid_keys.order_item_id + trigger extension.

**New admin files (11)**:
- hooks: `useOrdens`, `useOrden`, `useMutateOrden`, `useMutateOrderItem`
- routes: `OrdenesPage`, `OrdenDetailPage`
- components: `OrdenFormSheet`, `OrdenesTable`, `OrderItemsTable`, `ConfigureKeyItemSheet`, `OrdenStatusBadge`

**Modified admin files (5)**: main.tsx (routes), Sidebar (new NavSection), queryKeys (ordensKey, ordenKey), mapMutationError (new SQLSTATE cases), useMutateKey (accept order_item_id).

**Also**: rebuild `QuickUnitCreateDialog` (deleted with old KeyFormSheet) — reused inside ConfigureKeyItemSheet.

## Sidebar

Add new "Ordenes" NavSection (NOT activating the disabled "Ventas" slot — ordenes is its own top-level concept).

## Risks

1. **Dual-FK trigger extension** — `rfid_keys_prevent_reassignment` must lock `order_item_id`; if not, silent audit hole.
2. **Auto-transition trigger** must exclude cancelled items; single cancellation must not prematurely trigger ready_for_pickup.
3. **Partial-write risk** on client-side sequential inserts — mitigated by RPC.
4. **Budget >400 lines**: 3 chained PRs recommended (PR#1 migrations+types+hooks, PR#2 list+create, PR#3 detail+configure).
5. **Types regen** is hard prerequisite before hooks — first task of PR#1.
6. **RLS for installer on order_items**: skip this cycle (no installer UI yet), add when installer worklist refactor arrives.

## Pending user decisions

- Q3: `equipment` vs `installation` item types — same concept or distinct?
- Q4: OrdenesPage filters — status-only or also client_type + date range?

(Defaults applied: Q1 ORD-YYYY-NNNNNN numbering, Q2 auto-transition via trigger, Q5 authorizations optional multi-select at configure time, Q6 rebuild QuickUnitCreateDialog for reuse.)
