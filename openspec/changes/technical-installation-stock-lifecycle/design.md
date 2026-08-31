# Design: technical-installation-stock-lifecycle

## Context

The technical-order pipeline routes `item_type='installation'` items into a `category='installation'` support ticket. Every downstream side-effect (stock reservation gate at confirm, equipment configuration RPC guard, resolve equipment-creation + stock-movement block, and `intended_equipment_id` write-back) currently branches on the sibling `category='equipment_installation'` alone. As a result, four independent bugs surface from the same mapping gap:

1. no `reserva` written at confirm (silent stock drift),
2. no `egreso_instalacion` / `liberacion_reserva` at resolve (silent ledger drift),
3. `configure_technical_ticket_equipment` rejects the ticket with a category guard, so serial/model UX is broken on both admin (`TareaDetailPage`) and installer (`TaskDetailPage`),
4. even the admin fallback (`createAndAssignEquipment`) only links `tickets.equipment_id` and never writes `technical_order_items.intended_equipment_id`, so cross-app visibility never lands.

The `equipment_installation` category already has the correct end-to-end behavior. The design here is Flujo A: extend the guards symmetrically, add exactly one intent-immutable trigger bypass to unblock `intended_equipment_id` write-back at resolve time, and require `product_id` on the admin form when `item_type='installation'`. No schema DDL, no new stock movement types, no new statuses.

Baseline reference: `supabase/migrations/20260831000000_baseline.sql` (single squashed baseline as of `4642a6f`).

## Goals

- Extend `equipment_installation` behavior to `installation` end-to-end (stock reserve → configure UX → resolve equipment + ledger + intent write-back) with a delta migration + 5 UI files.
- Preserve the explicit `IN (...)` list style for category guards so any future divergence between `installation` and `equipment_installation` remains a visible, single-point edit.
- Introduce one scoped `set_config` bypass (`app.allow_resolve_equipment_id_write`) modeled on the existing `app.allow_installer_equipment_swap` pattern.
- Preserve cross-app UI symmetry: admin and installer stay on the same `useConfigureTechnicalTicketEquipment` hook and identical `ConfigureEquipmentPanel` / `ConfigureEquipmentInline` behavior — only the category gates in consuming components change.

## Non-Goals

- Key-orders lifecycle (`key_installation`, `key_configuration`).
- Any new stock-movement type (reuse `reserva`, `liberacion_reserva`, `egreso_instalacion`).
- Any new `technical_order_items.status` value or new `support.tickets.status` value.
- Any pool-based equipment model, per-serial purchase traceability, `pending_access_type` column, or backfill of legacy `installation` tickets.
- Introducing a polymorphism/dispatch layer or `is_equipment_installation()` helper (see Decision 1).
- Standing up pgTAP as a general DB test framework.

## Decisions

### 1. Guard extension pattern — keep the explicit `IN` list

**Before (`configure_technical_ticket_equipment`, baseline L1114):**

```sql
if v_category not in ('equipment_installation', 'equipment_replacement') then
  raise exception 'configure_technical_ticket_equipment: ticket % category=% is not configurable ...'
```

**After:**

```sql
if v_category not in ('equipment_installation', 'equipment_replacement', 'installation') then
  raise exception 'configure_technical_ticket_equipment: ticket % category=% is not configurable ...'
```

**Before (`resolve_ticket`, baseline L3022):**

```sql
if v_ticket.category in ('equipment_installation', 'equipment_replacement') then
```

**After:**

```sql
if v_ticket.category in ('equipment_installation', 'equipment_replacement', 'installation') then
```

Inside that block, the inner branch that already distinguishes `equipment_installation` from `equipment_replacement` (baseline L3058 `if v_ticket.category = 'equipment_installation' then ... else -- equipment_replacement`) becomes:

```sql
if v_ticket.category in ('equipment_installation', 'installation') then
  -- freestanding-install path: needs building_id, insert equipment, emit egreso+liberacion
else -- equipment_replacement
  -- calls operations.replace_equipment(...)
end if;
```

**Rationale — why `IN` list over dispatch / helper function:**

- **Visibility of divergence.** An `IN` list is a plain, greppable enumeration. If a future requirement forks `installation` from `equipment_installation` (a different movement type, a different equipment status, a different building rule), the fork is a single-file, single-line edit visible in code review. A dispatch table or `is_equipment_installation()` helper would hide the coupling and make the fork require touching a shared abstraction layer.
- **No premature abstraction.** Today the two categories share behavior by *choice*, not by natural taxonomy. `equipment_replacement` already coexists in the same block with a diverging inner branch — the codebase's convention is "one guard, inner `if` per divergence." A new helper would be inconsistent with that established pattern.
- **Low cognitive cost.** Three category tokens fit on one line; the guard reads as documentation. A helper would push the reader to a second file to answer "which categories does this cover?"
- **Matches the exploration's Key Learning 5** and the proposal's Risk 4 mitigation: keep the guard as an explicit `IN` list, not a fall-through default.

### 2. Intent-immutable trigger bypass — `app.allow_resolve_equipment_id_write`

`technical_order_items_intent_immutable` (baseline L3534–L3560) blocks any change to `intended_equipment_id`, `intended_assignee_staff_id`, or `intended_replacement_equipment_id` once the parent order leaves `draft`. To let `resolve_ticket` write the newly-created equipment id back onto the order item, we mirror the existing `app.allow_installer_equipment_swap` pattern (baseline L3034 / L4659):

**Trigger change (delta migration only):**

```sql
CREATE OR REPLACE FUNCTION public.technical_order_items_intent_immutable() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path TO 'public','extensions'
AS $$
declare
  v_parent_status text;
  v_allow_resolve_equipment boolean := coalesce(
    current_setting('app.allow_resolve_equipment_id_write', true), 'false'
  ) = 'true';
begin
  -- Fast path: no intent columns changed.
  if new.intended_equipment_id is not distinct from old.intended_equipment_id
     and new.intended_assignee_staff_id is not distinct from old.intended_assignee_staff_id
     and new.intended_replacement_equipment_id is not distinct from old.intended_replacement_equipment_id
  then
    return new;
  end if;

  -- Narrow bypass: resolve_ticket writes intended_equipment_id after creating
  -- operations.equipment. Only intended_equipment_id may change under this flag;
  -- intended_assignee_staff_id and intended_replacement_equipment_id remain locked.
  if v_allow_resolve_equipment
     and new.intended_equipment_id is distinct from old.intended_equipment_id
     and new.intended_assignee_staff_id is not distinct from old.intended_assignee_staff_id
     and new.intended_replacement_equipment_id is not distinct from old.intended_replacement_equipment_id
  then
    return new;
  end if;

  select status into v_parent_status
    from public.technical_orders
   where id = new.order_id;

  if v_parent_status <> 'draft' then
    raise exception 'TECHNICAL_ORDER_ITEM_INTENT_LOCKED: intent columns ... are immutable once the order leaves draft (order_id=%, status=%)',
      new.order_id, v_parent_status
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;
```

**Key properties:**

- `current_setting(..., true)` returns NULL when the GUC is unset (the `true` = "missing_ok"), and `coalesce(..., 'false') = 'true'` collapses NULL to `false`. Never raises.
- The bypass admits **only** an `intended_equipment_id` change. If any other intent column also moves in the same UPDATE, the bypass does not apply — the row falls through to the standard lock check and raises. This narrows blast radius even if the GUC leaks.
- The check is a plpgsql local variable (`v_allow_resolve_equipment`) so it evaluates once per row, matching the shape of `v_allow_swap` at L4658.

**Where `resolve_ticket` sets it:**

Inside the freestanding-install branch of `resolve_ticket`, immediately after `INSERT INTO operations.equipment ... RETURNING id INTO v_new_equipment_id` and after the existing `set_config('app.allow_installer_equipment_swap', 'true', true)`:

```sql
-- Bypass technical_order_items_intent_immutable for the single write-back below.
-- Transaction-local: cannot leak past this transaction; scoped to a single UPDATE
-- statement targeting one order-item row.
perform set_config('app.allow_resolve_equipment_id_write', 'true', true);

update public.technical_order_items
   set intended_equipment_id = v_new_equipment_id
 where id = v_toi.id
   and v_toi.id is not null;

-- Immediately clear so the flag does not apply to any sibling UPDATE in the
-- same transaction (defense-in-depth; the `true` third arg already scopes it
-- to this transaction, but explicit clearing tightens the window further).
perform set_config('app.allow_resolve_equipment_id_write', 'false', true);
```

**Why transaction-local `true`:**

- `set_config(name, value, true)` sets the GUC only for the current transaction, matching how `app.allow_installer_equipment_swap` is already used. It disappears at COMMIT/ROLLBACK — cannot leak to another session, another statement outside the transaction, or a connection pool re-use.
- The explicit reset after the UPDATE is defense-in-depth: even within the same transaction, no later statement (e.g., the ticket-status UPDATE or the stock-movement INSERTs) sees the flag on. Combined with the trigger's narrow-column check, two independent gates must fail before a rogue caller can move any other intent column.

**Contract:** the only caller allowed to set `app.allow_resolve_equipment_id_write` is `resolve_ticket`. This must be documented in a migration comment header (see Decision 8) and reinforced in code review — no client-side code, no other RPC, no manual SQL should touch it. Any future caller must be added by an explicit design amendment.

### 3. Reserva emission trigger point — no RPC change

`confirm_technical_order` already emits `reserva` when `v_item.product_id IS NOT NULL` (baseline L1380–L1402):

```sql
if v_item.product_id is not null then
  insert into public.stock_movements (
    product_id, type, quantity, note, order_id, order_item_id, order_kind
  ) values (
    v_item.product_id, 'reserva', -v_item.quantity, 'Reserva de stock desde technical_order_item ' || v_item.id::text,
    p_order_id, v_item.id, 'technical'
  )
  on conflict (order_item_id, type)
    where type = 'reserva' and order_item_id is not null
    do nothing;
end if;
```

The category mapping (baseline L1335) sends `item_type='installation' → category='installation'`, but that mapping does **not** gate reservation. Reservation is gated only on `product_id IS NOT NULL`. Today the admin form (`TechnicalItemEquipmentField`, L673–675) returns `null` for `itemType === 'installation'`, so `product_id` is NULL, so no reserva is emitted.

**Consequence: no RPC change is required for reservation.** The fix lives entirely in the admin form (Decision 5). Once the form provides `product_id`, `confirm_technical_order` emits `reserva` automatically, exactly the way it does for `equipment_installation`.

**Flow (once form change lands):**

```
Admin submits TechnicalOrderForm (item_type='installation', product_id=<eq>)
  → confirm_technical_order(order_id)
     → for each item:
        - build category := 'installation'
        - insert support.tickets(category='installation', ...)
        - product_id IS NOT NULL → insert stock_movements(type='reserva', quantity=-qty)
     → stock_movements_maintain_counters trigger
        - products.stock_reservado += qty (via ledger delta)
```

`ON CONFLICT (order_item_id, type) WHERE type='reserva'` keeps `confirm_technical_order` idempotent across accidental re-confirms — no design change needed.

### 4. Resolve side-effect sequencing

Inside `resolve_ticket`, the extended freestanding-install branch (covering both `equipment_installation` and `installation`) executes in this exact order. The sequencing matters because (a) `tickets_require_equipment_on_resolve` must see a valid `equipment_id` at the resolved hop, and (b) the intent-bypass GUC must be set only around the single write-back:

1. **Validate ticket state.** Confirm `v_ticket.status NOT IN ('resolved','cancelled')` (existing guard, L3012), then require `v_ticket.pending_new_serial` non-empty (existing guard, L3023).
2. **Set installer-swap bypass.** `perform set_config('app.allow_installer_equipment_swap', 'true', true)` (existing, L3034) — required for the later ticket UPDATE that assigns `equipment_id`.
3. **Load linked `technical_order_item`.** `select toi.id, toi.product_id, toi.quantity, toi.order_id, p.name into v_toi ...` (existing, L3038–L3044).
4. **Resolve effective model.** `coalesce(pending_new_model, v_toi.product_name)`; raise if NULL (existing, L3046–L3056).
5. **Insert `operations.equipment`.** `insert into operations.equipment (...) values (...) returning id into v_new_equipment_id` (existing for `equipment_installation`, L3067; runs for both categories under the extended guard). Requires `v_ticket.building_id NOT NULL`.
6. **Update ticket with new equipment id.** `update support.tickets set equipment_id = v_new_equipment_id where id = p_ticket_id` (existing, L3078). Passes because installer-swap bypass is on.
7. **Write back `intended_equipment_id` (new step, scoped by intent bypass).**
   ```sql
   perform set_config('app.allow_resolve_equipment_id_write', 'true', true);
   update public.technical_order_items
      set intended_equipment_id = v_new_equipment_id
    where id = v_toi.id
      and v_toi.id is not null;
   perform set_config('app.allow_resolve_equipment_id_write', 'false', true);
   ```
   Skipped as a no-op when `v_toi.id IS NULL` (freestanding ticket with no linked order item — the existing `equipment_installation` freestanding case).
8. **Emit stock movements** (existing L3082–L3099, unchanged; runs only when `v_toi.product_id IS NOT NULL`):
   - `stock_movements(type='egreso_instalacion', quantity=-v_toi.quantity, ...)`.
   - `stock_movements(type='liberacion_reserva', quantity=+v_toi.quantity, ...)`.
9. **Transition ticket status.** Existing code path after the category-specific block sets `support.tickets.status='resolved'` and resolved timestamps. `tickets_require_equipment_on_resolve` sees the freshly-set `equipment_id` from step 6.
10. **Cascade item status.** Existing trigger (or downstream update) transitions `technical_order_items.status` from `in_progress` → `completed` when all its tickets close. No change required.

**Why write-back precedes stock movements, not after:** ordering here is not functionally load-bearing (both happen inside the same transaction, both share the ticket), but keeping the intent-bypass window as small and adjacent as possible to its single UPDATE keeps the audit story simple. The bypass turns on, does its one UPDATE, and turns off — with no unrelated INSERTs happening while it is set.

**Why the explicit `perform set_config(..., 'false', true)` after the UPDATE:** transaction-local scoping (third arg `true`) already contains leakage across transactions, but explicit reset prevents any later intra-transaction UPDATE on `technical_order_items` from silently benefiting from the flag. Combined with the trigger's narrow-column admission (Decision 2), this is two independent gates.

### 5. Admin form — `product_id` field for `item_type='installation'`

**File:** `apps/admin/src/components/servicio-tecnico/TechnicalOrderForm.tsx` (and its `TechnicalItemEquipmentField` sub-component).

**Field placement:** mirror the existing `itemType === 'equipment'` branch inside `TechnicalItemEquipmentField`. Today it returns `null` for `itemType === 'installation'` (L673–675). Extend the render to:

- For `itemType === 'equipment'`: keep the existing product selector.
- For `itemType === 'installation'`: render the same product selector (filtered to equipment-category products, see below), with a label suited to the "which equipment SKU will be installed" question rather than "which equipment to attach."
- For `itemType === 'maintenance' | 'equipment_replacement'`: unchanged.

**Zod schema (conditional requirement):**

```ts
// pseudo — mirror the existing shape
const technicalOrderItemSchema = z.object({
  item_type: z.enum(['equipment','maintenance','installation','equipment_replacement']),
  product_id: z.string().uuid().nullable(),
  // ... other fields
}).superRefine((data, ctx) => {
  if ((data.item_type === 'equipment' || data.item_type === 'installation')
      && !data.product_id) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['product_id'],
      message: 'product_id is required for equipment and installation items',
    });
  }
});
```

Use `superRefine` (or the existing conditional pattern already used in the form) rather than a hard `.min(1)` because `product_id` remains legitimately nullable for `maintenance` and `equipment_replacement`.

**Product query filter:** the field's data source must filter `products` to the equipment-eligible SKUs. Reuse whatever category filter the `itemType === 'equipment'` branch already applies (typically `products.category = 'equipment'` in the products taxonomy). Do not introduce a new query hook — extend the enabled/select gating of the existing hook.

**Backward compatibility:** existing draft orders with a legacy `installation` item lacking `product_id` will now fail the schema on next submit. Since drafts are user-owned and short-lived, admins simply fill the newly-required field before confirm. No data migration.

### 6. Cross-app UI symmetry — no shared factory change

Both `apps/admin/src/components/tareas/ConfigureEquipmentPanel.tsx` and `apps/installer/src/components/work/ConfigureEquipmentInline.tsx` (or the installer's equivalent) already share the `useConfigureTechnicalTicketEquipment` hook. That hook wraps the RPC call and knows nothing about category — it accepts the ticket id and payload and delegates the guard to the SQL function.

**No changes are required to the shared hook or any shared factory.** The design surface is entirely in the *consuming* components:

- `apps/admin/src/routes/tareas/TareaDetailPage.tsx`: `CATEGORIES_TWO_STEP_CONFIGURE = new Set(['equipment_installation','equipment_replacement'])` → add `'installation'`.
- `apps/admin/src/components/tareas/ConfigureEquipmentPanel.tsx`: extend the `category` prop's type union and any heading/help-copy record maps to include `'installation'` (labels for the new key can reuse or lightly customize the `equipment_installation` copy).
- `apps/installer/src/components/work/TicketCard.tsx`: `TWO_STEP_CATEGORIES = ['equipment_installation','equipment_replacement']` → add `'installation'`.
- `apps/installer/src/routes/TaskDetailPage.tsx`: extend whatever category gate (constant `EQUIPMENT_INSTALLATION` or equivalent, L36) gates `ConfigureEquipmentInline`.

**Contract:** the hook's public shape is unchanged. Vitest coverage on the hook needs a new test case exercising `category='installation'` end-to-end through the mocked RPC, but no signature change.

### 7. `item_type='installation'` status transitions — mirror `equipment_installation`

No new statuses. The item follows the existing state machine unchanged:

```
technical_order_items.status:
  pending
    → in_progress  (when the child support.ticket transitions open → in_progress
                    on ticket assignment or on configure_technical_ticket_equipment)
    → completed    (when the child ticket transitions to resolved via resolve_ticket)
    → cancelled    (independent path — order or item cancellation)
```

`support.tickets.status` for the child ticket follows its existing state machine (`open → in_progress → resolved`) and remains unchanged. No new `pending_*` columns needed on `support.tickets` — `pending_new_serial` and `pending_new_model` already exist and are populated by `configure_technical_ticket_equipment`.

The order-level rollup that transitions `technical_order_items.status` based on child-ticket state is category-agnostic in the baseline; extending the guard set has no effect on the status FSM. Documented here to make the review's "no state-machine changes" assertion easy to verify.

### 8. Migration file — naming, shape, comment header

**File:** `supabase/migrations/YYYYMMDDHHMMSS_extend_installation_category_lifecycle.sql`
(pick the timestamp at commit time, e.g. `20260901120000_...`; must sort strictly after `20260831000000_baseline.sql`).

**Shape:** pure delta on top of the squashed baseline. Contents, in order:

1. Comment header (see below).
2. `CREATE OR REPLACE FUNCTION public.technical_order_items_intent_immutable() ...` — full replacement with the new `v_allow_resolve_equipment` bypass branch.
3. `CREATE OR REPLACE FUNCTION public.configure_technical_ticket_equipment(...) ...` — full replacement with the extended `IN (...)` guard.
4. `CREATE OR REPLACE FUNCTION public.resolve_ticket(...) ...` — full replacement with the extended outer `IN (...)` guard, the extended inner freestanding-install branch, and the new `intended_equipment_id` write-back block gated by `set_config('app.allow_resolve_equipment_id_write', 'true', true)`.

No `ALTER TABLE`, no new triggers, no new GRANTs (existing function grants persist through `CREATE OR REPLACE`), no data statements.

**Comment header (mandatory — this is where the design contract lives at runtime):**

```sql
-- extend_installation_category_lifecycle
--
-- Purpose: bring category='installation' to full parity with 'equipment_installation'
-- for the confirm → configure → resolve pipeline, closing four bugs rooted in a single
-- mapping gap (see sdd/technical-installation-stock-lifecycle proposal and design).
--
-- Contract: this migration introduces one new transaction-local GUC:
--   app.allow_resolve_equipment_id_write
-- The ONLY caller allowed to set this GUC is public.resolve_ticket, and only
-- around the single UPDATE that writes technical_order_items.intended_equipment_id
-- after creating operations.equipment. Any other caller (client code, other RPCs,
-- manual SQL) setting this GUC would silently subvert the technical_order_items
-- intent-immutability guarantee.
--
-- The trigger admits the bypass only when intended_equipment_id is the sole
-- intent column changing in the UPDATE — a second gate that narrows blast radius
-- even if the GUC leaks.
--
-- No schema DDL, no data migration, no new movement types, no new statuses.
```

### 9. Testing plan

**Vitest (extended existing suites):**

- `apps/admin/src/components/tareas/__tests__/ConfigureEquipmentPanel.test.tsx`: add cases for `category='installation'` (renders panel, submits through hook, disables when ticket status is invalid).
- `apps/installer/src/components/work/__tests__/ConfigureEquipmentInline.test.tsx` (or the equivalent path): add symmetric cases for `category='installation'`.
- `apps/*/src/hooks/__tests__/useConfigureTechnicalTicketEquipment.test.ts`: add a case that passes a ticket with `category='installation'` through the mocked RPC and asserts payload shape.
- `apps/admin/src/routes/tareas/__tests__/TareaDetailPage.test.tsx` (if it exists): assert `ConfigureEquipmentPanel` renders for `category='installation'` and `AssignEquipmentDialog` is NOT rendered in `create` mode for it.
- `apps/installer/src/components/work/__tests__/TicketCard.test.tsx`: assert two-step affordance renders for `category='installation'`.

**Vitest (new admin-form branch):**

- `apps/admin/src/components/servicio-tecnico/__tests__/TechnicalOrderForm.test.tsx`: unit test the zod schema's conditional branch — a submission with `item_type='installation'` and `product_id=null` fails validation with a `product_id`-scoped error; the same submission with a `product_id` passes.

**Manual E2E checklist (committed as `openspec/changes/technical-installation-stock-lifecycle/manual-verification.md`):**

Run against a local Supabase stack (`supabase start`) with the migration applied:

1. Seed: at least one active `products` row with `category='equipment'` and positive `stock_total`.
2. **Create order:** admin creates a technical order with one item of `item_type='installation'`, a valid `building_id`, `quantity=1`, and the seeded `product_id`. Confirm the item saves and the order is in `draft`.
3. **Confirm order:** invoke `confirm_technical_order(order_id)`.
   - Assert: exactly one `support.tickets` row with `category='installation'`, `status='open'`, `technical_order_item_id` linked.
   - Assert: exactly one `stock_movements` row with `type='reserva'`, `product_id=<seeded>`, `quantity=-1`, `order_item_id=<item>`, `order_kind='technical'`.
   - Assert: `products.stock_reservado` incremented by 1.
4. **Configure equipment:** as an assigned installer (or admin via `ConfigureEquipmentPanel`), call `configure_technical_ticket_equipment(ticket_id, p_new_serial='SN-TEST', p_new_model='M1')`.
   - Assert: RPC returns without raising.
   - Assert: `support.tickets.pending_new_serial='SN-TEST'`, `pending_new_model='M1'`, `status='in_progress'`.
5. **Resolve ticket:** call `resolve_ticket(ticket_id)`.
   - Assert: one new `operations.equipment` row with `serial_number='SN-TEST'`, `model='M1'`, `building_id=<from ticket>`, `status='active'`.
   - Assert: `support.tickets.equipment_id` set to the new equipment id.
   - Assert: `support.tickets.status='resolved'`.
   - Assert: `technical_order_items.intended_equipment_id` set to the new equipment id.
   - Assert: one `stock_movements` row with `type='egreso_instalacion'`, `quantity=-1`.
   - Assert: one `stock_movements` row with `type='liberacion_reserva'`, `quantity=+1`.
   - Assert: `products.stock_total` decreased by 1; `products.stock_reservado` back to prior value.
6. **Intent-immutability negative test:** attempt a direct UPDATE from `psql` on the resolved item that changes `intended_assignee_staff_id` — must fail with `TECHNICAL_ORDER_ITEM_INTENT_LOCKED`. Attempt a direct UPDATE changing `intended_equipment_id` — must also fail (the GUC is not set outside `resolve_ticket`).

## Data Flow Diagrams

### Confirm flow (after form fix)

```
[Admin submits form: item_type='installation', product_id=<eq>, quantity=N]
                             │
                             ▼
              confirm_technical_order(order_id)
                             │
        ┌────────────────────┼─────────────────────┐
        ▼                    ▼                     ▼
  build v_category      insert support.tickets   product_id IS NOT NULL?
   = 'installation'     (category='installation') │
                                                  ▼ yes
                                     insert stock_movements
                                     (type='reserva', qty=-N,
                                      order_item_id, order_kind='technical')
                                                  │
                                                  ▼
                             stock_movements_maintain_counters trigger
                                                  │
                                                  ▼
                                 products.stock_reservado += N
```

### Resolve flow (with extended guard + intent write-back)

```
[Installer resolves ticket via UI → resolve_ticket(ticket_id)]
                             │
                             ▼
     v_ticket.category IN ('equipment_installation','equipment_replacement','installation') ?
                             │
                             ▼ yes
       set_config('app.allow_installer_equipment_swap','true',true)
                             │
                             ▼
       load v_toi from technical_order_items (product_id, quantity, order_id, name)
                             │
                             ▼
       v_ticket.category IN ('equipment_installation','installation') ?
                             │
                             ▼ yes
       INSERT operations.equipment RETURNING id INTO v_new_equipment_id
                             │
                             ▼
       UPDATE support.tickets SET equipment_id = v_new_equipment_id
                             │
                             ▼
       ┌────── intent-bypass window (single UPDATE) ──────┐
       │  set_config('app.allow_resolve_equipment_id_write','true',true)
       │  UPDATE technical_order_items SET intended_equipment_id = v_new_equipment_id
       │  set_config('app.allow_resolve_equipment_id_write','false',true)
       └────────────────────────────────────────────────────┘
                             │
                             ▼
       v_toi.product_id IS NOT NULL ?
                             │
                             ▼ yes
       INSERT stock_movements(type='egreso_instalacion', qty=-N)
       INSERT stock_movements(type='liberacion_reserva',  qty=+N)
                             │
                             ▼
       stock_movements_maintain_counters trigger
         → products.stock_total     -= N
         → products.stock_reservado -= N
                             │
                             ▼
       UPDATE support.tickets SET status='resolved', resolved_at=now(),
                                  resolved_by=<actor>
                             │
                             ▼
       (existing rollup) technical_order_items.status: in_progress → completed
                          when all sibling tickets resolved
```

## Migration & Rollback

**Forward migration:** apply the delta file. `CREATE OR REPLACE` on three functions is atomic per statement and safe under concurrent traffic — Postgres queues DDL against ongoing calls. No data touched.

**Rollback:** re-run the previous definitions of the three functions from the baseline (a maintainer can dump the three prior `CREATE OR REPLACE FUNCTION` blocks straight from `20260831000000_baseline.sql` L1114/L3022/L3534 as a rollback migration if needed). No data rollback required — the new logic only affects newly-created tickets and equipment; already-inserted rows are compatible with either code version.

**Coexistence with existing `installation` tickets:** legacy tickets currently sitting in `open`/`in_progress` with `category='installation'` and no `product_id` on their linked item become eligible for the new configure/resolve path only if an admin/installer chooses to walk them through it. Because `product_id` is NULL on those items, `resolve_ticket` will still create equipment (freestanding path allows `product_id IS NULL`) and simply skip the stock-movement block — same behavior as an `equipment_installation` freestanding ticket without a linked order item. No breakage.

## Open Questions

None blocking. Two minor follow-ups worth noting but explicitly out of scope for this change:

- Should `access_type` collection move from installer-typed to `pending_access_type` on the ticket? Explicitly deferred (proposal Non-goals) — installer types it on resolve, matching current `equipment_installation`.
- Should we introduce pgTAP now to lock in the intent-bypass contract? Explicitly deferred (proposal Non-goals) — manual verification checklist is the substitute; Vitest + code-review discipline guards the client side.

## Key Learnings

1. **Guard extensions beat abstractions when divergence is likely.** Keeping `IN ('equipment_installation','equipment_replacement','installation')` as an explicit list — instead of hiding it behind an `is_equipment_installation()` helper — preserves the visible signal that these categories share behavior *by choice*. A future fork stays a single-line, single-file edit visible in code review.
2. **A scoped `set_config` bypass needs two independent gates, not one.** Transaction-local scoping (third arg `true`) contains cross-transaction leakage; a narrow-column check inside the trigger contains intra-transaction misuse. Either alone would be fragile; both together make a rogue caller need to fail two contracts to move an unauthorized intent column.
3. **A "missing side-effect" is often a mapping bug, not a logic bug.** All four surface symptoms here (no reserva, no egreso, broken UX, no write-back) collapse to the single `case v_item.item_type when 'installation' then 'installation'` line in `confirm_technical_order` placing the item outside the shared category set. The design fixes the guards, not the logic — the logic was already right for the sibling category.
4. **Form contract is part of the RPC contract.** `confirm_technical_order` already emits `reserva` when `product_id IS NOT NULL`; the reason no reserva emitted was purely a form-side omission (`TechnicalItemEquipmentField` returning `null` for `installation`). Treating form validation as an extension of the RPC's precondition avoids RPC-side changes and keeps the delta small.
5. **Cross-app UI symmetry pays back at design time.** Because `ConfigureEquipmentPanel` (admin) and `ConfigureEquipmentInline` (installer) already share `useConfigureTechnicalTicketEquipment`, extending the category surface required zero changes to the shared hook — only the consuming components' category gates move. The prior symmetry investment turned a 6-file change into a 5-file change and eliminated an entire class of "admin works, installer doesn't" bugs.
