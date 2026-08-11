# Design: Real draft + explicit confirmed for orders

## Technical Approach

Move side effects (tickets, stock reservations) out of `order_items` INSERT and behind an explicit `confirm_order(order_id)` RPC. Add `update_draft_order_with_items` for atomic draft edits. Rewrite the status enum in one migration to widen → backfill → narrow, so no window exists where a stale trigger operates on the new enum. Extract the create form into a shared `OrdenForm` reused by `/ordenes/nueva` and a new `/ordenes/:id/editar` route. All effect-producing operations become explicit RPCs; direct table UPDATEs from the client for status transitions are removed.

## Architecture Decisions

| Decision | Choice | Alternatives rejected | Rationale |
|---|---|---|---|
| Migration granularity | ONE file: widen enum → backfill → narrow → rewrite trigger → add RPCs | Split across N files | Prevents an intermediate window where the old trigger sees the new enum (or vice versa). Down migration is symmetric and atomic. |
| Trigger fate | DROP `order_items_create_tarea` and its trigger entirely | Keep with status guard `if order.status = 'confirmed'` | Confirmed orders are non-editable (per proposal scope), so items are never inserted post-confirm. Keeping a conditional trigger leaves a footgun and dead branches. Logic moves to `confirm_order`. |
| Confirm entry point | New RPC `confirm_order(order_id uuid)` returns void, `SECURITY DEFINER` | Table UPDATE + rely on triggers | Tickets/reservations must be created ATOMICALLY with the status flip. Also validates draft invariants that per-row INSERT triggers cannot see (e.g. `≥1 item`). |
| Concurrency guard | `SELECT ... FOR UPDATE` on `orders` + status re-check inside RPC | Optimistic `updated_at` compare | Confirm is idempotent-safe already via partial unique on `stock_movements_reserva_unique`; row lock closes the double-click race without exposing `updated_at` to the client. |
| Draft edit strategy | RPC `update_draft_order_with_items(p_order_id, p_patch jsonb, p_items jsonb[])` performs full item-set sync (upsert by id, delete missing) | Separate INSERT/UPDATE/DELETE RPCs called from client | One transaction ⇒ no partial state. Simpler client (send desired items[]). Optimistic concurrency via `p_expected_updated_at` argument. |
| Enum swap ordering | Widen check to include both `in_preparation` and `confirmed` → UPDATE `in_preparation → in_progress` → DELETE drafts → narrow check to drop `in_preparation` | Rename via ALTER | `orders.status` is `text` with a CHECK, not a Postgres enum type. Widen/narrow keeps the constraint valid throughout and needs no ALTER TYPE. |
| Draft deletion | `DELETE FROM orders WHERE status='draft'` before the enum narrow | Migrate drafts forward to `confirmed` | Per proposal: existing drafts are test data and side-effects from the buggy trigger are inconsistent. Clean slate is safer than reconciling. |
| UI form reuse | Extract to `components/ordenes/OrdenForm.tsx` with `mode: 'create'|'edit'`, `initialValues`, `onSubmit` | Duplicate the form | Same Zod schema, same layout, same subcomponents (`KeyItemUnitField`, `KeyItemPickupField`). Only submit action differs. |
| Order type editability in draft | Allow `order_type` change in draft edit | Freeze `order_type` at creation | `order_items_validate_type` trigger guards item/type consistency; the RPC also revalidates. Users occasionally miscategorize; forbidding it forces cancel+recreate which is exactly the anti-pattern this change fixes. |
| RPC error surface | Raise `P0001` with human-readable message + machine-parseable prefix (`ORDERS_CONFIRM_*`, `ORDERS_UPDATE_*`) | `raise_exception` with SQLSTATE only | Existing `mapMutationError` shows toast messages; keep the pattern. Prefix lets future error mapping key off it. |

## Data Flow

### Confirm flow

    UI: "Confirmar orden"                          hooks/useMutateOrden
         │                                                 │
         └── confirmOrden.mutate({id}) ────► supabase.rpc('confirm_order', {p_order_id})
                                                           │
                                                           ▼
                                     public.confirm_order(order_id)
                                        │  1. FOR UPDATE lock orders row
                                        │  2. Assert status = 'draft'
                                        │  3. Assert ≥1 order_item exists
                                        │  4. Per-item validation (mirrors create_order)
                                        │  5. UPDATE orders SET status='confirmed'
                                        │  6. FOR EACH item:
                                        │       - technical → INSERT support.tickets
                                        │       - keys      → INSERT support.tickets
                                        │                     + INSERT stock_movements (reserva)
                                        │                       ON CONFLICT DO NOTHING
                                        │  7. Trigger tickets_sync_order_status may fire but
                                        │     no-ops (source status is now 'confirmed', not
                                        │     'draft' or 'in_preparation')
                                        ▼
                                     COMMIT (atomic)

### Update draft flow

    UI: "Editar" ──► /ordenes/:id/editar (loads OrdenForm with initial values)
         │
         └── updateDraftOrden.mutate({id, order, items})
                       │
                       └─► supabase.rpc('update_draft_order_with_items', {...})
                                          │
                                          ▼
                       public.update_draft_order_with_items(p_order_id, p_patch, p_items[])
                          1. FOR UPDATE lock; assert status='draft'
                          2. Optional: assert p_expected_updated_at = orders.updated_at
                          3. UPDATE orders SET <allowed header fields> from p_patch
                          4. Item sync:
                               a. incoming items WITH id → UPDATE (validate type/order_type)
                               b. incoming items WITHOUT id → INSERT
                               c. existing items NOT in payload → DELETE
                          5. NO trigger side effects fire (order_items_create_tarea dropped)
                          6. Return orders.updated_at

### `recompute_order_status` update

- Keys branch: source state changes from `in_preparation` to `confirmed`. When first key item reaches `configured`, promote to `in_progress`; when all non-cancelled key items are `configured`, promote to `ready_for_pickup` (unchanged terminal semantics).
- Technical branch: unchanged logic, but source state list becomes `('confirmed', 'in_progress')` — never `draft`.

## File Changes

| File | Action | Description |
|---|---|---|
| `supabase/migrations/2026081100005X_orders_draft_and_confirmed.sql` | Create | Single migration: widen CHECK, delete drafts, UPDATE in_preparation → in_progress, narrow CHECK, drop `order_items_create_tarea` trigger + function, rewrite `recompute_order_status`, add `confirm_order` + `update_draft_order_with_items` RPCs. Includes DOWN section as comment for manual rollback (Supabase CLI convention). |
| `apps/admin/src/hooks/useOrdens.ts` | Modify | `OrderStatus` type: replace `in_preparation` with `confirmed`. |
| `apps/admin/src/hooks/useMutateOrden.ts` | Modify | Remove `advanceOrdenStatus`. Add `confirmOrden({id})` calling `confirm_order`. Add `updateDraftOrden({id, order, items})` calling `update_draft_order_with_items`. Update `CreateOrderInput.status` union to remove `in_preparation`. |
| `apps/admin/src/components/ordenes/OrdenForm.tsx` | Create | Extracted from `OrdenNuevaPage.tsx`. Props: `mode: 'create'|'edit'`, `initialValues?: OrdenFormValues`, `onSubmit: (values) => Promise<void>`, `submitLabel`. Owns Zod schema, `useFieldArray`, `KeyItemUnitField`, `KeyItemPickupField`. |
| `apps/admin/src/routes/ordenes/OrdenNuevaPage.tsx` | Modify | Reduced to thin wrapper: instantiates `OrdenForm` with empty defaults, calls `createOrden.mutateAsync`, navigates on success. |
| `apps/admin/src/routes/ordenes/OrdenEditarPage.tsx` | Create | Loads `useOrden(ordenId)`, guards `status === 'draft'` (else redirect with toast), hydrates `OrdenForm` with existing values, calls `updateDraftOrden.mutateAsync`. |
| `apps/admin/src/routes/ordenes/OrdenDetailPage.tsx` | Modify | Draft actions: `[Editar]` + `[Confirmar orden]` + `[Cancelar]`. `Confirmar orden` visible for both order types (replaces "Iniciar preparación"). Other-state actions preserved. |
| `apps/admin/src/components/ordenes/OrdenStatusBadge.tsx` | Modify | Label/variant map: replace `in_preparation` with `confirmed` (label "Confirmada"). |
| `apps/admin/src/main.tsx` | Modify | Register `/ordenes/:ordenId/editar` route. |

## Interfaces / Contracts

### RPC signatures

```sql
create or replace function public.confirm_order(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public, support;

create or replace function public.update_draft_order_with_items(
  p_order_id              uuid,
  p_patch                 jsonb,      -- {notes?, particular_id?, administration_id?,
                                      --  particular_full_name?, particular_dni?,
                                      --  particular_phone?, particular_email?,
                                      --  client_type?, order_type?}
  p_items                 jsonb[],    -- each element MAY include "id" (existing item)
  p_expected_updated_at   timestamptz -- optimistic concurrency; error P0001 on mismatch
) returns timestamptz                 -- new orders.updated_at
language plpgsql
security definer
set search_path = public, support;
```

### TypeScript hook API

```ts
interface ConfirmOrdenInput { id: string }
interface UpdateDraftOrdenInput {
  id: string;
  expectedUpdatedAt: string;
  order: Partial<CreateOrderInput>;
  items: (CreateOrderItemInput & { id?: string })[];
}

// removed: advanceOrdenStatus
// added:   confirmOrden, updateDraftOrden
```

## Testing Strategy

| Layer | What to test | Approach |
|---|---|---|
| DB migration | Enum widen/narrow leaves no invalid rows; trigger dropped; drafts deleted; `in_preparation` rows migrated to `in_progress` | Fresh Supabase local DB; apply migration; run assertion SQL in a follow-up migration test file (repo has no pgTAP — hand-rolled `do $$ begin assert ...` blocks in `supabase/tests-sql/` executed via `psql`). |
| DB — trigger removed | `INSERT INTO order_items` on a draft order creates NO tickets, NO stock_movements | Hand-rolled assertion. |
| DB — `confirm_order` | (a) happy path creates tickets + reservations + status='confirmed'; (b) rejects non-draft; (c) rejects zero-item order; (d) rejects invalid item shape (key without product_id); (e) double-call is safe (row lock + partial unique) | Hand-rolled assertion, one file per scenario. |
| DB — `update_draft_order_with_items` | (a) full item sync (insert/update/delete); (b) rejects non-draft; (c) optimistic concurrency mismatch raises; (d) `order_type` switch revalidates items | Hand-rolled assertion. |
| DB — `recompute_order_status` | Keys: `confirmed → in_progress → ready_for_pickup` chain fires on `configured` transitions. Technical: `confirmed → in_progress` fires on first ticket `in_progress`; `→ completed` on all resolved. | Hand-rolled assertion, cover both order_type branches. |
| DB — cancellation | Cancel from draft = no stock movements. Cancel from confirmed = liberacion_reserva emitted for every reserva without egreso (existing trigger). | Hand-rolled assertion. |
| Frontend — `useMutateOrden` | `confirmOrden` calls `supabase.rpc('confirm_order', {p_order_id})`; `updateDraftOrden` calls RPC with expected shape; invalidates `ordensKey()` and `ordenKey(id)` on success | Extend existing `useMutateOrden.test.ts` with mocked `supabase.rpc`. |
| Frontend — `OrdenForm` | Renders in `edit` mode with initial values; submit calls `onSubmit` with mapped payload; item-add/remove works; Zod validation still fires per item_type | New component test using RTL + user-event. |
| Frontend — `OrdenDetailPage` | Draft status shows `[Editar]`, `[Confirmar orden]`, `[Cancelar]`; other statuses hide edit and confirm | Extend detail page tests. |
| Frontend — `OrdenEditarPage` | Non-draft order → redirect with toast; draft → hydrates form and submits update | New route test. |

## Threat Matrix

N/A — no routing, shell, subprocess, VCS/PR automation, executable-file classification, or process-integration boundary. Change is confined to DB migration + RPCs + React UI.

## Migration / Rollout

**Order of operations in the single migration:**

1. `alter table public.orders drop constraint orders_status_check;`
2. Add widened CHECK: `('draft','in_preparation','confirmed','in_progress','ready_for_pickup','completed','invoiced','cancelled')`.
3. `delete from public.orders where status = 'draft';` (cascades to `order_items`, `stock_movements`, tickets nullified).
4. `update public.orders set status = 'in_progress' where status = 'in_preparation';`
5. `alter table public.orders drop constraint orders_status_check;` and add narrowed CHECK: `('draft','confirmed','in_progress','ready_for_pickup','completed','invoiced','cancelled')`.
6. `drop trigger if exists order_items_create_tarea_trigger on public.order_items;` and `drop function if exists public.order_items_create_tarea();`.
7. `create or replace function public.recompute_order_status` with new source-state list.
8. `create or replace function public.confirm_order(uuid) ...`.
9. `create or replace function public.update_draft_order_with_items(uuid, jsonb, jsonb[], timestamptz) ...`.
10. `grant execute on function ... to authenticated;` for both new RPCs.

**Rollback (documented in migration header as SQL comment):** re-add the previous trigger definition from `20260811000050`, restore the previous CHECK (with `in_preparation`), and drop the two new RPCs. No data restoration for deleted drafts (accepted).

**Deployment**: single migration + single frontend release. No feature flag (per proposal — mixed states corrupt reservations).

## Open Questions

- [ ] Exact test-runner mechanism: repo has no `supabase/tests/` directory nor pgTAP. Confirm during tasks phase whether to add a lightweight `supabase/tests-sql/` runner in CI or defer DB assertions to a manual smoke checklist for this migration.
- [ ] `p_expected_updated_at` in `update_draft_order_with_items`: is optimistic concurrency in-scope for MVP, or accept last-write-wins? Proposal flagged the risk but did not decide. Design assumes YES (safer default); tasks can drop the arg if the team accepts LWW.
- [ ] `OrdenEditarPage` fallback when opened for a non-draft order: redirect to detail page with toast vs render read-only banner. Design assumes redirect; confirm during UI implementation.
