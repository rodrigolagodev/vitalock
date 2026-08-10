-- ============================================================
-- rfid_keys: add order_item_id FK + mutual-exclusion CHECK
-- ============================================================
-- Ordenes introduces a second path for key production: an order item
-- can be the origin of an rfid_key (alongside the existing
-- key_request_item_id path from sales.key_requests).
--
-- Business rule: a single rfid_key can only be produced from ONE origin.
-- Mutual-exclusion is enforced by the CHECK below.

alter table public.rfid_keys
  add column order_item_id uuid references public.order_items(id) on delete restrict;

create index rfid_keys_order_item_id_idx on public.rfid_keys (order_item_id)
  where order_item_id is not null;

-- Mutual exclusion: a key cannot be linked to both origins simultaneously.
alter table public.rfid_keys
  add constraint rfid_keys_origin_mutex check (
    key_request_item_id is null or order_item_id is null
  );

------------------------------------------------------------
-- Extend rfid_keys_prevent_reassignment to guard order_item_id
------------------------------------------------------------
-- The existing trigger function is redefined here with create or replace,
-- adding the order_item_id immutability guard alongside the existing checks
-- for unit_id, rfid_code, key_request_item_id, and pickup fields.
create or replace function public.rfid_keys_prevent_reassignment()
returns trigger
language plpgsql
as $$
begin
  if new.unit_id is distinct from old.unit_id then
    raise exception 'rfid_keys.unit_id is immutable (key %)', old.id
      using errcode = 'check_violation';
  end if;
  if new.rfid_code is distinct from old.rfid_code then
    raise exception 'rfid_keys.rfid_code is immutable (key %)', old.id
      using errcode = 'check_violation';
  end if;
  if new.key_request_item_id is distinct from old.key_request_item_id then
    raise exception 'rfid_keys.key_request_item_id is immutable (key %)', old.id
      using errcode = 'check_violation';
  end if;
  if new.order_item_id is distinct from old.order_item_id then
    raise exception 'rfid_keys.order_item_id is immutable (key %)', old.id
      using errcode = 'check_violation';
  end if;
  -- Los campos de pickup, una vez seteados, no se pueden cambiar:
  -- esa es la evidencia del retiro.
  if old.picked_up_at is not null then
    if new.picked_up_at            is distinct from old.picked_up_at
       or new.picked_up_by_name    is distinct from old.picked_up_by_name
       or new.picked_up_by_surname is distinct from old.picked_up_by_surname
       or new.picked_up_by_dni     is distinct from old.picked_up_by_dni
       or new.delivered_by_staff_id is distinct from old.delivered_by_staff_id then
      raise exception 'rfid_keys pickup fields are immutable once picked_up_at is set (key %)', old.id
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;
