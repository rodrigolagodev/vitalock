-- ============================================================
-- Migration: record_order_key_pickup rewrite for key_orders schema
-- ============================================================
-- The old body of record_order_key_pickup joined public.rfid_keys →
-- public.order_items → public.orders. Migration 000094 dropped the legacy
-- tables with CASCADE, leaving the RPC body referencing dropped relations
-- (the plpgsql body is parsed at execution time, so the function survived
-- the drop but any call raises "relation ... does not exist").
--
-- The origin-tracking convention also changed post-split: for the new
-- key_orders path, rfid_keys.order_item_id is NULL and the link lives on
-- key_order_items.produced_key_id. rfid_keys_validate_pickup rejected such
-- keys with "cannot record pickup without a production origin".
--
-- This migration:
--   1. Rewrites public.rfid_keys_validate_pickup to accept the key_orders
--      origin (lookup via key_order_items.produced_key_id) and drops the
--      dead legacy public.order_items branch.
--   2. Replaces public.record_order_key_pickup so it operates on
--      key_orders / key_order_items instead of the dropped legacy tables.
--      Auto-completes the order (status='completed') when every non-cancelled
--      item has picked_up_at set.
--
-- Both symbols keep their existing signatures — no wrapper changes required.
--
-- Depends on: 20260818000094 (legacy retirement)
--             20260818000081 (key_order_items with produced_key_id)
--             20260823000097 (pending_installation state — record_pickup does
--                             not depend on it but the two ship together)
-- ============================================================

-- ============================================================
-- (1) rfid_keys_validate_pickup — key_orders-aware
-- ============================================================
create or replace function public.rfid_keys_validate_pickup()
returns trigger
language plpgsql
as $$
declare
  v_authorized_dni text;
  v_request_status text;
  v_buyer_dni      text;
  v_pickup_dni     text;
  v_koi_id         uuid;
begin
  if new.picked_up_at is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.picked_up_at is not null then
    return new;  -- already validated; immutability enforced by prevent_reassignment
  end if;

  if new.picked_up_by_name is null
     or new.picked_up_by_surname is null
     or new.picked_up_by_dni is null then
    raise exception 'pickup fields (name, surname, dni) are required to set picked_up_at (key %)', new.id
      using errcode = 'check_violation';
  end if;

  -- Origin lookup — key_orders path (new).
  select koi.id
    into v_koi_id
    from public.key_order_items koi
   where koi.produced_key_id = new.id
   limit 1;

  -- Every pickup requires at least one production origin. The legacy
  -- public.order_items branch is intentionally omitted (retired in 000094).
  if new.key_request_item_id is null and v_koi_id is null then
    raise exception 'cannot record pickup without a production origin (key %)', new.id
      using errcode = 'check_violation';
  end if;

  -- KEY_ORDERS path.
  if v_koi_id is not null then
    select p.dni,
           coalesce(pp_item.dni, pp_order.dni)
      into v_buyer_dni, v_pickup_dni
      from public.key_order_items koi
      join public.key_orders ko             on ko.id       = koi.order_id
      left join public.particulares p        on p.id        = ko.particular_id
      left join public.particulares pp_item  on pp_item.id  = koi.pickup_particular_id
      left join public.particulares pp_order on pp_order.id = ko.pickup_particular_id
     where koi.id = v_koi_id;

    if v_buyer_dni is null and v_pickup_dni is null then
      raise exception 'key_order pickup requires an authorized particular (key %)', new.id
        using errcode = 'check_violation';
    end if;
    if new.picked_up_by_dni is distinct from v_buyer_dni
       and new.picked_up_by_dni is distinct from v_pickup_dni then
      raise exception 'pickup DNI (%) does not match the key_order authorized DNI', new.picked_up_by_dni
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

  if v_request_status not in ('ready_for_pickup', 'delivered') then
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

-- ============================================================
-- (2) record_order_key_pickup — key_orders-aware body
-- ============================================================
create or replace function public.record_order_key_pickup(
  p_key_id                uuid,
  p_picked_up_by_name     text,
  p_picked_up_by_surname  text,
  p_picked_up_by_dni      text,
  p_actor_staff_id        uuid default null
) returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_order_id     uuid;
  v_client_type  text;
  v_order_status text;
  v_total        int;
  v_done         int;
begin
  -- Lock the key row.
  perform 1 from public.rfid_keys where id = p_key_id for update;
  if not found then
    raise exception 'record_order_key_pickup: key % not found', p_key_id
      using errcode = 'P0001';
  end if;

  -- Locate the owning key_order via key_order_items.produced_key_id.
  select koi.order_id
    into v_order_id
    from public.key_order_items koi
   where koi.produced_key_id = p_key_id
   limit 1;

  if v_order_id is null then
    raise exception 'record_order_key_pickup: key % is not linked to any key_order', p_key_id
      using errcode = 'P0001';
  end if;

  -- Lock the owning order; strict guard: only particular orders ready_for_pickup.
  select client_type, status
    into v_client_type, v_order_status
    from public.key_orders
   where id = v_order_id
     for update;

  if v_client_type <> 'particular' then
    raise exception
      'record_order_key_pickup: key_order % has no particular client (administration flow not supported here)',
      v_order_id
      using errcode = 'P0001';
  end if;

  if v_order_status <> 'ready_for_pickup' then
    raise exception
      'record_order_key_pickup: key_order % must be ready_for_pickup to register pickups (current status: %)',
      v_order_id, v_order_status
      using errcode = 'P0001';
  end if;

  -- Record the pickup; rfid_keys_validate_pickup validates the DNI against
  -- the order-authorized DNIs (buyer + optional pickup person) before write.
  update public.rfid_keys
     set picked_up_by_name     = p_picked_up_by_name,
         picked_up_by_surname  = p_picked_up_by_surname,
         picked_up_by_dni      = p_picked_up_by_dni,
         picked_up_at          = now(),
         delivered_by_staff_id = p_actor_staff_id
   where id = p_key_id;

  -- Auto-complete: every non-cancelled item must have a picked_up_at.
  select
    count(*) filter (where koi.status <> 'cancelled'),
    count(*) filter (where koi.status <> 'cancelled' and rk.picked_up_at is not null)
    into v_total, v_done
    from public.key_order_items koi
    left join public.rfid_keys rk on rk.id = koi.produced_key_id
   where koi.order_id = v_order_id;

  if v_total > 0 and v_done = v_total then
    update public.key_orders
       set status = 'completed'
     where id = v_order_id;
  end if;
end;
$$;

grant execute on function public.record_order_key_pickup(uuid, text, text, text, uuid) to authenticated, service_role;
