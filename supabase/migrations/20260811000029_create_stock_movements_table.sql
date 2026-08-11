-- ============================================================
-- public.stock_movements — append-only inventory ledger
-- ============================================================
-- Every stock change is represented as a row here; the counters on
-- public.products are derived via trigger. No row may ever be updated
-- or deleted (enforced by stock_movements_prevent_modification).
--
-- Movement taxonomy:
--   ingresos  : compra, devolucion, ajuste_manual(+)   → quantity > 0
--   egresos   : egreso_grabacion, egreso_instalacion,
--               baja_defectuoso, baja_perdida           → quantity < 0
--   reservas  : reserva                                 → quantity < 0
--               liberacion_reserva                      → quantity > 0
--   ajuste_manual may carry any sign.
--
-- Cross-schema FKs (identity.staff, support.tickets) are intentionally
-- omitted; PostgREST cannot embed across schemas and FK constraints would
-- couple schemas unnecessarily. Names resolved via batch lookup in the
-- TypeScript layer (see useStockMovements.ts).

create table public.stock_movements (
  id             uuid          primary key default gen_random_uuid(),
  product_id     uuid          not null references public.products(id) on delete restrict,
  type           text          not null check (type in (
                                 'compra',
                                 'devolucion',
                                 'ajuste_manual',
                                 'egreso_grabacion',
                                 'egreso_instalacion',
                                 'baja_defectuoso',
                                 'baja_perdida',
                                 'reserva',
                                 'liberacion_reserva'
                               )),
  quantity       int           not null check (quantity <> 0),
  unit_cost      numeric(12,2) check (unit_cost is null or unit_cost >= 0),
  note           text,
  order_id       uuid          references public.orders(id)      on delete set null,
  order_item_id  uuid          references public.order_items(id) on delete set null,
  ticket_id      uuid,          -- cross-schema ref to support.tickets; no FK
  staff_id       uuid,          -- cross-schema ref to identity.staff; no FK
  created_by     uuid,          -- staff who caused the movement
  created_at     timestamptz   not null default now(),

  -- compra (purchase) movements must record the per-unit cost.
  constraint stock_movements_ingreso_requires_cost check (
    type <> 'compra' or unit_cost is not null
  ),

  -- Quantity sign must match the movement type.
  -- ajuste_manual is exempt (can be positive or negative).
  constraint stock_movements_sign_matches_type check (
    (type in ('compra', 'devolucion', 'liberacion_reserva') and quantity > 0)
    or (type in ('egreso_grabacion', 'egreso_instalacion', 'baja_defectuoso', 'baja_perdida', 'reserva') and quantity < 0)
    or (type = 'ajuste_manual')
  )
);

-- Supporting indexes.
create index stock_movements_product_idx
  on public.stock_movements (product_id);

create index stock_movements_order_item_idx
  on public.stock_movements (order_item_id)
  where order_item_id is not null;

create index stock_movements_ticket_idx
  on public.stock_movements (ticket_id)
  where ticket_id is not null;

-- Idempotency guard: exactly one reserva per order_item.
-- If the trigger fires twice (e.g., retried request), the second insert
-- hits this index and raises a unique-violation that the trigger caller
-- absorbs silently.
create unique index stock_movements_reserva_unique
  on public.stock_movements (order_item_id, type)
  where type = 'reserva' and order_item_id is not null;

-- Enable RLS; policies defined in 20260811000038_stock_rls_policies.sql.
alter table public.stock_movements enable row level security;

grant all on public.stock_movements to authenticated, service_role;
