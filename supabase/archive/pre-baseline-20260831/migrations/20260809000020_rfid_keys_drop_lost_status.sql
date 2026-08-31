-- Remove 'lost' from rfid_keys.status — product decision: a key is either
-- active or disabled, "lost" is a special case of disabled.

update public.rfid_keys
   set status = 'disabled',
       deactivated_at = coalesce(deactivated_at, now())
 where status = 'lost';

alter table public.rfid_keys
  drop constraint rfid_keys_status_check;

alter table public.rfid_keys
  add constraint rfid_keys_status_check
  check (status = any (array['active'::text, 'disabled'::text]));
