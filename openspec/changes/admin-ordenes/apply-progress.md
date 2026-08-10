# Apply Progress: admin-ordenes

## Work Unit: PR 1 — DB + Types + Hooks

**Mode**: Standard (no strict TDD)
**Chain**: stacked-to-main, PR 1 of 3

## Completed Tasks

- [x] 1.1 Create `supabase/migrations/20260810000022_orders.sql`
- [x] 1.2 Create `supabase/migrations/20260810000023_order_items.sql`
- [x] 1.3 Create `supabase/migrations/20260810000024_rfid_keys_order_item_fk.sql`
- [x] 1.4 Regenerate `packages/supabase/src/database.types.ts`
- [x] 1.5 Modify `apps/admin/src/lib/queryKeys.ts`
- [x] 1.6 Modify `apps/admin/src/hooks/mapMutationError.ts`
- [x] 1.7 Create `apps/admin/src/hooks/useOrdens.ts`
- [x] 1.8 Create `apps/admin/src/hooks/useOrden.ts`
- [x] 1.9 Create `apps/admin/src/hooks/useMutateOrden.ts`
- [x] 1.10 Create `apps/admin/src/hooks/useMutateOrderItem.ts`
- [x] 1.11 Modify `apps/admin/src/hooks/useMutateKey.ts`
- [x] 1.12 Extend `apps/admin/src/hooks/__tests__/mapMutationError.test.ts` (5 new cases)
- [x] 1.13 Create `apps/admin/src/hooks/__tests__/useOrdens.test.ts` (12 tests)
- [x] 1.14 Create `apps/admin/src/hooks/__tests__/useMutateOrden.test.ts` (8 tests)
- [x] 1.15 Create `apps/admin/src/hooks/__tests__/useMutateOrderItem.test.ts` (7 tests)

## Files Changed

| File | Action | Notes |
|------|--------|-------|
| `supabase/migrations/20260810000022_orders.sql` | Created | orders table, sequence, gen_order_number, recompute_order_status function, RLS |
| `supabase/migrations/20260810000023_order_items.sql` | Created | order_items table, auto-transition trigger, create_order_with_items RPC, configure_key_order_item RPC, RLS |
| `supabase/migrations/20260810000024_rfid_keys_order_item_fk.sql` | Created | order_item_id column, mutual-exclusion CHECK, extended rfid_keys_prevent_reassignment |
| `packages/supabase/src/database.types.ts` | Modified | Regenerated to include orders, order_items, new RPCs |
| `apps/admin/src/lib/queryKeys.ts` | Modified | Added ordensKey, ordenKey |
| `apps/admin/src/hooks/mapMutationError.ts` | Modified | Added 23505 order_number, P0001 configure_key/create_order, 23503 cancel-context branches |
| `apps/admin/src/hooks/useOrdens.ts` | Created | PostgREST embed, server-side ilike, client-side admin filter |
| `apps/admin/src/hooks/useOrden.ts` | Created | Order + order_items embedded |
| `apps/admin/src/hooks/useMutateOrden.ts` | Created | createOrden (RPC), cancelOrden, advanceOrdenStatus |
| `apps/admin/src/hooks/useMutateOrderItem.ts` | Created | configureKeyItem (RPC), cancelOrderItem |
| `apps/admin/src/hooks/useMutateKey.ts` | Modified | Widened CreateKeyInput with order_item_id |
| `apps/admin/src/hooks/__tests__/mapMutationError.test.ts` | Modified | +5 new test cases for ordenes error branches |
| `apps/admin/src/hooks/__tests__/useOrdens.test.ts` | Created | 12 tests |
| `apps/admin/src/hooks/__tests__/useMutateOrden.test.ts` | Created | 8 tests |
| `apps/admin/src/hooks/__tests__/useMutateOrderItem.test.ts` | Created | 7 tests |

## Work Unit Evidence

| Evidence | Result |
|---|---|
| Focused test command | `pnpm --filter admin test` → **20 test files, 129 tests, 0 failures** (was 97, added 32 new) |
| Runtime harness | `supabase db reset` — all 24 migrations applied cleanly (000022→000023→000024 in order); seed error is pre-existing (seed.sql has 'lost' status keys, migration 20260809000020 removed that status) |
| Rollback boundary | Drop 3 migrations (20260810000022/23/24); revert queryKeys.ts, mapMutationError.ts, useMutateKey.ts; delete 4 new hook files + 3 new test files |

## Pipeline Gate Results

| Gate | Result |
|---|---|
| `pnpm --filter admin test` | PASS — 129/129 |
| `pnpm --filter admin typecheck` | PASS — 0 errors |
| `pnpm --filter admin lint` | PASS — 0 errors (4 pre-existing shadcn warnings) |
| `pnpm --filter admin build` | PASS — clean |
| `supabase db reset` | PASS — migrations apply in order (seed error pre-existing) |

## Deviations from Design

1. **RPC JSON cast**: The generated `database.types.ts` types `p_order` as `Json` and `p_items` as `Json[]`. Used `as any` cast in `useMutateOrden.ts` to satisfy TypeScript while passing typed inputs — this is a standard workaround for Supabase's generic JSON typing.
2. **Supabase gen types stdout contamination**: `supabase gen types typescript` printed an upgrade notice to stdout, contaminating the initial output file. Fixed by redirecting to `/tmp` first then copying.
3. **TanStack Query onError signature**: `onError` passes `(err, variables, context)` — test assertions updated to check only `mock.calls[0]![0]` instead of `toHaveBeenCalledWith(err)` directly.
4. **`.order()` placement in useOrdens**: Moved `.order()` to be the last call in the chain (after optional `.eq()` and `.or()`) to ensure the mock terminal step works correctly in tests. Functionally identical.

## Remaining Tasks (Phase 2 + 3)

- [ ] 2.1–2.8 Phase 2: OrdenesPage, OrdenesTable, OrdenFormSheet, OrdenStatusBadge, Sidebar, routes, tests
- [ ] 3.1–3.7 Phase 3: OrdenDetailPage, OrderItemsTable, ConfigureKeyItemSheet, QuickUnitCreateDialog, tests
- [ ] 4.1–4.5 Pipeline gate phase
