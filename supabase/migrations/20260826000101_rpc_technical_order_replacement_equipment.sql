-- ============================================================
-- Migration: technical order RPCs accept intended_replacement_equipment_id
-- ============================================================
-- Redefines three RPCs on top of the migration-091 versions to add
-- support for the new intent column:
--   * create_technical_order_with_items — accept + insert new field
--   * confirm_technical_order           — require both equipment intents
--                                         for equipment_replacement items
--   * update_draft_technical_order_with_items — accept + update/insert
--
-- Depends on: 20260826000100 (schema change), 20260818000091 (building_id RPCs)

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
  v_building_id    uuid;
begin
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

  if p_items is null or array_length(p_items, 1) = 0 then
    raise exception 'TECHNICAL_ORDER_EMPTY: at least one item is required'
      using errcode = 'P0001';
  end if;

  foreach v_item in array p_items loop
    v_item_type   := v_item->>'item_type';
    v_building_id := (v_item->>'building_id')::uuid;

    if v_building_id is null then
      raise exception 'TECHNICAL_ORDER_ITEM_BUILDING_REQUIRED: building_id is required for each item (item_type=%)', v_item_type
        using errcode = 'P0001';
    end if;

    if v_item_type not in ('equipment', 'maintenance', 'installation', 'equipment_replacement') then
      raise exception 'TECHNICAL_ORDER_INVALID_ITEM_TYPE: item_type must be one of equipment/maintenance/installation/equipment_replacement (got %)', v_item_type
        using errcode = 'P0001';
    end if;

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

    if p_confirm_immediately then
      if (v_item->>'intended_assignee_staff_id') is null then
        raise exception 'TECHNICAL_ORDER_INTENT_REQUIRED: intended_assignee_staff_id required for confirm (item_type=%)', v_item_type
          using errcode = 'P0001';
      end if;

      if v_item_type in ('maintenance', 'equipment_replacement')
         and (v_item->>'intended_equipment_id') is null then
        raise exception 'TECHNICAL_ORDER_INTENT_REQUIRED: intended_equipment_id required for confirm when item_type=% ', v_item_type
          using errcode = 'P0001';
      end if;

      if v_item_type = 'equipment_replacement'
         and (v_item->>'intended_replacement_equipment_id') is null then
        raise exception 'TECHNICAL_ORDER_INTENT_REQUIRED: intended_replacement_equipment_id required for confirm when item_type=equipment_replacement'
          using errcode = 'P0001';
      end if;

      if v_item_type = 'equipment' and (v_item->>'product_id') is null then
        raise exception 'TECHNICAL_ORDER_PRODUCT_REQUIRED: product_id required for item_type=equipment'
          using errcode = 'P0001';
      end if;
    end if;
  end loop;

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

  foreach v_item in array p_items loop
    insert into public.technical_order_items (
      order_id,
      item_type,
      quantity,
      description,
      unit_price,
      product_id,
      intended_equipment_id,
      intended_replacement_equipment_id,
      intended_assignee_staff_id,
      building_id,
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
      (v_item->>'intended_replacement_equipment_id')::uuid,
      (v_item->>'intended_assignee_staff_id')::uuid,
      (v_item->>'building_id')::uuid,
      'pending'
    );
  end loop;

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
  v_admin_id     uuid;
begin
  select id, status, administration_id
    into v_order
    from public.technical_orders
   where id = p_order_id
   for update;

  if not found then
    raise exception 'TECHNICAL_ORDER_NOT_FOUND: technical order % does not exist', p_order_id
      using errcode = 'P0001';
  end if;

  if v_order.status <> 'draft' then
    raise exception 'TECHNICAL_ORDER_NOT_DRAFT: technical order % is not in draft status (current: %)',
      p_order_id, v_order.status
      using errcode = 'P0001';
  end if;

  select count(*) into v_item_count
    from public.technical_order_items
   where order_id = p_order_id
     and status <> 'cancelled';

  if v_item_count = 0 then
    raise exception 'TECHNICAL_ORDER_EMPTY: technical order % has no active items', p_order_id
      using errcode = 'P0001';
  end if;

  for v_item in
    select id, item_type, intended_equipment_id, intended_replacement_equipment_id,
           intended_assignee_staff_id, building_id
      from public.technical_order_items
     where order_id = p_order_id
       and status <> 'cancelled'
  loop
    if v_item.intended_assignee_staff_id is null then
      raise exception 'TECHNICAL_ORDER_INTENT_REQUIRED: intended_assignee_staff_id required to confirm (order_id=%, item_id=%, item_type=%)',
        p_order_id, v_item.id, v_item.item_type
        using errcode = 'P0001';
    end if;

    if v_item.item_type in ('maintenance', 'equipment_replacement')
       and v_item.intended_equipment_id is null then
      raise exception 'TECHNICAL_ORDER_INTENT_REQUIRED: intended_equipment_id required for item_type=% (order_id=%, item_id=%)',
        v_item.item_type, p_order_id, v_item.id
        using errcode = 'P0001';
    end if;

    if v_item.item_type = 'equipment_replacement'
       and v_item.intended_replacement_equipment_id is null then
      raise exception 'TECHNICAL_ORDER_INTENT_REQUIRED: intended_replacement_equipment_id required for equipment_replacement (order_id=%, item_id=%)',
        p_order_id, v_item.id
        using errcode = 'P0001';
    end if;
  end loop;

  update public.technical_orders
     set status = 'confirmed'
   where id = p_order_id;

  for v_item in
    select id, item_type, product_id, intended_equipment_id,
           intended_replacement_equipment_id,
           intended_assignee_staff_id, quantity, description, building_id
      from public.technical_order_items
     where order_id = p_order_id
       and status <> 'cancelled'
  loop
    v_category := case v_item.item_type
                    when 'installation'          then 'installation'
                    when 'equipment_replacement' then 'equipment_replacement'
                    when 'maintenance'           then 'maintenance'
                    when 'equipment'             then 'equipment_installation'
                    else null
                  end;

    select b.administration_id
      into v_admin_id
      from public.buildings b
     where b.id = v_item.building_id;

    if v_admin_id is null then
      raise exception 'TECHNICAL_ORDER_BUILDING_NOT_FOUND: building % not found for item % (order_id=%)',
        v_item.building_id, v_item.id, p_order_id
        using errcode = 'P0001';
    end if;

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
    )
    values (
      v_admin_id,
      v_item.building_id,
      v_item.intended_equipment_id,
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
-- update_draft_technical_order_with_items
-- -------------------------------------------------------
create or replace function public.update_draft_technical_order_with_items(
  p_order_id            uuid,
  p_patch               jsonb,
  p_items               jsonb[],
  p_expected_updated_at timestamptz
) returns timestamptz
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_order          record;
  v_new_updated_at timestamptz;
  v_item           jsonb;
  v_item_id        uuid;
  v_item_ids_kept  uuid[] := array[]::uuid[];
  v_unit_price     numeric(12, 2);
begin
  select id, status, updated_at
    into v_order
    from public.technical_orders
   where id = p_order_id
   for update;

  if not found then
    raise exception 'TECHNICAL_ORDER_NOT_FOUND: technical order % does not exist', p_order_id
      using errcode = 'P0001';
  end if;

  if v_order.status <> 'draft' then
    raise exception 'TECHNICAL_ORDER_NOT_DRAFT: technical order % is not in draft status (current: %)',
      p_order_id, v_order.status
      using errcode = 'P0001';
  end if;

  if v_order.updated_at <> p_expected_updated_at then
    raise exception 'TECHNICAL_ORDER_STALE: technical order % was modified concurrently (expected %, actual %)',
      p_order_id, p_expected_updated_at, v_order.updated_at
      using errcode = 'P0001';
  end if;

  update public.technical_orders
     set
       notes                = coalesce(p_patch->>'notes',                 notes),
       client_type          = coalesce(p_patch->>'client_type',           client_type),
       administration_id    = case
                                when p_patch ? 'administration_id'
                                then (p_patch->>'administration_id')::uuid
                                else administration_id
                              end,
       particular_id        = case
                                when p_patch ? 'particular_id'
                                then (p_patch->>'particular_id')::uuid
                                else particular_id
                              end,
       particular_full_name = coalesce(p_patch->>'particular_full_name', particular_full_name),
       particular_dni       = coalesce(p_patch->>'particular_dni',       particular_dni),
       particular_phone     = coalesce(p_patch->>'particular_phone',     particular_phone),
       particular_email     = coalesce(p_patch->>'particular_email',     particular_email)
   where id = p_order_id
  returning updated_at into v_new_updated_at;

  if p_items is not null then
    foreach v_item in array p_items loop
      v_item_id    := (v_item->>'id')::uuid;
      v_unit_price := nullif(v_item->>'unit_price', '')::numeric(12, 2);

      if v_item_id is not null then
        update public.technical_order_items
           set
             item_type                          = coalesce(v_item->>'item_type', item_type),
             quantity                           = coalesce((v_item->>'quantity')::int, quantity),
             description                        = coalesce(v_item->>'description', description),
             unit_price                         = case when v_item ? 'unit_price'
                                                       then v_unit_price
                                                       else unit_price end,
             product_id                         = case when v_item ? 'product_id'
                                                       then (v_item->>'product_id')::uuid
                                                       else product_id end,
             intended_equipment_id              = case when v_item ? 'intended_equipment_id'
                                                       then (v_item->>'intended_equipment_id')::uuid
                                                       else intended_equipment_id end,
             intended_replacement_equipment_id  = case when v_item ? 'intended_replacement_equipment_id'
                                                       then (v_item->>'intended_replacement_equipment_id')::uuid
                                                       else intended_replacement_equipment_id end,
             intended_assignee_staff_id         = case when v_item ? 'intended_assignee_staff_id'
                                                       then (v_item->>'intended_assignee_staff_id')::uuid
                                                       else intended_assignee_staff_id end,
             building_id                        = case when v_item ? 'building_id'
                                                       then (v_item->>'building_id')::uuid
                                                       else building_id end
         where id = v_item_id
           and order_id = p_order_id;

        v_item_ids_kept := v_item_ids_kept || v_item_id;

      else
        insert into public.technical_order_items (
          order_id,
          item_type,
          quantity,
          description,
          unit_price,
          product_id,
          intended_equipment_id,
          intended_replacement_equipment_id,
          intended_assignee_staff_id,
          building_id
        )
        values (
          p_order_id,
          v_item->>'item_type',
          coalesce((v_item->>'quantity')::int, 1),
          v_item->>'description',
          v_unit_price,
          (v_item->>'product_id')::uuid,
          (v_item->>'intended_equipment_id')::uuid,
          (v_item->>'intended_replacement_equipment_id')::uuid,
          (v_item->>'intended_assignee_staff_id')::uuid,
          (v_item->>'building_id')::uuid
        )
        returning id into v_item_id;

        v_item_ids_kept := v_item_ids_kept || v_item_id;
      end if;
    end loop;

    delete from public.technical_order_items
     where order_id = p_order_id
       and id <> all(v_item_ids_kept);
  end if;

  return v_new_updated_at;
end;
$$;

grant execute on function public.create_technical_order_with_items(jsonb, jsonb[], boolean) to authenticated, service_role;
grant execute on function public.confirm_technical_order(uuid) to authenticated, service_role;
grant execute on function public.update_draft_technical_order_with_items(uuid, jsonb, jsonb[], timestamptz) to authenticated, service_role;
