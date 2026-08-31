-- ============================================================
-- Migration: purge public.order_items legacy join from
--            resolve_equipment_installation + resolve_equipment_replacement
-- ============================================================
-- Discovery: after PR-3 dropped public.order_items, both RPCs kept a legacy
-- ELSE branch that joined public.stock_movements to public.order_items via
-- ticket_id, executed whenever the ticket had NO technical_order_item_id
-- (freestanding tickets). At runtime this raises
--   42P01: relation "public.order_items" does not exist
-- crashing every freestanding equipment_installation / equipment_replacement
-- resolution. Discovered by pgTAP scenario 092-E (test_092_resolve_rpcs_dual_fk.sql)
-- after the runner scaffold landed in PR-10.
--
-- Fix: remove the ELSE branch. When v_technical_order_item_id IS NULL, all
-- reserva-lookup vars stay NULL and the downstream `if v_product_id is not null`
-- block correctly skips stock movement inserts. Freestanding tickets resolve
-- without side effects, which matches the comment "No reserva → no stock
-- movement" already present in the RPC body.
-- ============================================================

create or replace function public.resolve_equipment_installation(
  p_ticket_id       uuid,
  p_serial          text,
  p_unit_id         uuid default null,
  p_note            text default null,
  p_actor_staff_id  uuid default null
) returns uuid
language plpgsql
security definer
set search_path = public, support, operations, identity
as $$
declare
  v_ticket_category          text;
  v_ticket_status            text;
  v_building_id              uuid;
  v_description              text;
  v_technical_order_item_id  uuid;
  v_equipment_id             uuid;
  v_product_id               uuid;
  v_quantity                 int;
  v_order_id                 uuid;
  v_order_item_id            uuid;
  v_order_kind               text;
  v_actor                    uuid;
begin
  v_actor := coalesce(p_actor_staff_id, identity.current_staff_id());

  if p_serial is null or length(trim(p_serial)) = 0 then
    raise exception 'resolve_equipment_installation: serial is required'
      using errcode = 'P0001';
  end if;

  select category, status, building_id, description, technical_order_item_id
    into v_ticket_category, v_ticket_status, v_building_id, v_description,
         v_technical_order_item_id
    from support.tickets
   where id = p_ticket_id
   for update;

  if v_ticket_category is null then
    raise exception 'resolve_equipment_installation: ticket % not found', p_ticket_id
      using errcode = 'P0001';
  end if;

  if v_ticket_category <> 'equipment_installation' then
    raise exception
      'resolve_equipment_installation: ticket % is not an equipment_installation (category: %)',
      p_ticket_id, v_ticket_category
      using errcode = 'P0001';
  end if;

  if v_ticket_status = 'resolved' then
    raise exception 'resolve_equipment_installation: ticket % is already resolved', p_ticket_id
      using errcode = 'P0001';
  end if;

  insert into operations.equipment (
    serial_number,
    building_id,
    description,
    status,
    notes
  ) values (
    trim(p_serial),
    v_building_id,
    coalesce(nullif(trim(v_description), ''),
             'Equipo instalado (ticket ' || p_ticket_id || ')'),
    'active',
    'Instalado desde ticket ' || p_ticket_id
      || case when p_unit_id is not null
              then ' — unidad ' || p_unit_id::text
              else '' end
  )
  returning id into v_equipment_id;

  update support.tickets
     set equipment_id = v_equipment_id
   where id = p_ticket_id;

  -- Locate the originating reserva only via the new dual-FK path. Freestanding
  -- tickets (no technical_order_item_id) have no reserva to consume and produce
  -- no stock movements.
  if v_technical_order_item_id is not null then
    select sm.order_item_id, sm.product_id, toi.order_id, toi.quantity,
           sm.order_kind
      into v_order_item_id, v_product_id, v_order_id, v_quantity, v_order_kind
      from public.stock_movements sm
      join public.technical_order_items toi on toi.id = sm.order_item_id
     where sm.order_item_id = v_technical_order_item_id
       and sm.type          = 'reserva'
       and sm.order_kind    = 'technical'
     limit 1;
  end if;

  if v_product_id is not null then
    insert into public.stock_movements (
      product_id, type, quantity, note, order_id, order_item_id,
      order_kind, ticket_id, created_by
    ) values (
      v_product_id, 'egreso_instalacion', -v_quantity,
      'Egreso por instalación de equipo (ticket ' || p_ticket_id || ')',
      v_order_id, v_order_item_id, v_order_kind, p_ticket_id, v_actor
    );

    insert into public.stock_movements (
      product_id, type, quantity, note, order_id, order_item_id,
      order_kind, ticket_id, created_by
    ) values (
      v_product_id, 'liberacion_reserva', v_quantity,
      'Liberación de reserva al instalar equipo (ticket ' || p_ticket_id || ')',
      v_order_id, v_order_item_id, v_order_kind, p_ticket_id, v_actor
    );
  end if;

  update support.tickets
     set status = 'in_progress'
   where id = p_ticket_id
     and status = 'open';

  update support.tickets
     set status               = 'resolved',
         resolved_by_staff_id = v_actor,
         resolution_notes     = coalesce(
           nullif(trim(coalesce(p_note, '')), ''),
           'Equipo instalado (serial ' || trim(p_serial) || ')'
         )
   where id = p_ticket_id
     and status = 'in_progress';

  return v_equipment_id;
end;
$$;

create or replace function public.resolve_equipment_replacement(
  p_ticket_id         uuid,
  p_old_equipment_id  uuid,
  p_new_serial        text,
  p_new_model         text,
  p_new_description   text default null,
  p_note              text default null,
  p_actor_staff_id    uuid default null
) returns uuid
language plpgsql
security definer
set search_path = public, support, operations, identity
as $$
declare
  v_ticket_category          text;
  v_ticket_status            text;
  v_technical_order_item_id  uuid;
  v_new_equipment_id         uuid;
  v_product_id               uuid;
  v_quantity                 int;
  v_order_id                 uuid;
  v_order_item_id            uuid;
  v_order_kind               text;
  v_actor                    uuid;
begin
  v_actor := coalesce(p_actor_staff_id, identity.current_staff_id());

  if p_new_serial is null or length(trim(p_new_serial)) = 0 then
    raise exception 'resolve_equipment_replacement: new serial is required'
      using errcode = 'P0001';
  end if;

  select category, status, technical_order_item_id
    into v_ticket_category, v_ticket_status, v_technical_order_item_id
    from support.tickets
   where id = p_ticket_id
   for update;

  if v_ticket_category is null then
    raise exception 'resolve_equipment_replacement: ticket % not found', p_ticket_id
      using errcode = 'P0001';
  end if;

  if v_ticket_category <> 'equipment_replacement' then
    raise exception
      'resolve_equipment_replacement: ticket % is not equipment_replacement (category: %)',
      p_ticket_id, v_ticket_category
      using errcode = 'P0001';
  end if;

  if v_ticket_status = 'resolved' then
    raise exception 'resolve_equipment_replacement: ticket % is already resolved', p_ticket_id
      using errcode = 'P0001';
  end if;

  v_new_equipment_id := operations.replace_equipment(
    p_old_equipment_id,
    trim(p_new_serial),
    p_new_model,
    coalesce(p_new_description, ''),
    null,
    'Replaced via ticket ' || p_ticket_id,
    v_actor
  );

  -- Same rationale as resolve_equipment_installation: only the dual-FK path
  -- remains. Freestanding tickets produce no stock movements.
  if v_technical_order_item_id is not null then
    select sm.order_item_id, sm.product_id, toi.order_id, toi.quantity,
           sm.order_kind
      into v_order_item_id, v_product_id, v_order_id, v_quantity, v_order_kind
      from public.stock_movements sm
      join public.technical_order_items toi on toi.id = sm.order_item_id
     where sm.order_item_id = v_technical_order_item_id
       and sm.type          = 'reserva'
       and sm.order_kind    = 'technical'
     limit 1;
  end if;

  if v_product_id is not null then
    insert into public.stock_movements (
      product_id, type, quantity, note, order_id, order_item_id,
      order_kind, ticket_id, created_by
    ) values (
      v_product_id, 'egreso_reemplazo', -v_quantity,
      'Egreso por reemplazo de equipo (ticket ' || p_ticket_id || ')',
      v_order_id, v_order_item_id, v_order_kind, p_ticket_id, v_actor
    );

    insert into public.stock_movements (
      product_id, type, quantity, note, order_id, order_item_id,
      order_kind, ticket_id, created_by
    ) values (
      v_product_id, 'liberacion_reserva', v_quantity,
      'Liberación de reserva al reemplazar equipo (ticket ' || p_ticket_id || ')',
      v_order_id, v_order_item_id, v_order_kind, p_ticket_id, v_actor
    );
  end if;

  update support.tickets
     set equipment_id = v_new_equipment_id
   where id = p_ticket_id;

  update support.tickets
     set status = 'in_progress'
   where id = p_ticket_id
     and status = 'open';

  update support.tickets
     set status               = 'resolved',
         resolved_by_staff_id = v_actor,
         resolution_notes     = coalesce(
           nullif(trim(coalesce(p_note, '')), ''),
           'Equipo reemplazado (serial ' || trim(p_new_serial) || ')'
         )
   where id = p_ticket_id
     and status = 'in_progress';

  return v_new_equipment_id;
end;
$$;

grant execute on function public.resolve_equipment_installation(uuid, text, uuid, text, uuid)
  to authenticated;

grant execute on function public.resolve_equipment_replacement(uuid, uuid, text, text, text, text, uuid)
  to authenticated;
