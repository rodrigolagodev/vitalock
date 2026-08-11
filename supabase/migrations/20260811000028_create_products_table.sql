-- ============================================================
-- public.products — inventory product catalog
-- ============================================================
-- Tracks physical items that can be stocked: RFID keys and access-control
-- equipment. Derived counter columns (stock_total, stock_reservado) are
-- maintained by the stock_movements_maintain_counters trigger; do not
-- update them directly.
--
-- NOTE: This is public.products (inventory). sales.products is a separate
-- billing table and MUST be qualified by schema in every reference.

create table public.products (
  id             uuid          primary key default gen_random_uuid(),
  name           text          not null check (length(trim(name)) > 0),
  category       text          not null check (category in ('rfid_key', 'equipment')),
  cost_price     numeric(12,2) check (cost_price is null or cost_price >= 0),
  stock_total    int           not null default 0 check (stock_total >= 0),
  stock_reservado int          not null default 0 check (stock_reservado >= 0),
  created_at     timestamptz   not null default now(),
  updated_at     timestamptz   not null default now(),
  constraint products_reservado_le_total check (stock_reservado <= stock_total)
);

-- Composite UNIQUE: same name is allowed across different categories.
create unique index products_name_category_uidx on public.products (category, lower(trim(name)));

-- Index for category-filtered list queries.
create index products_category_idx on public.products (category);

-- Maintain updated_at via the shared trigger.
create trigger products_set_updated_at
before update on public.products
for each row execute function public.set_updated_at();

-- Enable RLS; policies defined in 20260811000038_stock_rls_policies.sql.
alter table public.products enable row level security;

-- Grants (RLS real policies arrive in the rls migration).
grant usage on schema public to authenticated, service_role;
grant all on public.products to authenticated, service_role;
