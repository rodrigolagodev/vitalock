-- ============================================================
-- Migration: key_orders and key_order_items tables
-- ============================================================
-- Creates the key-order bounded context tables.
-- key_orders  — the order header (client, status, number).
-- key_order_items — exploded line items; each represents ONE physical key
--   (quantity explosion happened at create time per design §2.1).
--
-- Status domain (7 states — keys-specific):
--   draft → confirmed → in_progress → ready_for_pickup → completed → invoiced
--   any non-terminal → cancelled
--
-- Item status domain (3 states — simplified per Correction 2):
--   pending → configured | cancelled
--
-- Depends on: 20260818000080_orders_sequences.sql

-- -------------------------------------------------------
-- public.key_orders
-- -------------------------------------------------------
create table public.key_orders (
  id                    uuid        primary key default gen_random_uuid(),
  order_number          text        not null unique default public.gen_key_order_number(),

  -- Client identification: exactly one mode.
  client_type           text        not null
                                    check (client_type in ('administration', 'particular')),
  administration_id     uuid        references public.administrations(id) on delete restrict,
  particular_id         uuid        references public.particulares(id) on delete restrict,

  -- Snapshot of the particular at order creation time (denormalized for immutability).
  particular_full_name  text,
  particular_dni        text,
  particular_phone      text,
  particular_email      text,

  -- Client-consistency rule: administration mode requires administration_id;
  -- particular mode requires particular_full_name (other snapshot fields optional).
  constraint key_orders_client_consistency check (
    (client_type = 'administration'
      and administration_id is not null
      and particular_full_name is null)
    or
    (client_type = 'particular'
      and administration_id is null
      and particular_full_name is not null)
  ),

  -- Order-level pickup particular (optional; per-item pickup overrides this).
  pickup_particular_id  uuid        references public.particulares(id) on delete set null,

  status                text        not null default 'draft'
                                    check (status in (
                                      'draft',
                                      'confirmed',
                                      'in_progress',
                                      'ready_for_pickup',
                                      'completed',
                                      'invoiced',
                                      'cancelled'
                                    )),

  notes                 text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index key_orders_status_idx         on public.key_orders (status);
create index key_orders_created_at_idx     on public.key_orders (created_at desc);
create index key_orders_order_number_idx   on public.key_orders (order_number);
create index key_orders_administration_id_idx
  on public.key_orders (administration_id)
  where administration_id is not null;
create index key_orders_particular_id_idx
  on public.key_orders (particular_id)
  where particular_id is not null;

create trigger key_orders_set_updated_at
before update on public.key_orders
for each row execute function public.set_updated_at();

-- -------------------------------------------------------
-- public.key_order_items
-- -------------------------------------------------------
-- Each row represents exactly one physical key unit (quantity already
-- exploded at create time). Building is required (keys are building-scoped).
create table public.key_order_items (
  id                    uuid        primary key default gen_random_uuid(),
  order_id              uuid        not null
                                    references public.key_orders(id)
                                    on delete restrict,

  -- Item type: fixed to 'key' — enforced by CHECK so there is no ambiguity.
  item_type             text        not null default 'key'
                                    check (item_type = 'key'),

  quantity              int         not null default 1
                                    check (quantity > 0),
  description           text,

  -- Location context: building required, unit optional.
  building_id           uuid        not null
                                    references public.buildings(id)
                                    on delete restrict,
  unit_id               uuid        references public.units(id) on delete set null,

  -- Pricing: required at create time (design §2.1).
  unit_price            numeric(12,2) not null
                                    check (unit_price > 0),

  -- Inventory SKU for stock reservation.
  product_id            uuid        references public.products(id) on delete restrict,

  -- Per-item pickup particular (overrides order-level pickup_particular_id).
  pickup_particular_id  uuid        references public.particulares(id) on delete set null,

  -- Produced RFID key after configuration.
  produced_key_id       uuid        references public.rfid_keys(id) on delete set null,

  -- Item lifecycle (simplified 3-state domain per Correction 2).
  status                text        not null default 'pending'
                                    check (status in ('pending', 'configured', 'cancelled')),

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index key_order_items_order_id_idx
  on public.key_order_items (order_id);
create index key_order_items_building_id_idx
  on public.key_order_items (building_id);
create index key_order_items_status_idx
  on public.key_order_items (status);
create index key_order_items_product_id_idx
  on public.key_order_items (product_id)
  where product_id is not null;

create trigger key_order_items_set_updated_at
before update on public.key_order_items
for each row execute function public.set_updated_at();

-- -------------------------------------------------------
-- Row Level Security
-- -------------------------------------------------------
alter table public.key_orders      enable row level security;
alter table public.key_order_items enable row level security;

create policy admin_all_key_orders on public.key_orders
  for all to authenticated
  using (identity.is_admin())
  with check (identity.is_admin());

create policy admin_all_key_order_items on public.key_order_items
  for all to authenticated
  using (identity.is_admin())
  with check (identity.is_admin());

-- Grant access.
grant all on public.key_orders      to authenticated, service_role;
grant all on public.key_order_items to authenticated, service_role;
grant usage, select on sequence public.key_order_number_seq to authenticated, service_role;
