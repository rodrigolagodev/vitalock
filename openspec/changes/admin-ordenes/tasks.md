# Tasks: admin-ordenes

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~1 100–1 400 (3 migrations + type regen + 4 new hooks + 2 modified hooks + 2 route pages + 6 new components + 2 modified files + tests) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 → PR 2 → PR 3 (stacked-to-main) |
| Delivery strategy | auto-chain |
| Chain strategy | stacked-to-main |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | DB migrations + types + hooks + queryKeys + mapMutationError | PR 1 | `pnpm vitest run apps/admin/src/hooks` | `supabase db reset && supabase db push` | Drop 3 migrations; revert queryKeys.ts, mapMutationError.ts, useMutateKey.ts; delete 4 new hook files |
| 2 | OrdenesPage + OrdenesTable + OrdenFormSheet + OrdenStatusBadge + Sidebar + routes | PR 2 | `pnpm vitest run apps/admin/src/components/ordenes` | Navigate to `/ordenes`; create an order in local dev | Revert Sidebar.tsx, main.tsx; delete routes/ordenes/ and components/ordenes/ (partial) |
| 3 | OrdenDetailPage + OrderItemsTable + ConfigureKeyItemSheet + QuickUnitCreateDialog | PR 3 | `pnpm vitest run apps/admin/src/components/ordenes` | Navigate to `/ordenes/:id`; configure a key item | Delete OrdenDetailPage.tsx, OrderItemsTable.tsx, ConfigureKeyItemSheet.tsx, QuickUnitCreateDialog.tsx |

---

## Phase 1 — DB + Types + Hooks (PR 1)

- [x] 1.1 Create `supabase/migrations/20260810000022_orders.sql`: `public.orders` table, `order_number` sequence, `gen_order_number()` function, `recompute_order_status(p_order_id uuid)` function, `order_items_trigger_recompute()` function, `order_items_recompute_order_status` AFTER UPDATE OF status trigger, RLS enable (permissive for authenticated role, TODO installer).
- [x] 1.2 Create `supabase/migrations/20260810000023_order_items.sql`: `public.order_items` table (item_type, quantity, building_id, status, produced_key_id FK), `set_updated_at` trigger, RLS enable, `create_order_with_items(p_order jsonb, p_items jsonb[]) returns uuid` RPC (security definer), `configure_key_order_item(p_order_item_id uuid, p_rfid_code text, p_unit_id uuid, p_equipment_ids uuid[]) returns uuid` RPC.
- [x] 1.3 Create `supabase/migrations/20260810000024_rfid_keys_order_item_fk.sql`: add `order_item_id uuid REFERENCES public.order_items(id)` column, mutual-exclusion CHECK (`key_request_item_id IS NULL OR order_item_id IS NULL`), extend `rfid_keys_prevent_reassignment()` with `order_item_id` immutability guard.
- [x] 1.4 Regenerate `packages/supabase/src/database.types.ts` via `supabase gen types typescript --local > packages/supabase/src/database.types.ts` after applying migrations locally.
- [x] 1.5 Modify `apps/admin/src/lib/queryKeys.ts`: add `ordensKey(status?: string, search?: string)` and `ordenKey(id: string)` following existing pattern.
- [x] 1.6 Modify `apps/admin/src/hooks/mapMutationError.ts`: add `23505` branch for `orders_order_number` detail → `'Ya existe una orden con ese número. Reintentá.'`; add `P0001` branch for `configure_key` substring → `'Error al configurar la llave. Revisá los datos.'`; add `P0001` branch for `create_order` substring → `'Error al crear la orden. Revisá los datos.'`; add `23503` branch for cancel context (substring detection before the generic 23503 handler).
- [x] 1.7 Create `apps/admin/src/hooks/useOrdens.ts`: `useOrdens({ search?, status? })` — PostgREST select with `administrations(company_name)` embed, `ordensKey(status, search)` query key, server-side `.ilike` filter on `order_number` + `particular_full_name`, debounce applied at call-site; client-side filter on embedded `administrations.company_name`.
- [x] 1.8 Create `apps/admin/src/hooks/useOrden.ts`: `useOrden(id: string)` — select `orders` + `order_items` embedded, `ordenKey(id)` query key.
- [x] 1.9 Create `apps/admin/src/hooks/useMutateOrden.ts`: `createOrden` (`supabase.rpc('create_order_with_items', { p_order, p_items })`; on success invalidate `ordensKey()`; `toastMutationError` on error), `cancelOrden` (UPDATE status='cancelled'; invalidate `ordensKey()` + `ordenKey(id)`), `advanceOrdenStatus` (UPDATE status draft→in_preparation; invalidate same keys).
- [x] 1.10 Create `apps/admin/src/hooks/useMutateOrderItem.ts`: `configureKeyItem` (`supabase.rpc('configure_key_order_item', { p_order_item_id, p_rfid_code, p_unit_id, p_equipment_ids })`; on success invalidate `ordenKey(orderId)` + `ordensKey()` + `keysKey(buildingId)`; toast success/error), `cancelOrderItem` (UPDATE status='cancelled'; invalidate `ordenKey(orderId)` + `ordensKey()`).
- [x] 1.11 Modify `apps/admin/src/hooks/useMutateKey.ts`: widen `CreateKeyInput` with `order_item_id?: string | null`; pass through to `.insert(input)` (no other changes needed).

### Phase 1 Tests

- [x] 1.12 Write `apps/admin/src/hooks/__tests__/mapMutationError.test.ts` (extend existing or create): RED tests for `23505` + `orders_order_number` detail → correct Spanish message; `P0001` + `configure_key` → correct message; `P0001` + `create_order` → correct message.
- [x] 1.13 Write `apps/admin/src/hooks/__tests__/useOrdens.test.ts`: mock Supabase; assert `ordensKey(status, search)` shape; assert RPC not called (query only); assert search + status filter params forwarded; assert two empty-state data shapes.
- [x] 1.14 Write `apps/admin/src/hooks/__tests__/useMutateOrden.test.ts`: assert `createOrden` calls `supabase.rpc('create_order_with_items', ...)` with correct `p_order` + `p_items` payload shape; assert `cancelOrden` calls UPDATE with `status: 'cancelled'`; assert `advanceOrdenStatus` calls UPDATE with `status: 'in_preparation'`.
- [x] 1.15 Write `apps/admin/src/hooks/__tests__/useMutateOrderItem.test.ts`: assert `configureKeyItem` calls `supabase.rpc('configure_key_order_item', { p_order_item_id, p_rfid_code, p_unit_id, p_equipment_ids })` with correct payload shape; assert `cancelOrderItem` calls UPDATE with `status: 'cancelled'`; assert all three cache keys invalidated on `configureKeyItem` success.

---

## Phase 2 — List Page + Create Form (PR 2)

- [ ] 2.1 Create `apps/admin/src/components/ordenes/OrdenStatusBadge.tsx`: maps `orders.status` enum to Spanish label + Shadcn Badge `variant`; no props other than `status`.
- [ ] 2.2 Create `apps/admin/src/components/ordenes/OrdenesTable.tsx`: Shadcn Table, skeleton rows while loading, `OrdenStatusBadge`, item-count column, `created_at` formatted, row click → navigate to `/ordenes/:id`; two empty states (no-records vs no-results driven by `hasFilters` prop).
- [ ] 2.3 Create `apps/admin/src/components/ordenes/OrdenFormSheet.tsx`: RHF + Zod; client_type radio (administration → useAdministrations combobox, particular → full_name/dni/phone/email fields); `useFieldArray` for items (type select, quantity, optional description, building_id select for key items); submit blocked if items empty; calls `useMutateOrden.createOrden`; sheet closes on success; `toastMutationError` on error; Sonner direct import.
- [ ] 2.4 Create `apps/admin/src/routes/ordenes/OrdenesPage.tsx`: renders search `Input` (debounced 300 ms, local state), status filter pills (all/draft/in_preparation/ready_for_pickup/completed/cancelled), "Nueva orden" Button that opens `OrdenFormSheet`, `OrdenesTable`; passes `{ search, status }` to `useOrdens`.
- [ ] 2.5 Modify `apps/admin/src/components/layout/Sidebar.tsx`: add "Ordenes" `NavSection` with one `NavItem` `/ordenes` between Infraestructura and Personal sections.
- [ ] 2.6 Modify `apps/admin/src/main.tsx`: add `/ordenes` → `OrdenesPage` and `/ordenes/:ordenId` → `OrdenDetailPage` inside existing `ProtectedRoute` + `App` wrapper.

### Phase 2 Tests

- [ ] 2.7 Write `apps/admin/src/components/ordenes/__tests__/OrdenFormSheet.test.tsx`: submit blocked when items array empty; client_type radio toggles administration vs particular fields; submit calls `createOrden` with correct payload including items array; form closes on mutation success.
- [ ] 2.8 Write `apps/admin/src/components/ordenes/__tests__/OrdenesTable.test.tsx`: renders skeleton during loading; renders two distinct empty-state messages; renders status badge per row; row click fires navigate.

---

## Phase 3 — Detail Page + Configure Flow (PR 3)

- [ ] 3.1 Create `apps/admin/src/components/ordenes/QuickUnitCreateDialog.tsx`: `props: { buildingId: string; onCreated: (unitId: string) => void }`; wraps `useMutateUnit(buildingId).createUnit`; on success calls `onCreated(newUnitId)` and auto-selects that unit in parent (caller passes callback); Dialog closes on success; Sonner direct import.
- [ ] 3.2 Create `apps/admin/src/components/ordenes/ConfigureKeyItemSheet.tsx`: `props: { item: OrderItemRow; orderId: string }`; RHF + Zod; `rfid_code` (required text), `unit_id` (required select from `useUnits(building_id)` + QuickUnitCreateDialog trigger button; `onCreated` callback updates `unit_id` field), equipment multi-select from `useEquipment(building_id)` (optional); submit calls `useMutateOrderItem.configureKeyItem`; sheet closes on success; `toastMutationError` on error.
- [ ] 3.3 Create `apps/admin/src/components/ordenes/OrderItemsTable.tsx`: Shadcn Table of `OrderItemRow[]`; columns: type, quantity, description, status badge, actions; "Configurar" button visible only when `item_type='key'` AND `status='pending'`; opens `ConfigureKeyItemSheet`; "Cancelar" button visible when `status='pending'`; calls `useMutateOrderItem.cancelOrderItem`; no button for configured/cancelled items.
- [ ] 3.4 Create `apps/admin/src/routes/ordenes/OrdenDetailPage.tsx`: reads `ordenId` from params; calls `useOrden(ordenId)`; header: `order_number`, client identity (administration company_name or particular_full_name + DNI), `OrdenStatusBadge`; notes section; `OrderItemsTable`; action buttons: "Iniciar preparación" (visible when status='draft'; calls `advanceOrdenStatus`), "Cancelar orden" (visible when status non-terminal; calls `cancelOrden`; disabled + tooltip when terminal), "Retirada completada" (visible when status='ready_for_pickup'; reserved for future — disabled with tooltip "Próximamente" this cycle).

### Phase 3 Tests

- [ ] 3.5 Write `apps/admin/src/components/ordenes/__tests__/ConfigureKeyItemSheet.test.tsx`: submit blocked when `rfid_code` empty; submit blocked when `unit_id` not selected; submit calls RPC with correct `{ p_order_item_id, p_rfid_code, p_unit_id, p_equipment_ids }` payload; QuickUnitCreateDialog `onCreated` callback auto-selects the new unit_id in the unit select field.
- [ ] 3.6 Write `apps/admin/src/components/ordenes/__tests__/QuickUnitCreateDialog.test.tsx`: calls `createUnit` on submit; invokes `onCreated(newUnitId)` on mutation success.
- [ ] 3.7 Write `apps/admin/src/components/ordenes/__tests__/OrderItemsTable.test.tsx`: "Configurar" button rendered only for pending key items; "Cancelar" button rendered only for pending items; no action buttons for configured or cancelled items.

---

## Phase 4 — Pipeline Gate

- [ ] 4.1 Run `pnpm vitest run` across the admin app; confirm all new and modified test files pass.
- [ ] 4.2 Run `pnpm tsc --noEmit` in `apps/admin`; confirm no new TypeScript errors from widened `CreateKeyInput`, new hook types, and regenerated `database.types.ts`.
- [ ] 4.3 Verify `supabase db reset` applies all three migrations cleanly in correct numeric order (22 → 23 → 24).
- [ ] 4.4 Confirm `rfid_keys.order_item_id` immutability: attempt an UPDATE of `order_item_id` on an inserted row and verify the trigger raises `check_violation`.
- [ ] 4.5 Confirm `recompute_order_status` trigger edge case: all key items cancelled → no auto-transition to `ready_for_pickup`.
