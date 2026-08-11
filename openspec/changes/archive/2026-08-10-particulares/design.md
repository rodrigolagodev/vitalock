# Design: particulares

## Technical Approach

DB-first, three layers, following admin-ordenes: (1) `public.particulares` entity + FK wiring via 4 sequential migrations, (2) hook layer (TanStack Query, plain invalidation), (3) UI colocated under `components/particulares/` + `components/ordenes/`. Validation splits cleanly: the existing `rfid_keys_validate_pickup` trigger gains the `order_item_id` branch (data integrity), while order auto-completion runs **inside the pickup RPC** (user decision: no recompute trigger this cycle). Types regenerate via `npm run gen:types` against the local stack.

## Architecture Decisions

### D1: `public.particulares` table + RLS

```sql
create table public.particulares (
  id         uuid primary key default gen_random_uuid(),
  unit_id    uuid not null unique references public.units(id) on delete restrict,
  dni        text not null unique,
  full_name  text not null,
  phone      text,
  email      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.particulares enable row level security;
create policy "admin_all_particulares" on public.particulares
  for all to authenticated using (identity.is_admin()) with check (identity.is_admin());
```

1:1 enforced by two UNIQUE constraints (unit + DNI). Building/administration derive via `unit → building → administration` joins — no denormalized columns. No explicit grants (public-schema convention, mirrors `admin_all_orders`).

### D2: Order FKs — nullable, no CHECK change

| Option | Tradeoff | Decision |
|---|---|---|
| Enforce `particular_id IS NOT NULL` via CHECK for particular orders | Backfill migration for un-inferable units would violate it | Rejected |
| Nullable FK + RPC-level requirement | Backfill-safe; new orders always carry the id | **Chosen** |

```sql
alter table public.orders
  add column particular_id        uuid references public.particulares(id) on delete restrict,
  add column pickup_particular_id uuid references public.particulares(id) on delete restrict;
alter table sales.key_requests
  add column requester_particular_id uuid references public.particulares(id),
  add column pickup_particular_id    uuid references public.particulares(id);
```

`orders_client_consistency` stays untouched; `key_requests` enum untouched; both `key_requests` FKs nullable so existing administration flows are unaffected. Pickup person is **order-level** (`pickup_particular_id`), not per-item — one authorized retirer for all keys of the order, mirroring `key_requests.pickup_person_*`.

### D3: `create_order_with_items` — extended, no hidden row creation

`p_order` jsonb gains `particular_id`. Inside the RPC, `client_type='particular'` branch:
1. Resolve `v_particular_id := coalesce((p_order->>'particular_id')::uuid, (SELECT id FROM particulares WHERE dni = p_order->>'particular_dni'))` — DNI-match fallback for direct RPC callers.
2. If still null → `raise exception 'create_order: particular_id is required when client_type=particular' (P0001)`.
3. Snapshot autofill: if flat `particular_full_name` is empty, fill `particular_*` snapshot from the entity row (defensive; client also autofills).

The RPC does **not** create particulares rows — inline creation is the dialog's job (QuickUnitCreateDialog pattern: persist immediately, then submit order referencing the id). Deviation from the proposal note "DNI match or new row", with rationale: keeps the order RPC single-purpose and atomic on order+items only.

### D4: Pickup — trigger validates, RPC orchestrates + auto-completes

**Trigger** `rfid_keys_validate_pickup` gains an order branch (key_request branch intact, immutability triggers untouched):

```sql
-- replaces the old "key_request_item_id is null → raise" guard:
if new.key_request_item_id is null and new.order_item_id is null then
  raise exception 'cannot record pickup without a production origin (key %)', new.id;
end if;
if new.key_request_item_id is null then
  -- order path: authorized DNIs = buyer + explicit pickup person
  select p.dni, pp.dni into v_buyer_dni, v_pickup_dni
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    left join public.particulares p  on p.id  = o.particular_id
    left join public.particulares pp on pp.id = o.pickup_particular_id
   where oi.id = new.order_item_id;
  if v_buyer_dni is null and v_pickup_dni is null then
    raise exception 'order key pickup requires an authorized particular (key %)', new.id;
  end if;
  if new.picked_up_by_dni not in (v_buyer_dni, v_pickup_dni) then
    raise exception 'pickup DNI (%) does not match the order authorized DNI', new.picked_up_by_dni;
  end if;
end if;
```

`not in` with null operands yields no match — safe. Administration orders resolve both DNIs null → rejected (covers spec scenario).

**RPC** `record_order_key_pickup(p_key_id, p_picked_up_by_name, p_picked_up_by_surname, p_picked_up_by_dni, p_actor_staff_id default null) returns void` — `security definer`:

```sql
select oi.order_id into v_order_id
  from public.rfid_keys k join public.order_items oi on oi.id = k.order_item_id
 where k.id = p_key_id for update of k;               -- lock, reject non-order keys
-- lock order; reject unless client_type='particular' and status='ready_for_pickup'
update public.rfid_keys set picked_up_by_name=…, picked_up_by_surname=…,
       picked_up_by_dni=…, picked_up_at=now(), delivered_by_staff_id=p_actor_staff_id
 where id = p_key_id;                                  -- trigger validates DNI above
select count(*) filter (where oi.status <> 'cancelled') as total,
       count(*) filter (where oi.status <> 'cancelled' and k2.picked_up_at is not null) as done
  from public.order_items oi
  left join public.rfid_keys k2 on k2.id = oi.produced_key_id
 where oi.order_id = v_order_id and oi.item_type = 'key';
if v_total > 0 and v_done = v_total then
  update public.orders set status = 'completed' where id = v_order_id;   -- no recompute trigger
end if;
```

Order locks (`FOR UPDATE` on key + order) prevent concurrent-pickup races. `picked_up_at` immutability after set stays enforced by `rfid_keys_prevent_reassignment`.

### D5: Backfill — DNI dedupe, seed skip, unit via produced key

```sql
insert into public.particulares (unit_id, dni, full_name, phone, email)
select distinct on (o.particular_dni) rk.unit_id, o.particular_dni,
       o.particular_full_name, o.particular_phone, o.particular_email
  from public.orders o
  join public.order_items oi on oi.order_id = o.id and oi.item_type = 'key' and oi.produced_key_id is not null
  join public.rfid_keys rk on rk.id = oi.produced_key_id and rk.unit_id is not null
 where o.client_type = 'particular' and o.particular_dni is not null
   and o.particular_dni <> '20345678'                  -- seed: admin key-request pickup, not a particular
 order by o.particular_dni, o.created_at, rk.unit_id
on conflict do nothing;                                -- covers dni AND unit_id unique violations
update public.orders o set particular_id = p.id
  from public.particulares p
 where o.client_type = 'particular' and o.particular_id is null and o.particular_dni = p.dni;
```

First row per DNI wins (dedupe); unit-conflict rows silently skipped (stay unlinked); orders link by DNI match only.

### D6: Frontend composition

- `useParticulares({ search })` — PostgREST `.or('full_name.ilike.%t%,dni.ilike.%t%')` (useAdministrations pattern) + `useDebounce`; query key `particularesKey(search)`.
- `useMutateParticular().createParticular` — INSERT; invalidates `particularesKey()`.
- `ParticularSelector` — debounced combobox, empty state → opens `QuickParticularCreateDialog`; emits `onChange(particular)`.
- `QuickParticularCreateDialog` — Zod: full_name/dni required; unit via two-step building → unit selects (`useBuildings()`/`useUnits(buildingId)`); emits `onCreated(particularId)`; parent binds + snapshot autofill.
- `OrdenFormSheet` — `client_type='particular'` shows selector + create link (replaces flat inputs); on select `setValue` snapshot fields; payload adds `particular_id`.
- `PickupSection` (OrdenDetailPage) — shown only when `client_type='particular'` and non-terminal; checkbox "usar mismos datos de compra" → `useMutateOrden.setPickupPerson({ pickup_particular_id: particular_id })`; else selector/create + save.
- `OrderItemsTable` — new `canRegisterPickup` prop (particular order + `ready_for_pickup`); configured key rows without `picked_up_at` get "Registrar retiro" → `PickupKeyDialog` (prefilled from pickup person) → `useMutateKey.recordPickup` (rpc `record_order_key_pickup`; invalidates `ordenKey`, `ordensKey`, `keysKey`).
- `mapMutationError`: add P0001 `record_order_key_pickup`; 23505 `particulares` dni/unit dupes; 23514 pickup-DNI mismatch substring.

## Data Flow

```
(a) create order with particular
ParticularSelector/QuickParticularCreateDialog ──(persist row)──▶ public.particulares
OrdenFormSheet ──p_order{particular_id, particular_* snapshot}──▶ create_order_with_items (RPC)
      ──INSERT orders + order_items (atomic)──▶ [trigger set_updated_at] ──▶ invalidate ordensKey()

(b) register key pickup + auto-complete
PickupKeyDialog ──▶ record_order_key_pickup (RPC)
      ──UPDATE rfid_keys (picked_up_*, delivered_by)──▶ [rfid_keys_validate_pickup validates DNI]
      ──count non-cancelled key items vs picked_up──▶ UPDATE orders status='completed'
      ──▶ invalidate ordenKey() + ordensKey() + keysKey()
```

## File Changes

| File | Action | Description |
|---|---|---|
| `supabase/migrations/20260811000030_particulares.sql` | Create | Table, updated_at trigger, `admin_all_particulares` policy |
| `supabase/migrations/20260811000031_particulares_orders_fks.sql` | Create | `orders.particular_id`/`pickup_particular_id` + indexes; `key_requests` FKs; recreate `create_order_with_items` |
| `supabase/migrations/20260811000032_rfid_keys_pickup_order_path.sql` | Create | Trigger order branch; `record_order_key_pickup` |
| `supabase/migrations/20260811000033_backfill_particulares.sql` | Create | DNI-dedupe backfill + order linking |
| `packages/supabase/src/database.types.ts` | Modify | `npm run gen:types` (blocks hooks — first deliverable) |
| `apps/admin/src/lib/queryKeys.ts` | Modify | `particularesKey(search?)`, `particularKey(id)` |
| `apps/admin/src/hooks/useParticulares.ts` | Create | Server-side search hook |
| `apps/admin/src/hooks/useMutateParticular.ts` | Create | `createParticular` |
| `apps/admin/src/hooks/useMutateOrden.ts` | Modify | `CreateOrderInput.particular_id`; `setPickupPerson` mutation |
| `apps/admin/src/hooks/useMutateKey.ts` | Modify | `recordPickup` mutation |
| `apps/admin/src/hooks/useOrden.ts` | Modify | Embed `particular_id`, `pickup_particular_id`, `particulares(...)` embeds, `rfid_keys(picked_up_*)` per item |
| `apps/admin/src/hooks/mapMutationError.ts` | Modify | New SQLSTATE cases |
| `apps/admin/src/components/particulares/ParticularSelector.tsx` | Create | Debounced combobox + create link |
| `apps/admin/src/components/particulares/QuickParticularCreateDialog.tsx` | Create | Inline create, `onCreated` |
| `apps/admin/src/components/ordenes/PickupSection.tsx` | Create | Pickup-person selection + checkbox |
| `apps/admin/src/components/ordenes/PickupKeyDialog.tsx` | Create | Per-key pickup registration |
| `apps/admin/src/components/ordenes/OrdenFormSheet.tsx` | Modify | Selector replaces flat inputs, snapshot autofill |
| `apps/admin/src/components/ordenes/OrderItemsTable.tsx` | Modify | Pickup action on configured keys |
| `apps/admin/src/routes/ordenes/OrdenDetailPage.tsx` | Modify | Render PickupSection |

## Testing Strategy

| Layer | What | Approach |
|---|---|---|
| Unit (hooks) | `useParticulares` search args; `useMutateParticular` 23505 mapping; `useMutateOrden` payload includes `particular_id`; `recordPickup` rpc args | Vitest, mock `supabase` (existing pattern) |
| Unit | `mapMutationError` new branches | Vitest, error objects |
| Component | `ParticularSelector` debounce/empty-state/create; `QuickParticularCreateDialog` required fields + onCreated; `OrdenFormSheet` selector flow + snapshot autofill; `PickupSection` checkbox binding + hidden for administration; `OrderItemsTable` pickup action gating | Testing Library, mock hooks |
| DB (manual, no SQL runner in repo) | Trigger: unauthorized DNI → 23514; admin-order pickup → P0001; key_request path regression-free; RPC auto-complete on last pickup; backfill dedupe/seed-skip | `supabase db reset` + psql assertions during sdd-verify |

## Threat Matrix

N/A — no routing, shell, subprocess, VCS/PR automation, executable-file classification, or process-integration boundary. Entirely Supabase client/DB + React admin UI.

## Migration / Rollout

Apply `000030`→`000033` in order (note: highest existing is `20260811000029` — stock-inventory; the session brief's "today `20260810000025`" is stale). `gen:types` after reset. No feature flags — pickup UI is gated by `client_type`/`status`. Rollback: inverse drop order — backfill row delete (idempotent), drop RPC/trigger (restore prior body), drop FKs, drop table; legacy flat fields remain functional.

## Open Questions

- [ ] Confirm RPC does **not** create particulares rows (dialog persists first; DNI-match fallback only) — deviation from proposal "or new row".
- [ ] Confirm strict guard: pickup rejected unless order `status='ready_for_pickup'`.
- [ ] No `completed_at` timestamp added (status-only, per spec) — OK?

## Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Trigger extension breaks key_request pickup path | High | key_request branch untouched; RED regression test for both origins |
| Backfill wrong unit binding | Med | Best-effort (`on conflict do nothing`); unlinked orders keep NULL |
| FK+RLS visibility: `sales.key_requests` writes reference `particulares` | Low | `admin_all_particulares` covers admins; no client key_requests writes this cycle; service_role bypasses RLS |
| Snapshot/entity drift | Low | RPC autofills snapshot when flat fields empty |
| 800-line review budget | Med | One commit per migration + per component; chained commits if exceeded |
