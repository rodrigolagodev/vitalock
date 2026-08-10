# Design: admin-ordenes

## Technical Approach

Three-layer delivery: DB-first (PL/pgSQL RPC + trigger-driven auto-transition) → hook layer (TanStack Query, plain invalidation, no optimistic updates) → UI layer (RHF+Zod sheets, Shadcn table, Sonner toasts) — exactly following the admin-administrations and admin-infra-crud patterns. Chained 3-PR delivery stays under the 400-line reviewer budget.

---

## Architecture Decisions

### Decision 1: Atomic order+items creation — RPC `create_order_with_items`

| Option | Tradeoff | Decision |
|---|---|---|
| Client-side sequential inserts | Simple — order INSERT then item INSERTs; partial write possible if items INSERT fails | Rejected |
| DB RPC `create_order_with_items(order_data jsonb, items jsonb[]) returns uuid` | True atomicity; one round-trip; validation server-side | **Chosen** |

**Signature**:
```sql
create or replace function public.create_order_with_items(
  p_order  jsonb,   -- {client_type, administration_id?, particular_*, notes?, status}
  p_items  jsonb[]  -- [{item_type, quantity, description?, building_id?, equipment_id?}]
) returns uuid language plpgsql security definer as $$ ... $$;
```

**Server-side validation inside RPC**:
1. `client_type = 'administration'` → `administration_id` must not be null.
2. `client_type = 'particular'` → `particular_full_name` must not be empty.
3. Each item with `item_type = 'key'` → `building_id` must not be null (mirrors the `order_items` CHECK constraint already enforced at DB level, but RPC raises a `P0001` with a readable message).
4. `p_items` must not be empty (at least one item required).

**Client call** (`useMutateOrden.createOrden`):
```ts
const { data, error } = await supabase.rpc('create_order_with_items', {
  p_order: orderPayload,
  p_items: itemsPayload,
});
if (error) throw error;
return data as string; // returned uuid
```

On success: `queryClient.invalidateQueries({ queryKey: ordensKey() })` + `toast.success('Orden creada correctamente.')`.

---

### Decision 2: Configure key item atomicity — RPC `configure_key_order_item`

| Option | Tradeoff | Decision |
|---|---|---|
| (a) RPC `configure_key_order_item(...)` | True atomicity; rfid_keys INSERT + key_authorizations bulk INSERT + order_item status UPDATE in one transaction | **Chosen** |
| (b) Sequential client-side with try/catch cleanup | Rollback is unreliable from the browser; partial state (rfid_keys inserted, order_item not updated) is a real risk | Rejected |
| (c) DB trigger on rfid_keys INSERT to update `order_item.produced_key_id` | Hides coupling in trigger chain; harder to reason about; trigger fires on ALL rfid_keys inserts, not only ordenes-linked ones | Rejected |

**Rationale for (a)**: the same reason `create_order_with_items` was chosen. Three writes that must appear atomic from the admin's perspective. Trigger option (c) seems elegant but adds an implicit coupling: any `rfid_keys` INSERT with `order_item_id` would silently update `order_item`, which conflicts with the principle that the trigger chain should only manage status transitions, not business-entity linkages.

**Signature**:
```sql
create or replace function public.configure_key_order_item(
  p_order_item_id  uuid,
  p_rfid_code      text,
  p_unit_id        uuid,
  p_equipment_ids  uuid[]  -- may be empty
) returns uuid             -- returns produced rfid_key id
language plpgsql security definer as $$ ... $$;
```

Inside: INSERT rfid_keys (with `order_item_id = p_order_item_id`) → capture new key id → UPDATE order_items SET `produced_key_id = new_key_id, status = 'configured'` → INSERT key_authorizations for each equipment_id → return new key id.

**Client call** (`useMutateOrderItem.configureKeyItem`):
```ts
const { data, error } = await supabase.rpc('configure_key_order_item', {
  p_order_item_id: itemId,
  p_rfid_code:     rfidCode,
  p_unit_id:       unitId,
  p_equipment_ids: equipmentIds,
});
if (error) throw error;
```

On success: invalidate `ordenKey(orderId)` + `ordensKey()` + `keysKey(buildingId)` + `toast.success('Llave configurada correctamente.')`.

---

### Decision 3: Order status auto-transition trigger

Only fires when `order_items.status` is updated. Mirrors `sales.recompute_request_status()` pattern exactly.

**plpgsql** (to live in the `_orders.sql` or `_order_items.sql` migration):

```sql
create or replace function public.recompute_order_status(p_order_id uuid)
returns void language plpgsql as $$
declare
  v_current_status  text;
  v_total_key_items int;
  v_configured      int;
begin
  select status into v_current_status
    from public.orders where id = p_order_id for update;

  -- Only transition from in_preparation; other states are manual
  if v_current_status <> 'in_preparation' then return; end if;

  -- Count only non-cancelled KEY items (per spec: only key items auto-transition)
  select
    count(*) filter (where item_type = 'key' and status <> 'cancelled'),
    count(*) filter (where item_type = 'key' and status = 'configured')
  into v_total_key_items, v_configured
  from public.order_items
  where order_id = p_order_id;

  -- If there are no non-cancelled key items, do not auto-transition
  if v_total_key_items = 0 then return; end if;

  if v_configured = v_total_key_items then
    update public.orders set status = 'ready_for_pickup' where id = p_order_id;
  end if;
end;
$$;

create or replace function public.order_items_trigger_recompute()
returns trigger language plpgsql as $$
begin
  -- Fire on status change of any order_item
  if new.status is distinct from old.status then
    perform public.recompute_order_status(new.order_id);
  end if;
  return null;
end;
$$;

create trigger order_items_recompute_order_status
after update of status on public.order_items
for each row execute function public.order_items_trigger_recompute();
```

**Key rules encoded**:
- Only fires when `status` column actually changes (column-level trigger).
- Only acts when parent order is `in_preparation`.
- `v_total_key_items` excludes cancelled items — a single cancellation does not prematurely trigger `ready_for_pickup` for a partially-configured order.
- Only key items (`item_type = 'key'`) count; equipment/maintenance/installation items are out of scope this cycle and would stall auto-transition if included.

---

### Decision 4: Search — PostgREST embed for `administrations`

| Option | Tradeoff | Decision |
|---|---|---|
| Client-side map (fetch administrations separately, join in JS) | Extra round-trip; map lookup needed; stale if administration name changes between fetches | Rejected |
| PostgREST FK embed `orders?select=*,administrations(company_name)` | Single round-trip; administration name always fresh; no client-side join | **Chosen** |

`public.orders.administration_id` FK → `public.administrations.id` is in the same schema. PostgREST can embed it directly. `useOrdens` query:

```ts
supabase
  .from('orders')
  .select(`
    id, order_number, client_type,
    administration_id,
    administrations ( company_name ),
    particular_full_name, status,
    created_at,
    order_items ( id )
  `)
  .order('created_at', { ascending: false })
```

`administrations` is nullable embed (for particular clients). `OrdenRow` type reflects `administrations: { company_name: string } | null`.

For search: `useOrdens({ search?, status? })` passes filters server-side:
- `search`: `.or('order_number.ilike.%term%,particular_full_name.ilike.%term%')` + filtering on embedded `administrations.company_name` is not directly supported by PostgREST `.or()` on embedded columns → use `.textSearch` or fall back to a DB view/function. **Pragmatic decision**: search across `order_number` and `particular_full_name` via PostgREST `.or()` directly; for administration name search, include a denormalized `client_label text generated always as (coalesce(particular_full_name, ''))` column OR add `administration_company_name text` as a redundant stored column on `orders`.

**Simpler alternative accepted**: add `client_search_text text generated always as (coalesce(particular_full_name, '')) stored` on `orders` (for particular). For administration name search, perform client-side substring filter on the already-fetched embedded `administrations.company_name` after the PostgREST query returns — acceptable because the list is bounded (an admin at most has ~hundreds of orders visible at once, not millions). Full-text search of administration names client-side on the array is fast and avoids a generated column.

**Final**: PostgREST embed for administration name display; server-side `.ilike` filter on `order_number` and `particular_full_name`; client-side filter on `administrations.company_name` for the search input.

---

### Decision 5: `rfid_keys_prevent_reassignment` extension for `order_item_id`

Extend the existing `create or replace function public.rfid_keys_prevent_reassignment()` (already redefined in `20260807000011`) by adding a guard block:

```sql
if new.order_item_id is distinct from old.order_item_id then
  raise exception 'rfid_keys.order_item_id is immutable (key %)', old.id
    using errcode = 'check_violation';
end if;
```

This lives in the `rfid_keys_order_item_fk` migration (PR#1). Since the function is `create or replace`, the extension is safe to apply on top of the existing definition.

---

### Decision 6: QuickUnitCreateDialog placement

| Option | Tradeoff | Decision |
|---|---|---|
| Shared under `components/shared/` | Reusable across features; more discoverable | Rejected — "no lift this cycle" rule |
| Colocated under `components/ordenes/` | Local to configure flow; consistent with prior colocated pattern | **Chosen** |

`QuickUnitCreateDialog` lives at `apps/admin/src/components/ordenes/QuickUnitCreateDialog.tsx`. It wraps `useMutateUnit(buildingId).createUnit` and emits the created unit's `id` to its parent via `onCreated(unitId: string)` callback. ConfigureKeyItemSheet receives this callback and updates the `unit_id` field value.

---

### Decision 7: `useMutateKey.createKey` — `order_item_id` widening

`CreateKeyInput` gains `order_item_id?: string | null`. This is backward-compatible (existing callers omit the field; the DB column is nullable). The field is passed through directly to the Supabase `.insert()` call. No additional invalidation is needed because the ordenes flow invalidates `ordenKey` after `configure_key_order_item` RPC — the `createKey` path is not used directly from the ordenes UI anymore (the RPC handles the full configure step atomically).

---

### Decision 8: `mapMutationError` extensions

| SQLSTATE / case | Spanish message |
|---|---|
| `23505` + details includes `orders_order_number` | `'Ya existe una orden con ese número. Reintentá.'` |
| `23503` (FK violation in cancel context) | `'No se puede cancelar: tiene registros asociados.'` (override the generic 23503 with context detection via `err.message` substring) |
| `P0001` + message includes `configure_key` | `'Error al configurar la llave. Revisá los datos.'` |
| `P0001` + message includes `create_order` | `'Error al crear la orden. Revisá los datos.'` |

The `23503` case for FK violations already has a generic handler; add substring detection before it to differentiate the ordenes cancellation path from the buildings deactivation path.

---

## Data Flow

```
OrdenFormSheet (RHF+Zod)
  └── useMutateOrden.createOrden
        └── supabase.rpc('create_order_with_items', {...})
              └── [DB] INSERT orders + INSERT order_items  (atomic)
                    └── [trigger] set_updated_at
  └── invalidate ordensKey() → OrdenesPage refetch

OrdenDetailPage
  └── useOrden(ordenId) → orders + order_items (embedded)
  └── ConfigureKeyItemSheet (RHF+Zod, per item)
        └── useMutateOrderItem.configureKeyItem
              └── supabase.rpc('configure_key_order_item', {...})
                    └── [DB] INSERT rfid_keys (order_item_id set)
                         UPDATE order_items SET status='configured', produced_key_id=...
                         INSERT key_authorizations (bulk)
                    └── [trigger] order_items_recompute_order_status
                          └── recompute_order_status(order_id)
                                └── UPDATE orders SET status='ready_for_pickup'
                                    (when all non-cancelled key items configured)
        └── invalidate ordenKey(id) + ordensKey() + keysKey(buildingId)
```

---

## File Changes

### PR#1 — DB + types + base hooks

| File | Action | Description |
|---|---|---|
| `supabase/migrations/20260810XXXXXX_orders.sql` | Create | `public.orders` table, sequence, `gen_order_number()`, `recompute_order_status()`, `order_items_trigger_recompute` trigger, RLS |
| `supabase/migrations/20260810XXXXXX_order_items.sql` | Create | `public.order_items` table, `set_updated_at` trigger, RLS, `create_order_with_items` RPC, `configure_key_order_item` RPC |
| `supabase/migrations/20260810XXXXXX_rfid_keys_order_item_fk.sql` | Create | Add `order_item_id` column, mutual-exclusion CHECK, extend `rfid_keys_prevent_reassignment` |
| `packages/supabase/src/database.types.ts` | Modify | Regenerate via `supabase gen types typescript` |
| `apps/admin/src/lib/queryKeys.ts` | Modify | Add `ordensKey(status?, search?)` and `ordenKey(id)` |
| `apps/admin/src/hooks/mapMutationError.ts` | Modify | Add 23505 order_number case, P0001 configure/create_order cases |
| `apps/admin/src/hooks/useOrdens.ts` | Create | `useOrdens({ search?, status? })` — PostgREST with administration embed |
| `apps/admin/src/hooks/useOrden.ts` | Create | `useOrden(id)` — order + items joined |
| `apps/admin/src/hooks/useMutateOrden.ts` | Create | `createOrden` (RPC), `cancelOrden` (UPDATE status='cancelled'), `advanceOrdenStatus` (draft→in_preparation manual) |
| `apps/admin/src/hooks/useMutateOrderItem.ts` | Create | `configureKeyItem` (RPC), `cancelOrderItem` (UPDATE status='cancelled') |
| `apps/admin/src/hooks/useMutateKey.ts` | Modify | Widen `CreateKeyInput` with `order_item_id?: string \| null` |

### PR#2 — List page + create form

| File | Action | Description |
|---|---|---|
| `apps/admin/src/routes/ordenes/OrdenesPage.tsx` | Create | List with status pills + search input + table |
| `apps/admin/src/components/ordenes/OrdenesTable.tsx` | Create | Shadcn Table with skeleton rows + two empty states |
| `apps/admin/src/components/ordenes/OrdenFormSheet.tsx` | Create | RHF+Zod, client type radio, items field array, submit calls `createOrden` |
| `apps/admin/src/components/ordenes/OrdenStatusBadge.tsx` | Create | Status → colored Badge variant (Spanish labels) |
| `apps/admin/src/components/layout/Sidebar.tsx` | Modify | Add "Ordenes" NavSection (between Infraestructura and Personal) |
| `apps/admin/src/main.tsx` | Modify | Add `/ordenes` and `/ordenes/:ordenId` inside ProtectedRoute+App |

### PR#3 — Detail page + configure flow

| File | Action | Description |
|---|---|---|
| `apps/admin/src/routes/ordenes/OrdenDetailPage.tsx` | Create | Header (order_number, client, status), OrderItemsTable, manual transition buttons |
| `apps/admin/src/components/ordenes/OrderItemsTable.tsx` | Create | Items table with "Configurar" button on pending key items |
| `apps/admin/src/components/ordenes/ConfigureKeyItemSheet.tsx` | Create | rfid_code input, unit_id select + QuickUnitCreateDialog, equipment multi-select, calls `configureKeyItem` |
| `apps/admin/src/components/ordenes/QuickUnitCreateDialog.tsx` | Create | Inline unit creation; emits `onCreated(unitId)` |

---

## Interfaces / Contracts

```ts
// queryKeys.ts additions
export const ordensKey = (status?: string, search?: string) =>
  ['admin', 'ordenes', status ?? 'all', search ?? ''] as const;
export const ordenKey = (id: string) => ['admin', 'orden', id] as const;

// Hook row types
export interface OrdenRow {
  id: string;
  order_number: string;
  client_type: 'administration' | 'particular';
  administration_id: string | null;
  administrations: { company_name: string } | null;
  particular_full_name: string | null;
  status: 'draft' | 'in_preparation' | 'ready_for_pickup' | 'completed' | 'cancelled';
  created_at: string;
  order_items: { id: string }[];
}

export interface OrderItemRow {
  id: string;
  order_id: string;
  item_type: 'key' | 'equipment' | 'maintenance' | 'installation';
  quantity: number;
  description: string | null;
  status: 'pending' | 'configured' | 'in_progress' | 'completed' | 'cancelled';
  building_id: string | null;
  produced_key_id: string | null;
}

// RPC input types (client-side)
export interface CreateOrderInput {
  client_type: 'administration' | 'particular';
  administration_id?: string | null;
  particular_full_name?: string | null;
  particular_dni?: string | null;
  particular_phone?: string | null;
  particular_email?: string | null;
  notes?: string | null;
  status?: 'draft' | 'in_preparation';
}

export interface CreateOrderItemInput {
  item_type: 'key' | 'equipment' | 'maintenance' | 'installation';
  quantity: number;
  description?: string | null;
  building_id?: string | null;
  equipment_id?: string | null;
}
```

---

## Testing Strategy

| Layer | What | Approach |
|---|---|---|
| Unit | `toastMutationError` new branches (23505 order_number, P0001 configure/create_order) | Vitest; mock error objects; assert toast message |
| Unit | `ordensKey`, `ordenKey` shape | inline in queryKeys.test.ts (already pattern) |
| Integration (DB) | `create_order_with_items` — happy path, missing building_id on key item, empty items array | `supabase test` or direct `pg_tap` in migration test |
| Integration (DB) | `configure_key_order_item` — produces rfid_key, sets produced_key_id, updates status, inserts key_authorizations | same |
| Integration (DB) | `recompute_order_status` trigger — all key items configured → order transitions; cancelled item not counted; only key items counted | same |
| Integration (DB) | `rfid_keys_prevent_reassignment` extended — attempt to change `order_item_id` post-insert raises 23514 | same |
| Component | `OrdenFormSheet` — invalid submit blocked; client_type radio switches fields; requires ≥1 item | Vitest + Testing Library; mock `useMutateOrden` |
| Component | `ConfigureKeyItemSheet` — rfid_code required; unit_id required | same pattern |

---

## Threat Matrix

N/A — no routing, shell, subprocess, VCS/PR automation, executable-file classification, or process-integration boundary. This change is entirely within the Supabase client/DB and React admin UI.

---

## Migration / Rollout

**PR#1** is the prerequisite. Migrations run on local with `supabase db reset`; no seed data required for the new tables.

**Rollback**: the three new tables have `ON DELETE RESTRICT` on the FK from `rfid_keys.order_item_id`, so a partial rollback that drops `order_items` first will fail if any rfid_keys rows have `order_item_id` set. Correct rollback order: drop `rfid_keys.order_item_id` column first (nullify/drop FK), then drop `order_items`, then drop `orders`.

**No feature flags needed** — routes are only reachable via the new `/ordenes` path added to `main.tsx`. Sidebar entry drives discovery; without the sidebar entry (PR#2), the page is effectively unreachable by normal users.

---

## Open Questions

- [ ] Migration timestamp suffix for the three new files — confirm naming convention (`20260810000022`, `000023`, `000024`?) or a different date if applied later.
- [ ] RLS policy for `public.orders` and `public.order_items` for the installer role — deferred to installer cycle, but should the migration include a `-- TODO: installer SELECT policy` comment as a marker?
