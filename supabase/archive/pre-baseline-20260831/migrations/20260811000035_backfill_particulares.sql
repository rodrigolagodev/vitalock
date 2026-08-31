-- ============================================================
-- Backfill particulares from historical orders
-- ============================================================
-- Creates particulares rows from legacy flat order data, best-effort:
--   * unit inferred via order_items.produced_key_id → rfid_keys.unit_id
--   * DNI dedupe keeps the FIRST row per DNI (distinct on, ordered by
--     created_at then unit_id for determinism)
--   * seed DNI 20345678 skipped (administration key-request pickup, not a
--     particular)
--   * on conflict do nothing — covers dni AND unit_id unique violations
--     (unit-conflict rows silently skipped, stay unlinked)
-- Then links orders by DNI match only; orders whose unit could not be
-- inferred keep particular_id NULL.

insert into public.particulares (unit_id, dni, full_name, phone, email)
select distinct on (o.particular_dni) rk.unit_id, o.particular_dni,
       o.particular_full_name, o.particular_phone, o.particular_email
  from public.orders o
  join public.order_items oi on oi.order_id = o.id
                            and oi.item_type = 'key'
                            and oi.produced_key_id is not null
  join public.rfid_keys rk on rk.id = oi.produced_key_id
                          and rk.unit_id is not null
 where o.client_type = 'particular'
   and o.particular_dni is not null
   and o.particular_dni <> '20345678'
 order by o.particular_dni, o.created_at, rk.unit_id
on conflict do nothing;

update public.orders o
   set particular_id = p.id
  from public.particulares p
 where o.client_type = 'particular'
   and o.particular_id is null
   and o.particular_dni = p.dni;
