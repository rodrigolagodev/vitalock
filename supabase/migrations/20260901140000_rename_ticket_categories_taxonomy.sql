-- rename_ticket_categories_taxonomy
--
-- Purpose: rename support.tickets.category and technical_order_items.item_type
-- to a uniform verb_object naming convention:
--   installation/equipment_installation → install_equipment
--   equipment_replacement               → replace_equipment
--   equipment_update                    → update_equipment
--   maintenance                         → maintain_equipment
--
-- Dead categories (key_configuration, key_installation) are removed from the
-- CHECK constraint and the defensive trigger is dropped (redundant).
--
-- technical_order_items.item_type collapses from 4 values to 3:
--   install_equipment, replace_equipment, maintain_equipment
--
-- All function bodies sourced verbatim from latest versions:
--   configure_technical_ticket_equipment, resolve_ticket
--     → 20260901120000_extend_installation_category_lifecycle.sql
--   all others → 20260831000000_baseline.sql
-- Only category/item_type literal strings are swapped; no logic changes.
--
-- Runs atomically; rollback on failure is automatic.

-- ============================================================================
-- Step 1: Pre-migration counts (informational)
-- ============================================================================

DO $$
DECLARE
  v_maintenance            bigint;
  v_installation           bigint;
  v_equipment_installation bigint;
  v_equipment_replacement  bigint;
  v_equipment_update       bigint;
  v_key_configuration      bigint;
  v_key_installation       bigint;
BEGIN
  SELECT count(*) INTO v_maintenance            FROM support.tickets WHERE category = 'maintenance';
  SELECT count(*) INTO v_installation           FROM support.tickets WHERE category = 'installation';
  SELECT count(*) INTO v_equipment_installation FROM support.tickets WHERE category = 'equipment_installation';
  SELECT count(*) INTO v_equipment_replacement  FROM support.tickets WHERE category = 'equipment_replacement';
  SELECT count(*) INTO v_equipment_update       FROM support.tickets WHERE category = 'equipment_update';
  SELECT count(*) INTO v_key_configuration      FROM support.tickets WHERE category = 'key_configuration';
  SELECT count(*) INTO v_key_installation       FROM support.tickets WHERE category = 'key_installation';

  RAISE NOTICE 'Pre-migration category counts: maintenance=%, installation=%, equipment_installation=%, equipment_replacement=%, equipment_update=%, key_configuration=%, key_installation=%',
    v_maintenance, v_installation, v_equipment_installation,
    v_equipment_replacement, v_equipment_update,
    v_key_configuration, v_key_installation;
END $$;

-- ============================================================================
-- Step 2: Disable triggers to bypass immutability guard during data rename
-- ============================================================================

ALTER TABLE support.tickets DISABLE TRIGGER ALL;

-- ============================================================================
-- Step 3: Rename all 5 live category values to new names
-- ============================================================================

UPDATE support.tickets
   SET category = CASE category
                    WHEN 'installation'          THEN 'install_equipment'
                    WHEN 'equipment_installation' THEN 'install_equipment'
                    WHEN 'equipment_replacement'  THEN 'replace_equipment'
                    WHEN 'equipment_update'       THEN 'update_equipment'
                    WHEN 'maintenance'            THEN 'maintain_equipment'
                    ELSE category
                  END
 WHERE category IN (
   'installation', 'equipment_installation',
   'equipment_replacement', 'equipment_update', 'maintenance'
 );

-- ============================================================================
-- Step 4: Re-enable triggers (restores immutability guard)
-- ============================================================================

ALTER TABLE support.tickets ENABLE TRIGGER ALL;

-- ============================================================================
-- Step 5: Guard assertion — no row with old category values remains
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM support.tickets
     WHERE category NOT IN (
       'install_equipment', 'replace_equipment',
       'update_equipment', 'maintain_equipment',
       'key_configuration', 'key_installation'   -- still in CHECK; removed below
     )
  ) THEN
    RAISE EXCEPTION 'ticket-taxonomy-cleanup: rows with old category values remain after data rename — aborting';
  END IF;
END $$;

-- ============================================================================
-- Step 6: Drop old CHECK on support.tickets.category
-- ============================================================================

ALTER TABLE support.tickets
  DROP CONSTRAINT IF EXISTS tickets_category_check;

-- ============================================================================
-- Step 7: Add new 4-value CHECK on support.tickets.category
-- ============================================================================

ALTER TABLE support.tickets
  ADD CONSTRAINT tickets_category_check
  CHECK (category IN ('install_equipment', 'replace_equipment', 'update_equipment', 'maintain_equipment'));

-- ============================================================================
-- Step 8: Add tickets_equipment_required CHECK (Decision 5)
-- Ensures standalone install/replace/update tickets cannot be created without
-- a linked technical_order_item (DB-level defense; UI already restricts this).
-- ============================================================================

ALTER TABLE support.tickets
  ADD CONSTRAINT tickets_equipment_required
  CHECK (technical_order_item_id IS NOT NULL OR category = 'maintain_equipment');

-- ============================================================================
-- Step 9: Rename technical_order_items.item_type — drop old CHECK, add new
-- (No immutability trigger on this column; plain UPDATE suffices if rows exist.)
-- ============================================================================

UPDATE public.technical_order_items
   SET item_type = CASE item_type
                     WHEN 'equipment'            THEN 'install_equipment'
                     WHEN 'installation'         THEN 'install_equipment'
                     WHEN 'equipment_replacement' THEN 'replace_equipment'
                     WHEN 'maintenance'           THEN 'maintain_equipment'
                     ELSE item_type
                   END
 WHERE item_type IN ('equipment', 'installation', 'equipment_replacement', 'maintenance');

ALTER TABLE public.technical_order_items
  DROP CONSTRAINT IF EXISTS technical_order_items_item_type_check;

ALTER TABLE public.technical_order_items
  ADD CONSTRAINT technical_order_items_item_type_check
  CHECK (item_type IN ('install_equipment', 'replace_equipment', 'maintain_equipment'));

-- ============================================================================
-- Step 10: Drop tickets_reject_key_installation_inserts trigger + function
-- (Redundant now that key_installation is removed from the CHECK constraint.)
-- ============================================================================

DROP TRIGGER IF EXISTS tickets_reject_key_installation_inserts ON support.tickets;
DROP FUNCTION IF EXISTS support.tickets_reject_key_installation_inserts();

-- ============================================================================
-- Step 11: CREATE OR REPLACE trigger functions with new category names
-- Source: 20260831000000_baseline.sql — verbatim bodies, literals swapped.
-- ============================================================================

-- 11a. tickets_require_equipment_on_resolve
-- Old categories: maintenance, installation, equipment_installation,
--   equipment_replacement, equipment_update
-- New categories: maintain_equipment, install_equipment, replace_equipment,
--   update_equipment

CREATE OR REPLACE FUNCTION support.tickets_require_equipment_on_resolve() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  if new.status = 'resolved' and (old.status is distinct from 'resolved') then
    if new.category in (
      'maintain_equipment',
      'install_equipment',
      'replace_equipment',
      'update_equipment'
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

-- 11b. tickets_block_equipment_update_cancel_in_progress
-- Old: equipment_update → New: update_equipment

CREATE OR REPLACE FUNCTION support.tickets_block_equipment_update_cancel_in_progress() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  if new.status = 'cancelled'
     and old.status = 'in_progress'
     and old.category = 'update_equipment' then
    raise exception 'update_equipment in_progress tickets cannot be cancelled'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

-- ============================================================================
-- Step 12a: configure_technical_ticket_equipment
-- Source: 20260901120000_extend_installation_category_lifecycle.sql (verbatim)
-- Swaps: equipment_installation/installation/equipment_replacement
--   → install_equipment/replace_equipment
-- ============================================================================

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

  if v_category not in ('install_equipment', 'replace_equipment') then
    raise exception
      'configure_technical_ticket_equipment: ticket % category=% is not configurable (only install_equipment, replace_equipment)',
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

-- ============================================================================
-- Step 12b: resolve_ticket
-- Source: 20260901120000_extend_installation_category_lifecycle.sql (verbatim)
-- Swaps:
--   equipment_installation/installation/equipment_replacement → install_equipment/replace_equipment
-- ============================================================================

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
  if v_ticket.category in ('install_equipment', 'replace_equipment') then
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

    if v_ticket.category = 'install_equipment' then
      -- Freestanding installation ticket needs building_id to create equipment.
      if v_ticket.building_id is null then
        raise exception
          'resolve_ticket: install_equipment ticket % has no building_id',
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

    else -- replace_equipment
      if v_ticket.equipment_id is null then
        raise exception
          'resolve_ticket: replace_equipment ticket % has no old equipment_id',
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

-- ============================================================================
-- Step 12c: resolve_equipment_installation
-- Source: 20260831000000_baseline.sql (verbatim)
-- Swap: 'equipment_installation' → 'install_equipment'
-- ============================================================================

CREATE OR REPLACE FUNCTION public.resolve_equipment_installation(p_ticket_id uuid, p_serial text, p_unit_id uuid DEFAULT NULL::uuid, p_note text DEFAULT NULL::text, p_actor_staff_id uuid DEFAULT NULL::uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'support', 'operations', 'identity'
AS $$
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

  if v_ticket_category <> 'install_equipment' then
    raise exception
      'resolve_equipment_installation: ticket % is not an install_equipment (category: %)',
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

-- ============================================================================
-- Step 12c (cont.): resolve_equipment_replacement
-- Source: 20260831000000_baseline.sql (verbatim)
-- Swap: 'equipment_replacement' → 'replace_equipment'
-- ============================================================================

CREATE OR REPLACE FUNCTION public.resolve_equipment_replacement(p_ticket_id uuid, p_old_equipment_id uuid, p_new_serial text, p_new_model text DEFAULT NULL::text, p_new_description text DEFAULT NULL::text, p_note text DEFAULT NULL::text, p_actor_staff_id uuid DEFAULT NULL::uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'support', 'operations', 'identity'
AS $$
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
  v_item_product_id          uuid;
  v_product_name             text;
  v_effective_model          text;
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

  if v_ticket_category <> 'replace_equipment' then
    raise exception
      'resolve_equipment_replacement: ticket % is not replace_equipment (category: %)',
      p_ticket_id, v_ticket_category
      using errcode = 'P0001';
  end if;

  if v_ticket_status = 'resolved' then
    raise exception 'resolve_equipment_replacement: ticket % is already resolved', p_ticket_id
      using errcode = 'P0001';
  end if;

  -- Resolve the effective model: caller-supplied wins; otherwise fall back to
  -- the product name chosen at order time. Freestanding tickets (no
  -- technical_order_item) still require the caller to supply the model.
  v_effective_model := nullif(trim(coalesce(p_new_model, '')), '');
  if v_effective_model is null and v_technical_order_item_id is not null then
    select toi.product_id, p.name
      into v_item_product_id, v_product_name
      from public.technical_order_items toi
      left join public.products p on p.id = toi.product_id
     where toi.id = v_technical_order_item_id;

    v_effective_model := v_product_name;
  end if;

  if v_effective_model is null then
    raise exception 'resolve_equipment_replacement: new model is required (no product on ticket to fall back to)'
      using errcode = 'P0001';
  end if;

  v_new_equipment_id := operations.replace_equipment(
    p_old_equipment_id,
    trim(p_new_serial),
    v_effective_model,
    coalesce(p_new_description, ''),
    null,
    'Replaced via ticket ' || p_ticket_id,
    v_actor
  );

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

-- ============================================================================
-- Step 12c (cont.): resolve_equipment_update
-- Source: 20260831000000_baseline.sql (verbatim)
-- Swap: 'equipment_update' → 'update_equipment'
-- ============================================================================

CREATE OR REPLACE FUNCTION public.resolve_equipment_update(p_task_id uuid, p_actor_staff_id uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'support', 'operations', 'identity'
AS $$
declare
  v_ticket_id       uuid;
  v_ticket_category text;
  v_ticket_status   text;
  v_equipment_id    uuid;
  v_actor           uuid;
  v_key_id          uuid;
  v_key_status      text;
  v_auth_id         uuid;
  v_order_item_id   uuid;
  v_order_id        uuid;
  v_keys_to_activate uuid[];
  v_keys_to_disable  uuid[];
  v_skipped          uuid[] := '{}';
  -- New-path key_order_items advancement
  v_koi_id          uuid;
  v_koi_status      text;
begin
  v_actor := coalesce(p_actor_staff_id, identity.current_staff_id());

  -- Lock the task row and retrieve snapshot.
  select ticket_id, equipment_id, keys_to_activate, keys_to_disable
    into v_ticket_id, v_equipment_id, v_keys_to_activate, v_keys_to_disable
    from support.equipment_updates
   where id = p_task_id
   for update;

  if v_ticket_id is null then
    raise exception 'resolve_equipment_update: task % not found', p_task_id
      using errcode = 'P0001';
  end if;

  -- Lock and validate the ticket.
  select category, status
    into v_ticket_category, v_ticket_status
    from support.tickets
   where id = v_ticket_id
   for update;

  if v_ticket_category <> 'update_equipment' then
    raise exception 'resolve_equipment_update: ticket % is not update_equipment (category: %)',
      v_ticket_id, v_ticket_category
      using errcode = 'P0001';
  end if;

  if v_ticket_status = 'resolved' then
    raise exception 'resolve_equipment_update: task % is already resolved', p_task_id
      using errcode = 'P0001';
  end if;

  if v_ticket_status not in ('open', 'in_progress') then
    raise exception 'resolve_equipment_update: ticket % has unexpected status %',
      v_ticket_id, v_ticket_status
      using errcode = 'P0001';
  end if;

  -- Transition ticket: open → in_progress (no-op if already in_progress).
  update support.tickets set status = 'in_progress'
   where id = v_ticket_id and status = 'open';

  -- -------------------------------------------------------
  -- Process keys_to_activate: pending_installation → active
  -- -------------------------------------------------------
  foreach v_key_id in array v_keys_to_activate loop
    -- Lock the key row.
    select status, order_item_id
      into v_key_status, v_order_item_id
      from public.rfid_keys
     where id = v_key_id
     for update;

    if v_key_status = 'pending_installation' then
      -- 1. Advance key to active.
      update public.rfid_keys set status = 'active' where id = v_key_id;

      -- 2. Mint key_authorization. The key_authorizations_validate trigger
      --    forces sync_state='pending_install' on INSERT and checks key is active.
      --    We INSERT now that the key IS active, then immediately UPDATE to installed.
      insert into operations.key_authorizations (rfid_key_id, equipment_id)
        values (v_key_id, v_equipment_id)
        returning id into v_auth_id;

      -- 3. Advance authorization to installed in the same transaction.
      --    The equipment update IS the install act; no separate installer trip needed.
      update operations.key_authorizations
         set sync_state = 'installed'
       where id = v_auth_id;

      -- 4. Emit activated key_event.
      insert into public.key_events (key_id, event_type, note, actor_staff_id)
        values (v_key_id, 'activated', 'Activada por actualización de equipo ' || p_task_id, v_actor);

      -- 5. Legacy order_items branch: recompute order status if key linked via old path.
      if v_order_item_id is not null then
        select order_id into v_order_id from public.order_items where id = v_order_item_id;
        if v_order_id is not null then
          perform public.recompute_order_status(v_order_id);
        end if;
      end if;

      -- 6. New-path key_order_items branch: advance the item that produced this key.
      --    Applies only when key_order_items.produced_key_id = v_key_id and status = 'configured'.
      --    The key_order_items_recompute_order_status_trigger drives key_orders automatically.
      select id, status
        into v_koi_id, v_koi_status
        from public.key_order_items
       where produced_key_id = v_key_id;

      if found and v_koi_status = 'configured' then
        update public.key_order_items
           set status = 'installed'
         where id = v_koi_id;
      end if;

    else
      -- Stale key: collect id, emit snapshot_skipped event, do not abort.
      v_skipped := array_append(v_skipped, v_key_id);
      insert into public.key_events (key_id, event_type, note, actor_staff_id)
        values (v_key_id, 'snapshot_skipped',
                'Estado inesperado al resolver (esperado: pending_installation, actual: ' || coalesce(v_key_status, 'NULL') || ')',
                v_actor);
    end if;
  end loop;

  -- -------------------------------------------------------
  -- Process keys_to_disable: pending_disable → disabled
  -- -------------------------------------------------------
  foreach v_key_id in array v_keys_to_disable loop
    select status
      into v_key_status
      from public.rfid_keys
     where id = v_key_id
     for update;

    if v_key_status = 'pending_disable' then
      update public.rfid_keys set status = 'disabled' where id = v_key_id;

      -- Update existing key_authorizations to removed
      update operations.key_authorizations
         set sync_state          = 'pending_removal',
             removed_by_staff_id = v_actor
       where rfid_key_id = v_key_id
         and equipment_id = v_equipment_id
         and sync_state   = 'installed';

      update operations.key_authorizations
         set sync_state          = 'removed',
             removed_by_staff_id = v_actor
       where rfid_key_id = v_key_id
         and equipment_id = v_equipment_id
         and sync_state   = 'pending_removal';

      insert into public.key_events (key_id, event_type, note, actor_staff_id)
        values (v_key_id, 'disabled', 'Desactivada por actualización de equipo ' || p_task_id, v_actor);
    else
      -- Stale key: collect id, emit snapshot_skipped event, do not abort.
      v_skipped := array_append(v_skipped, v_key_id);
      insert into public.key_events (key_id, event_type, note, actor_staff_id)
        values (v_key_id, 'snapshot_skipped',
                'Estado inesperado al resolver (esperado: pending_disable, actual: ' || coalesce(v_key_status, 'NULL') || ')',
                v_actor);
    end if;
  end loop;

  -- -------------------------------------------------------
  -- Resolve ticket: in_progress → resolved
  -- -------------------------------------------------------
  update support.tickets
     set status               = 'resolved',
         resolved_by_staff_id = v_actor,
         resolution_notes     = 'Actualización de equipo resuelta (tarea ' || p_task_id || ')'
   where id = v_ticket_id
     and status = 'in_progress';

  -- Mark the task as resolved.
  update support.equipment_updates
     set resolved_at           = now(),
         resolved_by_staff_id  = v_actor
   where id = p_task_id;

  return jsonb_build_object(
    'ticket_id', v_ticket_id,
    'skipped_key_ids', to_jsonb(v_skipped)
  );
end;
$$;

-- ============================================================================
-- Step 12c (cont.): create_equipment_update
-- Source: 20260831000000_baseline.sql (verbatim)
-- Swap: 'equipment_update' → 'update_equipment'
-- ============================================================================

CREATE OR REPLACE FUNCTION public.create_equipment_update(p_equipment_id uuid, p_administration_id uuid, p_building_id uuid, p_description text, p_mdb_storage_path text, p_keys_to_activate uuid[] DEFAULT '{}'::uuid[], p_keys_to_disable uuid[] DEFAULT '{}'::uuid[], p_actor_staff_id uuid DEFAULT NULL::uuid, p_assigned_to_staff_id uuid DEFAULT NULL::uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'support', 'identity'
AS $$
declare
  v_ticket_id  uuid;
  v_task_id    uuid;
  v_actor      uuid;
begin
  v_actor := coalesce(p_actor_staff_id, identity.current_staff_id());

  if cardinality(p_keys_to_activate) + cardinality(p_keys_to_disable) = 0 then
    raise exception 'create_equipment_update: snapshot must include at least one key'
      using errcode = 'P0001';
  end if;

  insert into support.tickets (
    administration_id,
    building_id,
    equipment_id,
    category,
    description,
    status,
    assigned_to_staff_id
  ) values (
    p_administration_id,
    p_building_id,
    p_equipment_id,
    'update_equipment',
    p_description,
    'open',
    p_assigned_to_staff_id
  ) returning id into v_ticket_id;

  insert into support.equipment_updates (
    ticket_id,
    equipment_id,
    mdb_storage_path,
    keys_to_activate,
    keys_to_disable,
    created_by_staff_id
  ) values (
    v_ticket_id,
    p_equipment_id,
    p_mdb_storage_path,
    p_keys_to_activate,
    p_keys_to_disable,
    v_actor
  ) returning id into v_task_id;

  return v_task_id;
end;
$$;

-- ============================================================================
-- Step 12d: confirm_technical_order
-- Source: 20260831000000_baseline.sql (verbatim)
-- Swaps:
--   item_type validation: old 4-value set → new 3-value set
--   CASE mapping: collapsed to identity assignment (v_category := v_item.item_type)
--   product_id required: 'equipment'/'equipment_replacement' → 'install_equipment'/'replace_equipment'
--   product category check: same
--   intended_equipment_id: 'maintenance'/'equipment_replacement' → 'maintain_equipment'/'replace_equipment'
-- ============================================================================

CREATE OR REPLACE FUNCTION public.confirm_technical_order(p_order_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'support', 'extensions'
AS $$
declare
  v_order        record;
  v_item         record;
  v_item_count   int;
  v_category     text;
  v_admin_id     uuid;
  v_product_cat  text;
begin
  select id, status, administration_id
    into v_order
    from public.technical_orders
   where id = p_order_id
   for update;

  if not found then
    raise exception 'TECHNICAL_ORDER_NOT_FOUND: technical order % does not exist', p_order_id
      using errcode = 'P0001';
  end if;

  if v_order.status <> 'draft' then
    raise exception 'TECHNICAL_ORDER_NOT_DRAFT: technical order % is not in draft status (current: %)',
      p_order_id, v_order.status
      using errcode = 'P0001';
  end if;

  select count(*) into v_item_count
    from public.technical_order_items
   where order_id = p_order_id
     and status <> 'cancelled';

  if v_item_count = 0 then
    raise exception 'TECHNICAL_ORDER_EMPTY: technical order % has no active items', p_order_id
      using errcode = 'P0001';
  end if;

  for v_item in
    select id, item_type, product_id, intended_equipment_id,
           intended_replacement_equipment_id,
           intended_assignee_staff_id, building_id
      from public.technical_order_items
     where order_id = p_order_id
       and status <> 'cancelled'
  loop
    if v_item.intended_assignee_staff_id is null then
      raise exception 'TECHNICAL_ORDER_INTENT_REQUIRED: intended_assignee_staff_id required to confirm (order_id=%, item_id=%, item_type=%)',
        p_order_id, v_item.id, v_item.item_type
        using errcode = 'P0001';
    end if;

    if v_item.item_type in ('maintain_equipment', 'replace_equipment')
       and v_item.intended_equipment_id is null then
      raise exception 'TECHNICAL_ORDER_INTENT_REQUIRED: intended_equipment_id required for item_type=% (order_id=%, item_id=%)',
        v_item.item_type, p_order_id, v_item.id
        using errcode = 'P0001';
    end if;

    if v_item.item_type in ('install_equipment', 'replace_equipment')
       and v_item.product_id is null then
      raise exception 'TECHNICAL_ORDER_PRODUCT_REQUIRED: product_id required for item_type=% (order_id=%, item_id=%)',
        v_item.item_type, p_order_id, v_item.id
        using errcode = 'P0001';
    end if;

    if v_item.product_id is not null then
      select category into v_product_cat
        from public.products
       where id = v_item.product_id;

      if v_item.item_type in ('install_equipment', 'replace_equipment')
         and v_product_cat <> 'equipment' then
        raise exception 'TECHNICAL_ORDER_PRODUCT_CATEGORY_MISMATCH: product % has category % but item_type=% requires equipment',
          v_item.product_id, v_product_cat, v_item.item_type
          using errcode = 'P0001';
      end if;
    end if;
  end loop;

  update public.technical_orders
     set status = 'confirmed'
   where id = p_order_id;

  for v_item in
    select id, item_type, product_id, intended_equipment_id,
           intended_replacement_equipment_id,
           intended_assignee_staff_id, quantity, description, building_id
      from public.technical_order_items
     where order_id = p_order_id
       and status <> 'cancelled'
  loop
    -- Identity assignment: item_type IS the category (Decision 4)
    v_category := v_item.item_type;

    select b.administration_id
      into v_admin_id
      from public.buildings b
     where b.id = v_item.building_id;

    if v_admin_id is null then
      raise exception 'TECHNICAL_ORDER_BUILDING_NOT_FOUND: building % not found for item % (order_id=%)',
        v_item.building_id, v_item.id, p_order_id
        using errcode = 'P0001';
    end if;

    insert into support.tickets (
      administration_id,
      building_id,
      equipment_id,
      assigned_to_staff_id,
      category,
      description,
      status,
      notes,
      technical_order_item_id
    )
    values (
      v_admin_id,
      v_item.building_id,
      v_item.intended_equipment_id,
      v_item.intended_assignee_staff_id,
      v_category,
      coalesce(
        nullif(trim(v_item.description), ''),
        'Item de orden técnica (' || v_item.item_type || ')'
      ),
      'open',
      'Generado automáticamente desde technical_order_item ' || v_item.id::text,
      v_item.id
    );

    if v_item.product_id is not null then
      insert into public.stock_movements (
        product_id,
        type,
        quantity,
        note,
        order_id,
        order_item_id,
        order_kind
      )
      values (
        v_item.product_id,
        'reserva',
        -v_item.quantity,
        'Reserva de stock desde technical_order_item ' || v_item.id::text,
        p_order_id,
        v_item.id,
        'technical'
      )
      on conflict (order_item_id, type)
        where type = 'reserva' and order_item_id is not null
        do nothing;
    end if;
  end loop;
end;
$$;

-- ============================================================================
-- Step 12c (cont.): create_technical_order_with_items
-- Source: 20260831000000_baseline.sql (verbatim)
-- Swaps item_type validation: old 4-value set → new 3-value set
--   product_id required: 'equipment'/'equipment_replacement' → 'install_equipment'/'replace_equipment'
--   intended_equipment_id: 'maintenance'/'equipment_replacement' → 'maintain_equipment'/'replace_equipment'
--   product category check: same
-- Note: This function is the one referenced as add_technical_order_item in exploration.md
-- (lines 1887-1888 contain the item_type validation guard inside this function)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.create_technical_order_with_items(p_order jsonb, p_items jsonb[], p_confirm_immediately boolean DEFAULT true) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'support', 'extensions'
AS $$
declare
  v_order_id       uuid;
  v_client_type    text;
  v_particular_id  uuid;
  v_part_full_name text;
  v_part_dni       text;
  v_part_phone     text;
  v_part_email     text;
  v_item           jsonb;
  v_item_type      text;
  v_unit_price     numeric(12, 2);
  v_qty            int;
  v_building_id    uuid;
  v_product_id     uuid;
  v_product_cat    text;
begin
  v_client_type := p_order->>'client_type';

  if v_client_type = 'administration' then
    if (p_order->>'administration_id') is null then
      raise exception 'TECHNICAL_ORDER_CLIENT_INCONSISTENT: administration_id required when client_type=administration'
        using errcode = 'P0001';
    end if;

  elsif v_client_type = 'particular' then
    v_particular_id := coalesce(
      (p_order->>'particular_id')::uuid,
      (select id from public.particulares where dni = p_order->>'particular_dni')
    );

    if v_particular_id is null then
      raise exception 'TECHNICAL_ORDER_CLIENT_INCONSISTENT: particular_id required when client_type=particular'
        using errcode = 'P0001';
    end if;

    select full_name, dni, phone, email
      into v_part_full_name, v_part_dni, v_part_phone, v_part_email
      from public.particulares
     where id = v_particular_id;

    if v_part_full_name is null then
      raise exception 'TECHNICAL_ORDER_CLIENT_INCONSISTENT: particular % not found', v_particular_id
        using errcode = 'P0001';
    end if;

  else
    raise exception 'TECHNICAL_ORDER_CLIENT_INCONSISTENT: invalid client_type %', v_client_type
      using errcode = 'P0001';
  end if;

  if p_items is null or array_length(p_items, 1) = 0 then
    raise exception 'TECHNICAL_ORDER_EMPTY: at least one item is required'
      using errcode = 'P0001';
  end if;

  foreach v_item in array p_items loop
    v_item_type   := v_item->>'item_type';
    v_building_id := (v_item->>'building_id')::uuid;

    if v_building_id is null then
      raise exception 'TECHNICAL_ORDER_ITEM_BUILDING_REQUIRED: building_id is required for each item (item_type=%)', v_item_type
        using errcode = 'P0001';
    end if;

    if v_item_type not in ('install_equipment', 'maintain_equipment', 'replace_equipment') then
      raise exception 'TECHNICAL_ORDER_INVALID_ITEM_TYPE: item_type must be one of install_equipment/maintain_equipment/replace_equipment (got %)', v_item_type
        using errcode = 'P0001';
    end if;

    v_unit_price := nullif(v_item->>'unit_price', '')::numeric(12, 2);
    if v_unit_price is null or v_unit_price <= 0 then
      raise exception 'TECHNICAL_ORDER_PRICE_REQUIRED: unit_price > 0 is required for all items (item_type=%)', v_item_type
        using errcode = 'P0001';
    end if;

    v_qty := coalesce((v_item->>'quantity')::int, 1);
    if v_qty < 1 then
      raise exception 'TECHNICAL_ORDER_INVALID_QUANTITY: quantity must be >= 1'
        using errcode = 'P0001';
    end if;

    if p_confirm_immediately then
      if (v_item->>'intended_assignee_staff_id') is null then
        raise exception 'TECHNICAL_ORDER_INTENT_REQUIRED: intended_assignee_staff_id required for confirm (item_type=%)', v_item_type
          using errcode = 'P0001';
      end if;

      if v_item_type in ('maintain_equipment', 'replace_equipment')
         and (v_item->>'intended_equipment_id') is null then
        raise exception 'TECHNICAL_ORDER_INTENT_REQUIRED: intended_equipment_id required for confirm when item_type=% ', v_item_type
          using errcode = 'P0001';
      end if;

      -- product_id is required for install_equipment (installing new device from stock)
      -- and replace_equipment (picking the replacement unit from stock).
      if v_item_type in ('install_equipment', 'replace_equipment')
         and (v_item->>'product_id') is null then
        raise exception 'TECHNICAL_ORDER_PRODUCT_REQUIRED: product_id required for item_type=%', v_item_type
          using errcode = 'P0001';
      end if;
    end if;

    -- Category coherence: whenever product_id is provided, its category must
    -- match the item_type family. Enforced at create-time even in draft mode
    -- so bad picks fail immediately.
    v_product_id := (v_item->>'product_id')::uuid;
    if v_product_id is not null then
      select category into v_product_cat
        from public.products
       where id = v_product_id;

      if v_product_cat is null then
        raise exception 'TECHNICAL_ORDER_PRODUCT_NOT_FOUND: product % not found', v_product_id
          using errcode = 'P0001';
      end if;

      if v_item_type in ('install_equipment', 'replace_equipment')
         and v_product_cat <> 'equipment' then
        raise exception 'TECHNICAL_ORDER_PRODUCT_CATEGORY_MISMATCH: product % has category % but item_type=% requires equipment',
          v_product_id, v_product_cat, v_item_type
          using errcode = 'P0001';
      end if;
    end if;
  end loop;

  insert into public.technical_orders (
    client_type,
    administration_id,
    particular_id,
    particular_full_name,
    particular_dni,
    particular_phone,
    particular_email,
    notes,
    status
  )
  values (
    v_client_type,
    (p_order->>'administration_id')::uuid,
    v_particular_id,
    coalesce(nullif(trim(p_order->>'particular_full_name'), ''), v_part_full_name),
    coalesce(nullif(trim(p_order->>'particular_dni'), ''), v_part_dni),
    coalesce(nullif(trim(p_order->>'particular_phone'), ''), v_part_phone),
    coalesce(nullif(trim(p_order->>'particular_email'), ''), v_part_email),
    p_order->>'notes',
    'draft'
  )
  returning id into v_order_id;

  foreach v_item in array p_items loop
    insert into public.technical_order_items (
      order_id,
      item_type,
      quantity,
      description,
      unit_price,
      product_id,
      intended_equipment_id,
      intended_replacement_equipment_id,
      intended_assignee_staff_id,
      building_id,
      status
    )
    values (
      v_order_id,
      v_item->>'item_type',
      coalesce((v_item->>'quantity')::int, 1),
      v_item->>'description',
      nullif(v_item->>'unit_price', '')::numeric(12, 2),
      (v_item->>'product_id')::uuid,
      (v_item->>'intended_equipment_id')::uuid,
      (v_item->>'intended_replacement_equipment_id')::uuid,
      (v_item->>'intended_assignee_staff_id')::uuid,
      (v_item->>'building_id')::uuid,
      'pending'
    );
  end loop;

  if p_confirm_immediately then
    perform public.confirm_technical_order(v_order_id);
  end if;

  return v_order_id;
end;
$$;

-- ============================================================================
-- Step 13: Update column COMMENTs
-- ============================================================================

COMMENT ON COLUMN support.tickets.category IS
  'Ticket category: install_equipment (equipment installation via order), replace_equipment (equipment replacement via order), update_equipment (key/config update task), maintain_equipment (standalone maintenance — only category createable without a technical_order_item).';

COMMENT ON COLUMN public.technical_order_items.item_type IS
  'Item type: install_equipment (new device installation from stock), replace_equipment (device swap from stock), maintain_equipment (maintenance/key update work). Maps 1-to-1 to support.tickets.category.';

-- ============================================================================
-- Step 14: Post-migration assertion
-- ============================================================================

DO $$
DECLARE
  v_total_before bigint;
  v_total_after  bigint;
  v_old_count    bigint;
BEGIN
  -- Total rows should be preserved
  SELECT count(*) INTO v_total_after FROM support.tickets;

  -- Zero rows with old category values
  SELECT count(*) INTO v_old_count
    FROM support.tickets
   WHERE category NOT IN (
     'install_equipment', 'replace_equipment',
     'update_equipment', 'maintain_equipment'
   );

  IF v_old_count > 0 THEN
    RAISE EXCEPTION 'ticket-taxonomy-cleanup post-migration assertion FAILED: % rows retain old category values', v_old_count;
  END IF;

  -- Zero rows in technical_order_items with old item_type
  SELECT count(*) INTO v_old_count
    FROM public.technical_order_items
   WHERE item_type NOT IN ('install_equipment', 'replace_equipment', 'maintain_equipment');

  IF v_old_count > 0 THEN
    RAISE EXCEPTION 'ticket-taxonomy-cleanup post-migration assertion FAILED: % technical_order_items rows retain old item_type values', v_old_count;
  END IF;

  RAISE NOTICE 'ticket-taxonomy-cleanup: post-migration assertions PASSED. total tickets after=%', v_total_after;
END $$;
