-- ============================================================
-- Add nullable product_id FK to public.order_items
-- ============================================================
-- Links an order line item to a public.products (inventory) row.
-- NULL means "no product referenced" (legacy rows + maintenance/
-- installation items). The reservation trigger gates on IS NOT NULL.
--
-- NOTE: References public.products (inventory), not sales.products (billing).

alter table public.order_items
  add column product_id uuid references public.products(id) on delete set null;

create index order_items_product_id_idx
  on public.order_items (product_id)
  where product_id is not null;

-- Also extend create_order_with_items RPC to accept optional product_id
-- per item.
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

  -- Insert items (now including optional product_id).
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
