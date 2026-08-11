# Design: Stock / Inventory Domain

## Technical Approach

Introduce a `public.products` catalog and an append-only `public.stock_movements` ledger. Product counters (`stock_total`, `stock_reservado`) are DERIVED by a trigger on movement inserts, so the ledger is the source of truth. Order-item flow emits a `reserva` on insert; ticket resolution converts reservations into definitive egresos and chains `key_configuration -> key_installation`. Keys additionally use the existing `configure_key_order_item` RPC (extended, atomic with `rfid_keys` minting). Admin UI mirrors the Tareas pattern (PageHeader + filters + table + Radix Sheet).

## Architecture Decisions

### Decision: quantity typed as `int` (not `numeric`)

**Choice**: `stock_movements.quantity int not null` (signed). Products counters are `int`.
**Alternatives**: `numeric(12,3)` for fractional units.
**Rationale**: `order_items.quantity` is already `int` (migration `20260810000023:25`). RFID keys and access-control equipment are integer units by nature. `numeric` adds rounding risk with no domain benefit.

### Decision: stock decrement for keys inside `configure_key_order_item` RPC

**Choice**: keys — RPC path (atomic with `rfid_keys` INSERT). Equipment — ticket-resolution RPC.
**Alternatives**: single trigger on `support.tickets` for both flows.
**Rationale**: Keys already flow through `configure_key_order_item` which mints the physical row; putting stock there avoids a 4-level trigger chain. Equipment has no such RPC today, so we introduce `resolve_equipment_installation` RPC to keep INSERTs atomic instead of hiding side-effects in a resolution trigger.

### Decision: nullable `order_items.product_id` FK

**Choice**: `product_id uuid null references public.products(id) on delete restrict`.
**Alternatives**: NOT NULL with backfill; separate junction table; resolve `product_id` by `item_type` string mapping.
**Rationale**: Legacy rows and non-stock line types (`maintenance`, `installation`) must remain valid. Nullability lets the tarea trigger gate reservation on `product_id IS NOT NULL AND item_type IN ('key','equipment')` without breaking existing INSERTs.

### Decision: idempotency via partial UNIQUE index

**Choice**: `create unique index stock_movements_reserva_unique on public.stock_movements (order_item_id, type) where type = 'reserva' and order_item_id is not null;`
**Alternatives**: application-level SELECT-then-INSERT check.
**Rationale**: Trigger retries or duplicated INSERTs must never double-reserve. A partial UNIQUE fails loud and cheap.

### Decision: append-only ledger via BEFORE UPDATE/DELETE trigger

**Choice**: mirror `support.ticket_comments_prevent_modification` (raise on UPDATE/DELETE).
**Rationale**: Same audit shape already used in the codebase; keeps the ledger tamper-evident.

### Decision: derived counters via AFTER INSERT trigger

**Choice**: single `stock_movements_maintain_counters` trigger updates `products.stock_total` and `products.stock_reservado` based on `NEW.type` and `NEW.quantity`.
**Alternatives**: application maintains counters; materialised view.
**Rationale**: Application-level maintenance splits truth across two systems. Trigger-in-transaction guarantees counters match sum(quantity) at all times. `products.stock_total` and `products.stock_reservado` are read-only from the API.

### Decision: cross-schema references without FK

**Choice**: `stock_movements.ticket_id uuid` and `.staff_id uuid` — no FK constraint. `useStockMovements` resolves display names via batch lookups on `identity.staff` and `support.tickets`, mirroring `useTareas.ts:46`.
**Rationale**: PostgREST cannot embed cross-schema FKs (PGRST200). Consistent with existing pattern.

### Decision: single-PR delivery with `size:exception`

**Choice**: emit `Chained PRs recommended: No` and rely on `size:exception` because the DB, UI, and trigger integration are cohesive and share verification signals.
**Rationale**: Chaining PRs would leave the DB in an intermediate state (products exist, trigger doesn't route into them). Reviewer burden is high but a single reviewer pass is safer than four partial reviews.

## Data Flow

    order_items INSERT
       │
       ├── item_type IN ('maintenance','installation')  ──►  support.tickets INSERT (existing)
       │
       ├── item_type = 'key' + product_id NOT NULL      ──►  support.tickets INSERT (key_configuration)
       │                                                 ──►  stock_movements INSERT (reserva, -qty on reservado)
       │
       └── item_type = 'equipment' + product_id NOT NULL ──►  support.tickets INSERT (equipment_installation)
                                                         ──►  stock_movements INSERT (reserva)

    admin fills ConfigureKeyItemSheet
       │
       └── configure_key_order_item RPC (extended)
                ├── INSERT rfid_keys, INSERT key_authorizations (existing)
                ├── UPDATE order_items.status = 'configured' (existing)
                ├── INSERT stock_movements (egreso_grabacion, -qty)   ← NEW
                ├── INSERT stock_movements (liberacion_reserva, +qty) ← NEW (cancels reserva)
                └── UPDATE tickets set status='resolved' WHERE category='key_configuration' ← NEW

    tickets AFTER UPDATE (status -> resolved, category='key_configuration')
       │
       └── INSERT support.tickets (category='key_installation')   ← trigger

    installer resolves key_installation (out of scope for UI; ticket flow only)
       │
       └── (no stock side effect — key already decremented at configuration)

    admin calls resolve_equipment_installation RPC
       │
       ├── INSERT operations.equipment (serial)
       ├── INSERT stock_movements (egreso_instalacion, -qty)
       ├── INSERT stock_movements (liberacion_reserva, +qty)
       └── UPDATE tickets set status='resolved'

## File Changes

### New migrations (ordered)

| File | Purpose |
|------|---------|
| `20260811000028_create_products_table.sql` | `public.products` + indexes + `set_updated_at` trigger |
| `20260811000029_create_stock_movements_table.sql` | ledger + append-only trigger + partial UNIQUE index |
| `20260811000030_stock_counters_maintenance.sql` | AFTER INSERT trigger on `stock_movements` maintains `products.stock_total` and `stock_reservado` |
| `20260811000031_order_items_add_product_id.sql` | nullable FK `order_items.product_id -> public.products(id)` + index |
| `20260811000032_expand_tickets_category.sql` | `ALTER TABLE support.tickets` DROP + ADD CHECK to include `key_configuration`, `key_installation`, `equipment_installation` |
| `20260811000033_extend_order_items_create_tarea.sql` | rewrite trigger to route `key` and `equipment` to correct ticket category + emit `reserva` |
| `20260811000034_ticket_chain_and_stock_resolution.sql` | trigger on `support.tickets` AFTER UPDATE: create follow-up `key_installation` when `key_configuration` resolved |
| `20260811000035_extend_configure_key_order_item_rpc.sql` | replace RPC body: keep signature, add `egreso_grabacion` + `liberacion_reserva` + auto-resolve `key_configuration` ticket |
| `20260811000036_create_resolve_equipment_installation_rpc.sql` | NEW RPC: spawn `operations.equipment` + emit egreso + liberacion + resolve ticket |
| `20260811000037_stock_admin_rpcs.sql` | `create_stock_movement` + `create_product_with_initial_stock` for admin sidesheet |
| `20260811000038_stock_rls_policies.sql` | admin full access, installer SELECT (mirror `20260808000015`) |
| `supabase/seed.sql` MODIFY | append 1x rfid_key product + 1x equipment product with `compra` initial stock |

### Admin app — new files

| File | Purpose |
|------|---------|
| `apps/admin/src/routes/stock/StockPage.tsx` | list route |
| `apps/admin/src/routes/stock/StockDetailPage.tsx` | detail + movements timeline |
| `apps/admin/src/hooks/useProducts.ts` | list with filters (search, category) |
| `apps/admin/src/hooks/useProduct.ts` | single product by id |
| `apps/admin/src/hooks/useMutateProduct.ts` | create/update product |
| `apps/admin/src/hooks/useStockMovements.ts` | list movements for a product with cross-schema batch resolution |
| `apps/admin/src/hooks/useMutateStockMovement.ts` | wraps `create_stock_movement` and `create_product_with_initial_stock` RPCs |
| `apps/admin/src/components/stock/ProductsTable.tsx` | atomic table |
| `apps/admin/src/components/stock/CargarProductoSheet.tsx` | Radix Sheet with discriminated-union form (existing/new product) |
| `apps/admin/src/components/stock/StockMovementsTable.tsx` | movements timeline |
| `apps/admin/src/components/stock/ProductFormFields.tsx` | shared fields between create/edit |

### Admin app — modified files

| File | Change |
|------|--------|
| `apps/admin/src/main.tsx:41-48` | add `/stock` and `/stock/:productId` routes |
| `apps/admin/src/components/layout/Sidebar.tsx:12` | add `Inventario > Stock` NavSection |
| `apps/admin/src/lib/queryKeys.ts` | append `productsKey`, `productKey`, `stockMovementsKey` |
| `apps/admin/src/hooks/useTareas.ts:8` | widen `TareaRow['category']` union |
| `apps/admin/src/hooks/useMutateTarea.ts:8` | widen `CreateTareaInput.category` union |
| `apps/admin/src/routes/tareas/TareaFormSheet.tsx:97-102` | expand `CATEGORY_LABELS` map |

## Interfaces / Contracts

### Table DDL — `public.products`

```sql
create table public.products (
  id                uuid        primary key default gen_random_uuid(),
  name              text        not null check (length(trim(name)) > 0),
  category          text        not null check (category in ('rfid_key', 'equipment')),
  cost_price        numeric(12,2) check (cost_price is null or cost_price >= 0),
  stock_total       int         not null default 0 check (stock_total >= 0),
  stock_reservado   int         not null default 0 check (stock_reservado >= 0),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint products_reservado_le_total check (stock_reservado <= stock_total)
);
create index products_category_idx on public.products (category);
create trigger products_set_updated_at
  before update on public.products
  for each row execute function public.set_updated_at();
comment on table public.products is
  'Inventory catalog. Distinct from sales.products (billing catalog). Counters are derived by trigger on stock_movements.';
```

### Table DDL — `public.stock_movements`

```sql
create table public.stock_movements (
  id             uuid        primary key default gen_random_uuid(),
  product_id     uuid        not null references public.products(id) on delete restrict,
  type           text        not null check (type in (
                   'compra','devolucion','ajuste_manual',
                   'egreso_grabacion','egreso_instalacion',
                   'baja_defectuoso','baja_perdida',
                   'reserva','liberacion_reserva'
                 )),
  quantity       int         not null check (quantity <> 0),
  unit_cost      numeric(12,2) check (unit_cost is null or unit_cost >= 0),
  note           text,
  order_id       uuid        references public.orders(id)      on delete set null,
  order_item_id  uuid        references public.order_items(id) on delete set null,
  ticket_id      uuid,       -- cross-schema (support.tickets); no FK
  staff_id       uuid,       -- cross-schema (identity.staff);  no FK
  created_by     uuid,       -- cross-schema (identity.staff);  no FK
  created_at     timestamptz not null default now(),
  constraint stock_movements_ingreso_requires_cost check (
    type not in ('compra') or unit_cost is not null
  ),
  constraint stock_movements_sign_matches_type check (
    (type in ('compra','devolucion','liberacion_reserva')       and quantity > 0) or
    (type in ('egreso_grabacion','egreso_instalacion',
              'baja_defectuoso','baja_perdida','reserva')       and quantity < 0) or
    (type = 'ajuste_manual')  -- signed either way
  )
);
create index stock_movements_product_idx     on public.stock_movements (product_id);
create index stock_movements_order_item_idx  on public.stock_movements (order_item_id) where order_item_id is not null;
create index stock_movements_ticket_idx      on public.stock_movements (ticket_id)     where ticket_id     is not null;
create index stock_movements_created_at_idx  on public.stock_movements (created_at desc);
create unique index stock_movements_reserva_unique
  on public.stock_movements (order_item_id, type)
  where type = 'reserva' and order_item_id is not null;
```

### Trigger contracts

| Trigger | Table | Timing | Contract |
|---------|-------|--------|----------|
| `stock_movements_prevent_modification` | `public.stock_movements` | BEFORE UPDATE/DELETE | Raise `check_violation`. Mirrors `support.ticket_comments_prevent_modification`. |
| `stock_movements_maintain_counters` | `public.stock_movements` | AFTER INSERT | Updates `products.stock_total` and `stock_reservado` based on `NEW.type` and `NEW.quantity`. Idempotent per row: partial UNIQUE index prevents duplicate `reserva`. Failure modes: violates `products_reservado_le_total` CHECK if reservation exceeds available. |
| `order_items_create_tarea` (extended) | `public.order_items` | AFTER INSERT | Rewrite dispatch: `maintenance`/`installation` -> existing behavior; `key` -> create `key_configuration` ticket + `reserva` movement (only when `product_id IS NOT NULL`); `equipment` -> create `equipment_installation` ticket + `reserva`. **Does not short-circuit on particular orders for `key`/`equipment`** — only skips reservation when `product_id IS NULL`. Idempotency: partial UNIQUE on `stock_movements (order_item_id, type) WHERE type='reserva'`. |
| `tickets_resolution_chain` | `support.tickets` | AFTER UPDATE OF status | When `NEW.status='resolved'` AND `OLD.status <> 'resolved'` AND `category='key_configuration'` -> INSERT `key_installation` ticket in same building/administration. `category='equipment_installation'` resolutions are handled by `resolve_equipment_installation` RPC only; the trigger explicitly ignores them to avoid double-egreso. |

### RPC signatures

```sql
-- MODIFIED — signature preserved from 20260810000025 pattern
public.configure_key_order_item(
  p_order_item_id uuid,
  p_serial_code   text,
  p_unit_id       uuid,
  p_equipment_ids uuid[],
  p_note          text default null,
  p_actor_staff_id uuid default null
) returns uuid  -- new rfid_key_id
-- ADDS: stock_movements (egreso_grabacion) + (liberacion_reserva) +
--       UPDATE support.tickets set status='resolved' where order_item_id=... and category='key_configuration'
-- Idempotent: if order_item.status already 'configured', no-op.

-- NEW
public.resolve_equipment_installation(
  p_ticket_id  uuid,
  p_serial     text,
  p_unit_id    uuid,
  p_note       text default null,
  p_actor_staff_id uuid default null
) returns uuid  -- new equipment.id
-- INSERT operations.equipment (serial, unit_id, building_id from ticket)
-- INSERT stock_movements (egreso_instalacion, liberacion_reserva)
-- UPDATE support.tickets set status='resolved'
-- security definer, mirrors change_key_status audit style

-- NEW — for admin manual adjustments and 'Cargar producto' sidesheet
public.create_stock_movement(
  p_product_id uuid,
  p_type       text,
  p_quantity   int,
  p_unit_cost  numeric default null,
  p_note       text default null,
  p_actor_staff_id uuid default null
) returns uuid  -- new movement id
-- Only permits types NOT auto-emitted by triggers/RPCs:
-- ('compra','devolucion','ajuste_manual','baja_defectuoso','baja_perdida')

-- NEW — one-shot for 'Cargar producto' in new-product mode
public.create_product_with_initial_stock(
  p_name       text,
  p_category   text,
  p_cost_price numeric,
  p_quantity   int,
  p_note       text default null,
  p_actor_staff_id uuid default null
) returns uuid  -- new product id
-- INSERT products + INSERT stock_movements (compra) in same transaction.
```

### TypeScript types

```ts
export type ProductCategory = 'rfid_key' | 'equipment';
export type MovementType =
  | 'compra' | 'devolucion' | 'ajuste_manual'
  | 'egreso_grabacion' | 'egreso_instalacion'
  | 'baja_defectuoso' | 'baja_perdida'
  | 'reserva' | 'liberacion_reserva';

export interface ProductRow {
  id: string;
  name: string;
  category: ProductCategory;
  cost_price: number | null;
  stock_total: number;
  stock_reservado: number;
  stock_disponible: number; // derived client-side: stock_total - stock_reservado
  created_at: string;
  updated_at: string;
}

export interface StockMovementRow {
  id: string;
  product_id: string;
  type: MovementType;
  quantity: number;
  unit_cost: number | null;
  note: string | null;
  order_id: string | null;
  order_item_id: string | null;
  ticket_id: string | null;
  ticket_number: string | null;   // resolved by useStockMovements batch lookup
  staff_id: string | null;
  staff_name: string | null;      // resolved by useStockMovements batch lookup
  created_at: string;
}

// Widen (useTareas.ts:8, useMutateTarea.ts:8, TareaFormSheet.tsx:97):
type TareaCategory =
  | 'maintenance' | 'installation'
  | 'key_configuration' | 'key_installation' | 'equipment_installation';
```

### Query keys (append to `queryKeys.ts`)

```ts
export const productsKey = (category?: string, search?: string) =>
  ['admin', 'products', category ?? 'all', search ?? ''] as const;
export const productKey = (id: string) => ['admin', 'product', id] as const;
export const stockMovementsKey = (productId: string) =>
  ['admin', 'stock-movements', productId] as const;
```

### Form validation (Zod)

```ts
const CargarProductoExistingSchema = z.object({
  mode: z.literal('existing'),
  product_id: z.string().uuid(),
  quantity: z.number().int().positive(),
  unit_cost: z.number().positive(),
  note: z.string().max(500).optional(),
});
const CargarProductoNewSchema = z.object({
  mode: z.literal('new'),
  name: z.string().min(1).max(120),
  category: z.enum(['rfid_key', 'equipment']),
  quantity: z.number().int().positive(),
  unit_cost: z.number().positive(),
  note: z.string().max(500).optional(),
});
const CargarProductoSchema = z.discriminatedUnion('mode', [
  CargarProductoExistingSchema, CargarProductoNewSchema,
]);

const EditProductSchema = z.object({
  name: z.string().min(1).max(120),
  category: z.enum(['rfid_key', 'equipment']),
  cost_price: z.number().nonnegative().nullable(),
});
```

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| DB (pgTAP-style, manual SQL) | Counters reconcile with sum(quantity) after each movement type; partial UNIQUE prevents double `reserva`; append-only trigger raises on UPDATE/DELETE; particular orders emit reservation when `product_id` set | Seed products, INSERT movements of each type, `select sum(quantity) from stock_movements where product_id=...` = `stock_total` |
| DB | `configure_key_order_item` atomicity — rollback on failure leaves no partial state | Wrap in transaction, force failure via bad `p_unit_id`, assert no `stock_movements` or `rfid_keys` rows |
| DB | Ticket resolution chain: `key_configuration` resolved -> `key_installation` ticket appears | UPDATE ticket status, SELECT new ticket |
| Integration | `useStockMovements` cross-schema batch lookup returns ticket_number and staff_name correctly | Vitest + Supabase mock |
| E2E manual | `/stock` list + Cargar producto (both modes) + edit product + view movements timeline | admin app browser walkthrough |

## Threat Matrix

N/A — no routing, shell, subprocess, VCS/PR automation, executable-file classification, or process-integration boundary. All changes are SQL migrations plus in-repo React components.

## Migration / Rollout

Single deploy. Migrations are additive; nullable FK on `order_items.product_id` means existing rows keep functioning. On rollback (before production use): drop movements, then products; restore prior tickets CHECK; restore prior `configure_key_order_item` and `order_items_create_tarea` bodies; remove admin route. After production use: archive `stock_movements` table before dropping.

Delivery guard:

- Decision needed before apply: No
- Chained PRs recommended: No
- 400-line budget risk: High
- Justification for single-PR: DB, UI, and trigger integration are cohesive; splitting would leave the DB in an intermediate state where new products exist but the tarea trigger cannot route into them. Session cache is `single-pr` with `size:exception` flagged by `sdd-tasks`.

## Open Questions

- [x] `quantity` type — resolved: `int` (matches `order_items.quantity`).
- [x] Reservation gating on particular orders — resolved: gate on `product_id IS NOT NULL AND item_type IN ('key','equipment')`, never on order client_type.
- [x] Stock decrement locus for keys — resolved: RPC (atomic with `rfid_keys`).
- [x] Idempotency for `reserva` — resolved: partial UNIQUE index.
- [ ] Does `resolve_equipment_installation` need an authorizations bulk-insert like keys? Deferred to `sdd-tasks`: equipment installation does not require key_authorizations pre-registration; skip unless product intent changes.
- [ ] Should `stock.available < 0` block reservation vs allow (oversell warning only)? Design chooses BLOCK via `products_reservado_le_total` CHECK; `sdd-tasks` must ensure the trigger surfaces a friendly PostgREST error message.
