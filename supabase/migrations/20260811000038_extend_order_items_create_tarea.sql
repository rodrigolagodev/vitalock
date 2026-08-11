-- ============================================================
-- Extend order_items_create_tarea: stock-backed key/equipment items
-- ============================================================
-- Rewrites the AFTER INSERT trigger so that:
--   * 'maintenance'/'installation'  -> existing behavior (administration
--     orders only, ticket category = item_type).
--   * 'key' + product_id NOT NULL   -> support.tickets (key_configuration)
--     + stock_movements (reserva).
--   * 'equipment' + product_id NOT NULL -> support.tickets
--     (equipment_installation) + stock_movements (reserva).
--   * 'key'/'equipment' + product_id NULL -> no ticket, no reservation
--     (backward compatible with legacy rows).
--
-- Particular orders are NOT exempt for key/equipment: the reservation is
-- gated ONLY on product_id IS NOT NULL. When the order has no
-- administration_id, the ticket's administration is derived from the
-- building (support.tickets.administration_id is NOT NULL and must match
-- the building's administration).
--
-- Reservation idempotency: the partial UNIQUE index
-- stock_movements_reserva_unique on (order_item_id, type)
-- WHERE type = 'reserva' AND order_item_id IS NOT NULL absorbs duplicate
-- fires via ON CONFLICT DO NOTHING.

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
    product_id, type, quantity, note, order_id, order_item_id, ticket_id
  ) values (
    new.product_id,
    'reserva',
    -new.quantity,
    'Reserva de stock desde order_item ' || new.id::text,
    new.order_id,
    new.id,
    v_ticket_id
  )
  on conflict (order_item_id, type)
    where type = 'reserva' and order_item_id is not null
    do nothing;

  return new;
end;
$$;
