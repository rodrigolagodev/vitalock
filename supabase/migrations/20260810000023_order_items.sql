-- ============================================================
-- public.order_items — line items for each order
-- ============================================================
-- Each item belongs to an order and represents one unit of work:
--   key         — duplicate a physical RFID key for a building unit
--   equipment   — install/configure an access-control device
--   maintenance — general maintenance task
--   installation — new installation (non-equipment)
--
-- For key items: building_id is required (enforced by CHECK).
-- Status is managed by staff; auto-transition from the parent order
-- is driven by the trigger defined below.

------------------------------------------------------------
-- public.order_items table
------------------------------------------------------------
create table public.order_items (
  id              uuid        primary key default gen_random_uuid(),
  order_id        uuid        not null
                              references public.orders(id) on delete restrict,

  item_type       text        not null
                              check (item_type in ('key', 'equipment', 'maintenance', 'installation')),

  quantity        int         not null check (quantity > 0),
  description     text,

  -- Required for key items only (validated by the CHECK below).
  building_id     uuid        references public.buildings(id) on delete restrict,

  constraint order_items_key_requires_building check (
    item_type <> 'key' or building_id is not null
  ),

  status          text        not null default 'pending'
                              check (status in (
                                'pending',
                                'configured',
                                'in_progress',
                                'completed',
                                'cancelled'
                              )),

  -- Set by configure_key_order_item RPC when a key item is configured.
  produced_key_id uuid        references public.rfid_keys(id) on delete set null,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index order_items_order_id_idx   on public.order_items (order_id);
create index order_items_status_idx     on public.order_items (status);
create index order_items_building_id_idx on public.order_items (building_id)
  where building_id is not null;

create trigger order_items_set_updated_at
before update on public.order_items
for each row execute function public.set_updated_at();

------------------------------------------------------------
-- Auto-transition trigger
------------------------------------------------------------
create or replace function public.order_items_trigger_recompute()
returns trigger
language plpgsql
as $$
begin
  -- Only fire when the status column actually changes.
  if new.status is distinct from old.status then
    perform public.recompute_order_status(new.order_id);
  end if;
  return null;
end;
$$;

create trigger order_items_recompute_order_status
after update of status on public.order_items
for each row execute function public.order_items_trigger_recompute();

------------------------------------------------------------
-- RPC: create_order_with_items
------------------------------------------------------------
-- Atomically creates an order and its items in a single transaction.
-- Validates:
--   * client_type consistency (administration requires administration_id;
--     particular requires particular_full_name)
--   * each key item requires building_id
--   * at least one item must be provided
--
-- Returns the new order UUID.
create or replace function public.create_order_with_items(
  p_order  jsonb,
  p_items  jsonb[]
) returns uuid
language plpgsql
security definer
as $$
declare
  v_order_id     uuid;
  v_client_type  text;
  v_item         jsonb;
begin
  v_client_type := p_order->>'client_type';

  -- Validate client_type consistency.
  if v_client_type = 'administration' then
    if (p_order->>'administration_id') is null then
      raise exception 'create_order: administration_id is required when client_type=administration'
        using errcode = 'P0001';
    end if;
  elsif v_client_type = 'particular' then
    if (p_order->>'particular_full_name') is null
       or length(trim(p_order->>'particular_full_name')) = 0 then
      raise exception 'create_order: particular_full_name is required when client_type=particular'
        using errcode = 'P0001';
    end if;
  else
    raise exception 'create_order: invalid client_type %', v_client_type
      using errcode = 'P0001';
  end if;

  -- At least one item is required.
  if p_items is null or array_length(p_items, 1) = 0 then
    raise exception 'create_order: at least one item is required'
      using errcode = 'P0001';
  end if;

  -- Validate each item.
  foreach v_item in array p_items loop
    if (v_item->>'item_type') = 'key' and (v_item->>'building_id') is null then
      raise exception 'create_order: building_id is required for key items'
        using errcode = 'P0001';
    end if;
  end loop;

  -- Insert the order.
  insert into public.orders (
    client_type,
    administration_id,
    particular_full_name,
    particular_dni,
    particular_phone,
    particular_email,
    notes,
    status
  )
  values (
    v_client_type,
    (p_order->>'administration_id')::uuid,
    p_order->>'particular_full_name',
    p_order->>'particular_dni',
    p_order->>'particular_phone',
    p_order->>'particular_email',
    p_order->>'notes',
    coalesce(p_order->>'status', 'draft')
  )
  returning id into v_order_id;

  -- Insert items.
  foreach v_item in array p_items loop
    insert into public.order_items (
      order_id,
      item_type,
      quantity,
      description,
      building_id
    )
    values (
      v_order_id,
      v_item->>'item_type',
      (v_item->>'quantity')::int,
      v_item->>'description',
      (v_item->>'building_id')::uuid
    );
  end loop;

  return v_order_id;
end;
$$;

------------------------------------------------------------
-- RPC: configure_key_order_item
------------------------------------------------------------
-- Atomically configures a key order item:
--   1. INSERT public.rfid_keys (with order_item_id set)
--   2. UPDATE public.order_items SET produced_key_id, status='configured'
--   3. INSERT public.key_authorizations (bulk, one per equipment_id)
--
-- Returns the new rfid_key UUID.
create or replace function public.configure_key_order_item(
  p_order_item_id  uuid,
  p_rfid_code      text,
  p_unit_id        uuid,
  p_equipment_ids  uuid[]
) returns uuid
language plpgsql
security definer
as $$
declare
  v_key_id       uuid;
  v_item_status  text;
  v_eq_id        uuid;
begin
  -- Guard: item must be pending.
  select status into v_item_status
    from public.order_items
   where id = p_order_item_id;

  if v_item_status is null then
    raise exception 'configure_key: order item % not found', p_order_item_id
      using errcode = 'P0001';
  end if;

  if v_item_status <> 'pending' then
    raise exception 'configure_key: order item % is not pending (current status: %)',
      p_order_item_id, v_item_status
      using errcode = 'P0001';
  end if;

  -- Insert the RFID key (unit type, as configure flow always links to a unit).
  insert into public.rfid_keys (
    rfid_code,
    key_type,
    unit_id,
    order_item_id
  )
  values (
    p_rfid_code,
    'unit',
    p_unit_id,
    p_order_item_id
  )
  returning id into v_key_id;

  -- Link the key to the order item and mark as configured.
  update public.order_items
     set produced_key_id = v_key_id,
         status          = 'configured'
   where id = p_order_item_id;

  -- Insert key authorizations (optional; empty array is OK).
  if p_equipment_ids is not null then
    foreach v_eq_id in array p_equipment_ids loop
      insert into operations.key_authorizations (rfid_key_id, equipment_id)
      values (v_key_id, v_eq_id);
    end loop;
  end if;

  return v_key_id;
end;
$$;

------------------------------------------------------------
-- RLS
------------------------------------------------------------
alter table public.order_items enable row level security;

create policy "admin_all_order_items" on public.order_items
  for all to authenticated
  using (identity.is_admin())
  with check (identity.is_admin());

-- TODO: installer SELECT policy (deferred to installer cycle)
