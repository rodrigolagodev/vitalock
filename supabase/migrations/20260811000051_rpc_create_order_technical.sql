-- ============================================================
-- create_order_with_items: order_type-aware
-- ============================================================
-- Replaces the previous body (migration 000047) so the RPC accepts and
-- persists the new orders.order_type discriminator. Validates:
--   * order_type ∈ {'keys','technical'}
--   * technical orders reject key items; keys orders reject non-key items
--   * technical orders skip the unit_price>0 requirement (it applies only
--     to keys)
--   * building_id remains required for key items
-- The rest of the behavior (particular linkage snapshot, product_id, etc.)
-- is preserved verbatim from the previous version.

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
  v_order_type     text;
  v_particular_id  uuid;
  v_item           jsonb;
  v_part_full_name text;
  v_part_dni       text;
  v_part_phone     text;
  v_part_email     text;
  v_unit_price     numeric(12, 2);
  v_item_type      text;
begin
  v_client_type := p_order->>'client_type';
  v_order_type  := coalesce(p_order->>'order_type', 'keys');

  if v_order_type not in ('keys', 'technical') then
    raise exception 'create_order: invalid order_type %', v_order_type
      using errcode = 'P0001';
  end if;

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

  -- Per-item validation, gated by order_type.
  foreach v_item in array p_items loop
    v_item_type := v_item->>'item_type';

    if v_order_type = 'keys' and v_item_type <> 'key' then
      raise exception 'create_order: order_type=keys only accepts item_type=key (got %)', v_item_type
        using errcode = 'P0001';
    end if;
    if v_order_type = 'technical'
       and v_item_type not in ('equipment', 'maintenance', 'installation') then
      raise exception 'create_order: order_type=technical only accepts equipment/maintenance/installation (got %)', v_item_type
        using errcode = 'P0001';
    end if;

    if v_item_type = 'key' then
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
    order_type,
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
    v_order_type,
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
