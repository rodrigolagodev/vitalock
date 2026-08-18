-- ============================================================
-- Migration: create_technical_order_with_items + confirm_technical_order RPCs
-- ============================================================
-- Technical order RPC family (create + confirm bundled).
--
-- create_technical_order_with_items(p_order, p_items[], p_confirm_immediately)
--   * Validates client consistency.
--   * Validates item_type in domain.
--   * When p_confirm_immediately=true also validates intent fields.
--   * Inserts order header and items.
--   * Optionally calls confirm_technical_order inline (default true).
--
-- confirm_technical_order(p_order_id)
--   * Row-locks the order; validates status='draft'.
--   * Validates intent fields: intended_assignee_staff_id NOT NULL on every
--     non-cancelled item; intended_equipment_id NOT NULL for item_type IN
--     ('maintenance','equipment_replacement').
--   * Derives building/admin context from intended_equipment_id via
--     operations.equipment → buildings chain.
--   * Inserts one support.tickets row per item (skips installation items
--     with null intended_equipment_id — no building context available).
--   * Inserts stock_movements reserva for items with product_id
--     (order_kind='technical').
--   * Updates status to 'confirmed'.
--
-- Ticket category mapping:
--   'installation'          → 'installation'
--   'equipment_replacement' → 'equipment_replacement'
--   'maintenance'           → 'maintenance'
--   'equipment'             → 'equipment_installation'
--
-- Depends on: 20260818000082 (technical_orders, technical_order_items)
--             20260818000083 (stock_movements polymorphic)
--             20260818000084 (tickets dual FK)
--             20260818000085 (intent_immutable trigger)
-- ============================================================

-- -------------------------------------------------------
-- create_technical_order_with_items
-- -------------------------------------------------------
create or replace function public.create_technical_order_with_items(
  p_order               jsonb,
  p_items               jsonb[],
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
begin
  -- ----------------------------------------------------------------
  -- 1. Client validation
  -- ----------------------------------------------------------------
  v_client_type := p_order->>'client_type';

  if v_client_type = 'administration' then
    if (p_order->>'administration_id') is null then
      raise exception 'TECHNICAL_ORDER_CLIENT_INCONSISTENT: administration_id required when client_type=administration'
        using errcode = 'P0001';
    end if;

  elsif v_client_type = 'particular' then
    v_particular_id := coalesce(
      (p_order->>'particular_id')::uuid,
      (select id from public.particulares where dni = p_order->>'particular_dni')
    );

    if v_particular_id is null then
      raise exception 'TECHNICAL_ORDER_CLIENT_INCONSISTENT: particular_id required when client_type=particular'
        using errcode = 'P0001';
    end if;

    select full_name, dni, phone, email
      into v_part_full_name, v_part_dni, v_part_phone, v_part_email
      from public.particulares
     where id = v_particular_id;

    if v_part_full_name is null then
      raise exception 'TECHNICAL_ORDER_CLIENT_INCONSISTENT: particular % not found', v_particular_id
        using errcode = 'P0001';
    end if;

  else
    raise exception 'TECHNICAL_ORDER_CLIENT_INCONSISTENT: invalid client_type %', v_client_type
      using errcode = 'P0001';
  end if;

  -- ----------------------------------------------------------------
  -- 2. Items pre-validation
  -- ----------------------------------------------------------------
  if p_items is null or array_length(p_items, 1) = 0 then
    raise exception 'TECHNICAL_ORDER_EMPTY: at least one item is required'
      using errcode = 'P0001';
  end if;

  foreach v_item in array p_items loop
    v_item_type := v_item->>'item_type';

    if v_item_type not in ('equipment', 'maintenance', 'installation', 'equipment_replacement') then
      raise exception 'TECHNICAL_ORDER_INVALID_ITEM_TYPE: item_type must be one of equipment/maintenance/installation/equipment_replacement (got %)', v_item_type
        using errcode = 'P0001';
    end if;

    -- Uniform pricing policy: unit_price > 0 required for all items.
    v_unit_price := nullif(v_item->>'unit_price', '')::numeric(12, 2);
    if v_unit_price is null or v_unit_price <= 0 then
      raise exception 'TECHNICAL_ORDER_PRICE_REQUIRED: unit_price > 0 is required for all items (item_type=%)', v_item_type
        using errcode = 'P0001';
    end if;

    v_qty := coalesce((v_item->>'quantity')::int, 1);
    if v_qty < 1 then
      raise exception 'TECHNICAL_ORDER_INVALID_QUANTITY: quantity must be >= 1'
        using errcode = 'P0001';
    end if;

    -- Confirm-time intent validation (run pre-emptively when confirming immediately).
    if p_confirm_immediately then
      -- All items: intended_assignee_staff_id required.
      if (v_item->>'intended_assignee_staff_id') is null then
        raise exception 'TECHNICAL_ORDER_INTENT_REQUIRED: intended_assignee_staff_id required for confirm (item_type=%)', v_item_type
          using errcode = 'P0001';
      end if;

      -- maintenance and equipment_replacement: intended_equipment_id required.
      if v_item_type in ('maintenance', 'equipment_replacement')
         and (v_item->>'intended_equipment_id') is null then
        raise exception 'TECHNICAL_ORDER_INTENT_REQUIRED: intended_equipment_id required for confirm when item_type=% ', v_item_type
          using errcode = 'P0001';
      end if;

      -- equipment: product_id required.
      if v_item_type = 'equipment' and (v_item->>'product_id') is null then
        raise exception 'TECHNICAL_ORDER_PRODUCT_REQUIRED: product_id required for item_type=equipment'
          using errcode = 'P0001';
      end if;
    end if;
  end loop;

  -- ----------------------------------------------------------------
  -- 3. Insert order header
  -- ----------------------------------------------------------------
  insert into public.technical_orders (
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
  -- 4. Insert items (technical orders do NOT explode quantity)
  -- ----------------------------------------------------------------
  foreach v_item in array p_items loop
    insert into public.technical_order_items (
      order_id,
      item_type,
      quantity,
      description,
      unit_price,
      product_id,
      intended_equipment_id,
      intended_assignee_staff_id,
      status
    )
    values (
      v_order_id,
      v_item->>'item_type',
      coalesce((v_item->>'quantity')::int, 1),
      v_item->>'description',
      nullif(v_item->>'unit_price', '')::numeric(12, 2),
      (v_item->>'product_id')::uuid,
      (v_item->>'intended_equipment_id')::uuid,
      (v_item->>'intended_assignee_staff_id')::uuid,
      'pending'
    );
  end loop;

  -- ----------------------------------------------------------------
  -- 5. Optionally confirm inline
  -- ----------------------------------------------------------------
  if p_confirm_immediately then
    perform public.confirm_technical_order(v_order_id);
  end if;

  return v_order_id;
end;
$$;

-- -------------------------------------------------------
-- confirm_technical_order
-- -------------------------------------------------------
create or replace function public.confirm_technical_order(
  p_order_id uuid
) returns void
language plpgsql
security definer
set search_path = public, support, extensions
as $$
declare
  v_order        record;
  v_item         record;
  v_item_count   int;
  v_category     text;
  v_building_id  uuid;
  v_admin_id     uuid;
begin
  -- 1. Row-lock and read current state.
  select id, status, administration_id
    into v_order
    from public.technical_orders
   where id = p_order_id
   for update;

  if not found then
    raise exception 'TECHNICAL_ORDER_NOT_FOUND: technical order % does not exist', p_order_id
      using errcode = 'P0001';
  end if;

  -- 2. Validate status = 'draft'.
  if v_order.status <> 'draft' then
    raise exception 'TECHNICAL_ORDER_NOT_DRAFT: technical order % is not in draft status (current: %)',
      p_order_id, v_order.status
      using errcode = 'P0001';
  end if;

  -- 3. Validate at least one non-cancelled item.
  select count(*) into v_item_count
    from public.technical_order_items
   where order_id = p_order_id
     and status <> 'cancelled';

  if v_item_count = 0 then
    raise exception 'TECHNICAL_ORDER_EMPTY: technical order % has no active items', p_order_id
      using errcode = 'P0001';
  end if;

  -- 4. Validate intent fields on every non-cancelled item.
  for v_item in
    select id, item_type, intended_equipment_id, intended_assignee_staff_id
      from public.technical_order_items
     where order_id = p_order_id
       and status <> 'cancelled'
  loop
    -- All items: intended_assignee_staff_id required.
    if v_item.intended_assignee_staff_id is null then
      raise exception 'TECHNICAL_ORDER_INTENT_REQUIRED: intended_assignee_staff_id required to confirm (order_id=%, item_id=%, item_type=%)',
        p_order_id, v_item.id, v_item.item_type
        using errcode = 'P0001';
    end if;

    -- maintenance, equipment_replacement: intended_equipment_id required.
    if v_item.item_type in ('maintenance', 'equipment_replacement')
       and v_item.intended_equipment_id is null then
      raise exception 'TECHNICAL_ORDER_INTENT_REQUIRED: intended_equipment_id required for item_type=% (order_id=%, item_id=%)',
        v_item.item_type, p_order_id, v_item.id
        using errcode = 'P0001';
    end if;
  end loop;

  -- 5. Transition order to 'confirmed' BEFORE creating tickets.
  --    (intent_immutable trigger fires on any subsequent UPDATE of items)
  update public.technical_orders
     set status = 'confirmed'
   where id = p_order_id;

  -- 6. Per-item side effects: ticket creation + stock reservations.
  for v_item in
    select id, item_type, product_id, intended_equipment_id,
           intended_assignee_staff_id, quantity, description
      from public.technical_order_items
     where order_id = p_order_id
       and status <> 'cancelled'
  loop
    -- ---- Category mapping ----
    v_category := case v_item.item_type
                    when 'installation'          then 'installation'
                    when 'equipment_replacement' then 'equipment_replacement'
                    when 'maintenance'           then 'maintenance'
                    when 'equipment'             then 'equipment_installation'
                    else null
                  end;

    -- ---- Derive building_id and administration_id from equipment ----
    v_building_id := null;
    v_admin_id    := null;

    if v_item.intended_equipment_id is not null then
      select e.building_id, b.administration_id
        into v_building_id, v_admin_id
        from operations.equipment e
        join public.buildings b on b.id = e.building_id
       where e.id = v_item.intended_equipment_id;
    end if;

    -- ---- Ticket creation ----
    -- Skip if we cannot satisfy tickets.administration_id NOT NULL or
    -- tickets.building_id NOT NULL (installation items with no equipment yet).
    if v_building_id is not null and v_admin_id is not null then
      insert into support.tickets (
        administration_id,
        building_id,
        equipment_id,
        assigned_to_staff_id,
        category,
        description,
        status,
        notes,
        technical_order_item_id
        -- key_order_item_id: NULL (not set)
        -- order_item_id:     column dropped in migration 084
      )
      values (
        v_admin_id,
        v_building_id,
        v_item.intended_equipment_id,       -- may be NULL for installation
        v_item.intended_assignee_staff_id,
        v_category,
        coalesce(
          nullif(trim(v_item.description), ''),
          'Item de orden técnica (' || v_item.item_type || ')'
        ),
        'open',
        'Generado automáticamente desde technical_order_item ' || v_item.id::text,
        v_item.id
      );
    end if;

    -- ---- Stock reservation ----
    -- Only for items that reference an inventory SKU.
    if v_item.product_id is not null then
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
        'Reserva de stock desde technical_order_item ' || v_item.id::text,
        p_order_id,
        v_item.id,
        'technical'
      )
      on conflict (order_item_id, type)
        where type = 'reserva' and order_item_id is not null
        do nothing;
    end if;
  end loop;
end;
$$;

-- -------------------------------------------------------
-- Grants
-- -------------------------------------------------------
grant execute on function public.create_technical_order_with_items(jsonb, jsonb[], boolean) to authenticated, service_role;
grant execute on function public.confirm_technical_order(uuid) to authenticated, service_role;
