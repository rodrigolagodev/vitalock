-- Auto-create a support.tickets row (aka Tarea) when an order_item of type
-- 'maintenance' or 'installation' is inserted. Bridges the ordenes flow
-- with the installer worklist / admin tareas view.
--
-- Skipped when:
--   - item_type is 'key' (admin configures the key manually)
--   - item_type is 'equipment' (stock/inventory concern, no work ticket yet)
--   - parent order is for a particular client (no administration_id — ticket
--     requires one). Admin can manually convert to a tarea from the UI.
--   - order_item.building_id is null (support.tickets requires building_id).

create or replace function public.order_items_create_tarea()
returns trigger
language plpgsql
security definer
set search_path = public, support
as $$
declare
  v_admin_id uuid;
begin
  if new.item_type not in ('maintenance', 'installation') then
    return new;
  end if;

  select administration_id into v_admin_id
    from public.orders where id = new.order_id;

  if v_admin_id is null then
    return new;  -- particular orders: skip
  end if;

  if new.building_id is null then
    return new;
  end if;

  insert into support.tickets (
    administration_id, building_id, category, description, status,
    equipment_id, notes
  ) values (
    v_admin_id,
    new.building_id,
    new.item_type,
    coalesce(nullif(trim(new.description), ''),
             'Item de orden (' || new.item_type || ')'),
    'open',
    new.equipment_id,
    'Generado automáticamente desde order_item ' || new.id::text
  );

  return new;
end;
$$;

drop trigger if exists order_items_create_tarea_trigger on public.order_items;

create trigger order_items_create_tarea_trigger
after insert on public.order_items
for each row execute function public.order_items_create_tarea();
