-- ============================================================
-- Stock compra: unit_cost opcional + sincroniza products.cost_price
-- ============================================================
-- Cambios:
--   1) Se afloja el check constraint que exigía unit_cost para toda
--      compra: ahora una compra puede registrarse sin costo cuando el
--      admin solo repone stock sin querer sobrescribir el precio actual.
--   2) create_stock_movement, cuando p_type = 'compra' y llega un
--      p_unit_cost > 0, actualiza public.products.cost_price con ese
--      valor. NULL o 0 significan "no tocar el precio actual".

alter table public.stock_movements
  drop constraint if exists stock_movements_ingreso_requires_cost;

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
  v_unit_cost   numeric;
begin
  if not identity.is_admin() then
    raise exception 'create_stock_movement: admin role required'
      using errcode = 'insufficient_privilege';
  end if;

  v_actor := coalesce(p_actor_staff_id, identity.current_staff_id());

  -- 0 en la UI significa "no registrar costo / no actualizar precio":
  -- lo normalizamos a NULL para que el ledger no muestre $0,00 falso.
  v_unit_cost := case
    when p_unit_cost is null then null
    when p_unit_cost <= 0    then null
    else p_unit_cost
  end;

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

  if p_type in ('compra', 'devolucion') and p_quantity < 0 then
    raise exception 'create_stock_movement: % requires a positive quantity', p_type
      using errcode = 'P0001';
  end if;

  if p_type in ('baja_defectuoso', 'baja_perdida') and p_quantity > 0 then
    raise exception 'create_stock_movement: % requires a negative quantity', p_type
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
    v_unit_cost,
    coalesce(nullif(trim(coalesce(p_note, '')), ''),
             'Movimiento manual (' || p_type || ')'),
    v_actor
  )
  returning id into v_movement_id;

  -- Sincronizar precio de costo del producto solo cuando la compra
  -- trae un costo positivo. NULL o 0 preservan el precio actual.
  if p_type = 'compra' and v_unit_cost is not null then
    update public.products
      set cost_price = v_unit_cost
      where id = p_product_id;
  end if;

  return v_movement_id;
end;
$$;
