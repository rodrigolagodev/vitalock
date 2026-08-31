-- ============================================================
-- Migration: two-step configure + resolve for equipment tickets
-- ============================================================
-- Splits the previously atomic resolve_equipment_installation and
-- resolve_equipment_replacement flows into two operator-facing steps:
--
--   Step 1 — configure (public.configure_technical_ticket_equipment):
--     Operator (admin panel or installer app) loads the new serial (and
--     optional model) BEFORE physically working. Writes the intent into
--     support.tickets.pending_new_serial / pending_new_model and transitions
--     the ticket open → in_progress. No side effects on operations.equipment,
--     stock, or key authorizations at this stage.
--
--   Step 2 — resolve (public.resolve_ticket, extended):
--     Uses the generic "finalizar tarea" flow (checkbox + button). When the
--     ticket category is equipment_installation or equipment_replacement,
--     resolve_ticket now reads the pending intent and runs the atomic side
--     effects (create/replace equipment, key transfer, stock movements) as
--     part of the same transaction that resolves the ticket.
--
-- Key transfer semantics on replacement: keys go directly to sync_state
-- 'installed' on the new equipment (Option B). The installer syncs the new
-- device's local database at the moment of the physical replacement, so
-- there is no intermediate pending_install stage. This diverges from the
-- direct ReplaceEquipmentDialog path (unrelated to technical orders), which
-- keeps the pending_install → equipment_update train flow. The divergence
-- is opted-in via a new p_activate_keys_directly flag on
-- operations.replace_equipment.
--
-- The legacy atomic RPCs (resolve_equipment_installation and
-- resolve_equipment_replacement) are retained for backward compatibility
-- while Slice 3 (admin UI) removes AssignEquipmentDialog for these
-- categories. They will be dropped in a later migration.
--
-- Depends on:
--   * 20260811000052 (tickets_require_equipment_on_resolve trigger)
--   * 20260811000058 (public.resolve_ticket original body)
--   * 20260812000061 (atomic stock/work resolution baseline)
--   * 20260818000090 (recompute_technical_order_status cascade)
--   * 20260826000102 (technical_order_items product-based replacement)
-- ============================================================

-- -------------------------------------------------------
-- 1) Schema: pending_new_serial / pending_new_model on tickets
-- -------------------------------------------------------
alter table support.tickets
  add column if not exists pending_new_serial text,
  add column if not exists pending_new_model  text;

comment on column support.tickets.pending_new_serial is
  'Operator-supplied serial for the equipment to be created/swapped at resolve '
  'time. Only meaningful when category in (equipment_installation, '
  'equipment_replacement). Written by configure_technical_ticket_equipment.';
comment on column support.tickets.pending_new_model is
  'Optional operator-supplied model. When null at resolve time, defaults to '
  'the product name of the associated technical_order_item.';

-- -------------------------------------------------------
-- 2) Extend operations.replace_equipment with direct-active flag
-- -------------------------------------------------------
-- Adds p_activate_keys_directly. When true, the fresh authorizations on the
-- new equipment are immediately promoted pending_install → installed (still
-- satisfies the two-step state machine, in one transaction).
--
-- Old authorizations on the outgoing device are closed by the
-- equipment_close_authorizations_on_dead trigger (installed → pending_removal
-- → removed, pending_install → removed). This function only snapshots the
-- installed-key list BEFORE the status flip so that trigger cascade does not
-- erase the source rows before we copy them.
--
-- The previous 7-arg signature is dropped so callers do not encounter an
-- ambiguous overload at PL/pgSQL parse time. The redefined 8-arg version
-- keeps positional-arg compatibility (last arg has a default).
drop function if exists operations.replace_equipment(uuid, text, text, text, text, text, uuid);

create or replace function operations.replace_equipment(
  p_old_equipment_id       uuid,
  p_new_serial_number      text,
  p_new_model              text,
  p_new_description        text,
  p_new_access_type        text default null,
  p_decommission_reason    text default 'Replaced by new equipment',
  p_replacement_staff_id   uuid default null,
  p_activate_keys_directly boolean default false
)
returns uuid
language plpgsql
as $$
declare
  v_building_id uuid;
  v_old_status  text;
  v_new_id      uuid;
begin
  select building_id, status
    into v_building_id, v_old_status
    from operations.equipment
   where id = p_old_equipment_id
   for update;

  if not found then
    raise exception 'equipment % not found', p_old_equipment_id;
  end if;
  if v_old_status = 'dead' then
    raise exception 'equipment % is already dead', p_old_equipment_id;
  end if;

  -- Snapshot installed keys BEFORE the status flip. Once status becomes dead,
  -- equipment_close_authorizations_on_dead transitions them out of 'installed'
  -- and this SELECT would return zero rows.
  create temp table if not exists _keys_to_migrate (rfid_key_id uuid) on commit drop;
  truncate _keys_to_migrate;
  insert into _keys_to_migrate (rfid_key_id)
  select rfid_key_id
    from operations.key_authorizations
   where equipment_id = p_old_equipment_id
     and sync_state   = 'installed';

  -- 1) Kill the old device. Trigger closes old authorizations automatically.
  update operations.equipment
     set status              = 'dead',
         decommission_reason = p_decommission_reason
   where id = p_old_equipment_id;

  -- 2) Create the replacement.
  insert into operations.equipment (
    serial_number, model, building_id, description, access_type,
    status, replaces_equipment_id
  ) values (
    p_new_serial_number, p_new_model, v_building_id, p_new_description,
    p_new_access_type, 'active', p_old_equipment_id
  )
  returning id into v_new_id;

  -- 3) Recreate authorizations on the new device (default sync_state
  --    pending_install, forced by key_authorizations_validate).
  insert into operations.key_authorizations (rfid_key_id, equipment_id, notes)
  select rfid_key_id,
         v_new_id,
         'Auto-created by replace_equipment(' || p_old_equipment_id || ')'
    from _keys_to_migrate;

  -- 4) Option B: caller physically installed the keys at the same visit —
  --    promote pending_install → installed atomically. Silent no-op otherwise.
  if p_activate_keys_directly then
    update operations.key_authorizations
       set sync_state          = 'installed',
           installed_by_staff_id = coalesce(installed_by_staff_id, p_replacement_staff_id)
     where equipment_id = v_new_id
       and sync_state   = 'pending_install';
  end if;

  return v_new_id;
end;
$$;

-- -------------------------------------------------------
-- 3) configure_technical_ticket_equipment — Step 1 RPC
-- -------------------------------------------------------
-- Loads the operator-supplied serial/model into the ticket and moves it to
-- in_progress. Idempotent: safe to call repeatedly on an already-in_progress
-- ticket to correct a typo before finalizing.
create or replace function public.configure_technical_ticket_equipment(
  p_ticket_id   uuid,
  p_new_serial  text,
  p_new_model   text default null
) returns void
language plpgsql
security definer
set search_path = public, support, extensions
as $$
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

  if v_category not in ('equipment_installation', 'equipment_replacement') then
    raise exception
      'configure_technical_ticket_equipment: ticket % category=% is not configurable (only equipment_installation and equipment_replacement)',
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

comment on function public.configure_technical_ticket_equipment is
  'Step 1 of the two-step equipment task flow. Writes the operator-supplied '
  'serial (and optional model) into the ticket and transitions it to '
  'in_progress. No side effects on equipment, stock, or authorizations — '
  'those run at finalize time via resolve_ticket.';

-- -------------------------------------------------------
-- 4a) Loosen tickets_enforce_installer_columns for the resolve-owned equipment_id UPDATE
-- -------------------------------------------------------
-- The generic trigger blocks installers from writing equipment_id directly —
-- correct default, but the two-step resolve flow legitimately swaps the ticket
-- to the newly-created equipment during finalize. resolve_ticket sets a
-- transaction-scoped flag right before that UPDATE; the trigger honours it
-- and lets the equipment_id column change through, while every other guarded
-- column (assigned_to_staff_id, unit_id, description, related_*,
-- cancellation_reason) stays denied.
create or replace function support.enforce_installer_ticket_column_restrictions()
returns trigger language plpgsql as $$
declare
  v_role         text := identity.current_staff_role();
  v_allow_swap   boolean := coalesce(
    current_setting('app.allow_installer_equipment_swap', true), 'false'
  ) = 'true';
begin
  if v_role = 'installer' then
    if new.assigned_to_staff_id is distinct from old.assigned_to_staff_id then
      raise exception 'installer cannot reassign tickets'
        using errcode = 'insufficient_privilege';
    end if;
    if new.unit_id is distinct from old.unit_id
       or (not v_allow_swap and new.equipment_id is distinct from old.equipment_id)
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

-- -------------------------------------------------------
-- 4b) resolve_ticket — extended with side effects for equipment categories
-- -------------------------------------------------------
-- For equipment_installation and equipment_replacement tickets, runs the
-- atomic side effects immediately before the final in_progress → resolved
-- transition:
--   * equipment_installation: creates the equipment row, links to ticket,
--     emits egreso_instalacion + liberacion_reserva when product_id is set.
--   * equipment_replacement: calls operations.replace_equipment(activate=true)
--     to swap devices and transfer keys as installed, then updates
--     ticket.equipment_id and emits egreso_reemplazo + liberacion_reserva.
--
-- Requires pending_new_serial to be set (via configure_technical_ticket_equipment).
-- All other categories preserve the original open → in_progress → resolved
-- behavior without side effects.
create or replace function public.resolve_ticket(
  p_ticket_id       uuid,
  p_note            text default null,
  p_actor_staff_id  uuid default null
) returns uuid
language plpgsql
security definer
set search_path = public, support, operations, extensions
as $$
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
  if v_ticket.category in ('equipment_installation', 'equipment_replacement') then
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

    if v_ticket.category = 'equipment_installation' then
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

-- -------------------------------------------------------
-- Grants
-- -------------------------------------------------------
grant execute on function operations.replace_equipment(uuid, text, text, text, text, text, uuid, boolean)
  to authenticated, service_role;
grant execute on function public.configure_technical_ticket_equipment(uuid, text, text)
  to authenticated, service_role;
grant execute on function public.resolve_ticket(uuid, text, uuid)
  to authenticated, service_role;
