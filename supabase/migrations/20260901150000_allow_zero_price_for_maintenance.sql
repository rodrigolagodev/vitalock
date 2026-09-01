-- allow_zero_price_for_maintenance
--
-- Business rule: administrations on the monthly plan get free maintenance
-- visits (24hs technical support included). Maintenance items must therefore
-- allow unit_price = 0 (or NULL, defaulting to 0). Install and replace items
-- remain billable and still require unit_price > 0.
--
-- Only create_technical_order_with_items changes. No CHECK constraint update
-- needed — the invariant is caller-side (RPC guard), not stored at row level.

CREATE OR REPLACE FUNCTION public.create_technical_order_with_items(p_order jsonb, p_items jsonb[], p_confirm_immediately boolean DEFAULT true) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'support', 'extensions'
AS $$
declare
  v_order_id uuid; v_client_type text; v_particular_id uuid;
  v_part_full_name text; v_part_dni text; v_part_phone text; v_part_email text;
  v_item jsonb; v_item_type text; v_unit_price numeric(12, 2); v_qty int;
  v_building_id uuid; v_product_id uuid; v_product_cat text;
begin
  v_client_type := p_order->>'client_type';

  if v_client_type = 'administration' then
    if (p_order->>'administration_id') is null then
      raise exception 'TECHNICAL_ORDER_CLIENT_INCONSISTENT: administration_id required when client_type=administration' using errcode = 'P0001';
    end if;
  elsif v_client_type = 'particular' then
    v_particular_id := coalesce((p_order->>'particular_id')::uuid,
      (select id from public.particulares where dni = p_order->>'particular_dni'));
    if v_particular_id is null then
      raise exception 'TECHNICAL_ORDER_CLIENT_INCONSISTENT: particular_id required when client_type=particular' using errcode = 'P0001';
    end if;
    select full_name, dni, phone, email into v_part_full_name, v_part_dni, v_part_phone, v_part_email
      from public.particulares where id = v_particular_id;
    if v_part_full_name is null then
      raise exception 'TECHNICAL_ORDER_CLIENT_INCONSISTENT: particular % not found', v_particular_id using errcode = 'P0001';
    end if;
  else
    raise exception 'TECHNICAL_ORDER_CLIENT_INCONSISTENT: invalid client_type %', v_client_type using errcode = 'P0001';
  end if;

  if p_items is null or array_length(p_items, 1) = 0 then
    raise exception 'TECHNICAL_ORDER_EMPTY: at least one item is required' using errcode = 'P0001';
  end if;

  foreach v_item in array p_items loop
    v_item_type := v_item->>'item_type';
    v_building_id := (v_item->>'building_id')::uuid;

    if v_building_id is null then
      raise exception 'TECHNICAL_ORDER_ITEM_BUILDING_REQUIRED: building_id is required for each item (item_type=%)', v_item_type using errcode = 'P0001';
    end if;

    if v_item_type not in ('install_equipment', 'maintain_equipment', 'replace_equipment') then
      raise exception 'TECHNICAL_ORDER_INVALID_ITEM_TYPE: item_type must be one of install_equipment/maintain_equipment/replace_equipment (got %)', v_item_type using errcode = 'P0001';
    end if;

    -- Price policy:
    --   maintain_equipment: unit_price may be null or 0 (monthly plan covers it) or > 0 (extra charge).
    --   install_equipment / replace_equipment: unit_price MUST be > 0 (billable work).
    v_unit_price := nullif(v_item->>'unit_price', '')::numeric(12, 2);

    if v_unit_price is null then
      if v_item_type <> 'maintain_equipment' then
        raise exception 'TECHNICAL_ORDER_PRICE_REQUIRED: unit_price is required for item_type=%', v_item_type using errcode = 'P0001';
      end if;
      v_unit_price := 0;
    end if;

    if v_unit_price < 0 then
      raise exception 'TECHNICAL_ORDER_INVALID_PRICE: unit_price cannot be negative (item_type=%)', v_item_type using errcode = 'P0001';
    end if;

    if v_unit_price = 0 and v_item_type <> 'maintain_equipment' then
      raise exception 'TECHNICAL_ORDER_PRICE_REQUIRED: unit_price > 0 is required for item_type=% (only maintain_equipment allows 0)', v_item_type using errcode = 'P0001';
    end if;

    v_qty := coalesce((v_item->>'quantity')::int, 1);
    if v_qty < 1 then
      raise exception 'TECHNICAL_ORDER_INVALID_QUANTITY: quantity must be >= 1' using errcode = 'P0001';
    end if;

    if p_confirm_immediately then
      if (v_item->>'intended_assignee_staff_id') is null then
        raise exception 'TECHNICAL_ORDER_INTENT_REQUIRED: intended_assignee_staff_id required for confirm (item_type=%)', v_item_type using errcode = 'P0001';
      end if;

      if v_item_type in ('maintain_equipment', 'replace_equipment') and (v_item->>'intended_equipment_id') is null then
        raise exception 'TECHNICAL_ORDER_INTENT_REQUIRED: intended_equipment_id required for confirm when item_type=% ', v_item_type using errcode = 'P0001';
      end if;

      if v_item_type in ('install_equipment', 'replace_equipment') and (v_item->>'product_id') is null then
        raise exception 'TECHNICAL_ORDER_PRODUCT_REQUIRED: product_id required for item_type=%', v_item_type using errcode = 'P0001';
      end if;
    end if;

    v_product_id := (v_item->>'product_id')::uuid;
    if v_product_id is not null then
      select category into v_product_cat from public.products where id = v_product_id;
      if v_product_cat is null then
        raise exception 'TECHNICAL_ORDER_PRODUCT_NOT_FOUND: product % not found', v_product_id using errcode = 'P0001';
      end if;
      if v_item_type in ('install_equipment', 'replace_equipment') and v_product_cat <> 'equipment' then
        raise exception 'TECHNICAL_ORDER_PRODUCT_CATEGORY_MISMATCH: product % has category % but item_type=% requires equipment',
          v_product_id, v_product_cat, v_item_type using errcode = 'P0001';
      end if;
    end if;
  end loop;

  insert into public.technical_orders (client_type, administration_id, particular_id, particular_full_name,
    particular_dni, particular_phone, particular_email, notes, status)
  values (v_client_type, (p_order->>'administration_id')::uuid, v_particular_id,
    coalesce(nullif(trim(p_order->>'particular_full_name'), ''), v_part_full_name),
    coalesce(nullif(trim(p_order->>'particular_dni'), ''), v_part_dni),
    coalesce(nullif(trim(p_order->>'particular_phone'), ''), v_part_phone),
    coalesce(nullif(trim(p_order->>'particular_email'), ''), v_part_email),
    p_order->>'notes', 'draft')
  returning id into v_order_id;

  foreach v_item in array p_items loop
    insert into public.technical_order_items (order_id, item_type, quantity, description, unit_price,
      product_id, intended_equipment_id, intended_replacement_equipment_id,
      intended_assignee_staff_id, building_id, status)
    values (v_order_id, v_item->>'item_type', coalesce((v_item->>'quantity')::int, 1),
      v_item->>'description',
      -- Maintenance items with no price default to 0 (monthly plan). Other types
      -- already errored above if unit_price was null.
      coalesce(nullif(v_item->>'unit_price', '')::numeric(12, 2), 0),
      (v_item->>'product_id')::uuid, (v_item->>'intended_equipment_id')::uuid,
      (v_item->>'intended_replacement_equipment_id')::uuid, (v_item->>'intended_assignee_staff_id')::uuid,
      (v_item->>'building_id')::uuid, 'pending');
  end loop;

  if p_confirm_immediately then
    perform public.confirm_technical_order(v_order_id);
  end if;

  return v_order_id;
end;
$$;
