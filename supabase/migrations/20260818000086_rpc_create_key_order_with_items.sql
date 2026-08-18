-- ============================================================
-- Migration: create_key_order_with_items + confirm_key_order RPCs
-- ============================================================
-- Key order RPC family (create + confirm bundled).
--
-- create_key_order_with_items(p_order, p_items[], p_confirm_immediately)
--   * Validates client consistency.
--   * Validates every item: item_type='key', building_id NOT NULL,
--     unit_price > 0 (W-001 correction: required for all items at creation).
--   * Explodes quantity > 1 into N rows of quantity=1 (mirrors 000056 behavior).
--   * Optionally calls confirm_key_order inline (default true).
--
-- confirm_key_order(p_order_id)
--   * Row-locks the order; validates status='draft'.
--   * Validates at least one item exists.
--   * Creates stock_movements reserva per item (order_kind='key').
--   * Updates status to 'confirmed'.
--   * Key orders do NOT create tickets (technical-only concern).
--
-- Depends on: 20260818000081 (key_orders, key_order_items)
--             20260818000083 (stock_movements polymorphic)
--             20260818000085 (trigger stubs)
-- ============================================================

-- -------------------------------------------------------
-- create_key_order_with_items
-- -------------------------------------------------------
create or replace function public.create_key_order_with_items(
  p_order             jsonb,
  p_items             jsonb[],
  p_confirm_immediately boolean default true
) returns uuid
language plpgsql
security definer
set search_path = public, support, extensions
as $$
declare
  v_order_id       uuid;
  v_client_type    text;
  v_particular_id  uuid;
  v_part_full_name text;
  v_part_dni       text;
  v_part_phone     text;
  v_part_email     text;
  v_item           jsonb;
  v_item_type      text;
  v_unit_price     numeric(12, 2);
  v_qty            int;
  v_key_idx        int;
begin
  -- ----------------------------------------------------------------
  -- 1. Client validation
  -- ----------------------------------------------------------------
  v_client_type := p_order->>'client_type';

  if v_client_type = 'administration' then
    if (p_order->>'administration_id') is null then
      raise exception 'KEY_ORDER_CLIENT_INCONSISTENT: administration_id required when client_type=administration'
        using errcode = 'P0001';
    end if;

  elsif v_client_type = 'particular' then
    v_particular_id := coalesce(
      (p_order->>'particular_id')::uuid,
      (select id from public.particulares where dni = p_order->>'particular_dni')
    );

    if v_particular_id is null then
      raise exception 'KEY_ORDER_CLIENT_INCONSISTENT: particular_id required when client_type=particular'
        using errcode = 'P0001';
    end if;

    select full_name, dni, phone, email
      into v_part_full_name, v_part_dni, v_part_phone, v_part_email
      from public.particulares
     where id = v_particular_id;

    if v_part_full_name is null then
      raise exception 'KEY_ORDER_CLIENT_INCONSISTENT: particular % not found', v_particular_id
        using errcode = 'P0001';
    end if;

  else
    raise exception 'KEY_ORDER_CLIENT_INCONSISTENT: invalid client_type %', v_client_type
      using errcode = 'P0001';
  end if;

  -- ----------------------------------------------------------------
  -- 2. Items pre-validation (all items before any INSERT)
  -- ----------------------------------------------------------------
  if p_items is null or array_length(p_items, 1) = 0 then
    raise exception 'KEY_ORDER_EMPTY: at least one item is required'
      using errcode = 'P0001';
  end if;

  foreach v_item in array p_items loop
    v_item_type := v_item->>'item_type';

    if v_item_type <> 'key' then
      raise exception 'KEY_ORDER_INVALID_ITEM_TYPE: key orders only accept item_type=key (got %)', v_item_type
        using errcode = 'P0001';
    end if;

    if (v_item->>'building_id') is null then
      raise exception 'KEY_ORDER_MISSING_BUILDING: building_id is required for key items'
        using errcode = 'P0001';
    end if;

    -- W-001 correction: unit_price > 0 required for ALL items at creation time.
    v_unit_price := nullif(v_item->>'unit_price', '')::numeric(12, 2);
    if v_unit_price is null or v_unit_price <= 0 then
      raise exception 'KEY_ORDER_PRICE_REQUIRED: unit_price > 0 is required for key items'
        using errcode = 'P0001';
    end if;

    v_qty := coalesce((v_item->>'quantity')::int, 1);
    if v_qty < 1 then
      raise exception 'KEY_ORDER_INVALID_QUANTITY: quantity must be >= 1'
        using errcode = 'P0001';
    end if;
  end loop;

  -- ----------------------------------------------------------------
  -- 3. Insert order header
  -- ----------------------------------------------------------------
  insert into public.key_orders (
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
    'draft'
  )
  returning id into v_order_id;

  -- ----------------------------------------------------------------
  -- 4. Insert items — explode quantity > 1 into N rows of quantity=1
  -- ----------------------------------------------------------------
  foreach v_item in array p_items loop
    v_qty := coalesce((v_item->>'quantity')::int, 1);

    for v_key_idx in 1..v_qty loop
      insert into public.key_order_items (
        order_id,
        item_type,
        quantity,
        description,
        building_id,
        product_id,
        unit_price,
        unit_id,
        pickup_particular_id,
        status
      )
      values (
        v_order_id,
        'key',
        1,
        v_item->>'description',
        (v_item->>'building_id')::uuid,
        (v_item->>'product_id')::uuid,
        nullif(v_item->>'unit_price', '')::numeric(12, 2),
        (v_item->>'unit_id')::uuid,
        (v_item->>'pickup_particular_id')::uuid,
        'pending'
      );
    end loop;
  end loop;

  -- ----------------------------------------------------------------
  -- 5. Optionally confirm inline
  -- ----------------------------------------------------------------
  if p_confirm_immediately then
    perform public.confirm_key_order(v_order_id);
  end if;

  return v_order_id;
end;
$$;

-- -------------------------------------------------------
-- confirm_key_order
-- -------------------------------------------------------
create or replace function public.confirm_key_order(
  p_order_id uuid
) returns void
language plpgsql
security definer
set search_path = public, support, extensions
as $$
declare
  v_order      record;
  v_item       record;
  v_item_count int;
begin
  -- 1. Row-lock and read current state.
  select id, status
    into v_order
    from public.key_orders
   where id = p_order_id
   for update;

  if not found then
    raise exception 'KEY_ORDER_NOT_FOUND: key order % does not exist', p_order_id
      using errcode = 'P0001';
  end if;

  -- 2. Validate status = 'draft'.
  if v_order.status <> 'draft' then
    raise exception 'KEY_ORDER_NOT_DRAFT: key order % is not in draft status (current: %)',
      p_order_id, v_order.status
      using errcode = 'P0001';
  end if;

  -- 3. Validate at least one non-cancelled item.
  select count(*) into v_item_count
    from public.key_order_items
   where order_id = p_order_id
     and status <> 'cancelled';

  if v_item_count = 0 then
    raise exception 'KEY_ORDER_EMPTY: key order % has no active items', p_order_id
      using errcode = 'P0001';
  end if;

  -- 4. Transition order to 'confirmed'.
  update public.key_orders
     set status = 'confirmed'
   where id = p_order_id;

  -- 5. Per-item stock reservations (key orders: reserva only, no tickets).
  --    Only items with a product_id participate in stock movements.
  for v_item in
    select id, product_id, quantity
      from public.key_order_items
     where order_id = p_order_id
       and status <> 'cancelled'
       and product_id is not null
  loop
    insert into public.stock_movements (
      product_id,
      type,
      quantity,
      note,
      order_id,
      order_item_id,
      order_kind
    )
    values (
      v_item.product_id,
      'reserva',
      -v_item.quantity,
      'Reserva de stock desde key_order_item ' || v_item.id::text,
      p_order_id,
      v_item.id,
      'key'
    )
    on conflict (order_item_id, type)
      where type = 'reserva' and order_item_id is not null
      do nothing;
  end loop;
end;
$$;

-- -------------------------------------------------------
-- Grants
-- -------------------------------------------------------
grant execute on function public.create_key_order_with_items(jsonb, jsonb[], boolean) to authenticated, service_role;
grant execute on function public.confirm_key_order(uuid) to authenticated, service_role;
