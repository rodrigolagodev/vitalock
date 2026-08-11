# Proposal: Real `draft` state and explicit `confirmed` commitment for orders

## Why

The current 7-status order lifecycle (`draft · in_preparation · ready_for_pickup · in_progress · completed · invoiced · cancelled`) has two structural problems that hurt operator experience and data integrity:

### Problem 1 — `draft` is not really a draft

The trigger `order_items_create_tarea` (`AFTER INSERT ON order_items`, defined in `supabase/migrations/20260811000038_extend_order_items_create_tarea.sql` and extended in `20260811000050_orders_types_technical.sql`) runs on every item insert regardless of the parent order's status. Consequences:

- The moment an order is saved in `draft`, `support.tickets` rows are created and negative reservations are written to `stock_movements`.
- Instructors see technical tickets for orders that were never confirmed.
- Keys stock is silently committed for orders that may never be fulfilled.
- Any subsequent edit to items must reconcile downstream tickets and reservations, which today has no code path.

`draft` therefore behaves like a soft `confirmed`. There is no true planning state.

### Problem 2 — Draft orders cannot be edited

`OrdenDetailPage` (`apps/admin/src/routes/ordenes/OrdenDetailPage.tsx`) exposes only:

- "Iniciar preparación" (keys only)
- "Cancelar orden"
- "Marcar facturada"

There is no "Editar" action. To fix a mistake in a freshly created order, operators must cancel and recreate — losing the row, its history, and its ID, and (because of Problem 1) leaving orphan tickets/reservations behind if the trigger already ran.

### Industry pattern

Every mature transactional system treats `draft` as a real, freely editable planning state and requires an explicit commitment action to fire downstream effects:

| System        | Draft freely editable | Commit state              | Execution state |
| ---           | ---                   | ---                       | ---             |
| Shopify       | yes                   | pending                   | processing      |
| Odoo          | yes                   | sale (confirmed)          | (same)          |
| Salesforce    | yes                   | Accepted / Order Placed   | Fulfilled       |
| SAP           | yes                   | Released                  | In Progress     |
| ServiceNow    | yes                   | Approved                  | In Progress     |
| **Vitalock (this proposal)** | yes    | **confirmed**             | in_progress     |

We adopt the same shape: `draft` is a planning state with zero side effects; `confirmed` is the atomic commitment that creates tickets and reservations.

## What Changes

### Data model
- New `order_status` enum: `draft · confirmed · in_progress · ready_for_pickup · completed · invoiced · cancelled`.
- Remove `in_preparation` (keys-only intermediate that becomes redundant); migrate existing rows to `in_progress`.
- Delete all existing `status='draft'` orders (test data only, confirmed by user) so no orphan side effects remain.

### Triggers and RPCs
- Remove ticket/reservation side effects from `order_items_create_tarea` (AFTER INSERT on `order_items`). The trigger no longer materializes downstream artifacts on item insert.
- New RPC `confirm_order(order_id uuid)` that:
  - Validates the order is in `draft`.
  - Transitions status to `confirmed`.
  - Creates `support.tickets` rows for technical items.
  - Writes negative reservations to `stock_movements` for keys items.
  - Runs atomically; failure rolls back the whole transition.
- New RPC `update_draft_order_with_items(order_id, header_patch, items[])` for atomic draft edits (header + items diff in one transaction). Valid only while status = `draft`.
- Update `recompute_order_status` to transition `confirmed → in_progress` when work begins (keys: first item configured; technical: first ticket enters `in_progress`), and to preserve the existing `in_progress → ready_for_pickup → completed → invoiced` chain.
- Cancellation:
  - From `draft`: no cleanup (no side effects existed).
  - From `confirmed` / `in_progress`: reuse existing `cancel_order_releases_reservations`.

### Admin UI
- Extract the create form from `OrdenNuevaPage` into a shared `OrdenForm` component consumed by both `/ordenes/nueva` and a new `/ordenes/:id/editar` route.
- `OrdenDetailPage`:
  - Replace "Iniciar preparación" with "Confirmar orden" (available for both order types, only in `draft`).
  - Add "Editar" button visible only when status = `draft`, linking to `/ordenes/:id/editar`.
- Update `OrdenStatusBadge` label set and copy for the new enum.
- Update `OrderStatus` type in `apps/admin/src/hooks/useOrdens.ts` and any dependent typings.

### Tests
- Update DB tests covering trigger behavior, `recompute_order_status`, and cancellation.
- Add tests for `confirm_order` and `update_draft_order_with_items`.
- Update admin tests for the detail page action set and the new edit route/form.

## Impact

### Affected specs
- `openspec/specs/ordenes-admin/` — status machine, allowed transitions, action visibility rules, draft editability requirement.
- `openspec/specs/stock-inventory/` — clarify that keys reservations are written on `confirm_order`, not on item insert. Semantics of movements themselves are unchanged.

### Affected code
- Supabase migrations: new migration adding the enum value, backfilling rows, rewriting the trigger, adding the two RPCs, updating `recompute_order_status`. Reversible down migration required.
- `apps/admin/src/routes/ordenes/OrdenNuevaPage.tsx` — split into route + shared form.
- `apps/admin/src/routes/ordenes/OrdenDetailPage.tsx` — action set, "Editar" button, "Confirmar orden" wiring.
- `apps/admin/src/routes/ordenes/OrdenEditarPage.tsx` — new route consuming `OrdenForm`.
- `apps/admin/src/components/ordenes/OrdenForm.tsx` (new, extracted) plus imports in Nueva/Editar.
- `apps/admin/src/components/ordenes/OrdenStatusBadge.tsx` — label map.
- `apps/admin/src/hooks/useOrdens.ts` — `OrderStatus` type and any mutation helpers (`confirmOrder`, `updateDraftOrder`).
- `apps/admin/src/main.tsx` — new route registration.

### Test coverage impact
- DB: trigger behavior, `confirm_order`, `update_draft_order_with_items`, `recompute_order_status`, cancellation from each state.
- Admin: `OrdenDetailPage` action visibility per status, edit-page hydration, `OrdenForm` reuse contract, badge labels.
- No installer app changes.

### Data impact
- All existing `status='draft'` orders are deleted (cascades order_items, tickets, reservations). User confirmed these are test data.
- All existing `status='in_preparation'` orders are migrated to `in_progress`.
- No other historical data is touched.

## Non-goals

- Redesigning the `in_progress → completed` flow (already handled by ticket-status sync).
- Any change to the invoice flow.
- Editing items after `confirmed` (still not allowed; scope is draft edits only).
- Any change to the semantics of keys stock reservations themselves.
- Any change to the installer app.
- Feature flagging the rollout (see Risks).

## Risks and open questions

- **Data loss on draft deletion.** Accepted by the user; existing drafts are test data.
- **Migration ordering.** The trigger rewrite and the enum change must land in the same migration (or a strict sequence) so that no window exists where `order_items` inserts against a `draft` row create partial side effects with a stale trigger. Down migration must restore the previous trigger and enum atomically.
- **`recompute_order_status` coverage.** The function must correctly promote `confirmed → in_progress` for both order types on the correct signals; this is the highest-risk logical change and needs dedicated tests.
- **Feature flag.** Not proposed: the change is a coherent state-machine refactor that cannot be safely half-shipped (mixed enum + old trigger would corrupt reservations). Ship as one migration + one UI release.
- **Concurrent confirm.** `confirm_order` should be safe against double-clicks (row-level lock or status guard inside the RPC). Worth calling out during design.
- **Draft edit conflicts.** If two admins edit the same draft, `update_draft_order_with_items` needs an optimistic concurrency guard (e.g. `updated_at` check) — flagged for design phase.
