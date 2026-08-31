-- ============================================================
-- particulares ← orders / key_requests FK wiring
-- ============================================================
-- Orders: nullable FKs (backfill-safe; new particular orders always carry
-- particular_id, enforced by create_order_with_items). Pickup person is
-- order-level (pickup_particular_id) — one authorized retirer for all keys
-- of the order, mirroring key_requests.pickup_person_*.
-- key_requests: nullable FKs only — existing administration flows are
-- unaffected; the requester_type enum stays 'individual'.

alter table public.orders
  add column particular_id        uuid references public.particulares(id) on delete restrict,
  add column pickup_particular_id uuid references public.particulares(id) on delete restrict;

create index orders_particular_id_idx on public.orders (particular_id)
  where particular_id is not null;
create index orders_pickup_particular_id_idx on public.orders (pickup_particular_id)
  where pickup_particular_id is not null;

alter table sales.key_requests
  add column requester_particular_id uuid references public.particulares(id),
  add column pickup_particular_id    uuid references public.particulares(id);

create index key_requests_requester_particular_id_idx on sales.key_requests (requester_particular_id)
  where requester_particular_id is not null;
create index key_requests_pickup_particular_id_idx on sales.key_requests (pickup_particular_id)
  where pickup_particular_id is not null;

------------------------------------------------------------
-- RPC: create_order_with_items — particular entity linkage
------------------------------------------------------------
-- Extends the RPC with the client_type='particular' branch:
--   1. Resolve v_particular_id := coalesce(p_order->>'particular_id',
--      particulares.id where dni = p_order->>'particular_dni') — DNI-match
--      fallback for direct RPC callers.
--   2. Still null → raise P0001. The RPC NEVER creates particulares rows —
--      inline creation is the UI dialog's job (QuickUnitCreateDialog
--      pattern: persist first, then submit the order referencing the id).
--   3. Snapshot autofill: when flat particular_* fields are empty, fill the
--      snapshot from the entity row (defensive; client also autofills).
--      Guarantees orders_client_consistency (particular_full_name non-null).
--
-- NOTE: preserves the optional product_id per item added by the stock
-- inventory change (20260811000031) — this version replaces that body and
-- must keep its behavior.

create or replace function public.create_order_with_items(
  p_order  jsonb,
  p_items  jsonb[]
) returns uuid
language plpgsql
security definer
as $$
declare
  v_order_id       uuid;
  v_client_type    text;
  v_particular_id  uuid;
  v_item           jsonb;
  v_part_full_name text;
  v_part_dni       text;
  v_part_phone     text;
  v_part_email     text;
begin
  v_client_type := p_order->>'client_type';

  -- Validate client_type consistency.
  if v_client_type = 'administration' then
    if (p_order->>'administration_id') is null then
      raise exception 'create_order: administration_id is required when client_type=administration'
        using errcode = 'P0001';
    end if;
  elsif v_client_type = 'particular' then
    -- Resolve the entity: explicit particular_id, or DNI-match fallback.
    v_particular_id := coalesce(
      (p_order->>'particular_id')::uuid,
      (select id from public.particulares where dni = p_order->>'particular_dni')
    );
    if v_particular_id is null then
      raise exception 'create_order: particular_id is required when client_type=particular'
        using errcode = 'P0001';
    end if;

    -- Snapshot autofill from the entity row (defensive; client autofills too).
    select full_name, dni, phone, email
      into v_part_full_name, v_part_dni, v_part_phone, v_part_email
      from public.particulares
     where id = v_particular_id;

    if v_part_full_name is null then
      raise exception 'create_order: particular % not found', v_particular_id
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

  -- Insert the order. Flat snapshot: client value wins, entity fills the gap.
  insert into public.orders (
    client_type,
    administration_id,
    particular_id,
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
    v_particular_id,
    coalesce(nullif(trim(p_order->>'particular_full_name'), ''), v_part_full_name),
    coalesce(nullif(trim(p_order->>'particular_dni'), ''), v_part_dni),
    coalesce(nullif(trim(p_order->>'particular_phone'), ''), v_part_phone),
    coalesce(nullif(trim(p_order->>'particular_email'), ''), v_part_email),
    p_order->>'notes',
    coalesce(p_order->>'status', 'draft')
  )
  returning id into v_order_id;

  -- Insert items (optional product_id preserved from stock inventory).
  foreach v_item in array p_items loop
    insert into public.order_items (
      order_id,
      item_type,
      quantity,
      description,
      building_id,
      product_id
    )
    values (
      v_order_id,
      v_item->>'item_type',
      (v_item->>'quantity')::int,
      v_item->>'description',
      (v_item->>'building_id')::uuid,
      (v_item->>'product_id')::uuid
    );
  end loop;

  return v_order_id;
end;
$$;
