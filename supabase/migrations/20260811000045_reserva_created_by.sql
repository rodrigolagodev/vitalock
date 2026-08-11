-- ============================================================
-- order_items_create_tarea: record created_by on reserva movements
-- ============================================================
-- Re-creates order_items_create_tarea() so the stock_movements 'reserva'
-- INSERT carries created_by from the JWT context
-- (identity.current_staff_id(); NULL when no staff is logged in).
-- The rest of the trigger behavior is preserved exactly:
--   * 'maintenance'/'installation'  -> existing ticket path.
--   * 'key'/'equipment' + product_id NOT NULL -> ticket + reserva.
--   * 'key'/'equipment' + product_id NULL -> no ticket, no reservation.
-- Reservation idempotency via the partial UNIQUE index
-- (order_item_id, type) WHERE type='reserva' is kept via ON CONFLICT.

create or replace function public.order_items_create_tarea()
returns trigger
language plpgsql
security definer
set search_path = public, support
as $$
declare
  v_admin_id  uuid;
  v_ticket_id uuid;
  v_category  text;
begin
  if new.item_type in ('maintenance', 'installation') then
    select administration_id into v_admin_id
      from public.orders where id = new.order_id;

    if v_admin_id is null then
      return new;  -- particular orders: skip (existing behavior)
    end if;

    if new.building_id is null then
      return new;
    end if;

    insert into support.tickets (
      administration_id, building_id, category, description, status, notes
    ) values (
      v_admin_id,
      new.building_id,
      new.item_type,
      coalesce(nullif(trim(new.description), ''),
               'Item de orden (' || new.item_type || ')'),
      'open',
      'Generado automáticamente desde order_item ' || new.id::text
    );

    return new;
  end if;

  -- Stock-backed lines only: key / equipment.
  if new.item_type not in ('key', 'equipment') then
    return new;
  end if;

  if new.product_id is null then
    return new;  -- no inventory SKU -> no ticket, no reservation
  end if;

  v_category := case new.item_type
                  when 'key'       then 'key_configuration'
                  when 'equipment' then 'equipment_installation'
                end;

  -- Resolve the administration for the ticket. Administration orders carry
  -- it directly; particular orders derive it from the building so the ticket
  -- is still created (particular orders are NOT exempt for stock lines).
  select o.administration_id
    into v_admin_id
    from public.orders o
   where o.id = new.order_id;

  if v_admin_id is null then
    select administration_id into v_admin_id
      from public.buildings
     where id = new.building_id;
  end if;

  -- Ticket (only when a building is available; support.tickets requires
  -- administration_id and building_id NOT NULL).
  if new.building_id is not null and v_admin_id is not null then
    insert into support.tickets (
      administration_id, building_id, category, description, status, notes
    ) values (
      v_admin_id,
      new.building_id,
      v_category,
      coalesce(nullif(trim(new.description), ''),
               'Item de orden (' || new.item_type || ')'),
      'open',
      'Generado automáticamente desde order_item ' || new.id::text
    )
    returning id into v_ticket_id;
  end if;

  -- Reservation movement (negative quantity). Idempotent per order_item via
  -- the partial UNIQUE index; duplicate fires are silently absorbed.
  insert into public.stock_movements (
    product_id, type, quantity, note, order_id, order_item_id, ticket_id, created_by
  ) values (
    new.product_id,
    'reserva',
    -new.quantity,
    'Reserva de stock desde order_item ' || new.id::text,
    new.order_id,
    new.id,
    v_ticket_id,
    identity.current_staff_id()
  )
  on conflict (order_item_id, type)
    where type = 'reserva' and order_item_id is not null
    do nothing;

  return new;
end;
$$;
