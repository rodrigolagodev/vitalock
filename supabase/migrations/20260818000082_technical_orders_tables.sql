-- ============================================================
-- Migration: technical_orders and technical_order_items tables
-- ============================================================
-- Creates the technical-order bounded context tables.
-- technical_orders      — the order header.
-- technical_order_items — one row per work item; carries the intent
--   snapshot (intended_equipment_id, intended_assignee_staff_id) that
--   seeds the support.tickets at confirm time.
--
-- Status domain (6 states — technical-specific; no ready_for_pickup):
--   draft → confirmed → in_progress → completed → invoiced
--   any non-terminal → cancelled
--
-- Item type domain: equipment | maintenance | installation | equipment_replacement
-- Item status domain: pending → in_progress → completed | cancelled
--
-- Key design decisions:
--   * intended_equipment_id / intended_assignee_staff_id are nullable at
--     draft, required at confirm (enforced by the RPC, not here).
--   * Intent columns are immutable once the parent order leaves draft
--     (enforced by trigger in 20260818000085).
--   * intended_assignee_staff_id FK targets identity.staff(id) per
--     Correction 1 (staff lives in the identity schema).
--
-- Depends on: 20260818000080_orders_sequences.sql

-- -------------------------------------------------------
-- public.technical_orders
-- -------------------------------------------------------
create table public.technical_orders (
  id                    uuid        primary key default gen_random_uuid(),
  order_number          text        not null unique default public.gen_technical_order_number(),

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

  -- Client-consistency rule.
  constraint technical_orders_client_consistency check (
    (client_type = 'administration'
      and administration_id is not null
      and particular_full_name is null)
    or
    (client_type = 'particular'
      and administration_id is null
      and particular_full_name is not null)
  ),

  -- Status domain: 6 states (no ready_for_pickup — technical orders
  -- do NOT use the key-pickup flow).
  status                text        not null default 'draft'
                                    check (status in (
                                      'draft',
                                      'confirmed',
                                      'in_progress',
                                      'completed',
                                      'invoiced',
                                      'cancelled'
                                    )),

  notes                 text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index technical_orders_status_idx
  on public.technical_orders (status);
create index technical_orders_created_at_idx
  on public.technical_orders (created_at desc);
create index technical_orders_order_number_idx
  on public.technical_orders (order_number);
create index technical_orders_administration_id_idx
  on public.technical_orders (administration_id)
  where administration_id is not null;
create index technical_orders_particular_id_idx
  on public.technical_orders (particular_id)
  where particular_id is not null;

create trigger technical_orders_set_updated_at
before update on public.technical_orders
for each row execute function public.set_updated_at();

-- -------------------------------------------------------
-- public.technical_order_items
-- -------------------------------------------------------
create table public.technical_order_items (
  id                          uuid        primary key default gen_random_uuid(),
  order_id                    uuid        not null
                                          references public.technical_orders(id)
                                          on delete restrict,

  -- Work item type.
  item_type                   text        not null
                                          check (item_type in (
                                            'equipment',
                                            'maintenance',
                                            'installation',
                                            'equipment_replacement'
                                          )),

  quantity                    int         not null default 1
                                          check (quantity > 0),
  description                 text,

  -- Pricing (required at create time, matches migration 000054 rule).
  unit_price                  numeric(12,2) not null
                                          check (unit_price > 0),

  -- Inventory SKU — required for 'equipment' items, optional for others.
  product_id                  uuid        references public.products(id) on delete restrict,

  -- Intent snapshot: the equipment and staff intended at order creation.
  -- Nullable at draft; required at confirm (validated by RPC, not by CHECK here).
  -- immutability enforced by trigger in 20260818000085 once parent is confirmed.
  intended_equipment_id       uuid        references operations.equipment(id) on delete set null,

  -- FK targets identity.staff(id) per Correction 1 (staff is in identity schema).
  intended_assignee_staff_id  uuid        references identity.staff(id) on delete set null,

  -- Item lifecycle.
  status                      text        not null default 'pending'
                                          check (status in (
                                            'pending',
                                            'in_progress',
                                            'completed',
                                            'cancelled'
                                          )),

  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

create index technical_order_items_order_id_idx
  on public.technical_order_items (order_id);
create index technical_order_items_status_idx
  on public.technical_order_items (status);
create index technical_order_items_intended_equipment_id_idx
  on public.technical_order_items (intended_equipment_id)
  where intended_equipment_id is not null;
create index technical_order_items_intended_assignee_staff_id_idx
  on public.technical_order_items (intended_assignee_staff_id)
  where intended_assignee_staff_id is not null;
create index technical_order_items_product_id_idx
  on public.technical_order_items (product_id)
  where product_id is not null;

create trigger technical_order_items_set_updated_at
before update on public.technical_order_items
for each row execute function public.set_updated_at();

-- -------------------------------------------------------
-- Row Level Security
-- -------------------------------------------------------
alter table public.technical_orders      enable row level security;
alter table public.technical_order_items enable row level security;

create policy admin_all_technical_orders on public.technical_orders
  for all to authenticated
  using (identity.is_admin())
  with check (identity.is_admin());

create policy admin_all_technical_order_items on public.technical_order_items
  for all to authenticated
  using (identity.is_admin())
  with check (identity.is_admin());

-- Grant access.
grant all on public.technical_orders      to authenticated, service_role;
grant all on public.technical_order_items to authenticated, service_role;
grant usage, select on sequence public.technical_order_number_seq to authenticated, service_role;
