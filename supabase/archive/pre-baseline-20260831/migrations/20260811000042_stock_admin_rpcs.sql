-- ============================================================
-- Stock admin RPCs: create_stock_movement + create_product_with_initial_stock
-- ============================================================
-- SECURITY DEFINER + explicit identity.is_admin() guard (mirrors
-- change_key_status / configure_key_order_item). Both run in a single
-- transaction so the product and its initial compra movement are atomic.

create or replace function public.create_stock_movement(
  p_product_id      uuid,
  p_type            text,
  p_quantity        int,
  p_unit_cost       numeric default null,
  p_note            text default null,
  p_actor_staff_id  uuid default null
) returns uuid
language plpgsql
security definer
as $$
declare
  v_movement_id uuid;
  v_actor       uuid;
begin
  if not identity.is_admin() then
    raise exception 'create_stock_movement: admin role required'
      using errcode = 'insufficient_privilege';
  end if;

  v_actor := coalesce(p_actor_staff_id, identity.current_staff_id());

  -- Only manual types are exposed. Movement types auto-emitted by triggers
  -- and RPCs (reserva, liberacion_reserva, egreso_grabacion,
  -- egreso_instalacion) are rejected to keep the ledger append-only and
  -- the counters consistent.
  if p_type not in (
    'compra', 'devolucion', 'ajuste_manual', 'baja_defectuoso', 'baja_perdida'
  ) then
    raise exception 'create_stock_movement: type % is not a manual stock movement type', p_type
      using errcode = 'P0001';
  end if;

  if p_product_id is null then
    raise exception 'create_stock_movement: product is required'
      using errcode = 'P0001';
  end if;

  if p_quantity = 0 then
    raise exception 'create_stock_movement: quantity must not be zero'
      using errcode = 'P0001';
  end if;

  -- Sign guard for asymmetric types (mirrors stock_movements_sign_matches_type):
  -- compra/devolucion are always positive, baja_* always negative.
  if p_type in ('compra', 'devolucion') and p_quantity < 0 then
    raise exception 'create_stock_movement: % requires a positive quantity', p_type
      using errcode = 'P0001';
  end if;

  if p_type in ('baja_defectuoso', 'baja_perdida') and p_quantity > 0 then
    raise exception 'create_stock_movement: % requires a negative quantity', p_type
      using errcode = 'P0001';
  end if;

  -- compra movements must record the per-unit cost.
  if p_type = 'compra' and p_unit_cost is null then
    raise exception 'create_stock_movement: compra requires unit_cost'
      using errcode = 'P0001';
  end if;

  insert into public.stock_movements (
    product_id,
    type,
    quantity,
    unit_cost,
    note,
    created_by
  ) values (
    p_product_id,
    p_type,
    p_quantity,
    p_unit_cost,
    coalesce(nullif(trim(coalesce(p_note, '')), ''),
             'Movimiento manual (' || p_type || ')'),
    v_actor
  )
  returning id into v_movement_id;

  return v_movement_id;
end;
$$;

create or replace function public.create_product_with_initial_stock(
  p_name            text,
  p_category        text,
  p_cost_price      numeric default null,
  p_quantity        int default 0,
  p_note            text default null,
  p_actor_staff_id  uuid default null
) returns uuid
language plpgsql
security definer
as $$
declare
  v_product_id  uuid;
  v_actor       uuid;
begin
  if not identity.is_admin() then
    raise exception 'create_product_with_initial_stock: admin role required'
      using errcode = 'insufficient_privilege';
  end if;

  v_actor := coalesce(p_actor_staff_id, identity.current_staff_id());

  if p_name is null or length(trim(p_name)) = 0 then
    raise exception 'create_product_with_initial_stock: name is required'
      using errcode = 'P0001';
  end if;

  if p_category not in ('rfid_key', 'equipment') then
    raise exception
      'create_product_with_initial_stock: category % is invalid (rfid_key | equipment)',
      p_category
      using errcode = 'P0001';
  end if;

  if p_quantity < 0 then
    raise exception 'create_product_with_initial_stock: quantity must not be negative'
      using errcode = 'P0001';
  end if;

  -- Atomic insert: product + its initial compra movement in the same tx.
  insert into public.products (name, category, cost_price)
  values (trim(p_name), p_category, p_cost_price)
  returning id into v_product_id;

  if p_quantity > 0 then
    insert into public.stock_movements (
      product_id, type, quantity, unit_cost, note, created_by
    ) values (
      v_product_id,
      'compra',
      p_quantity,
      coalesce(p_cost_price, 0),
      coalesce(nullif(trim(coalesce(p_note, '')), ''),
               'Stock inicial (alta de producto)'),
      v_actor
    );
  end if;

  return v_product_id;
end;
$$;
