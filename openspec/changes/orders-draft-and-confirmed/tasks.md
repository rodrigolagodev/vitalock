# Tasks: Real `draft` state and explicit `confirmed` commitment for orders

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~700–900 (migration ~180, hooks ~80, OrdenForm extracted ~250, OrdenNuevaPage ~80, OrdenEditarPage ~120, OrdenDetailPage ~60, badge + type ~20, tests ~200) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1: DB migration → PR 2: Hook layer + types → PR 3: UI form extraction + edit route → PR 4: Detail page action bar + badge + tests |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | DB migration: enum swap, trigger drop, RPCs | PR 1 | `supabase/tests-sql/` smoke assertions via `psql` (see T-01–T-09) | `supabase db reset && psql -f supabase/tests-sql/smoke_orders_draft_confirmed.sql` or manual checklist | Drop the migration file; restore via down-migration comment |
| 2 | Hook layer: new RPCs, removed advanceOrdenStatus, type update | PR 2 | `pnpm --filter @vitalock/admin test -- useMutateOrden` | N/A — hook tests are in-process with mocked supabase | Revert `useMutateOrden.ts` and `useOrdens.ts` independently of UI |
| 3 | UI: OrdenForm extraction + OrdenNuevaPage refactor + OrdenEditarPage + route | PR 3 | `pnpm --filter @vitalock/admin test -- OrdenForm OrdenEditar OrdenNueva` | Manual: create draft order → navigate to /ordenes/:id/editar → save changes | Remove OrdenEditarPage and route registration; OrdenNuevaPage restore |
| 4 | UI: OrdenDetailPage action bar + OrdenStatusBadge + OrdenesTable label fix | PR 4 | `pnpm --filter @vitalock/admin test -- OrdenDetail OrdenesTable OrdenStatusBadge` | Manual: detail page per-status action visibility; badge label "Confirmada" | Revert detail page and badge files independently |

---

## Phase 1: DB Migration (Foundation)

> Prerequisite for all other phases. One file, atomic widen→backfill→narrow sequence.

- [x] T-01 **Add** `supabase/tests-sql/smoke_orders_draft_confirmed.sql` — hand-rolled assertion file that verifies pre-migration invariants (no `confirmed` value in CHECK, trigger exists). Run manually before applying.
  _Implements: ordenes-admin/Enum Backfill Safety_

- [x] T-02 **Create** `supabase/migrations/20260811000055_orders_draft_and_confirmed.sql` — widen CHECK to include `in_preparation` AND `confirmed`, `DELETE FROM orders WHERE status='draft'` (cascade), `UPDATE orders SET status='in_progress' WHERE status='in_preparation'`, narrow CHECK to drop `in_preparation`, `DROP TRIGGER order_items_create_tarea_trigger ON order_items`, `DROP FUNCTION order_items_create_tarea()`.
  _Implements: ordenes-admin/Enum Backfill Safety, ordenes-admin/No Side Effects in Draft_

- [x] T-03 **Add** `CREATE OR REPLACE FUNCTION public.recompute_order_status` to migration — keys branch: source state changes from `in_preparation` → `confirmed`; promote `confirmed → in_progress` on first item `configured`, `→ ready_for_pickup` on all non-cancelled configured; technical branch: source list becomes `('confirmed', 'in_progress')`.
  _Implements: ordenes-admin/Order Status State Machine (confirmed auto-advances to in_progress)_

- [x] T-04 **Add** `CREATE OR REPLACE FUNCTION public.confirm_order(p_order_id uuid)` to migration — `SELECT FOR UPDATE` lock, assert `status='draft'` and `≥1 order_item`, `UPDATE orders SET status='confirmed'`, per-item: INSERT `support.tickets` for technical items, INSERT `stock_movements` (reserva) `ON CONFLICT DO NOTHING` for key items with non-null `product_id`, `GRANT EXECUTE TO authenticated`.
  _Implements: ordenes-admin/Confirm Order RPC — Atomic Commitment, stock-inventory/Reservation Lifecycle on Order Events_

- [x] T-05 **Add** `CREATE OR REPLACE FUNCTION public.update_draft_order_with_items(p_order_id uuid, p_patch jsonb, p_items jsonb[], p_expected_updated_at timestamptz)` to migration — `FOR UPDATE` lock, assert `status='draft'`, assert `p_expected_updated_at = orders.updated_at` (raise P0001 `ORDERS_UPDATE_CONFLICT` on mismatch), `UPDATE orders SET <header fields>`, item sync (upsert by id, delete missing), return new `updated_at`. `GRANT EXECUTE TO authenticated`.
  _Implements: ordenes-admin/Draft Order Editability, ordenes-admin/Draft Edit Concurrency Guard_

- [x] T-06 **Add** rollback instructions as SQL comment block at the top of the migration (Supabase CLI convention) — documents restoring prior trigger from `20260811000050`, restoring CHECK with `in_preparation`, dropping the two new RPCs. Notes that draft data is not restorable.
  _Implements: proposal/Migration ordering risk_

- [x] T-07 **Add** post-migration smoke assertions to `supabase/tests-sql/smoke_orders_draft_confirmed.sql` — assert: (a) `in_preparation` is not a valid status value (INSERT should fail CHECK); (b) `confirmed` is valid; (c) trigger `order_items_create_tarea_trigger` does not exist; (d) `confirm_order` function exists; (e) `update_draft_order_with_items` function exists; (f) no `in_preparation` rows remain.
  _Implements: ordenes-admin/Enum Backfill Safety (post-migration verification)_

- [x] T-08 **Add** DB smoke test scenario in `supabase/tests-sql/` — `test_no_side_effects_on_draft_insert.sql`: insert order_item into a draft order, assert zero rows in `support.tickets` and zero `reserva` rows in `stock_movements`.
  _Implements: ordenes-admin/No Side Effects in Draft; stock-inventory scenario "No reservation emitted on order_item insert into draft order"_

- [x] T-09 **Add** DB smoke test scenario in `supabase/tests-sql/` — `test_confirm_order.sql`: (a) happy path creates ticket + reserva + status=confirmed; (b) second call returns error (idempotent); (c) call on non-draft order returns error.
  _Implements: ordenes-admin/Confirm Order RPC — Atomic Commitment scenarios_

---

## Phase 2: Hook Layer

> Depends on Phase 1 (types derived from DB enum). Can proceed in parallel with Phase 3 if DB migration is applied locally.

- [x] T-10 **RED** — Add failing test in `apps/admin/src/hooks/__tests__/useMutateOrden.test.ts`: `confirmOrden` calls `supabase.rpc('confirm_order', { p_order_id: id })` and invalidates `ordensKey()` + `ordenKey(id)` on success.
  _Implements: ordenes-admin/Confirm Order RPC (hook contract)_

- [x] T-11 **RED** — Add failing test in `apps/admin/src/hooks/__tests__/useMutateOrden.test.ts`: `updateDraftOrden` calls `supabase.rpc('update_draft_order_with_items', { p_order_id, p_patch, p_items, p_expected_updated_at })` and invalidates both query keys on success.
  _Implements: ordenes-admin/Draft Order Editability (hook contract)_

- [x] T-12 **RED** — Add failing test confirming `advanceOrdenStatus` is NOT exported from `useMutateOrden` (import-level assertion).
  _Implements: design/file changes for useMutateOrden_

- [x] T-13 **Modify** `apps/admin/src/hooks/useOrdens.ts` — remove `'in_preparation'` from `OrderStatus` union, add `'confirmed'`.
  _Implements: ordenes-admin/Order Status State Machine (type safety)_

- [x] T-14 **Modify** `apps/admin/src/hooks/useMutateOrden.ts` — remove `AdvanceOrdenStatusInput` interface and `advanceOrdenStatus` mutation; remove `'in_preparation'` from `CreateOrderInput.status` union; add `ConfirmOrdenInput` interface and `confirmOrden` mutation calling `supabase.rpc('confirm_order', { p_order_id: id })`; add `UpdateDraftOrdenInput` interface and `updateDraftOrden` mutation calling `supabase.rpc('update_draft_order_with_items', {...})`.
  _Implements: ordenes-admin/Confirm Order RPC; ordenes-admin/Draft Order Editability_

- [x] T-15 **GREEN** — Run `pnpm --filter @vitalock/admin test -- useMutateOrden`; all T-10, T-11, T-12 tests pass.

---

## Phase 3: UI — Form Extraction and Edit Route

> Depends on Phase 2 (hook types). `OrdenNuevaPage` refactor and `OrdenEditarPage` are sequential within this phase.

- [ ] T-16 **RED** — Create `apps/admin/src/components/ordenes/__tests__/OrdenForm.test.tsx` — failing tests: (a) renders in `edit` mode pre-populated with `initialValues`; (b) submit calls `onSubmit` with mapped payload; (c) item add/remove works; (d) submit blocked when order has no items (Zod validation).
  _Implements: ordenes-admin/Draft Order Editability (form contract)_

- [ ] T-17 **RED** — Create `apps/admin/src/routes/ordenes/__tests__/OrdenEditarPage.test.tsx` — failing tests: (a) non-draft order redirects to `/ordenes/:id` with a toast "Solo se pueden editar órdenes en borrador"; (b) draft order hydrates `OrdenForm` with existing values and calls `updateDraftOrden.mutateAsync` on submit.
  _Implements: ordenes-admin/Draft Order Editability (edit page contract); design open question: redirect with toast_

- [ ] T-18 **Create** `apps/admin/src/components/ordenes/OrdenForm.tsx` — extracted from `OrdenNuevaPage.tsx`; props: `mode: 'create' | 'edit'`, `initialValues?: OrdenFormValues`, `onSubmit: (values: OrdenFormValues) => Promise<void>`, `submitLabel: string`; owns Zod schema, `useForm`, `useFieldArray`, all item-card subfields, `KeyItemUnitField`, `KeyItemPickupField`.
  _Implements: ordenes-admin/Draft Order Editability; design/UI form reuse_

- [ ] T-19 **Modify** `apps/admin/src/routes/ordenes/OrdenNuevaPage.tsx` — reduce to thin wrapper: import `OrdenForm`, pass `mode="create"`, empty `initialValues`, `onSubmit` calls `createOrden.mutateAsync` then navigates to `/ordenes/:newId`.
  _Implements: design/OrdenNuevaPage file change_

- [ ] T-20 **Create** `apps/admin/src/routes/ordenes/OrdenEditarPage.tsx` — loads `useOrden(ordenId)`; if `status !== 'draft'` redirect to `/ordenes/:id` with `toast.warning('Solo se pueden editar órdenes en borrador.')`; else render `OrdenForm` with `mode="edit"`, hydrated `initialValues` (include `updated_at` for concurrency guard), `onSubmit` calls `updateDraftOrden.mutateAsync({ id, expectedUpdatedAt, order, items })` then navigates to `/ordenes/:id`.
  _Implements: ordenes-admin/Draft Order Editability; design open question: redirect with toast_

- [ ] T-21 **Modify** `apps/admin/src/main.tsx` — register route `<Route path="ordenes/:ordenId/editar" element={<OrdenEditarPage />} />` in the authenticated layout.
  _Implements: design/main.tsx file change_

- [ ] T-22 **GREEN** — Run `pnpm --filter @vitalock/admin test -- OrdenForm OrdenEditar OrdenNueva`; T-16 and T-17 tests pass.

---

## Phase 4: Detail Page Action Bar and Status Badge

> Depends on Phase 2 (hook mutations) and Phase 3 (route registered).

- [ ] T-23 **RED** — Extend `apps/admin/src/routes/ordenes/__tests__/OrdenDetailPage.test.tsx` (create file if absent) — failing tests: (a) draft status shows "Confirmar orden", "Editar", "Cancelar orden" buttons and hides "Iniciar preparación"; (b) confirmed status shows only "Cancelar orden"; (c) "Confirmar orden" click calls `confirmOrden.mutate`.
  _Implements: ordenes-admin/OrdenDetailPage Action Visibility_

- [ ] T-24 **Modify** `apps/admin/src/routes/ordenes/OrdenDetailPage.tsx` — replace `advanceOrdenStatus` with `confirmOrden` and `updateDraftOrden` from `useMutateOrden`; render `[Editar]` (link to `/ordenes/:id/editar`) and `[Confirmar orden]` only when `status === 'draft'`; remove "Iniciar preparación" button entirely; keep cancel/invoice actions.
  _Implements: ordenes-admin/OrdenDetailPage Action Visibility_

- [ ] T-25 **RED** — Add failing test in `apps/admin/src/components/ordenes/__tests__/OrdenesTable.test.tsx` — `status: 'confirmed'` row renders badge label "Confirmada"; `status: 'in_preparation'` is no longer a valid fixture (update existing fixture to `'draft'`).
  _Implements: ordenes-admin/Order List with Filters; ordenes-admin/OrderStatus type_

- [ ] T-26 **Modify** `apps/admin/src/components/ordenes/OrdenStatusBadge.tsx` — replace `in_preparation: 'En preparación'` with `confirmed: 'Confirmada'` in `STATUS_LABELS`; replace `in_preparation` entry in `STATUS_VARIANTS` with `confirmed: 'default'`.
  _Implements: ordenes-admin/OrdenDetailPage Action Visibility (badge update)_

- [ ] T-27 **GREEN** — Run `pnpm --filter @vitalock/admin test -- OrdenDetail OrdenesTable OrdenStatusBadge`; T-23 and T-25 tests pass.

---

## Phase 5: Verification

- [ ] T-28 **Run** `pnpm --filter @vitalock/admin test` — all tests green; no regression in `useMutateOrden`, `useOrdens`, `OrdenesTable`, and new suites.

- [ ] T-29 **Run** `pnpm --filter @vitalock/admin exec tsc --noEmit` — zero TypeScript errors; `OrderStatus` and `CreateOrderInput.status` unions are consistent everywhere.

- [ ] T-30 **Run** `pnpm --filter @vitalock/admin exec eslint src` — zero lint errors.

- [ ] T-31 **Manual smoke** — Apply migration to local Supabase (`supabase db reset`); run `supabase/tests-sql/` assertions; confirm no `in_preparation` rows, trigger absent, `confirm_order` callable.

- [ ] T-32 **Manual smoke** — Create draft order in admin UI → verify no tickets/reservations in DB → navigate to `/ordenes/:id/editar` → change items → save → verify header/items updated → click "Confirmar orden" → verify status=confirmed, tickets and reserva rows created.

- [ ] T-33 **Manual smoke** — Open a confirmed order detail page → verify "Editar" and "Confirmar orden" are absent → verify "Cancelar orden" is visible and triggers `cancel_order_releases_reservations`.
