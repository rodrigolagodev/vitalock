# Exploration: terminal-state-immutability

## Current State

None of the three aggregates (`support.tickets`, `public.technical_orders`, `public.key_orders`) has a DB-level BEFORE UPDATE trigger that locks terminal rows. A Supabase-authenticated client can UPDATE `status`, `assigned_to_staff_id`, `description`, etc. on a `resolved` ticket or `invoiced` order — this is the bug the user reported.

`tickets_validate` (baseline:4880) enforces a state machine INCLUDING an explicit `resolved → in_progress` reapertura path, but has no total-freeze guard for terminal rows.

## Terminal States (per aggregate)

**`support.tickets`** — baseline:5831
`status IN ('open', 'in_progress', 'resolved', 'cancelled')`
Terminal: **`resolved`**, **`cancelled`**

**`public.technical_orders`** — baseline:5067
`status IN ('draft', 'confirmed', 'in_progress', 'completed', 'invoiced', 'cancelled')`
Terminal: **`invoiced`**, **`cancelled`** — NOT `completed`

**`public.key_orders`** — baseline:5044
`status IN ('draft', 'confirmed', 'in_progress', 'pending_installation', 'ready_for_pickup', 'completed', 'invoiced', 'cancelled')`
Terminal: **`invoiced`**, **`cancelled`** — NOT `completed`

### Critical: why `completed` is NOT terminal

`mark_technical_order_invoiced` and `mark_key_order_invoiced` write `completed → invoiced`. If `completed` is declared terminal, these RPCs break without a set_config bypass. Consistent with existing UI: `TechnicalOrderDetailPage.tsx:19` already uses `TERMINAL_STATUSES = Set(['invoiced', 'cancelled'])`.

## Existing Immutability Patterns

| Trigger function | Table | What it locks | errcode |
|---|---|---|---|
| `operations.equipment_prevent_reassignment` | operations.equipment | serial_number, building_id, replaces_equipment_id, installed_at | check_violation |
| `public.technical_order_items_intent_immutable` | public.technical_order_items | intent columns (once order leaves draft) | P0001 |
| `operations.key_authorizations_prevent_reassignment` | operations.key_authorizations | rfid_key_id, equipment_id | check_violation |
| `public.rfid_keys_prevent_reassignment` | public.rfid_keys | unit_id, rfid_code, key_request_item_id, order_item_id, pickup fields | check_violation |
| `sales.bills_validate` | sales.bills | administration_id, from_quote_id, state machine | check_violation |
| `support.tickets_validate` | support.tickets | administration_id, building_id, category, opened_by/at + state machine | check_violation |

**Naming convention for new triggers**: `<schema>.<table>_terminal_immutable()` — parallels `_intent_immutable`.

**errcode**: `P0001` with structured `<AGGREGATE>_TERMINAL:` message prefix. Matches existing `KEY_ORDER_TERMINAL_STATE` pattern at baseline:704.

**set_config bypass**: three existing precedents (`app.allow_installer_equipment_swap`, `app.allow_resolve_equipment_id_write`, others). Pattern is standard. **Not needed for this change** — no legitimate write to truly-terminal rows exists.

## Cascading Update Paths (risk analysis)

| Path | Direction | Writes to terminal? | Risk |
|---|---|---|---|
| `resolve_ticket` → `recompute_technical_order_status` | ticket → technical_order | Only drives `confirmed`/`in_progress`; early return at `status not in ('confirmed', 'in_progress')` | None |
| `cancel_technical_order` → tickets cascade | technical_order → tickets | Excludes `resolved`/`cancelled` via `AND status NOT IN ('resolved', 'cancelled')` | None |
| `cancel_key_order` → items cascade | key_order → key_order_items | Only cancels non-cancelled items | None |
| `mark_technical_order_invoiced` | writes `completed → invoiced` on technical_orders | YES to `completed` (NOT terminal in our design) | None if terminal set excludes `completed` |
| `mark_key_order_invoiced` | writes `completed → invoiced` on key_orders | Same | Same |
| `setKeyOrderPickupPerson` (`packages/supabase/src/rpc/keyOrders.ts:157`) | direct client `.update()` on `key_orders` | Could hit terminal | Needs UI guard in `KeyOrderItemsTable` |

**Conclusion**: no set_config bypass needed. Trigger can be strict.

## UI Edit Surfaces Inventory

### apps/admin — unguarded surfaces

1. **`TareaDetailPage.tsx:121`** — "Editar" button has NO terminal guard. Renders for resolved/cancelled tickets. Fix: hide when `status IN ('resolved', 'cancelled')`.
2. **`TareaFormSheet` submit path** — `updateTarea` mutation (`useMutateTarea.ts:75`) is a plain `.update(rest)` with no status guard. The DB trigger will catch this, but UX suffers — user sees a cryptic P0001. Best fix: prevent form open for terminal tickets (via #1).
3. **`useMutateTicketEquipment.ts:50-64`** `assignExistingEquipment` — plain `.update({ equipment_id })`. UI (`AssignEquipmentDialog` in `TareaDetailPage`) already gates `status !== 'resolved' && status !== 'cancelled'`. Trigger is the backstop.
4. **`setKeyOrderPickupPerson`** — called from `KeyOrderItemsTable`. Need UI guard so the pickup action is hidden for terminal orders. Confirmed in propose phase.

### apps/installer

All mutations go through RPCs that already bail on terminal tickets. No UI changes needed here.

## Test File Inventory

Files that will need new/updated cases:

- `apps/admin/src/hooks/__tests__/useMutateTechnicalOrder.test.ts`
- `apps/admin/src/hooks/__tests__/useMutateKeyOrder.test.ts`
- `apps/admin/src/routes/servicio-tecnico/__tests__/TechnicalOrderDetailPage.test.tsx`
- `apps/admin/src/routes/llaves/__tests__/KeyOrderDetailPage.test.tsx`
- `apps/admin/src/routes/tareas/__tests__/TareaDetailPage.test.tsx` (probably new)
- `useMutateTarea` has no test file — new one required.

No existing test today mutates a resolved ticket in a fixture and expects success. Adding the trigger will not break any current passing test.

## Risks

1. **`completed` must be excluded from terminal set**: else `mark_*_invoiced` RPCs break. Confirmed by matching to existing UI constant `TERMINAL_STATUSES = ['invoiced', 'cancelled']`.
2. **`tickets_validate` allows `resolved → in_progress` reapertura today** (baseline:4880); `TareaFormSheet` `VALID_TRANSITIONS` also allows it. After this change, that transition is dead code — the terminal trigger rejects it. **User confirmed "no reopen" — so this is expected.** Cleanup of the dead branches is out of scope for this change (would be a follow-up).
3. **`setKeyOrderPickupPerson`** is a direct client UPDATE; needs UI guard to hide the affordance on terminal orders.
4. **UX**: any UPDATE attempt against a terminal row from a client that hasn't been UI-guarded surfaces as generic P0001 toast. Mitigation: primary surfaces (`TareaDetailPage.Editar`, `KeyOrderItemsTable.setPickup`) are guarded in this change; the trigger is defense-in-depth for anything missed.
5. **Budget**: 3 trigger fns + 3 CREATE TRIGGER + 2-3 UI guards + tests. ~150-200 authored lines. Well under 800.

## Key Learnings

1. Terminal set for order tables (`technical_orders`, `key_orders`) is `{invoiced, cancelled}` only. `completed` is NOT terminal because `mark_*_invoiced` transitions `completed → invoiced`.
2. Existing `tickets_validate` allows `resolved → in_progress` reapertura; this change makes that branch dead code (expected per "no reopen" decision).
3. Zero existing RPCs legitimately write to genuinely-terminal rows — no set_config bypass required.
4. Only direct client UPDATE on `key_orders` is `setKeyOrderPickupPerson`; UI must gate this alongside the trigger for good UX.
5. `TareaDetailPage.Editar` button has no terminal guard today — primary UI path for the user-reported bug.
