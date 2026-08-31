-- Fix: previous migration referenced new.equipment_id which does not exist
-- on order_items (only key items produce keys; equipment_id lives elsewhere).

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
    return new;
  end if;

  if new.building_id is null then
    return new;
  end if;

  insert into support.tickets (
    administration_id, building_id, category, description, status, notes
  ) values (
    v_admin_id,
    new.building_id,
    new.item_type,
    coalesce(nullif(trim(new.description), ''),
             'Item de orden (' || new.item_type || ')'),
    'open',
    'Generado automáticamente desde order_item ' || new.id::text
  );

  return new;
end;
$$;
