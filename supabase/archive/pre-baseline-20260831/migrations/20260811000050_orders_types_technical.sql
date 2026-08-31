-- ============================================================
-- Orders split: order_type = keys | technical + state wiring
-- ============================================================
-- (1) Adds orders.order_type discriminator so the "keys" and "technical"
-- flows can coexist under the same table with their own state machines.
-- (2) Expands orders.status with 'in_progress' and 'invoiced' — the new
-- states used by technical orders.
-- (3) Enforces consistency: keys orders only carry key items; technical
-- orders only carry equipment/maintenance/installation items.
-- (4) Ties technical order status to its generated tickets: when any
-- ticket enters in_progress, the order moves to in_progress; when every
-- non-cancelled ticket is resolved, the order moves to completed.
-- (5) Adds support.tickets.order_item_id so the sync trigger can walk
-- from ticket → order.

------------------------------------------------------------
-- 1. orders.order_type
------------------------------------------------------------
alter table public.orders
  add column order_type text not null default 'keys'
    check (order_type in ('keys', 'technical'));

create index orders_order_type_idx on public.orders (order_type);

------------------------------------------------------------
-- 2. Expand orders.status
------------------------------------------------------------
alter table public.orders drop constraint orders_status_check;
alter table public.orders add constraint orders_status_check
  check (status in (
    'draft',
    'in_preparation',
    'ready_for_pickup',
    'in_progress',
    'completed',
    'invoiced',
    'cancelled'
  ));

------------------------------------------------------------
-- 3. support.tickets.order_item_id (nullable FK)
------------------------------------------------------------
alter table support.tickets
  add column order_item_id uuid references public.order_items(id) on delete set null;

create index tickets_order_item_id_idx
  on support.tickets (order_item_id)
  where order_item_id is not null;

------------------------------------------------------------
-- 4. Validate item_type ↔ order_type consistency
------------------------------------------------------------
create or replace function public.order_items_validate_type()
returns trigger
language plpgsql
as $$
declare
  v_order_type text;
begin
  select order_type into v_order_type
    from public.orders where id = new.order_id;

  if v_order_type = 'keys' and new.item_type <> 'key' then
    raise exception
      'order_items: order type "keys" only allows item_type=key (got %)',
      new.item_type
      using errcode = 'check_violation';
  end if;

  if v_order_type = 'technical'
     and new.item_type not in ('equipment', 'maintenance', 'installation') then
    raise exception
      'order_items: order type "technical" only allows equipment/maintenance/installation (got %)',
      new.item_type
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger order_items_validate_type_trigger
before insert or update of item_type on public.order_items
for each row execute function public.order_items_validate_type();

------------------------------------------------------------
-- 5. Extend order_items_create_tarea to record order_item_id on the ticket
------------------------------------------------------------
-- Preserves all previous behavior (particulares fallback, reservation
-- movement, stock-line branching) — only adds order_item_id to the
-- support.tickets INSERT.

create or replace function public.order_items_create_tarea()
returns trigger
language plpgsql
security definer
set search_path = public, support
as $$
declare
  v_admin_id  uuid;
  v_ticket_id uuid;
  v_category  text;
begin
  if new.item_type in ('maintenance', 'installation') then
    select administration_id into v_admin_id
      from public.orders where id = new.order_id;

    if v_admin_id is null then
      -- Particular technical orders: derive administration from the building
      -- so the ticket can still be created.
      if new.building_id is not null then
        select administration_id into v_admin_id
          from public.buildings where id = new.building_id;
      end if;
    end if;

    if v_admin_id is null or new.building_id is null then
      return new;
    end if;

    insert into support.tickets (
      administration_id, building_id, category, description, status, notes,
      order_item_id
    ) values (
      v_admin_id,
      new.building_id,
      new.item_type,
      coalesce(nullif(trim(new.description), ''),
               'Item de orden (' || new.item_type || ')'),
      'open',
      'Generado automáticamente desde order_item ' || new.id::text,
      new.id
    );

    return new;
  end if;

  -- Stock-backed lines only: key / equipment.
  if new.item_type not in ('key', 'equipment') then
    return new;
  end if;

  if new.product_id is null then
    return new;  -- no inventory SKU -> no ticket, no reservation
  end if;

  v_category := case new.item_type
                  when 'key'       then 'key_configuration'
                  when 'equipment' then 'equipment_installation'
                end;

  select o.administration_id
    into v_admin_id
    from public.orders o
   where o.id = new.order_id;

  if v_admin_id is null then
    select administration_id into v_admin_id
      from public.buildings
     where id = new.building_id;
  end if;

  if new.building_id is not null and v_admin_id is not null then
    insert into support.tickets (
      administration_id, building_id, category, description, status, notes,
      order_item_id
    ) values (
      v_admin_id,
      new.building_id,
      v_category,
      coalesce(nullif(trim(new.description), ''),
               'Item de orden (' || new.item_type || ')'),
      'open',
      'Generado automáticamente desde order_item ' || new.id::text,
      new.id
    )
    returning id into v_ticket_id;
  end if;

  -- Reservation movement (negative quantity). Idempotent via partial UNIQUE.
  insert into public.stock_movements (
    product_id, type, quantity, note, order_id, order_item_id, ticket_id
  ) values (
    new.product_id,
    'reserva',
    -new.quantity,
    'Reserva de stock desde order_item ' || new.id::text,
    new.order_id,
    new.id,
    v_ticket_id
  )
  on conflict (order_item_id, type)
    where type = 'reserva' and order_item_id is not null
    do nothing;

  return new;
end;
$$;

------------------------------------------------------------
-- 6. Recompute order status — branches by order_type
------------------------------------------------------------
create or replace function public.recompute_order_status(p_order_id uuid)
returns void
language plpgsql
as $$
declare
  v_current_status  text;
  v_order_type      text;
  v_total_key_items int;
  v_configured      int;
  v_total_tickets   int;
  v_open            int;
  v_in_progress     int;
  v_resolved        int;
begin
  select status, order_type
    into v_current_status, v_order_type
    from public.orders
   where id = p_order_id
   for update;

  -- Terminal states never auto-transition again.
  if v_current_status in ('completed', 'invoiced', 'cancelled') then
    return;
  end if;

  if v_order_type = 'keys' then
    -- Existing keys flow: only transitions from in_preparation.
    if v_current_status <> 'in_preparation' then
      return;
    end if;

    select
      count(*) filter (where item_type = 'key' and status <> 'cancelled'),
      count(*) filter (where item_type = 'key' and status = 'configured')
    into v_total_key_items, v_configured
    from public.order_items
    where order_id = p_order_id;

    if v_total_key_items = 0 then
      return;  -- all key items cancelled → no transition
    end if;

    if v_configured = v_total_key_items then
      update public.orders
         set status = 'ready_for_pickup'
       where id = p_order_id;
    end if;
    return;
  end if;

  -- Technical flow: derive from generated tickets.
  select
    count(*) filter (where status <> 'cancelled'),
    count(*) filter (where status = 'open'),
    count(*) filter (where status = 'in_progress'),
    count(*) filter (where status = 'resolved')
  into v_total_tickets, v_open, v_in_progress, v_resolved
  from support.tickets
  where order_item_id in (
    select id from public.order_items where order_id = p_order_id
  );

  if v_total_tickets = 0 then
    return;  -- nothing to derive from
  end if;

  if v_resolved = v_total_tickets then
    update public.orders set status = 'completed' where id = p_order_id;
  elsif v_in_progress > 0 or v_resolved > 0 then
    -- Any active work: keep the order in in_progress. Do not go backwards
    -- from later states already reached.
    if v_current_status in ('draft', 'in_preparation') then
      update public.orders set status = 'in_progress' where id = p_order_id;
    end if;
  end if;
end;
$$;

------------------------------------------------------------
-- 7. Ticket → order status sync trigger
------------------------------------------------------------
create or replace function public.tickets_sync_order_status()
returns trigger
language plpgsql
security definer
as $$
declare
  v_order_id uuid;
begin
  if new.order_item_id is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then
    return new;
  end if;

  select order_id into v_order_id
    from public.order_items
   where id = new.order_item_id;

  if v_order_id is not null then
    perform public.recompute_order_status(v_order_id);
  end if;
  return new;
end;
$$;

create trigger tickets_sync_order_status_trigger
after insert or update of status on support.tickets
for each row execute function public.tickets_sync_order_status();
