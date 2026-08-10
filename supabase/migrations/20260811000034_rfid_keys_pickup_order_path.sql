-- ============================================================
-- Order-key pickup path: trigger order branch + record RPC
-- ============================================================
-- Extends rfid_keys_validate_pickup to the order_item_id origin:
-- authorized DNIs = order buyer (orders.particular_id) + explicit pickup
-- person (orders.pickup_particular_id). Both null → rejected (covers
-- administration orders). The key_request_item_id branch stays untouched.
--
-- record_order_key_pickup orchestrates the write: FOR UPDATE locks on the
-- key and the order, a strict guard (client_type='particular' AND
-- status='ready_for_pickup'), then auto-completes the order when ALL
-- non-cancelled key items have picked_up_at. No recompute trigger this
-- cycle (user decision) — completion is evaluated at pickup time only.

------------------------------------------------------------
-- rfid_keys_validate_pickup — add the order path
------------------------------------------------------------
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
    -- ORDER path: authorized DNIs = buyer + explicit pickup person.
    -- IS DISTINCT FROM instead of NOT IN: a NULL pickup person must not
    -- widen the authorized set (NOT IN with a NULL operand yields NULL and
    -- would accept ANY DNI when only the buyer is set).
    select p.dni, pp.dni
      into v_buyer_dni, v_pickup_dni
      from public.order_items oi
      join public.orders o on o.id = oi.order_id
      left join public.particulares p  on p.id  = o.particular_id
      left join public.particulares pp on pp.id = o.pickup_particular_id
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

------------------------------------------------------------
-- RPC: record_order_key_pickup — orchestrate + auto-complete
------------------------------------------------------------
create or replace function public.record_order_key_pickup(
  p_key_id                uuid,
  p_picked_up_by_name     text,
  p_picked_up_by_surname  text,
  p_picked_up_by_dni      text,
  p_actor_staff_id        uuid default null
) returns void
language plpgsql
security definer
as $$
declare
  v_order_id     uuid;
  v_client_type  text;
  v_order_status text;
  v_total        int;
  v_done         int;
begin
  -- Lock the key row; only order-produced keys are eligible (no row → the
  -- key is missing or has a key_request origin → reject).
  select oi.order_id into v_order_id
    from public.rfid_keys k
    join public.order_items oi on oi.id = k.order_item_id
   where k.id = p_key_id
     for update of k;

  if v_order_id is null then
    raise exception 'record_order_key_pickup: key % is not an order-produced key', p_key_id
      using errcode = 'P0001';
  end if;

  -- Lock the order; strict guard: only particular orders ready_for_pickup.
  select client_type, status
    into v_client_type, v_order_status
    from public.orders
   where id = v_order_id
     for update;

  if v_client_type <> 'particular' then
    raise exception
      'record_order_key_pickup: order % has no particular client (administration orders use the key_requests flow)',
      v_order_id
      using errcode = 'P0001';
  end if;
  if v_order_status <> 'ready_for_pickup' then
    raise exception
      'record_order_key_pickup: order % must be ready_for_pickup to register pickups (current status: %)',
      v_order_id, v_order_status
      using errcode = 'P0001';
  end if;

  -- Record the pickup; rfid_keys_validate_pickup validates the DNI against
  -- the order's authorized DNIs (buyer or pickup person) before write.
  update public.rfid_keys
     set picked_up_by_name     = p_picked_up_by_name,
         picked_up_by_surname  = p_picked_up_by_surname,
         picked_up_by_dni      = p_picked_up_by_dni,
         picked_up_at          = now(),
         delivered_by_staff_id = p_actor_staff_id
   where id = p_key_id;

  -- Auto-complete: ALL non-cancelled key items must have picked_up_at.
  select count(*) filter (where oi.status <> 'cancelled'),
         count(*) filter (where oi.status <> 'cancelled' and k2.picked_up_at is not null)
    into v_total, v_done
    from public.order_items oi
    left join public.rfid_keys k2 on k2.id = oi.produced_key_id
   where oi.order_id = v_order_id
     and oi.item_type = 'key';

  if v_total > 0 and v_done = v_total then
    update public.orders
       set status = 'completed'
     where id = v_order_id;
  end if;
end;
$$;
