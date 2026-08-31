-- ============================================================
-- RLS real — reemplaza las placeholder policies con reglas por rol
-- ============================================================
-- Modelo actual de auth: solo Vitalock staff. Dos roles activos:
--   * admin      — full access a todo.
--   * installer  — SELECT en el mundo operativo + UPDATE limitado en su
--                  worklist. Nada de sales.
--
-- Cuando se agreguen usuarios de administración o particulares (opción B/C
-- del roadmap), estas policies se extienden; los nombres están armados para
-- que sea claro dónde plugar la lógica adicional.

------------------------------------------------------------
-- 1) Drop de todas las placeholder policies previas
------------------------------------------------------------
drop policy if exists "authenticated_all_administrations"      on public.administrations;
drop policy if exists "authenticated_all_buildings"            on public.buildings;
drop policy if exists "authenticated_all_units"                on public.units;
drop policy if exists "authenticated_all_rfid_keys"            on public.rfid_keys;
drop policy if exists "authenticated_all_staff"                on identity.staff;
drop policy if exists "authenticated_all_equipment"            on operations.equipment;
drop policy if exists "authenticated_all_key_authorizations"   on operations.key_authorizations;
drop policy if exists "authenticated_all_key_requests"         on sales.key_requests;
drop policy if exists "authenticated_all_key_request_items"    on sales.key_request_items;
drop policy if exists "authenticated_all_products"             on sales.products;
drop policy if exists "authenticated_all_quotes"               on sales.quotes;
drop policy if exists "authenticated_all_quote_items"          on sales.quote_items;
drop policy if exists "authenticated_all_bills"                on sales.bills;
drop policy if exists "authenticated_all_bill_items"           on sales.bill_items;
drop policy if exists "authenticated_all_payments"             on sales.payments;
drop policy if exists "authenticated_all_recurring_charges"    on sales.recurring_charges;

------------------------------------------------------------
-- 2) Policies para ADMIN — full access a todo (patrón repetido)
------------------------------------------------------------
create policy admin_all_administrations       on public.administrations       for all to authenticated using (identity.is_admin()) with check (identity.is_admin());
create policy admin_all_buildings             on public.buildings             for all to authenticated using (identity.is_admin()) with check (identity.is_admin());
create policy admin_all_units                 on public.units                 for all to authenticated using (identity.is_admin()) with check (identity.is_admin());
create policy admin_all_rfid_keys             on public.rfid_keys             for all to authenticated using (identity.is_admin()) with check (identity.is_admin());
create policy admin_all_staff                 on identity.staff               for all to authenticated using (identity.is_admin()) with check (identity.is_admin());
create policy admin_all_equipment             on operations.equipment         for all to authenticated using (identity.is_admin()) with check (identity.is_admin());
create policy admin_all_key_authorizations    on operations.key_authorizations for all to authenticated using (identity.is_admin()) with check (identity.is_admin());
create policy admin_all_key_requests          on sales.key_requests           for all to authenticated using (identity.is_admin()) with check (identity.is_admin());
create policy admin_all_key_request_items     on sales.key_request_items      for all to authenticated using (identity.is_admin()) with check (identity.is_admin());
create policy admin_all_products              on sales.products               for all to authenticated using (identity.is_admin()) with check (identity.is_admin());
create policy admin_all_quotes                on sales.quotes                 for all to authenticated using (identity.is_admin()) with check (identity.is_admin());
create policy admin_all_quote_items           on sales.quote_items            for all to authenticated using (identity.is_admin()) with check (identity.is_admin());
create policy admin_all_bills                 on sales.bills                  for all to authenticated using (identity.is_admin()) with check (identity.is_admin());
create policy admin_all_bill_items            on sales.bill_items             for all to authenticated using (identity.is_admin()) with check (identity.is_admin());
create policy admin_all_payments              on sales.payments               for all to authenticated using (identity.is_admin()) with check (identity.is_admin());
create policy admin_all_recurring_charges     on sales.recurring_charges      for all to authenticated using (identity.is_admin()) with check (identity.is_admin());
create policy admin_all_tickets               on support.tickets              for all to authenticated using (identity.is_admin()) with check (identity.is_admin());
create policy admin_all_ticket_comments       on support.ticket_comments      for all to authenticated using (identity.is_admin()) with check (identity.is_admin());

------------------------------------------------------------
-- 3) Policies para INSTALLER
------------------------------------------------------------
-- Contexto operativo — SELECT en todo lo que necesita ver para hacer su
-- trabajo. No ve sales.
create policy installer_read_administrations   on public.administrations       for select to authenticated using (identity.is_installer());
create policy installer_read_buildings         on public.buildings             for select to authenticated using (identity.is_installer());
create policy installer_read_units             on public.units                 for select to authenticated using (identity.is_installer());
create policy installer_read_rfid_keys         on public.rfid_keys             for select to authenticated using (identity.is_installer());
create policy installer_read_staff             on identity.staff               for select to authenticated using (identity.is_installer());
create policy installer_read_equipment         on operations.equipment         for select to authenticated using (identity.is_installer());

-- Worklist principal: key_authorizations.
-- SELECT en todas, UPDATE limitado (rfid_key_id/equipment_id ya son inmutables
-- por trigger existente; el installer puede tocar sync_state y campos de
-- auditoría, nada más).
create policy installer_read_key_authorizations    on operations.key_authorizations for select to authenticated using (identity.is_installer());
create policy installer_update_key_authorizations  on operations.key_authorizations for update to authenticated using (identity.is_installer()) with check (identity.is_installer());

-- Tickets: SELECT + UPDATE solo los asignados a él.
create policy installer_read_own_tickets
  on support.tickets
  for select to authenticated
  using (identity.is_installer() and assigned_to_staff_id = identity.current_staff_id());

create policy installer_update_own_tickets
  on support.tickets
  for update to authenticated
  using (identity.is_installer() and assigned_to_staff_id = identity.current_staff_id())
  with check (identity.is_installer() and assigned_to_staff_id = identity.current_staff_id());

-- Comentarios en los tickets que puede ver.
create policy installer_read_comments
  on support.ticket_comments
  for select to authenticated
  using (identity.is_installer()
         and exists (
           select 1 from support.tickets t
            where t.id = ticket_id
              and t.assigned_to_staff_id = identity.current_staff_id()
         ));

create policy installer_insert_comments
  on support.ticket_comments
  for insert to authenticated
  with check (identity.is_installer()
              and author_staff_id = identity.current_staff_id()
              and exists (
                select 1 from support.tickets t
                 where t.id = ticket_id
                   and t.assigned_to_staff_id = identity.current_staff_id()
              ));

------------------------------------------------------------
-- 4) Restricciones a nivel columna via triggers
------------------------------------------------------------
-- El installer no puede reasignar tickets ni modificar metadata "de admin".
-- Solo puede tocar: status, resolution_notes, notes, resolved_by_staff_id.
create or replace function support.enforce_installer_ticket_column_restrictions()
returns trigger language plpgsql as $$
declare
  v_role text := identity.current_staff_role();
begin
  if v_role = 'installer' then
    if new.assigned_to_staff_id is distinct from old.assigned_to_staff_id then
      raise exception 'installer cannot reassign tickets'
        using errcode = 'insufficient_privilege';
    end if;
    if new.unit_id is distinct from old.unit_id
       or new.equipment_id is distinct from old.equipment_id
       or new.description is distinct from old.description
       or new.related_bill_id is distinct from old.related_bill_id
       or new.related_key_request_id is distinct from old.related_key_request_id then
      raise exception 'installer cannot modify ticket metadata (unit, equipment, description, related_*)'
        using errcode = 'insufficient_privilege';
    end if;
    if new.cancellation_reason is distinct from old.cancellation_reason then
      raise exception 'installer cannot cancel tickets (admin only)'
        using errcode = 'insufficient_privilege';
    end if;
  end if;
  return new;
end;
$$;

create trigger tickets_enforce_installer_columns
before update on support.tickets
for each row execute function support.enforce_installer_ticket_column_restrictions();

------------------------------------------------------------
-- 5) Notas para el futuro (cuando se agreguen usuarios no-staff)
------------------------------------------------------------
comment on function identity.is_admin is
  'Marker: cuando se agreguen usuarios de administración/particulares, esta '
  'función NO debe volverse true para ellos. La extensión debería agregar '
  'is_admin_user(admin_id) y policies adicionales.';
