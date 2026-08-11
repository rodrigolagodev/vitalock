-- ============================================================
-- Equipment assignment on technical tickets
-- ============================================================
-- (1) Adds 'equipment_replacement' as a first-class item_type + ticket
-- category, so the order form can distinguish "install a new device"
-- from "replace an existing one". The trigger that materializes the
-- ticket propagates the category.
-- (2) Requires tickets.equipment_id to be set before a technical ticket
-- (maintenance / installation / equipment_installation /
-- equipment_replacement) can transition to 'resolved'. Enforced by a
-- BEFORE UPDATE trigger.

------------------------------------------------------------
-- 1. Expand order_items.item_type + validation trigger.
------------------------------------------------------------
alter table public.order_items drop constraint order_items_item_type_check;
alter table public.order_items add constraint order_items_item_type_check
  check (item_type in (
    'key',
    'equipment',
    'maintenance',
    'installation',
    'equipment_replacement'
  ));

create or replace function public.order_items_validate_type()
returns trigger
language plpgsql
as $$
declare
  v_order_type text;
begin
  select order_type into v_order_type
    from public.orders where id = new.order_id;

  if v_order_type = 'keys' and new.item_type <> 'key' then
    raise exception
      'order_items: order type "keys" only allows item_type=key (got %)',
      new.item_type
      using errcode = 'check_violation';
  end if;

  if v_order_type = 'technical'
     and new.item_type not in (
       'equipment', 'maintenance', 'installation', 'equipment_replacement'
     ) then
    raise exception
      'order_items: order type "technical" only allows equipment/maintenance/installation/equipment_replacement (got %)',
      new.item_type
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

------------------------------------------------------------
-- 2. Expand support.tickets.category
------------------------------------------------------------
alter table support.tickets drop constraint tickets_category_check;
alter table support.tickets add constraint tickets_category_check
  check (category in (
    'maintenance',
    'installation',
    'key_configuration',
    'key_installation',
    'equipment_installation',
    'equipment_replacement'
  ));

------------------------------------------------------------
-- 3. order_items_create_tarea: map equipment_replacement → ticket
------------------------------------------------------------
create or replace function public.order_items_create_tarea()
returns trigger
language plpgsql
security definer
set search_path = public, support
as $$
declare
  v_admin_id  uuid;
  v_ticket_id uuid;
  v_category  text;
begin
  if new.item_type in ('maintenance', 'installation') then
    select administration_id into v_admin_id
      from public.orders where id = new.order_id;

    if v_admin_id is null then
      if new.building_id is not null then
        select administration_id into v_admin_id
          from public.buildings where id = new.building_id;
      end if;
    end if;

    if v_admin_id is null or new.building_id is null then
      return new;
    end if;

    insert into support.tickets (
      administration_id, building_id, category, description, status, notes,
      order_item_id
    ) values (
      v_admin_id,
      new.building_id,
      new.item_type,
      coalesce(nullif(trim(new.description), ''),
               'Item de orden (' || new.item_type || ')'),
      'open',
      'Generado automáticamente desde order_item ' || new.id::text,
      new.id
    );

    return new;
  end if;

  -- equipment_replacement: same shape as equipment_installation but distinct
  -- category so the detail UI can offer the replacement flow.
  if new.item_type = 'equipment_replacement' then
    select o.administration_id
      into v_admin_id
      from public.orders o
     where o.id = new.order_id;

    if v_admin_id is null and new.building_id is not null then
      select administration_id into v_admin_id
        from public.buildings
       where id = new.building_id;
    end if;

    if new.building_id is not null and v_admin_id is not null then
      insert into support.tickets (
        administration_id, building_id, category, description, status, notes,
        order_item_id
      ) values (
        v_admin_id,
        new.building_id,
        'equipment_replacement',
        coalesce(nullif(trim(new.description), ''),
                 'Cambio de equipo'),
        'open',
        'Generado automáticamente desde order_item ' || new.id::text,
        new.id
      );
    end if;
    return new;
  end if;

  -- Stock-backed lines only: key / equipment.
  if new.item_type not in ('key', 'equipment') then
    return new;
  end if;

  if new.product_id is null then
    return new;
  end if;

  v_category := case new.item_type
                  when 'key'       then 'key_configuration'
                  when 'equipment' then 'equipment_installation'
                end;

  select o.administration_id
    into v_admin_id
    from public.orders o
   where o.id = new.order_id;

  if v_admin_id is null then
    select administration_id into v_admin_id
      from public.buildings
     where id = new.building_id;
  end if;

  if new.building_id is not null and v_admin_id is not null then
    insert into support.tickets (
      administration_id, building_id, category, description, status, notes,
      order_item_id
    ) values (
      v_admin_id,
      new.building_id,
      v_category,
      coalesce(nullif(trim(new.description), ''),
               'Item de orden (' || new.item_type || ')'),
      'open',
      'Generado automáticamente desde order_item ' || new.id::text,
      new.id
    )
    returning id into v_ticket_id;
  end if;

  insert into public.stock_movements (
    product_id, type, quantity, note, order_id, order_item_id, ticket_id
  ) values (
    new.product_id,
    'reserva',
    -new.quantity,
    'Reserva de stock desde order_item ' || new.id::text,
    new.order_id,
    new.id,
    v_ticket_id
  )
  on conflict (order_item_id, type)
    where type = 'reserva' and order_item_id is not null
    do nothing;

  return new;
end;
$$;

------------------------------------------------------------
-- 4. Technical resolve requires equipment_id
------------------------------------------------------------
create or replace function support.tickets_require_equipment_on_resolve()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'resolved' and (old.status is distinct from 'resolved') then
    if new.category in (
      'maintenance',
      'installation',
      'equipment_installation',
      'equipment_replacement'
    ) and new.equipment_id is null then
      raise exception
        'tickets: equipment_id required to resolve technical ticket (category=%)',
        new.category
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists tickets_require_equipment_on_resolve_trigger
  on support.tickets;
create trigger tickets_require_equipment_on_resolve_trigger
before update of status on support.tickets
for each row execute function support.tickets_require_equipment_on_resolve();
