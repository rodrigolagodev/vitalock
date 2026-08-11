# Tasks: particulares

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~2 050 authored (+ ~800 regenerated `database.types.ts` diff, excluded from authored risk count) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | Single PR with `size:exception`; fallback PR 1 → PR 2 → PR 3 if denied |
| Delivery strategy | single-pr |
| Chain strategy | size-exception |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: size-exception
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | Migrations 32–35 + types + queryKeys + hooks | PR 1 | `pnpm vitest run apps/admin/src/hooks` | `supabase db reset` | Drop 4 migrations; revert queryKeys.ts, mapMutationError.ts, useMutateOrden.ts, useMutateKey.ts, useOrden.ts; delete useParticulares.ts + useMutateParticular.ts |
| 2 | ParticularSelector + QuickParticularCreateDialog + PickupSection + PickupKeyDialog | PR 2 | `pnpm vitest run apps/admin/src/components/particulares apps/admin/src/components/ordenes` | Open `/ordenes/:id` in dev; create particular inline | Delete 4 new component files |
| 3 | OrdenFormSheet + OrderItemsTable + OrdenDetailPage wiring | PR 3 | `pnpm vitest run apps/admin/src/components/ordenes` | Create particular order + register pickup in dev | Revert 3 modified files |

---

## Phase 1 — DB + Types + Hooks

- [x] 1.1 Create `supabase/migrations/20260811000032_particulares.sql`: `public.particulares` (`unit_id`/`dni` NOT NULL UNIQUE, `full_name` NOT NULL, phone/email nullable, timestamps), `set_updated_at` trigger, RLS enable + `admin_all_particulares` policy. (~45 ln)
- [x] 1.2 Create `supabase/migrations/20260811000033_particulares_orders_fks.sql`: `orders.particular_id`/`pickup_particular_id` FKs + indexes; `key_requests` `requester_particular_id`/`pickup_particular_id` nullable FKs; recreate `create_order_with_items` (DNI-match fallback, snapshot autofill, P0001 guard). (~120 ln)
- [x] 1.3 Create `supabase/migrations/20260811000034_rfid_keys_pickup_order_path.sql`: trigger order branch (authorized DNIs = buyer + pickup person; both null → reject), `record_order_key_pickup` RPC (FOR UPDATE locks, strict `status='ready_for_pickup'`, auto-complete to `completed` when all non-cancelled key items picked up). (~90 ln)
- [x] 1.4 Create `supabase/migrations/20260811000035_backfill_particulares.sql`: DNI dedupe (`distinct on`), unit via `produced_key_id → rfid_keys.unit_id`, skip seed DNI `20345678`, `on conflict do nothing`, link orders by DNI. (~25 ln)
- [x] 1.5 Regenerate `packages/supabase/src/database.types.ts` via `npm run gen:types` after local reset (generated diff, excluded from authored count).
- [x] 1.6 Modify `apps/admin/src/lib/queryKeys.ts`: add `particularesKey(search?)`, `particularKey(id)`. (~15 ln)
- [x] 1.7 Create `apps/admin/src/hooks/useParticulares.ts`: server-side `.or('full_name.ilike.%t%,dni.ilike.%t%')` + `useDebounce`, `particularesKey` query key. (~45 ln)
- [x] 1.8 Create `apps/admin/src/hooks/useMutateParticular.ts`: `createParticular` INSERT; invalidates `particularesKey()`. (~50 ln)
- [x] 1.9 Modify `apps/admin/src/hooks/useMutateOrden.ts`: `CreateOrderInput.particular_id`; add `setPickupPerson` (UPDATE `pickup_particular_id`; invalidate `ordenKey`+`ordensKey`). (~40 ln)
- [x] 1.10 Modify `apps/admin/src/hooks/useMutateKey.ts`: add `recordPickup` → rpc `record_order_key_pickup`; invalidate `ordenKey`/`ordensKey`/`keysKey`. (~45 ln)
- [x] 1.11 Modify `apps/admin/src/hooks/useOrden.ts`: embed `particular_id`, `pickup_particular_id`, `particulares(...)`, per-item `rfid_keys(picked_up_*)`. (~30 ln)
- [x] 1.12 Modify `apps/admin/src/hooks/mapMutationError.ts`: P0001 `record_order_key_pickup`; 23505 particulares DNI/unit dupes; 23514 pickup-DNI mismatch substring. (~25 ln)

### Phase 1 Tests

- [x] 1.13 `apps/admin/src/hooks/__tests__/useParticulares.test.ts`: `.or()` search args forwarded; debounce; `particularesKey` shape. (~70 ln)
- [x] 1.14 `apps/admin/src/hooks/__tests__/useMutateParticular.test.ts`: INSERT payload; invalidates `particularesKey()`. (~60 ln)
- [x] 1.15 Extend `apps/admin/src/hooks/__tests__/useMutateOrden.test.ts`: payload carries `particular_id`; `setPickupPerson` UPDATE shape. (~40 ln)
- [x] 1.16 Extend `apps/admin/src/hooks/__tests__/useMutateKey.test.ts`: `recordPickup` rpc args; three cache keys invalidated. (~50 ln)
- [x] 1.17 Extend `apps/admin/src/hooks/__tests__/mapMutationError.test.ts`: P0001/23505/23514 branches → Spanish toasts. (~40 ln)

---

## Phase 2 — Components

- [x] 2.1 Create `apps/admin/src/components/particulares/ParticularSelector.tsx`: debounced combobox, empty state → create-dialog link, emits `onChange(particular)`; search labels "buscar particular"/"crear particular". (~150 ln)
- [x] 2.2 Create `apps/admin/src/components/particulares/QuickParticularCreateDialog.tsx`: Zod full_name/dni required; two-step building → unit selects (`useBuildings()`/`useUnits`); emits `onCreated(particularId)`. (~190 ln)
- [x] 2.3 Create `apps/admin/src/components/ordenes/PickupSection.tsx`: checkbox "usar mismos datos de compra" → `setPickupPerson({ pickup_particular_id: particular_id })`; else selector/create; hidden for administration orders. (~120 ln)
- [x] 2.4 Create `apps/admin/src/components/ordenes/PickupKeyDialog.tsx`: per-key pickup registration prefilled from pickup person; submit → `useMutateKey.recordPickup`. (~120 ln)
- [x] 2.5 Modify `apps/admin/src/components/ordenes/OrdenFormSheet.tsx`: particular branch → ParticularSelector + create link (replaces flat inputs); snapshot autofill via `setValue`; payload adds `particular_id`. (~80 ln)
- [x] 2.6 Modify `apps/admin/src/components/ordenes/OrderItemsTable.tsx`: `canRegisterPickup` prop; "Registrar retiro" on configured key rows without `picked_up_at` → PickupKeyDialog. (~60 ln)
- [x] 2.7 Modify `apps/admin/src/routes/ordenes/OrdenDetailPage.tsx`: render `PickupSection` when `client_type='particular'` and non-terminal. (~40 ln)

### Phase 2 Tests

- [x] 2.8 `apps/admin/src/components/particulares/__tests__/ParticularSelector.test.tsx`: debounced search by name/DNI; no-match empty state opens dialog; binds selection. (~120 ln)
- [x] 2.9 `apps/admin/src/components/particulares/__tests__/QuickParticularCreateDialog.test.tsx`: required fields block save; `onCreated(newParticularId)` fired on success. (~90 ln)
- [x] 2.10 `apps/admin/src/components/ordenes/__tests__/PickupSection.test.tsx`: checkbox sets `pickup_particular_id = particular_id`; explicit pick unchecks; section hidden for administration. (~100 ln)
- [x] 2.11 `apps/admin/src/components/ordenes/__tests__/PickupKeyDialog.test.tsx`: submit calls `recordPickup` with prefilled DNI. (~80 ln)
- [x] 2.12 Extend `apps/admin/src/components/ordenes/__tests__/OrdenFormSheet.test.tsx`: selector flow, snapshot autofill, payload `particular_id`. (~60 ln)
- [x] 2.13 Extend `apps/admin/src/components/ordenes/__tests__/OrderItemsTable.test.tsx`: pickup action gated by `canRegisterPickup` + missing `picked_up_at`. (~50 ln)

---

## Phase 3 — Pipeline Gate

- [x] 3.1 Run `pnpm vitest run` in `apps/admin`; all new and modified tests pass.
- [x] 3.2 Run `pnpm tsc --noEmit` in `apps/admin`; no new TypeScript errors.
- [x] 3.3 Verify `supabase db reset` applies migrations 32→35 cleanly in numeric order; `npm run gen:types` stable.
- [x] 3.4 DB assertions during sdd-verify (psql, no SQL runner in repo): unauthorized DNI → 23514; administration-order pickup → P0001; key_requests path regression-free; auto-complete on last pickup; backfill dedupe + seed skip + unlinked orders keep NULL.
