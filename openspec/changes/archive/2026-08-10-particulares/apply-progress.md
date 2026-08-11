# Apply Progress: particulares

**Slice**: 3 de 3 (PR 3 — work unit 3: Integration wiring) — branch `feat/particulares/integration` (targets `feat/particulares/components`)
**Slice 2**: `feat/particulares/components` (targets `feat/particulares/db-hooks`)
**Branch (slice 1)**: `feat/particulares/db-hooks` (targets tracker `feature/particulares`)
**Date**: 2026-08-10
**Mode**: Standard (no strict TDD; threat-matrix RED tests mapped per applicable case)

## Status

**Slice 3 complete: 5/5 assigned tasks** (wiring 2.5–2.7, tests 2.12–2.13). All change tasks now complete: Phase 1 17/17, Phase 2 15/15, Phase 3 pipeline gate (3.1–3.4) complete — verify verdict PASS WITH WARNINGS (see Verify Gate section).

## Slice 3 — Completed Tasks

- [x] 2.5 `OrdenFormSheet.tsx` — particular branch now renders `ParticularSelector` (replaces the 4 flat inputs); selecting/creating a particular binds `particular_id` and autofills the flat snapshots (`particular_full_name/dni/phone/email`) via `setValue`; Zod validation moved from `particular_full_name` to `particular_id` ("Seleccioná un particular"); payload sends `particular_id`.
- [x] 2.6 `OrderItemsTable.tsx` — new `canRegisterPickup` prop (default `false`); configured key rows with `produced_key_id` and no `picked_up_at` show "Registrar retiro" → `PickupKeyDialog`; optional `pickupPerson` prop forwards the prefill to the dialog.
- [x] 2.7 `OrdenDetailPage.tsx` — renders `PickupSection` only when `client_type='particular'` and non-terminal; passes `canRegisterPickup` (particular + `ready_for_pickup`) and a resolved `pickupPerson` prefill to `OrderItemsTable` (buyer embed; one lookup for explicit non-buyer via the same `['admin','particulares','one', id]` key PickupSection uses — deduped by react-query).
- [x] 2.12 `OrdenFormSheet.test.tsx` (extended/updated) — selector shown only for particular; search+select flow binds the row; snapshot autofill asserted via submitted payload (`particular_id` + flat fields); submit blocked without a selected particular. 12 tests.
- [x] 2.13 `OrderItemsTable.test.tsx` (extended) — "Registrar retiro" gated by `canRegisterPickup` + `produced_key_id` + missing `picked_up_at`; not shown for non-key or already-picked-up keys; opens `PickupKeyDialog` prefilled on click. 5 new tests (15 total).

## Slice 2 — Completed Tasks

- [x] 2.1 `ParticularSelector.tsx` (new) — combobox con Search icon, `role="combobox"` + `aria-expanded`, dropdown visible solo con query; `useParticulares` (debounce interno 300ms); options `full_name` + DNI; empty state → "Crear particular" abre el diálogo de creación; `onChange(ParticularRow | null)`; botón "Quitar particular" para limpiar; cierre con blur (150ms) y `onMouseDown preventDefault` en opciones.
- [x] 2.2 `QuickParticularCreateDialog.tsx` (new) — RHF + Zod (full_name/dni required, phone opcional, email opcional con `literal('')`); two-step `useBuildings()` → `useUnits(buildingId)` (select de unidad deshabilitado hasta elegir edificio; cambiar edificio resetea `unit_id`); `createParticular.mutateAsync` con valores trim; `onCreated(ParticularRow)`; reset al cerrar; `toastMutationError`.
- [x] 2.3 `PickupSection.tsx` (new) — solo para `client_type='particular'` + status no terminal; checkbox "Usar mismos datos de compra" → `setPickupPerson({ pickup_particular_id: buyer.id })`, desmarcar → null; si no, ParticularSelector + "Crear particular" + diálogo; resuelve pickup person no-comprador vía `useQuery(['admin','particulares','one', id])`; línea "Retira: {name} (DNI {dni})"; hooks siempre antes del render gate (rules-of-hooks).
- [x] 2.4 `PickupKeyDialog.tsx` (new) — prefill desde pickup person (splitFullName: primer token = name, resto = surname); `recordPickup.mutateAsync({ order_id, key_id, picked_up_by_name/surname/dni })`; submit deshabilitado sin `produced_key_id`; cierra + resetea al éxito.
- [x] 2.8 `ParticularSelector.test.tsx` (new) — debounce llega a `useParticulares({search})`, bind vía `onChange` con harness controlado, empty state abre diálogo, `onCreated` emite, valor ligado + "Quitar particular", sin dropdown con query vacía. 6 tests.
- [x] 2.9 `QuickParticularCreateDialog.test.tsx` (new) — required fields bloquean save sin mutate; creación con two-step edificio→unidad + `onCreated`; cierre tras éxito; select de unidad deshabilitado. 4 tests.
- [x] 2.10 `PickupSection.test.tsx` (new) — oculta para administration; oculta para status terminal; checkbox reusa buyer; checkbox marcado + desmarcar limpia + summary; pick explícito guarda y desmarca; resuelve pickup no-comprador por id + "Retira: Pérez Ana (DNI 33445566)"; abre diálogo de creación. 7 tests.
- [x] 2.11 `PickupKeyDialog.test.tsx` (new) — prefill desde pickup person + `recordPickup`; bloquea submit sin name/dni; deshabilitado sin `produced_key_id`; cierra tras éxito. 4 tests.

## Completed Tasks (slice 1)

### Phase 1 — DB + Types + Hooks (all complete)

- [x] 1.1 `20260811000032_particulares.sql` — `public.particulares` (id uuid pk, `unit_id` uuid NOT NULL UNIQUE → units, `dni` text NOT NULL UNIQUE, `full_name` NOT NULL, phone/email nullable, timestamps), `particulares_set_updated_at` trigger (set_updated_at), RLS enabled + `admin_all_particulares` policy (authenticated, `identity.is_admin()`), no explicit grants.
- [x] 1.2 `20260811000033_particulares_orders_fks.sql` — `orders.particular_id`/`pickup_particular_id` FKs (on delete restrict, partial indexes); `sales.key_requests.requester_particular_id`/`pickup_particular_id` nullable FKs + partial indexes; recreates `create_order_with_items` (particular branch: explicit `particular_id` → DNI fallback → P0001 `particular not found`; snapshot autofill `coalesce(nullif(trim(flat)), entity)`; per-item building_id validation; **preserves `product_id` per item from stock-inventory 00031**).
- [x] 1.3 `20260811000034_rfid_keys_pickup_order_path.sql` — recreates `rfid_keys_validate_pickup` with order branch (authorized DNIs = buyer + pickup person via `IS DISTINCT FROM`, both null → reject); creates `record_order_key_pickup(p_key_id, p_picked_up_by_name, p_picked_up_by_surname, p_picked_up_by_dni, p_actor_staff_id default null)` security definer: FOR UPDATE locks on rfid_keys + orders, P0001 guards (not an order-produced key / not a particular / status ≠ `ready_for_pickup`), updates pickup fields, auto-completes order when all non-cancelled key items have `picked_up_at`.
- [x] 1.4 `20260811000035_backfill_particulares.sql` — insert `distinct on (dni)` from orders→order_items(key, produced_key_id)→rfid_keys(unit_id), skips seed DNI `20345678`, `on conflict do nothing`, then links `orders.particular_id` by DNI.
- [x] 1.5 `packages/supabase/src/database.types.ts` regenerated via `npm run gen:types` after local `supabase db reset` (migrations 1→35 + seed applied cleanly). Diff also carries stock-inventory schema (products/stock_movements) — mechanical, generation is global; documented, excluded from authored count.
- [x] 1.6 `queryKeys.ts` — `particularesKey(search?)` → `['admin','particulares', search ?? '']`, `particularKey(id)`.
- [x] 1.7 `useParticulares.ts` — debounced (300ms) server-side `.or('full_name.ilike.%t%,dni.ilike.%t%')` search, ordered by `full_name`, returns `ParticularRow`.
- [x] 1.8 `useMutateParticular.ts` — `createParticular` INSERT → `.select().single()`, invalidates `particularesKey()`, success toast.
- [x] 1.9 `useMutateOrden.ts` — `CreateOrderInput.particular_id?`; `setPickupPerson` UPDATE `pickup_particular_id` filtered by id, invalidates `ordenKey(id)` + `ordensKey()`, toast "Persona de retiro actualizada."
- [x] 1.10 `useMutateKey.ts` — `recordPickup` → rpc `record_order_key_pickup` with p_* args (actor optional), invalidates `ordenKey(order_id)` + `ordensKey()` + `keysKey(buildingId)`, toast "Retiro registrado."
- [x] 1.11 `useOrden.ts` — `OrderItemRow.rfid_keys` per-item embed (picked_up_* + delivered_by_staff_id, nullable); `ParticularRef`; `OrdenDetailRow` + `particular_id`, `pickup_particular_id`, `particulares(...)` embed; select extended.
- [x] 1.12 `mapMutationError.ts` — 23505 particulares branch (details or message contains 'particulares' → "Ya existe un particular con ese DNI o unidad."), 23514 pickup-DNI mismatch substring → "El DNI de retiro no coincide con la persona autorizada para retirar.", P0001 `record_order_key_pickup` → "Error al registrar el retiro. La orden debe estar lista para retiro."

### Phase 1 Tests (all complete)

- [x] 1.13 `useParticulares.test.ts` (new) — `.or()` args forwarded, DNI search, `particularesKey` shape, debounce window with fake timers. 5 tests.
- [x] 1.14 `useMutateParticular.test.ts` (new) — INSERT payload, invalidate `['admin','particulares','']`, success toast, error → `toastMutationError`. 4 tests.
- [x] 1.15 `useMutateOrden.test.ts` (extended) — `particular_id` forwarded in `p_order`, `setPickupPerson` UPDATE shape, invalidations, toasts, error. 4 new tests (13 total).
- [x] 1.16 `useMutateKey.test.ts` (created — file did not exist) — `recordPickup` rpc args + actor, 3 cache-key invalidations, toast, error; createKey/changeStatus regression. 8 tests.
- [x] 1.17 `mapMutationError.test.ts` (extended) — 23505 particulares (details/message), 23514 pickup-DNI (order + key_request paths), P0001 record_order_key_pickup → Spanish toasts. 7 new tests (26 total).

## Verification (slice-scoped)

| Check | Result |
|-------|--------|
| `supabase db reset` (migrations 1→35 + seed) | PASS — branch `feat/particulares/db-hooks` (slice 1) |
| `npm run gen:types` | PASS — 187 lines added to `database.types.ts` (slice 1) |
| `pnpm --filter admin exec tsc --noEmit` | PASS — 0 errors (slice 1 y slice 2) |
| `pnpm --filter admin test` | PASS — slice 1: 32 files, 222 tests · slice 2: **36 files, 243 tests** (222 baseline + 21 new) |
| `pnpm --filter admin exec vitest run src/components/particulares src/components/ordenes` | PASS — 9 files, 65 tests (44 pre-existing + 21 new) |
| `pnpm --filter admin exec eslint` (new files) | PASS — 0 errors, 0 warnings |
| `pnpm --filter admin build` | PASS — 2104 modules, 2.12s (chunk-size warning pre-existing) |
| `pnpm --filter admin exec vitest run src/components/ordenes src/components/particulares` | PASS — 9 files, 69 tests (slice 3) |
| `pnpm --filter admin test` | PASS — slice 3: **36 files, 247 tests** (243 baseline + 4 net new) |
| `pnpm --filter admin exec tsc --noEmit` | PASS — 0 errors (slice 3) |
| `pnpm --filter admin exec eslint` (changed files) | PASS — 0 errors, 0 warnings (slice 3) |

## Commits

### Slice 3 (branch `feat/particulares/integration`)

| Hash | Message | Files |
|------|---------|-------|
| `5bc70bf` | feat(admin): wire ParticularSelector into order form | OrdenFormSheet + test |
| `f3c1ca2` | feat(admin): pickup registration in order detail | OrderItemsTable + OrdenDetailPage + OrderItemsTable test |

### Slice 2 (branch `feat/particulares/components`)

| Hash | Message | Files |
|------|---------|-------|
| `01c1dac` | feat(admin): add ParticularSelector + QuickParticularCreateDialog | ParticularSelector, QuickParticularCreateDialog, 2 test files, `test/setup.ts` polyfills |
| `b795094` | feat(admin): add PickupSection + PickupKeyDialog | PickupSection, PickupKeyDialog, 2 test files |

### Slice 1 (branch `feat/particulares/db-hooks`)

| Hash | Message | Files |
|------|---------|-------|
| `a67f2c0` | feat(supabase): particulares table + order/key_request FKs | 00032, 00033 |
| `b71914d` | feat(supabase): order-key pickup path — validate branch + record RPC | 00034 |
| `7f1580b` | feat(supabase): backfill particulares from historical orders | 00035, database.types.ts |
| `7383946` | feat(admin): particulares hooks + query keys + error mapping | 12 hook/test files |
| `c05aaaa` | test(admin): add rfid_keys to OrderItemRow fixtures | OrderItemsTable/ConfigureKeyItemSheet tests |

## Deviations

### Slice 3

- `OrdenFormSheet` validation for the particular branch now keys on `particular_id` instead of `particular_full_name` (flat inputs are gone; the selector is the only entry point). Same UX intent, message "Seleccioná un particular".
- `OrderItemsTable.canRegisterPickup` defaults to `false` so existing administration/list render sites and pre-existing tests are unaffected; the page opts in explicitly.
- `OrdenDetailPage` resolves the pickup person for the `PickupKeyDialog` prefill (buyer embed + one lookup for an explicit non-buyer) rather than reading it from `PickupSection`, which keeps its internal state self-contained. Both use the same query key, so react-query dedupes the fetch.
- No `OrdenDetailPage.test.tsx` exists in the repo and task 2.7's test scope ("si existe test") does not require creating one; the PickupSection render gate is covered by `PickupSection.test.tsx` and the page wiring is exercised at runtime during sdd-verify.

### Slice 2

- `onCreated`/`onChange` emit the full `ParticularRow` (not just the id as task 2.2/2.9 wording suggests) so parents autofill the flat snapshot without a refetch — same shape `useParticulares` returns, typed via `ParticularRow`.
- Radix Select throws `TypeError: target.hasPointerCapture is not a function` in jsdom (`@radix-ui/react-select` select.tsx:371). Patched shared `apps/admin/src/test/setup.ts` with `Element.prototype` polyfills (`hasPointerCapture`/`setPointerCapture`/`releasePointerCapture` + `scrollIntoView`), matching the existing ResizeObserver/matchMedia convention. Test-only, benefits all suites.
- `PickupSection` resolves the non-buyer pickup person with its own `useQuery(['admin','particulares','one', id])` because `useOrden` embeds only the buyer (`particulares(...)` via `particular_id`). Same key shape as the detail-query exact key.
- Test mock path for the create dialog had to be `../../particulares/QuickParticularCreateDialog` from `ordenes/__tests__/` (relative to the test file, not the component).
- Hook ordering: `useQuery` moved above the render gate in `PickupSection` (react-hooks rules); `enabled` guard prevents fetches for administration/buyer-reuse orders.

### Slice 1

- `OrderItemRow.rfid_keys` is a **required** property (`| null`), matching the existing embed convention (`administrations`). Two pre-existing component test fixtures omitted it; added `rfid_keys: null` to 5 fixture sites (follow-up commit `c05aaaa`).
- Task 1.16 said "Extend useMutateKey.test.ts", but the file did not exist; created it instead (same intent).
- `database.types.ts` diff includes stock-inventory schema entries mechanically (global regeneration); no stock-inventory files were staged or authored by this change.

## Rollback Boundary

Slice 3: revert commits `f3c1ca2` and `5bc70bf` (restores the 4 flat inputs, the ungated items table, and removes the PickupSection render + pickup prefill). No unrelated work is affected — staged files were limited to the 3 modified files + 2 test files.

Slice 2: delete `ParticularSelector.tsx`, `QuickParticularCreateDialog.tsx`, `PickupSection.tsx`, `PickupKeyDialog.tsx` + their 4 test files; revert `test/setup.ts` polyfill block (or keep — test-only). Revert commits `b795094` and `01c1dac`. No unrelated work is affected.

Slice 1: drop migrations 32–35 (in order); revert `queryKeys.ts`, `mapMutationError.ts`, `useMutateOrden.ts`, `useMutateKey.ts`, `useOrden.ts`; delete `useParticulares.ts`, `useMutateParticular.ts` + their test files + `useMutateKey.test.ts`. No unrelated work is affected.

## Next Slice

None — this is the final slice (PR 3). Phase 3 pipeline gate (tasks 3.1–3.4) runs during sdd-verify: full admin test suite, `tsc --noEmit`, `supabase db reset` + `gen:types`, and DB assertions (23514 unauthorized DNI, P0001 administration-order pickup, key_requests regression, auto-complete on last pickup, backfill dedupe + seed skip).

## Verify Gate (sdd-verify, 2026-08-10)

**Verdict: PASS WITH WARNINGS** — full report in `verify-report.md`.

| Check | Result |
|-------|--------|
| 3.1 `pnpm --filter admin test` | PASS — 36 files, **247 tests, 0 failures** |
| 3.2 `pnpm --filter admin exec tsc --noEmit` | PASS — 0 errors |
| 3.3 `supabase db reset` (1→35 + seed) + `npm run gen:types` | PASS — clean reset; `database.types.ts` no diff |
| 3.4 psql assertions | PASS — **19/19** (23514 unauthorized DNI, P0001 administration order, key_requests regression, auto-complete on last pickup, backfill dedupe + seed skip + NULL, A6 FKs, A7 P0001) |
| Lint (particulares scope) | PASS — 0 errors, 2 warnings (W2) |
| Build | PASS — chunk-size advisory pre-existing |

**Critical finding (pre-existing, NOT authored by particulares)**: `configure_key_order_item` references the dropped column `rfid_keys.key_type` (migration 00023, admin-ordenes PR#1 commit `9e1dee7`; column dropped in 00010 line 93) → SQLSTATE 42703 on every call. It is the only UI key-production path (`ConfigureKeyItemSheet` → `useMutateOrderItem.ts:31`), so the feature's end-to-end UI journey is gated at runtime. DB layer proven correct (3.4 bypassed the RPC with direct-row writes). Fix as a follow-up commit before the feature ships; does not require rework of this change's diff.

Non-blocking: W1 no `OrdenDetailPage.test.tsx`; W2 two lint warnings (`waitFor` unused in `PickupSection.test.tsx`, `order_id` unused in `useMutateKey` mutationFn).
