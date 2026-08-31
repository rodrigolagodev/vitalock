-- ============================================================
-- Pickup validation: per-item pickup_particular_id + buyer
-- ============================================================
-- The order pickup flow now attaches the authorized particular per line
-- item (order_items.pickup_particular_id) instead of at order level. The
-- validation trigger accepts either the item-level authorized DNI OR the
-- buyer's DNI. orders.pickup_particular_id is preserved for historical
-- rows but no longer participates in validation.

create or replace function public.rfid_keys_validate_pickup()
returns trigger
language plpgsql
as $$
declare
  v_authorized_dni text;
  v_request_status text;
  v_buyer_dni      text;
  v_pickup_dni     text;
begin
  if new.picked_up_at is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.picked_up_at is not null then
    return new;  -- ya validado antes; inmutabilidad la enforce el otro trigger
  end if;

  if new.picked_up_by_name is null or new.picked_up_by_surname is null or new.picked_up_by_dni is null then
    raise exception 'pickup fields (name, surname, dni) are required to set picked_up_at (key %)', new.id
      using errcode = 'check_violation';
  end if;

  -- A key must have exactly one production origin to be picked up
  -- (mutual exclusion is enforced by rfid_keys_origin_mutex).
  if new.key_request_item_id is null and new.order_item_id is null then
    raise exception 'cannot record pickup without a production origin (key %)', new.id
      using errcode = 'check_violation';
  end if;

  if new.key_request_item_id is null then
    -- ORDER path: authorized DNIs = buyer + item-level authorized particular.
    -- IS DISTINCT FROM instead of NOT IN: a NULL pickup person must not
    -- widen the authorized set (NOT IN with NULL yields NULL and would
    -- accept ANY DNI when only the buyer is set).
    select p.dni, pp.dni
      into v_buyer_dni, v_pickup_dni
      from public.order_items oi
      join public.orders o on o.id = oi.order_id
      left join public.particulares p  on p.id = o.particular_id
      left join public.particulares pp on pp.id = oi.pickup_particular_id
     where oi.id = new.order_item_id;

    if v_buyer_dni is null and v_pickup_dni is null then
      raise exception 'order key pickup requires an authorized particular (key %)', new.id
        using errcode = 'check_violation';
    end if;
    if new.picked_up_by_dni is distinct from v_buyer_dni
       and new.picked_up_by_dni is distinct from v_pickup_dni then
      raise exception 'pickup DNI (%) does not match the order authorized DNI', new.picked_up_by_dni
        using errcode = 'check_violation';
    end if;
    return new;
  end if;

  -- KEY_REQUEST path (unchanged).
  select kr.pickup_person_dni, kr.status
    into v_authorized_dni, v_request_status
    from sales.key_request_items kri
    join sales.key_requests kr on kr.id = kri.key_request_id
   where kri.id = new.key_request_item_id;

  if v_request_status not in ('ready_for_pickup','delivered') then
    raise exception
      'cannot pickup a key while the request is in status % (must be ready_for_pickup)',
      v_request_status
      using errcode = 'check_violation';
  end if;

  if new.picked_up_by_dni <> v_authorized_dni then
    raise exception
      'pickup DNI (%) does not match the authorized pickup person DNI (%) for this request',
      new.picked_up_by_dni, v_authorized_dni
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;
