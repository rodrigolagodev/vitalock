-- ============================================================
-- Cancel order releases pending stock reservations
-- ============================================================
-- AFTER UPDATE OF status ON public.orders. When an order transitions INTO
-- 'cancelled' (and only then), emit a liberacion_reserva movement for every
-- reserva movement of the order that has no paired definitive egreso
-- (egreso_grabacion / egreso_instalacion) — pending reservations only.
--
-- Covers the sales-orders spec scenarios:
--   * "Order cancellation releases pending reservations"
--   * "Egreso-consumed reservations are NOT re-released on cancel"
--
-- A reserva is considered consumed when its order_item already has a
-- definitive egreso (configure_key_order_item / resolve_equipment_installation
-- emit egreso + liberacion_reserva together), so no liberacion is emitted for
-- it again. The NOT EXISTS guard on an existing liberacion_reserva keeps the
-- trigger idempotent if it is ever re-fired.

create or replace function public.orders_cancel_release_reservations()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reserva record;
  v_actor   uuid;
begin
  -- Only a genuine transition INTO 'cancelled' releases reservations.
  -- A repeated UPDATE that keeps status = 'cancelled' is a no-op.
  if new.status <> 'cancelled' or old.status = 'cancelled' then
    return null;
  end if;

  v_actor := identity.current_staff_id();

  -- Release every pending reservation of this order: a reserva movement with
  -- no paired definitive egreso. The partial UNIQUE index
  -- (order_item_id, type) WHERE type = 'reserva' guarantees at most one
  -- reserva per order_item.
  for v_reserva in
    select m.order_item_id, m.product_id, m.quantity, m.ticket_id
      from public.stock_movements m
     where m.order_id = new.id
       and m.type = 'reserva'
       and not exists (
         select 1
           from public.stock_movements e
          where e.order_item_id = m.order_item_id
            and e.type in ('egreso_grabacion', 'egreso_instalacion')
       )
       and not exists (
         select 1
           from public.stock_movements l
          where l.order_item_id = m.order_item_id
            and l.type = 'liberacion_reserva'
       )
  loop
    -- liberacion_reserva carries a positive quantity (reserva is negative).
    insert into public.stock_movements (
      product_id, type, quantity, note, order_id, order_item_id,
      ticket_id, created_by
    ) values (
      v_reserva.product_id,
      'liberacion_reserva',
      -v_reserva.quantity,
      'Liberación de reserva por cancelación de orden ' || new.order_number,
      new.id,
      v_reserva.order_item_id,
      v_reserva.ticket_id,
      v_actor
    );
  end loop;

  return null;
end;
$$;

drop trigger if exists orders_cancel_release_reservations on public.orders;

create trigger orders_cancel_release_reservations
after update of status on public.orders
for each row execute function public.orders_cancel_release_reservations();
