# Proposal: admin-ordenes

## Intent

Admin staff have no structured workflow for creating service orders (key delivery, equipment, maintenance, installation). Orders are tracked informally, causing mismatches between keys issued, work performed, and client expectations. This cycle introduces the Ordenes system: the central entry point that governs key creation (via preparation phase) and seeds downstream installer tasks.

## Scope

### In Scope

- DB schema: `public.orders`, `public.order_items` tables + `rfid_keys.order_item_id` FK + mutual-exclusion constraint
- DB logic: order number sequence (`ORD-YYYY-NNNNNN`), auto-status trigger (`in_preparation → ready_for_pickup`), atomic RPC `create_order_with_items`, RLS for admin role
- Admin CRUD: list (OrdenesPage), create (OrdenFormSheet), detail (OrdenDetailPage), cancel
- Preparation phase: ConfigureKeyItemSheet — assign rfid_code + unit + optional key_authorizations; produces `rfid_keys` row with `order_item_id` FK
- QuickUnitCreateDialog rebuild (inline within ConfigureKeyItemSheet)
- Sidebar: new "Ordenes" NavSection
- Types regeneration after migrations

### Out of Scope

- Installer worklist integration (`order_items` RLS for installer role deferred)
- `ready_for_pickup → completed` retiro flow (status transition allowed in DB, no UI)
- Stock control for equipment items (deferred to a future cycle)
- equipment / maintenance / installation item preparation UI (items created, remain `pending`)
- Date-range filter on OrdenesPage

## Capabilities

### New Capabilities

- `ordenes-admin`: Full CRUD + preparation lifecycle for admin-managed service orders, including order creation with items, key preparation (ConfigureKeyItemSheet), order status management, and list/detail views

### Modified Capabilities

- `equipment-admin`: `rfid_keys` gains `order_item_id` FK — `useMutateKey.createKey` input type widens to accept optional `order_item_id`
- `admin-shell`: Sidebar gains new "Ordenes" NavSection; `queryKeys.ts` and `mapMutationError.ts` extended

## Approach

Follow the established admin CRUD pattern (hooks + TanStack Query + RHF/Zod sheets + Shadcn table) with three additions:

1. **DB-first atomicity**: PL/pgSQL RPC `create_order_with_items` replaces client-side sequential inserts.
2. **Trigger-driven status**: reuse `sales.recompute_request_status()` pattern for order auto-transition (`in_preparation → ready_for_pickup` when all non-cancelled key items reach `configured`).
3. **Dual-FK coexistence**: `rfid_keys.order_item_id` added alongside existing `key_request_item_id`; mutual-exclusion CHECK + trigger extension prevents silent reassignment bugs.

Delivery: 3 chained PRs (PR#1 migrations+types, PR#2 list+create, PR#3 detail+configure).

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `supabase/migrations/` | New (3 files) | orders, order_items, rfid_keys FK + trigger extension |
| `packages/supabase/src/database.types.ts` | Modified | Regenerated after migrations |
| `apps/admin/src/hooks/` | New (4) + Modified (1) | useOrdens, useOrden, useMutateOrden, useMutateOrderItem; useMutateKey widens input |
| `apps/admin/src/routes/ordenes/` | New (2) | OrdenesPage, OrdenDetailPage |
| `apps/admin/src/components/ordenes/` | New (5) | OrdenFormSheet, OrdenesTable, OrderItemsTable, ConfigureKeyItemSheet, OrdenStatusBadge |
| `apps/admin/src/components/layout/Sidebar.tsx` | Modified | New "Ordenes" NavSection |
| `apps/admin/src/main.tsx` | Modified | Add /ordenes and /ordenes/:ordenId routes |
| `apps/admin/src/lib/queryKeys.ts` | Modified | ordensKey, ordenKey |
| `apps/admin/src/hooks/mapMutationError.ts` | Modified | New SQLSTATE cases (23514, 23503) |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| `rfid_keys_prevent_reassignment` trigger not extended for `order_item_id` | Med | Explicit migration step; test by attempting double-set |
| Auto-transition trigger fires prematurely if cancelled items miscounted | Med | Trigger filters `status != 'cancelled'` before counting; integration test |
| Partial order+items write (client-side failure) | Low | Atomic RPC eliminates this; RPC is first deliverable of PR#1 |
| Types not regenerated before hooks compile | High | Types regen is first task of PR#1; CI will fail fast if skipped |
| Budget >400 lines | High | 3 chained PRs; each PR is independently deployable |

## Rollback Plan

- PR#1 (migrations): run `supabase db reset` on local; on production, apply inverse migration dropping `order_items`, `orders`, and the `rfid_keys.order_item_id` column (FK cascade-safe: `order_item_id` is nullable).
- PR#2–3 (admin UI): revert commits; no DB change required. `rfid_keys.order_item_id` column remains but unused.

## Dependencies

- `packages/supabase/src/database.types.ts` regeneration blocks all hooks — must be first deliverable
- `public.administrations`, `public.buildings`, `public.rfid_keys`, `operations.equipment` tables must exist (already established by prior cycles)
- QuickUnitCreateDialog is a net-new component (deleted with old Llaves cleanup); must be built before ConfigureKeyItemSheet is usable

## Success Criteria

- [ ] Admin can create an order for an administration or a particular with 1+ items
- [ ] Order number is auto-generated in `ORD-YYYY-NNNNNN` format and visible in list/detail
- [ ] Admin can configure a key item: assigns rfid_code + unit + optional equipment authorizations → produces an `rfid_keys` row with `order_item_id` set
- [ ] Order transitions to `ready_for_pickup` automatically when all non-cancelled key items are configured
- [ ] Mutual-exclusion constraint prevents a key from linking both `key_request_item_id` and `order_item_id`
- [ ] OrdenesPage filters by status (pill) and searches by order_number / administration name / particular name with debounce
- [ ] Order cancellation is blocked if terminal state already reached (DB enforced)
- [ ] All existing `rfid_keys` rows with `key_request_item_id` are unaffected by the migration
