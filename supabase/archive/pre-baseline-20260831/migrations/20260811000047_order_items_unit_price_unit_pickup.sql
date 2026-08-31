-- ============================================================
-- order_items: unit_price + unit_id + pickup_particular_id
-- ============================================================
-- Extends order_items with per-item pricing, optional pre-selected
-- unit, and the authorized retirer (particular) at line-item level.
-- Rationale: for a "key" item, the sidesheet captures price, edificio,
-- optional unidad, and the person authorized to pick that specific
-- key up (may differ per item — e.g. an administración places one
-- order but each owner picks up their own key).
--
-- Constraints:
--   * unit_price is required (> 0) for item_type='key'; other types leave it null.
--   * unit_id is always optional.
--   * pickup_particular_id is always optional; enforced by UI, not DB.

alter table public.order_items
  add column unit_price           numeric(12, 2),
  add column unit_id              uuid references public.units(id) on delete set null,
  add column pickup_particular_id uuid references public.particulares(id) on delete restrict;

alter table public.order_items
  add constraint order_items_unit_price_nonnegative
    check (unit_price is null or unit_price >= 0);

alter table public.order_items
  add constraint order_items_key_requires_price
    check (item_type <> 'key' or (unit_price is not null and unit_price > 0));

create index order_items_unit_id_idx
  on public.order_items (unit_id)
  where unit_id is not null;

create index order_items_pickup_particular_id_idx
  on public.order_items (pickup_particular_id)
  where pickup_particular_id is not null;

------------------------------------------------------------
-- RPC: create_order_with_items — accept new per-item fields
------------------------------------------------------------
-- Extends the RPC to persist unit_price, unit_id, and pickup_particular_id
-- per item. Preserves particular linkage (000033) and optional product_id
-- (000031). Validates that key items carry a positive unit_price.

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
  v_unit_price     numeric(12, 2);
begin
  v_client_type := p_order->>'client_type';

  -- Validate client_type consistency.
  if v_client_type = 'administration' then
    if (p_order->>'administration_id') is null then
      raise exception 'create_order: administration_id is required when client_type=administration'
        using errcode = 'P0001';
    end if;
  elsif v_client_type = 'particular' then
    v_particular_id := coalesce(
      (p_order->>'particular_id')::uuid,
      (select id from public.particulares where dni = p_order->>'particular_dni')
    );
    if v_particular_id is null then
      raise exception 'create_order: particular_id is required when client_type=particular'
        using errcode = 'P0001';
    end if;

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

  if p_items is null or array_length(p_items, 1) = 0 then
    raise exception 'create_order: at least one item is required'
      using errcode = 'P0001';
  end if;

  -- Validate each item.
  foreach v_item in array p_items loop
    if (v_item->>'item_type') = 'key' then
      if (v_item->>'building_id') is null then
        raise exception 'create_order: building_id is required for key items'
          using errcode = 'P0001';
      end if;
      v_unit_price := nullif(v_item->>'unit_price', '')::numeric(12, 2);
      if v_unit_price is null or v_unit_price <= 0 then
        raise exception 'create_order: unit_price > 0 is required for key items'
          using errcode = 'P0001';
      end if;
    end if;
  end loop;

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

  -- Insert items with the new fields.
  foreach v_item in array p_items loop
    insert into public.order_items (
      order_id,
      item_type,
      quantity,
      description,
      building_id,
      product_id,
      unit_price,
      unit_id,
      pickup_particular_id
    )
    values (
      v_order_id,
      v_item->>'item_type',
      (v_item->>'quantity')::int,
      v_item->>'description',
      (v_item->>'building_id')::uuid,
      (v_item->>'product_id')::uuid,
      nullif(v_item->>'unit_price', '')::numeric(12, 2),
      (v_item->>'unit_id')::uuid,
      (v_item->>'pickup_particular_id')::uuid
    );
  end loop;

  return v_order_id;
end;
$$;
