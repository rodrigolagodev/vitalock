-- ============================================================
-- public.orders — Vitalock order management
-- ============================================================
-- An "orden" is a production work order created by Vitalock staff.
-- It groups one or more order items (key duplication, equipment
-- installation, maintenance, etc.) under a single trackable unit.
--
-- Status state machine (manual transitions except ready_for_pickup):
--   draft → in_preparation (manual: "Iniciar preparación")
--   in_preparation → ready_for_pickup (AUTO via trigger when all
--                    non-cancelled key items are configured)
--   ready_for_pickup → completed (manual: "Retirada completada" — future)
--   any non-terminal → cancelled (manual: "Cancelar orden")
--
-- Client can be an existing administration (FK) or an ad-hoc particular
-- (free-text fields). A DB CHECK enforces consistency.

------------------------------------------------------------
-- Sequence + helper for the human-friendly order number
------------------------------------------------------------
create sequence public.order_number_seq;

create or replace function public.gen_order_number()
returns text
language plpgsql
as $$
begin
  return format('ORD-%s-%s',
                extract(year from now())::int,
                lpad(nextval('public.order_number_seq')::text, 6, '0'));
end;
$$;

------------------------------------------------------------
-- public.orders — the order header
------------------------------------------------------------
create table public.orders (
  id                    uuid        primary key default gen_random_uuid(),
  order_number          text        not null unique default public.gen_order_number(),

  -- Client identification: mutually exclusive modes.
  client_type           text        not null
                                    check (client_type in ('administration', 'particular')),
  administration_id     uuid        references public.administrations(id) on delete restrict,

  -- Particular client fields (required when client_type='particular').
  particular_full_name  text,
  particular_dni        text,
  particular_phone      text,
  particular_email      text,

  -- Business-logic CHECK: ensures FK and free-text fields are consistent
  -- with the chosen client_type.
  constraint orders_client_consistency check (
    (client_type = 'administration' and administration_id is not null and particular_full_name is null)
    or
    (client_type = 'particular' and administration_id is null and particular_full_name is not null)
  ),

  status                text        not null default 'draft'
                                    check (status in (
                                      'draft',
                                      'in_preparation',
                                      'ready_for_pickup',
                                      'completed',
                                      'cancelled'
                                    )),

  notes                 text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index orders_status_idx            on public.orders (status);
create index orders_created_at_idx        on public.orders (created_at desc);
create index orders_administration_id_idx on public.orders (administration_id)
  where administration_id is not null;
create index orders_order_number_idx      on public.orders (order_number);

create trigger orders_set_updated_at
before update on public.orders
for each row execute function public.set_updated_at();

------------------------------------------------------------
-- recompute_order_status — auto-transition to ready_for_pickup
------------------------------------------------------------
-- Called by the order_items_recompute_order_status trigger (defined in
-- the order_items migration, 20260810000023, because the trigger needs
-- public.order_items to exist first).
--
-- Rules:
--   1. Only acts when order.status = 'in_preparation'.
--   2. Only counts key items (item_type='key') that are not cancelled.
--   3. If v_total_key_items = 0 (all key items cancelled), no transition.
--   4. If every non-cancelled key item is configured, transition to
--      'ready_for_pickup'.
create or replace function public.recompute_order_status(p_order_id uuid)
returns void
language plpgsql
as $$
declare
  v_current_status  text;
  v_total_key_items int;
  v_configured      int;
begin
  select status into v_current_status
    from public.orders
   where id = p_order_id
   for update;

  -- Only transition from in_preparation; other states are manual.
  if v_current_status <> 'in_preparation' then
    return;
  end if;

  -- Count only non-cancelled KEY items.
  select
    count(*) filter (where item_type = 'key' and status <> 'cancelled'),
    count(*) filter (where item_type = 'key' and status = 'configured')
  into v_total_key_items, v_configured
  from public.order_items
  where order_id = p_order_id;

  -- Edge case: all key items cancelled → do NOT auto-transition.
  if v_total_key_items = 0 then
    return;
  end if;

  if v_configured = v_total_key_items then
    update public.orders
       set status = 'ready_for_pickup'
     where id = p_order_id;
  end if;
end;
$$;

------------------------------------------------------------
-- RLS
------------------------------------------------------------
alter table public.orders enable row level security;

create policy "admin_all_orders" on public.orders
  for all to authenticated
  using (identity.is_admin())
  with check (identity.is_admin());

-- TODO: installer SELECT policy (deferred to installer cycle)
