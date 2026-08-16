# Design: Atomic Stock Work Resolution

## Technical Approach

Close the ledger gap for `equipment_installation` and `equipment_replacement` tickets by mirroring the existing atomic pattern of `resolve_equipment_installation` (migration `20260811000041`) and `configure_key_order_item`. One migration extends the `stock_movements.type` domain with `egreso_reemplazo`, refreshes the twin `stock_movements_sign_matches_type` sign constraint (both live in `20260811000029_create_stock_movements_table.sql` and MUST be replaced together), adds `public.resolve_equipment_replacement`, and backfills historical resolved `equipment_installation` tickets. The admin client swaps its two-step create/replace mutations for two focused hooks that invoke the atomic RPCs; `AssignEquipmentDialog` becomes the whole completion step for those categories. The installer client learns `category` and drops `equipment_installation`/`equipment_replacement` from the batch-resolve selection. Keys (`configure_key_order_item`) are untouched.

## Architecture Decisions

### Decision: Keep two focused RPCs instead of one polymorphic RPC

**Choice**: `resolve_equipment_installation` and `resolve_equipment_replacement` remain distinct category-guarded RPCs.
**Alternatives**: Relax the category guard on `resolve_equipment_installation` so it also handles `installation` (no product_id) tickets, or collapse install + replace into a single RPC dispatched by category.
**Rationale**: Each RPC guards a single ticket category and a single stock-movement type. Relaxing the guard would let a caller resolve an `installation` ticket through the equipment path and silently mint a spurious equipment row. `installation` tickets have no product_id and no equipment side-effect, so they stay on the generic `resolve_ticket` path — enforced by an explicit code comment in `AssignEquipmentDialog.modeForCategory`.

### Decision: Extend the enum + sign constraint in the same migration

**Choice**: Drop and recreate both `stock_movements_type_check` (implicit) and `stock_movements_sign_matches_type` inside `20260812000061`, listing the full domain plus `egreso_reemplazo`.
**Alternatives**: Only touch the enum check; leave the sign constraint on the assumption a `CHECK … in (…)` list is separate.
**Rationale**: The sign constraint enumerates each egreso by name (`egreso_grabacion, egreso_instalacion, baja_defectuoso, baja_perdida, reserva`). Inserting `egreso_reemplazo` with negative quantity would fail the sign check even if the type domain accepts it. Both must move together.

### Decision: Distinguishable `note` prefix for backfill movements

**Choice**: Backfilled `stock_movements` rows use note prefix `[Backfill 000061] …`.
**Alternatives**: Use the same runtime note text; rely on `created_at` window for rollback.
**Rationale**: Rollback needs a WHERE clause that targets only backfilled rows without a time window (deploy times drift). A stable prefix makes `DELETE … WHERE note LIKE '[Backfill 000061]%'` safe.

### Decision: Enforce installer exclusion in the component, not the DB

**Choice**: `TicketsSection` filters `equipment_installation` and `equipment_replacement` out of the selectable set; `useResolveTickets` signature is unchanged.
**Alternatives**: Add a SQL guard inside `resolve_ticket` that rejects those categories (Option 5 in proposal).
**Rationale**: Proposal defers Option 5 as a defense-in-depth follow-up. Component-layer filtering plus TypeScript exhaustive dispatch already prevents the misroute; RPC-side rejection can land later without invalidating this design.

## Data Flow

```
 admin AssignEquipmentDialog
   ├─ maintenance          → useMutateTicketEquipment.assignExistingEquipment (unchanged)
   ├─ installation         → useMutateTicketEquipment.createAndAssignEquipment
   │                         + useResolveTickets (unchanged two-step; no product_id)
   ├─ equipment_installation → useResolveEquipmentInstallation
   │                             └─ RPC resolve_equipment_installation
   │                                 ├─ insert operations.equipment
   │                                 ├─ insert egreso_instalacion (-qty)
   │                                 ├─ insert liberacion_reserva (+qty)
   │                                 └─ support.tickets → in_progress → resolved
   └─ equipment_replacement  → useResolveEquipmentReplacement
                                └─ RPC resolve_equipment_replacement
                                    ├─ operations.replace_equipment (temp table, ON COMMIT DROP)
                                    ├─ insert egreso_reemplazo (-qty)
                                    ├─ insert liberacion_reserva (+qty)
                                    ├─ support.tickets.equipment_id = new
                                    └─ support.tickets → in_progress → resolved

 installer TicketsSection
   └─ tickets.filter(t => t.category ∉ {equipment_installation, equipment_replacement})
        │                                          (batch selection set)
        └─ excluded tickets render as read-only "Pendiente de admin" cards
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `supabase/migrations/20260812000061_atomic_stock_work_resolution.sql` | Create | Type + sign CHECK refresh, `resolve_equipment_replacement`, backfill DO block |
| `supabase/tests-sql/test_atomic_stock_work_resolution.sql` | Create | Smoke tests for both RPCs, backfill idempotency, temp-table nesting |
| `apps/admin/src/hooks/useResolveEquipmentInstallation.ts` | Create | Wraps `public.rpc('resolve_equipment_installation', …)` |
| `apps/admin/src/hooks/useResolveEquipmentReplacement.ts` | Create | Wraps `public.rpc('resolve_equipment_replacement', …)` |
| `apps/admin/src/hooks/useMutateTicketEquipment.ts` | Modify | Retire `createAndAssignEquipment` + `replaceEquipmentInTicket`; keep `assignExistingEquipment` |
| `apps/admin/src/components/tareas/AssignEquipmentDialog.tsx` | Modify | Route by category to the new atomic hooks; dialog closes the ticket |
| `apps/admin/src/routes/tareas/TareaDetailPage.tsx` | Modify | Minimal wiring update if it referenced retired mutations |
| `apps/installer/src/hooks/useAssignedTickets.ts` | Modify | Add `category` to `AssignedTicket` type and to the `.select(...)` list |
| `apps/installer/src/components/work/TicketsSection.tsx` | Modify | Filter equipment categories from selection; render as read-only cards |

## Interfaces / Contracts

### Migration `20260812000061_atomic_stock_work_resolution.sql`

Order (constraint changes first so the RPC and backfill can rely on the widened domain):

```sql
-- 1) Extend stock_movements.type CHECK.
alter table public.stock_movements
  drop constraint stock_movements_type_check;

alter table public.stock_movements
  add constraint stock_movements_type_check
  check (type in (
    'compra',
    'devolucion',
    'ajuste_manual',
    'egreso_grabacion',
    'egreso_instalacion',
    'egreso_reemplazo',
    'baja_defectuoso',
    'baja_perdida',
    'reserva',
    'liberacion_reserva'
  ));

-- 2) Refresh sign constraint (adds egreso_reemplazo to the negative list).
alter table public.stock_movements
  drop constraint stock_movements_sign_matches_type;

alter table public.stock_movements
  add constraint stock_movements_sign_matches_type
  check (
    (type in ('compra', 'devolucion', 'liberacion_reserva') and quantity > 0)
    or (type in (
          'egreso_grabacion',
          'egreso_instalacion',
          'egreso_reemplazo',
          'baja_defectuoso',
          'baja_perdida',
          'reserva'
        ) and quantity < 0)
    or (type = 'ajuste_manual')
  );

-- 3) New RPC: mirrors resolve_equipment_installation, delegates the swap
--    to operations.replace_equipment.
create or replace function public.resolve_equipment_replacement(
  p_ticket_id         uuid,
  p_old_equipment_id  uuid,
  p_new_serial        text,
  p_new_model         text,
  p_new_description   text default null,
  p_note              text default null,
  p_actor_staff_id    uuid default null
) returns uuid
language plpgsql
security definer
as $$
declare
  v_ticket_category  text;
  v_ticket_status    text;
  v_new_equipment_id uuid;
  v_product_id       uuid;
  v_quantity         int;
  v_order_id         uuid;
  v_order_item_id    uuid;
  v_actor            uuid;
begin
  v_actor := coalesce(p_actor_staff_id, identity.current_staff_id());

  if p_new_serial is null or length(trim(p_new_serial)) = 0 then
    raise exception 'resolve_equipment_replacement: new serial is required'
      using errcode = 'P0001';
  end if;

  select category, status
    into v_ticket_category, v_ticket_status
    from support.tickets
   where id = p_ticket_id
   for update;

  if v_ticket_category is null then
    raise exception 'resolve_equipment_replacement: ticket % not found', p_ticket_id
      using errcode = 'P0001';
  end if;

  if v_ticket_category <> 'equipment_replacement' then
    raise exception
      'resolve_equipment_replacement: ticket % is not equipment_replacement (category: %)',
      p_ticket_id, v_ticket_category
      using errcode = 'P0001';
  end if;

  if v_ticket_status = 'resolved' then
    raise exception 'resolve_equipment_replacement: ticket % is already resolved', p_ticket_id
      using errcode = 'P0001';
  end if;

  -- Swap the physical equipment + migrate authorizations.
  -- operations.replace_equipment uses CREATE TEMP TABLE _keys_to_migrate
  -- ON COMMIT DROP; nesting inside this outer transaction is safe — the
  -- temp table drops when the outer transaction commits.
  v_new_equipment_id := operations.replace_equipment(
    p_old_equipment_id,
    trim(p_new_serial),
    p_new_model,
    coalesce(p_new_description, ''),
    null,
    'Replaced via ticket ' || p_ticket_id,
    v_actor
  );

  -- Locate the originating order_item through the reserva movement.
  select sm.order_item_id, sm.product_id, oi.order_id, oi.quantity
    into v_order_item_id, v_product_id, v_order_id, v_quantity
    from public.stock_movements sm
    join public.order_items oi on oi.id = sm.order_item_id
   where sm.ticket_id = p_ticket_id
     and sm.type = 'reserva'
   limit 1;

  if v_product_id is not null then
    insert into public.stock_movements (
      product_id, type, quantity, note, order_id, order_item_id,
      ticket_id, created_by
    ) values (
      v_product_id, 'egreso_reemplazo', -v_quantity,
      'Egreso por reemplazo de equipo (ticket ' || p_ticket_id || ')',
      v_order_id, v_order_item_id, p_ticket_id, v_actor
    );

    insert into public.stock_movements (
      product_id, type, quantity, note, order_id, order_item_id,
      ticket_id, created_by
    ) values (
      v_product_id, 'liberacion_reserva', v_quantity,
      'Liberación de reserva al reemplazar equipo (ticket ' || p_ticket_id || ')',
      v_order_id, v_order_item_id, p_ticket_id, v_actor
    );
  end if;

  update support.tickets
     set equipment_id = v_new_equipment_id
   where id = p_ticket_id;

  update support.tickets
     set status = 'in_progress'
   where id = p_ticket_id
     and status = 'open';

  update support.tickets
     set status               = 'resolved',
         resolved_by_staff_id = v_actor,
         resolution_notes     = coalesce(
           nullif(trim(coalesce(p_note, '')), ''),
           'Equipo reemplazado (serial ' || trim(p_new_serial) || ')'
         )
   where id = p_ticket_id
     and status = 'in_progress';

  return v_new_equipment_id;
end;
$$;

-- 4) Backfill historical resolved equipment_installation tickets. Runs last
--    so it uses the freshly-extended domain (only touches egreso_instalacion
--    and liberacion_reserva — both already valid pre-migration, so ordering
--    is defensive rather than strictly required).
do $$
declare
  r record;
begin
  for r in
    select t.id            as ticket_id,
           t.resolved_by_staff_id,
           sm.product_id,
           sm.order_item_id,
           oi.order_id,
           oi.quantity
      from support.tickets t
      join public.stock_movements sm
        on sm.ticket_id = t.id
       and sm.type      = 'reserva'
      join public.order_items oi
        on oi.id = sm.order_item_id
     where t.status   = 'resolved'
       and t.category = 'equipment_installation'
       and sm.product_id is not null
       and not exists (
             select 1
               from public.stock_movements m2
              where m2.ticket_id = t.id
                and m2.type in ('egreso_instalacion', 'liberacion_reserva')
           )
  loop
    insert into public.stock_movements (
      product_id, type, quantity, note, order_id, order_item_id,
      ticket_id, created_by
    ) values (
      r.product_id, 'egreso_instalacion', -r.quantity,
      '[Backfill 000061] Egreso por instalación de equipo (ticket ' || r.ticket_id || ')',
      r.order_id, r.order_item_id, r.ticket_id, r.resolved_by_staff_id
    );

    insert into public.stock_movements (
      product_id, type, quantity, note, order_id, order_item_id,
      ticket_id, created_by
    ) values (
      r.product_id, 'liberacion_reserva', r.quantity,
      '[Backfill 000061] Liberación de reserva al instalar equipo (ticket ' || r.ticket_id || ')',
      r.order_id, r.order_item_id, r.ticket_id, r.resolved_by_staff_id
    );
  end loop;
end;
$$;
```

### Hook signatures

```ts
// apps/admin/src/hooks/useResolveEquipmentInstallation.ts
interface ResolveEquipmentInstallationInput {
  ticketId: string;
  serial: string;
  unitId?: string | null;
  note?: string | null;
}
// mutationFn: supabase.rpc('resolve_equipment_installation', {
//   p_ticket_id, p_serial, p_unit_id, p_note
// })
// invalidates: ['admin','tarea', ticketId], tareasKey(), equipmentKey(buildingId?)

// apps/admin/src/hooks/useResolveEquipmentReplacement.ts
interface ResolveEquipmentReplacementInput {
  ticketId: string;
  oldEquipmentId: string;
  newSerial: string;
  newModel: string;
  newDescription?: string | null;
  note?: string | null;
}
// mutationFn: supabase.rpc('resolve_equipment_replacement', {
//   p_ticket_id, p_old_equipment_id, p_new_serial,
//   p_new_model, p_new_description, p_note
// })
```

### `useMutateTicketEquipment` after change

Exports only `assignExistingEquipment` (used by `maintenance`). `createAndAssignEquipment` and `replaceEquipmentInTicket` are removed; their sole caller was `AssignEquipmentDialog`.

### `AssignEquipmentDialog` routing

```ts
// Existing modeForCategory keeps the same switch, but now:
//   'installation'          → 'create'   (KEEPS current two-step flow;
//                              no product_id, so no atomic RPC. See comment.)
//   'equipment_installation'→ 'create'   (uses useResolveEquipmentInstallation)
//   'equipment_replacement' → 'replace'  (uses useResolveEquipmentReplacement)
//   'maintenance'           → 'select'   (unchanged)
```

For `equipment_installation` and `equipment_replacement`, the dialog no longer emits a separate `resolve_ticket` call — the RPC resolves the ticket itself. For `installation`, keep the current two-step (`createAndAssignEquipment` + `useResolveTickets` follow-up) with an explicit source comment: `// installation has no product_id → generic resolve path`.

### Installer `AssignedTicket`

```ts
interface AssignedTicket {
  id: string;
  title: string;
  description: string | null;
  status: 'open' | 'in_progress';
  category: 'maintenance' | 'installation' | 'equipment_installation' | 'equipment_replacement' | string;
  opened_at: string;
  building: { id: string; name: string; administration: { id: string; company_name: string } };
}
```

`fetchAssignedTickets` adds `category` to the `.select(...)` string and to the row shape.

### `TicketsSection` filter

```ts
const EXCLUDED_FOR_BATCH: readonly string[] =
  ['equipment_installation', 'equipment_replacement'];

const selectable = tickets.filter(t => !EXCLUDED_FOR_BATCH.includes(t.category));
const pendingAdmin = tickets.filter(t => EXCLUDED_FOR_BATCH.includes(t.category));
// Render `selectable` in the existing batch toolbar; render `pendingAdmin`
// as read-only "Pendiente de admin" cards.
```

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| SQL smoke | `resolve_equipment_installation` end-to-end with reserva → egreso + liberacion; ticket resolved; equipment created | `supabase/tests-sql/test_atomic_stock_work_resolution.sql` scenario 1 |
| SQL smoke | `resolve_equipment_installation` with NULL product_id: no movements; ticket still resolves; equipment created | scenario 2 |
| SQL smoke | `resolve_equipment_replacement` end-to-end: reserva balanced by `egreso_reemplazo` + `liberacion_reserva`; ticket resolved; new equipment `active`; old equipment `dead`; `key_authorizations` migrated | scenario 3 |
| SQL smoke | `resolve_equipment_replacement` with NULL product_id: no movements; swap still happens | scenario 4 |
| SQL smoke | Second call on same ticket raises `SQLSTATE P0001`; no duplicate rows | scenario 5 |
| SQL smoke | Backfill DO block idempotency: second run inserts zero rows | scenario 6 |
| SQL smoke | Temp-table nesting: `operations.replace_equipment` invoked inside outer transaction succeeds | scenario 7 |
| Application | Existing vitest hooks that referenced the retired mutations | grep `createAndAssignEquipment` / `replaceEquipmentInTicket`; update or delete affected tests only |

## Threat Matrix

N/A — no routing, shell, subprocess, VCS/PR automation, executable-file classification, or process-integration boundary. All changes are DB migration + typed client code.

## Migration / Rollout

Ship the migration and both client apps in one PR. Applying the migration alone is safe (installer still routes `equipment_*` tickets to `resolve_ticket`; those calls silently transition state without emitting stock — the backfill catches the resulting orphaned reservas on any subsequent deploy). Applying the client alone before the migration would break `AssignEquipmentDialog` for equipment categories (RPC not found). SDD apply enforces order: DB migration first, then admin, then installer.

No down migration file. Manual rollback (non-production):
1. `drop function public.resolve_equipment_replacement(uuid, uuid, text, text, text, text, uuid);`
2. Restore the original `stock_movements_type_check` and `stock_movements_sign_matches_type` from `20260811000029` (dropping `egreso_reemplazo` from both).
3. `delete from public.stock_movements where note like '[Backfill 000061]%';`
4. `git revert` the client commits.

## Open Questions

- [ ] Should the installer read-only card render as its own collapsible subsection (`"Pendiente de admin (N)"`) or inline within the existing list with a visual badge? Defer to task phase; both fit the requirement.
- [ ] Confirm during apply that no other pending migration is competing for slot `20260812000061` (visual audit of `supabase/migrations/` before write).

## Key Learnings

1. `public.stock_movements` carries two constraints that both enumerate the type domain, so extending the enum requires dropping and recreating both constraints in the same migration.
2. `operations.replace_equipment` creates a temp table with `ON COMMIT DROP`, and nesting it inside the outer transaction of `resolve_equipment_replacement` is safe because the temp table drops at the outer commit.
3. Category-specific RPCs preserve semantic precision better than a single polymorphic resolver, so `resolve_equipment_installation` and `resolve_equipment_replacement` stay distinct.
4. Backfilled `stock_movements` rows use a `[Backfill 000061]` note prefix so rollback can target only those rows without depending on timestamps.
5. Installer misroute is prevented at the component layer through category filtering plus TypeScript exhaustive dispatch, deferring a SQL-level guard to a later defense-in-depth follow-up.
