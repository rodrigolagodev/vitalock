# Exploration: Atomic Stock Work Resolution

**Status**: done
**Next Recommended**: sdd-propose

## Executive Summary

The equipment installation and replacement flows lack the terminal stock movements that the key flow emits atomically via `configure_key_order_item`. The fix is a three-part wire-up: (1) wire the existing `resolve_equipment_installation` RPC from the admin app for `equipment_installation` tickets, where the admin becomes the completing actor; (2) add a new `public.resolve_equipment_replacement` RPC that wraps `operations.replace_equipment` plus emits stock movements plus resolves the ticket atomically; (3) close the client-side routing gap so each category dispatches to its correct RPC. The `installation` category carries no `product_id` / no `reserva` and correctly uses generic `resolve_ticket` with no stock change required.

## Current State

### Working flow (keys)
- Trigger `order_items_create_tarea`: `item_type=equipment` + `product_id IS NOT NULL` → inserts `equipment_installation` ticket + `reserva` (-qty) movement stamped with `ticket_id`.
- `configure_key_order_item` RPC: atomically mints key, emits `egreso_grabacion` + `liberacion_reserva`, resolves `key_configuration` ticket.

### Broken flow (equipment_installation)
1. Admin side (`AssignEquipmentDialog` / `useMutateTicketEquipment.createAndAssignEquipment`): two non-atomic client steps — INSERT into `operations.equipment` directly, then UPDATE `support.tickets.equipment_id`. No stock movements.
2. Installer side (`useResolveTickets`): calls generic `public.resolve_ticket(p_ticket_id, p_note)` for ALL categories. No stock movements.
3. Result: `reserva` (-qty) persists forever; `egreso_instalacion` and `liberacion_reserva` never fire.

### Broken flow (equipment_replacement)
- `useMutateTicketEquipment.replaceEquipmentInTicket` calls `operations.replace_equipment` RPC + updates `support.tickets.equipment_id`. That RPC creates new equipment + migrates `key_authorizations` but emits no stock movements and does not resolve the ticket.
- `useResolveTickets` then calls generic `resolve_ticket` separately. Still no stock movement.

### The existing RPC with zero callers
- `public.resolve_equipment_installation(p_ticket_id, p_serial, p_unit_id, p_note, p_actor_staff_id)` — migration `20260811000041`. Validates `category = 'equipment_installation'`, creates `operations.equipment`, emits `egreso_instalacion` + `liberacion_reserva` (only when `product_id IS NOT NULL`), resolves ticket via two-step state machine. Zero callers in `apps/**`.

### `installation` vs `equipment_installation` distinction
- `installation`: created from `item_type = 'installation'` — no `product_id`, no `reserva`, no stock. Represents a "service" item without an inventory SKU. Generic `resolve_ticket` is correct.
- `equipment_installation`: created from `item_type = 'equipment'` + `product_id IS NOT NULL` — carries a `reserva` movement, requires `egreso_instalacion` on completion.
- Merging them into one category is rejected — they have fundamentally different stock semantics.

### `tickets_require_equipment_on_resolve` trigger
- Both `installation` and `equipment_installation` require `equipment_id IS NOT NULL` before status transitions to `resolved`. The admin dialog's pre-step (assigning equipment) satisfies this guard. The resolution itself is the unclosed gap.

## Affected Areas

| Path | Reason |
|------|--------|
| `supabase/migrations/20260811000041_create_resolve_equipment_installation_rpc.sql` | Existing RPC, zero callers; needs wiring |
| `supabase/migrations/20260807000010_admin_units_refactor_and_fixes.sql` (lines 304–369) | `operations.replace_equipment`; wrapped by new public RPC |
| `apps/installer/src/hooks/useResolveTickets.ts` | Blindly calls `resolve_ticket` for all categories; must exclude `equipment_*` |
| `apps/installer/src/hooks/useAssignedTickets.ts` | `AssignedTicket` lacks `category`; must expose it for UI filtering |
| `apps/installer/src/components/work/TicketsSection.tsx` | May need to hide/grey-out equipment_installation/replacement tickets that admin must complete |
| `apps/admin/src/hooks/useMutateTicketEquipment.ts` | `createAndAssignEquipment` replaced by `resolve_equipment_installation` call for `equipment_installation`; `replaceEquipmentInTicket` replaced by `resolve_equipment_replacement` call |
| `apps/admin/src/components/tareas/AssignEquipmentDialog.tsx` | Routes to category-specific RPCs; becomes the completion step for stock categories |
| `apps/admin/src/routes/tareas/TareaDetailPage.tsx` | Calls dialog; minimal change |

## Approaches

### Option 1A — Wire existing `resolve_equipment_installation` (admin completes)

The RPC already does everything. Admin calls it from the dialog; it atomically creates the equipment row, emits stock movements, and resolves the ticket. The two-step `createAndAssignEquipment` flow is retired for `equipment_installation`.

| Dimension | Detail |
|-----------|--------|
| DB objects | None new (RPC exists) |
| Migration cost | Minimal (no migration for this piece alone) |
| Client impact | New `useResolveEquipmentInstallation` hook; `AssignEquipmentDialog` for `equipment_installation` calls it; `createAndAssignEquipment` retired for that category |
| Failure modes | RPC validates `category = 'equipment_installation'`; idempotency guard on already-resolved; `p_unit_id` stored in `equipment.notes` (pre-existing limitation) |
| Atomic contract | Yes — full atomicity in one RPC call |
| Alignment | Exact parallel of `configure_key_order_item` |

The `p_unit_id` parameter is present in the RPC signature for UI compatibility but stored in `equipment.notes` (no `unit_id` column on `operations.equipment`). The admin dialog must expose a unit selector or pass NULL.

The installer's role for `equipment_installation`: after this change, admin resolves the ticket atomically. The installer has nothing to do. `TicketsSection` should not show `equipment_installation` tickets as resolvable by the installer.

### Option 2 — New `public.resolve_equipment_replacement` RPC

`operations.replace_equipment` is in the `operations` schema and does not resolve the ticket or emit stock. A new public-schema RPC wraps it atomically.

**New RPC signature**:
```sql
public.resolve_equipment_replacement(
  p_ticket_id          uuid,
  p_old_equipment_id   uuid,
  p_new_serial         text,
  p_new_model          text,
  p_new_description    text default null,
  p_note               text default null,
  p_actor_staff_id     uuid default null
) returns uuid
```

**Steps inside**:
1. Validate `category = 'equipment_replacement'` + not already resolved.
2. Locate `reserva` movement via `ticket_id` → get `product_id`, `order_item_id`, `order_id`, `quantity`.
3. Call `operations.replace_equipment(p_old_equipment_id, p_new_serial, p_new_model, ...)` to create new equipment + migrate key_authorizations.
4. If `product_id IS NOT NULL`: emit `egreso_reemplazo` (-qty) + `liberacion_reserva` (+qty).
5. Update `support.tickets.equipment_id` to the new equipment UUID.
6. Resolve ticket via two-step state machine.
7. Return new equipment UUID.

| Dimension | Detail |
|-----------|--------|
| DB objects | New RPC `public.resolve_equipment_replacement`; new `stock_movements.type` value `egreso_reemplazo` (extend CHECK constraint) |
| Migration cost | Medium (one migration with RPC + constraint extension) |
| Client impact | New `useResolveEquipmentReplacement` hook; `replaceEquipmentInTicket` retired; `AssignEquipmentDialog` for `equipment_replacement` calls new hook |
| Failure modes | `operations.replace_equipment` uses `CREATE TEMP TABLE ON COMMIT DROP` — compatible when called from within the outer transaction in Postgres; must be verified in smoke test |
| Atomic contract | Yes — full atomicity in one RPC call |
| Alignment | Mirrors `resolve_equipment_installation` pattern |

### Option 3 — Consolidate `installation` and `equipment_installation` (rejected)

`installation` has no `product_id`, no `reserva`, no stock semantics. `equipment_installation` has all three. Merging forces conditional logic throughout. The existing RPC already handles the `product_id IS NULL` case gracefully. No benefit. **Rejected.**

### Option 4B — Separate hooks per category, page routes

| Option | Description | Verdict |
|--------|-------------|---------|
| 4A: Dispatch inside `useResolveTickets` | Fetch category per ticket, route inside hook | Rejected — resolution args differ per category (serial, unit_id for equipment_installation vs. just note for generic); hook interface becomes incoherent |
| 4B: Separate hooks, calling component routes | One hook per category-specific RPC | **Recommended** — each hook has focused interface, matches existing `modeForCategory` pattern, TypeScript exhaustive switch enforces coverage |
| 4C: Registry map | `CATEGORY_RESOLVERS` constant | Over-engineered for closed 4-category domain |

### Option 5 — DB-layer rejection of `resolve_ticket` for stock categories (deferred)

Modify `public.resolve_ticket` to raise an error if called for `equipment_installation` or `equipment_replacement`. Provides hard runtime guard.

**Verdict**: Defer. TypeScript exhaustive dispatch (Option 4B) catches misrouting at compile time. Can be added later as defense-in-depth.

### Option 6A — Backfill historical `reserva` orphans

For every resolved `equipment_installation` ticket with a `reserva` movement but no `egreso_instalacion`: replay `egreso_instalacion` (-qty) + `liberacion_reserva` (+qty). Include in the same migration as Option 2. Idempotency check: `WHERE NOT EXISTS (SELECT 1 FROM public.stock_movements WHERE ticket_id = v_ticket_id AND type = 'egreso_instalacion')`.

**Verdict for non-production**: Include in the change. Risk is zero (no production data). Keeps the ledger consistent from the start.

## Recommendation

**Implement 1A + 2 + 4B + 6A as a combined change.**

1. **1A** — Wire `resolve_equipment_installation`. Zero new migrations. Admin dialog becomes the atomic completion step for `equipment_installation`.
2. **2** — Add `public.resolve_equipment_replacement` + extend `stock_movements.type` CHECK to add `egreso_reemplazo`. Admin dialog becomes the atomic completion step for `equipment_replacement`.
3. **4B** — One focused hook per category. `useResolveTickets` remains for `maintenance` and `installation` only. `useResolveEquipmentInstallation` and `useResolveEquipmentReplacement` are new targeted hooks.
4. **6A** — Backfill `egreso_instalacion` + `liberacion_reserva` for historical resolved `equipment_installation` tickets with orphaned `reserva` movements. Safe for non-production.
5. **Installer UI** — `useAssignedTickets` must expose `category`. `TicketsSection` filters: `equipment_installation` and `equipment_replacement` tickets should be shown as "Pendiente de admin" (read-only) rather than selectable for batch resolution by the installer.
6. **Option 5** (DB guard) deferred. **Option 3** rejected.

## Risks

- `operations.replace_equipment` creates a temp table `ON COMMIT DROP`; calling it from within `resolve_equipment_replacement` (itself a transaction) must be verified in a SQL smoke test.
- `p_unit_id` in `resolve_equipment_installation` has no matching column on `operations.equipment` — stored in `notes`. Admin UI must handle this gracefully.
- `stock_movements.type` CHECK constraint extension: verify no concurrent migration in the pending set modifies the same constraint.
- `useAssignedTickets` cross-schema embed limitation applies to `category` fetch — same fallback pattern already in use; low risk.
- Historical backfill idempotency check is correct only if no manual workarounds inserted such movements already (non-production: safe assumption).
- After this change, admin is the completing actor for `equipment_installation` and `equipment_replacement`. The installer app must not show these as resolvable or the batch-resolve flow could call generic `resolve_ticket` on an already-resolved ticket (raises P0001, safe but confusing).

## Key Learnings

1. The existing `resolve_equipment_installation` RPC is feature-complete and only needs client-side wiring to fix the stock gap.
2. The `installation` category carries no inventory product and therefore correctly uses generic `resolve_ticket` with no stock side-effects.
3. `operations.replace_equipment` uses a PostgreSQL temp table (`ON COMMIT DROP`), which is compatible with being called from within an outer transaction but must be smoke-tested explicitly.
4. The admin is the natural completing actor for stock-backed equipment tickets, mirroring how `configure_key_order_item` makes the admin the completing actor for key tickets.
5. Extending `stock_movements.type` with `egreso_reemplazo` preserves audit clarity by distinguishing replacement egresses from installation egresses in the ledger.
