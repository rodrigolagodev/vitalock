-- ============================================================
-- Migration: record_order_key_pickup — enable admin-client flow
-- ============================================================
-- Removes the defensive hard-guard that rejected client_type='administration'
-- key_orders on pickup. The admin flow is otherwise identical to particular:
-- the pickup DNI is validated against the order-authorized particulares via
-- rfid_keys_validate_pickup (using pickup_particular_id at the item and/or
-- order level). Admin orders without any authorized particular are still
-- rejected — the rejection just moves from the RPC body to the pickup
-- validator, which is the correct layer for that check.
--
-- Symptom before this migration:
--   Every key_order with client_type='administration' becomes stuck in
--   ready_for_pickup with no path to completion — the "Registrar retiro"
--   action is hidden in the UI and the RPC would reject the call anyway.
--
-- Fix scope: RPC body only. The signature, grants, validate_pickup, and the
-- auto-complete tail block are unchanged from migration 098.
--
-- Depends on: 20260823000098 (record_order_key_pickup rewrite)
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

  -- Lock the owning order; only status is inspected here — DNI/authorized
  -- particular checks live in rfid_keys_validate_pickup and apply uniformly
  -- to both particular and administration flows.
  select status
    into v_order_status
    from public.key_orders
   where id = v_order_id
     for update;

  if v_order_status <> 'ready_for_pickup' then
    raise exception
      'record_order_key_pickup: key_order % must be ready_for_pickup to register pickups (current status: %)',
      v_order_id, v_order_status
      using errcode = 'P0001';
  end if;

  -- Record the pickup; rfid_keys_validate_pickup validates the DNI against
  -- the order-authorized DNIs before write and rejects orders (of any
  -- client_type) that have no authorized particular.
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
