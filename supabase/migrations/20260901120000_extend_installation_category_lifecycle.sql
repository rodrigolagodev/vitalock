-- extend_installation_category_lifecycle
--
-- Purpose: bring category='installation' to full parity with 'equipment_installation'
-- for the confirm → configure → resolve pipeline, closing four bugs rooted in a single
-- mapping gap (see sdd/technical-installation-stock-lifecycle proposal and design).
--
-- Contract: this migration introduces one new transaction-local GUC:
--   app.allow_resolve_equipment_id_write
-- The ONLY caller allowed to set this GUC is public.resolve_ticket, and only
-- around the single UPDATE that writes technical_order_items.intended_equipment_id
-- after creating operations.equipment. Any other caller (client code, other RPCs,
-- manual SQL) setting this GUC would silently subvert the technical_order_items
-- intent-immutability guarantee.
--
-- The trigger admits the bypass only when intended_equipment_id is the sole
-- intent column changing in the UPDATE — a second gate that narrows blast radius
-- even if the GUC leaks.
--
-- No schema DDL, no data migration, no new movement types, no new statuses.


-- ----------------------------------------------------------------------------
-- 1. technical_order_items_intent_immutable
--    Add the app.allow_resolve_equipment_id_write bypass branch (task 1.2).
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.technical_order_items_intent_immutable() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
AS $$
declare
  v_parent_status text;
  v_allow_resolve_equipment boolean := coalesce(
    current_setting('app.allow_resolve_equipment_id_write', true), 'false'
  ) = 'true';
begin
  -- Fast path: no intent columns changed.
  if new.intended_equipment_id is not distinct from old.intended_equipment_id
     and new.intended_assignee_staff_id is not distinct from old.intended_assignee_staff_id
     and new.intended_replacement_equipment_id is not distinct from old.intended_replacement_equipment_id
  then
    return new;
  end if;

  -- Narrow bypass: resolve_ticket writes intended_equipment_id after creating
  -- operations.equipment. Only intended_equipment_id may change under this flag;
  -- intended_assignee_staff_id and intended_replacement_equipment_id remain locked.
  if v_allow_resolve_equipment
     and new.intended_equipment_id is distinct from old.intended_equipment_id
     and new.intended_assignee_staff_id is not distinct from old.intended_assignee_staff_id
     and new.intended_replacement_equipment_id is not distinct from old.intended_replacement_equipment_id
  then
    return new;
  end if;

  select status into v_parent_status
    from public.technical_orders
   where id = new.order_id;

  if v_parent_status <> 'draft' then
    raise exception 'TECHNICAL_ORDER_ITEM_INTENT_LOCKED: intent columns (intended_equipment_id, intended_assignee_staff_id, intended_replacement_equipment_id) are immutable once the order leaves draft (order_id=%, status=%)',
      new.order_id, v_parent_status
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;


-- ----------------------------------------------------------------------------
-- 2. configure_technical_ticket_equipment
--    Extend category guard to include 'installation' (task 1.3).
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.configure_technical_ticket_equipment(p_ticket_id uuid, p_new_serial text, p_new_model text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'support', 'extensions'
AS $$
declare
  v_category                text;
  v_status                  text;
  v_technical_order_item_id uuid;
  v_effective_model         text;
  v_product_name            text;
begin
  if p_new_serial is null or length(trim(p_new_serial)) = 0 then
    raise exception 'configure_technical_ticket_equipment: new serial is required'
      using errcode = 'P0001';
  end if;

  select category, status, technical_order_item_id
    into v_category, v_status, v_technical_order_item_id
    from support.tickets
   where id = p_ticket_id
   for update;

  if v_category is null then
    raise exception 'configure_technical_ticket_equipment: ticket % not found', p_ticket_id
      using errcode = 'P0001';
  end if;

  if v_category not in ('equipment_installation', 'equipment_replacement', 'installation') then
    raise exception
      'configure_technical_ticket_equipment: ticket % category=% is not configurable (only equipment_installation, equipment_replacement, installation)',
      p_ticket_id, v_category
      using errcode = 'P0001';
  end if;

  if v_status not in ('open', 'in_progress') then
    raise exception
      'configure_technical_ticket_equipment: ticket % is not open/in_progress (current: %)',
      p_ticket_id, v_status
      using errcode = 'P0001';
  end if;

  -- Resolve effective model: caller wins, else product name from linked order item.
  v_effective_model := nullif(trim(coalesce(p_new_model, '')), '');
  if v_effective_model is null and v_technical_order_item_id is not null then
    select p.name
      into v_product_name
      from public.technical_order_items toi
      left join public.products p on p.id = toi.product_id
     where toi.id = v_technical_order_item_id;
    v_effective_model := v_product_name;
  end if;

  update support.tickets
     set pending_new_serial = trim(p_new_serial),
         pending_new_model  = v_effective_model
   where id = p_ticket_id;

  -- Transition open → in_progress if needed (idempotent when already in_progress).
  update support.tickets
     set status = 'in_progress'
   where id = p_ticket_id
     and status = 'open';
end;
$$;


-- ----------------------------------------------------------------------------
-- 3. resolve_ticket
--    Extend outer category guard to include 'installation';
--    extend inner freestanding-install branch to cover 'installation';
--    add intended_equipment_id write-back behind the GUC bypass (tasks 1.4).
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.resolve_ticket(p_ticket_id uuid, p_note text DEFAULT NULL::text, p_actor_staff_id uuid DEFAULT NULL::uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'support', 'operations', 'extensions'
AS $$
declare
  v_actor                   uuid;
  v_updated                 int := 0;
  v_rows                    int;
  v_ticket                  record;
  v_toi                     record;
  v_effective_model         text;
  v_new_equipment_id        uuid;
  v_stock_note              text;
begin
  v_actor := identity.current_staff_id();
  if v_actor is null then
    v_actor := p_actor_staff_id;
  end if;
  if v_actor is null then
    raise exception 'resolve_ticket: no authenticated staff' using errcode = 'P0001';
  end if;

  select id, category, status, building_id, equipment_id,
         technical_order_item_id, pending_new_serial, pending_new_model
    into v_ticket
    from support.tickets
   where id = p_ticket_id
   for update;

  if v_ticket.id is null then
    raise exception
      'resolve_ticket: ticket % cannot be resolved by this user (not found, already resolved/cancelled, or not assigned)',
      p_ticket_id
      using errcode = 'P0001';
  end if;

  -- Bail early if terminal.
  if v_ticket.status in ('resolved', 'cancelled') then
    raise exception
      'resolve_ticket: ticket % cannot be resolved by this user (not found, already resolved/cancelled, or not assigned)',
      p_ticket_id
      using errcode = 'P0001';
  end if;

  -- Category-specific side effects for equipment tickets. Runs BEFORE the
  -- status transitions so tickets_require_equipment_on_resolve sees a valid
  -- equipment_id at the resolved hop.
  if v_ticket.category in ('equipment_installation', 'equipment_replacement', 'installation') then
    if v_ticket.pending_new_serial is null
       or length(trim(v_ticket.pending_new_serial)) = 0 then
      raise exception
        'resolve_ticket: ticket % (%) requires configure_technical_ticket_equipment before resolve',
        p_ticket_id, v_ticket.category
        using errcode = 'P0001';
    end if;

    -- Flag lets tickets_enforce_installer_columns permit the equipment_id
    -- change we're about to make on the ticket. Transaction-scoped so it
    -- cannot leak into unrelated statements outside this resolve.
    perform set_config('app.allow_installer_equipment_swap', 'true', true);

    -- Read the linked technical_order_item to source product + quantity for
    -- stock movements and to fall back on product.name for the model.
    if v_ticket.technical_order_item_id is not null then
      select toi.id, toi.product_id, toi.quantity, toi.order_id, p.name as product_name
        into v_toi
        from public.technical_order_items toi
        left join public.products p on p.id = toi.product_id
       where toi.id = v_ticket.technical_order_item_id;
    end if;

    v_effective_model := coalesce(
      nullif(trim(coalesce(v_ticket.pending_new_model, '')), ''),
      v_toi.product_name
    );

    if v_effective_model is null then
      raise exception
        'resolve_ticket: ticket % has no model (neither pending_new_model nor linked product name)',
        p_ticket_id
        using errcode = 'P0001';
    end if;

    if v_ticket.category in ('equipment_installation', 'installation') then
      -- Freestanding installation ticket needs building_id to create equipment.
      if v_ticket.building_id is null then
        raise exception
          'resolve_ticket: equipment_installation ticket % has no building_id',
          p_ticket_id
          using errcode = 'P0001';
      end if;

      insert into operations.equipment (
        serial_number, model, building_id, description, status
      ) values (
        trim(v_ticket.pending_new_serial),
        v_effective_model,
        v_ticket.building_id,
        '',
        'active'
      )
      returning id into v_new_equipment_id;

      update support.tickets
         set equipment_id = v_new_equipment_id
       where id = p_ticket_id;

      -- Bypass technical_order_items_intent_immutable for the single write-back below.
      -- Transaction-local: cannot leak past this transaction; scoped to a single UPDATE
      -- statement targeting one order-item row.
      perform set_config('app.allow_resolve_equipment_id_write', 'true', true);

      update public.technical_order_items
         set intended_equipment_id = v_new_equipment_id
       where id = v_toi.id
         and v_toi.id is not null;

      -- Immediately clear so the flag does not apply to any sibling UPDATE in the
      -- same transaction (defense-in-depth; the `true` third arg already scopes it
      -- to this transaction, but explicit clearing tightens the window further).
      perform set_config('app.allow_resolve_equipment_id_write', 'false', true);

      if v_toi.product_id is not null then
        v_stock_note := 'Egreso por instalación (ticket ' || p_ticket_id || ')';
        insert into public.stock_movements (
          product_id, type, quantity, note, order_id, order_item_id,
          order_kind, ticket_id, created_by
        ) values (
          v_toi.product_id, 'egreso_instalacion', -v_toi.quantity, v_stock_note,
          v_toi.order_id, v_toi.id, 'technical', p_ticket_id, v_actor
        );
        insert into public.stock_movements (
          product_id, type, quantity, note, order_id, order_item_id,
          order_kind, ticket_id, created_by
        ) values (
          v_toi.product_id, 'liberacion_reserva', v_toi.quantity,
          'Liberación de reserva al instalar equipo (ticket ' || p_ticket_id || ')',
          v_toi.order_id, v_toi.id, 'technical', p_ticket_id, v_actor
        );
      end if;

    else -- equipment_replacement
      if v_ticket.equipment_id is null then
        raise exception
          'resolve_ticket: equipment_replacement ticket % has no old equipment_id',
          p_ticket_id
          using errcode = 'P0001';
      end if;

      v_new_equipment_id := operations.replace_equipment(
        v_ticket.equipment_id,
        trim(v_ticket.pending_new_serial),
        v_effective_model,
        '',
        null,
        'Replaced via ticket ' || p_ticket_id,
        v_actor,
        true  -- activate keys directly on the new device
      );

      update support.tickets
         set equipment_id = v_new_equipment_id
       where id = p_ticket_id;

      if v_toi.product_id is not null then
        v_stock_note := 'Egreso por reemplazo de equipo (ticket ' || p_ticket_id || ')';
        insert into public.stock_movements (
          product_id, type, quantity, note, order_id, order_item_id,
          order_kind, ticket_id, created_by
        ) values (
          v_toi.product_id, 'egreso_reemplazo', -v_toi.quantity, v_stock_note,
          v_toi.order_id, v_toi.id, 'technical', p_ticket_id, v_actor
        );
        insert into public.stock_movements (
          product_id, type, quantity, note, order_id, order_item_id,
          order_kind, ticket_id, created_by
        ) values (
          v_toi.product_id, 'liberacion_reserva', v_toi.quantity,
          'Liberación de reserva al reemplazar equipo (ticket ' || p_ticket_id || ')',
          v_toi.order_id, v_toi.id, 'technical', p_ticket_id, v_actor
        );
      end if;
    end if;
  end if;

  -- Standard two-step transition: open → in_progress → resolved. Idempotent
  -- when the ticket is already in_progress (configure step already ran).
  update support.tickets
     set status = 'in_progress'
   where id = p_ticket_id
     and status = 'open';
  get diagnostics v_updated = row_count;

  update support.tickets
     set status               = 'resolved',
         resolved_by_staff_id = v_actor,
         resolved_at          = coalesce(resolved_at, now()),
         resolution_notes     = coalesce(
           nullif(trim(coalesce(p_note, '')), ''),
           'Resuelta por ' || coalesce(
             (select s.full_name from identity.staff s where s.id = v_actor),
             'staff'
           )
         )
   where id = p_ticket_id
     and status = 'in_progress';
  get diagnostics v_rows = row_count;
  v_updated := v_updated + v_rows;

  if v_updated = 0 then
    raise exception
      'resolve_ticket: ticket % cannot be resolved by this user (not found, already resolved/cancelled, or not assigned)',
      p_ticket_id
      using errcode = 'P0001';
  end if;

  return p_ticket_id;
end;
$$;
