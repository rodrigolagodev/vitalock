-- ============================================================
-- Migration: add building_id to technical_order_items + update RPCs
-- ============================================================
-- Spec drift correction: technical_order_items lacked building_id,
-- but support.tickets requires building_id NOT NULL. The previous
-- confirm_technical_order silently skipped ticket creation for
-- installation items (no equipment → no building context). That
-- breaks the domain: installation items are the primary use-case
-- and MUST always produce a support.ticket.
--
-- Fix:
--   1. ALTER TABLE to add building_id NOT NULL FK on technical_order_items.
--      Safe without backfill — migrations run from clean state (db reset).
--   2. CREATE OR REPLACE create_technical_order_with_items — reads
--      building_id from each item jsonb; validates it non-null.
--   3. CREATE OR REPLACE confirm_technical_order — removes the
--      "skip if building_id is null" guard; uses item.building_id
--      directly; derives administration_id from buildings table.
--      equipment_id on the ticket may be NULL for installation items.
--   4. CREATE OR REPLACE update_draft_technical_order_with_items —
--      adds building_id to INSERT and UPDATE paths.
--
-- Depends on: 20260818000082 (technical_order_items), 20260818000089,
--             20260818000090
-- ============================================================

-- -------------------------------------------------------
-- 1. Add building_id column to technical_order_items
-- -------------------------------------------------------
alter table public.technical_order_items
  add column building_id uuid not null
    references public.buildings(id) on delete restrict;

create index technical_order_items_building_id_idx
  on public.technical_order_items (building_id);

-- -------------------------------------------------------
-- 2. CREATE OR REPLACE create_technical_order_with_items
-- -------------------------------------------------------
-- Adds building_id validation and persistence for each item.
create or replace function public.create_technical_order_with_items(
  p_order               jsonb,
  p_items               jsonb[],
  p_confirm_immediately boolean default true
) returns uuid
language plpgsql
security definer
set search_path = public, support, extensions
as $$
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
begin
  -- ----------------------------------------------------------------
  -- 1. Client validation
  -- ----------------------------------------------------------------
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

  -- ----------------------------------------------------------------
  -- 2. Items pre-validation
  -- ----------------------------------------------------------------
  if p_items is null or array_length(p_items, 1) = 0 then
    raise exception 'TECHNICAL_ORDER_EMPTY: at least one item is required'
      using errcode = 'P0001';
  end if;

  foreach v_item in array p_items loop
    v_item_type   := v_item->>'item_type';
    v_building_id := (v_item->>'building_id')::uuid;

    -- building_id is always required per item (needed for ticket creation).
    if v_building_id is null then
      raise exception 'TECHNICAL_ORDER_ITEM_BUILDING_REQUIRED: building_id is required for each item (item_type=%)', v_item_type
        using errcode = 'P0001';
    end if;

    if v_item_type not in ('equipment', 'maintenance', 'installation', 'equipment_replacement') then
      raise exception 'TECHNICAL_ORDER_INVALID_ITEM_TYPE: item_type must be one of equipment/maintenance/installation/equipment_replacement (got %)', v_item_type
        using errcode = 'P0001';
    end if;

    -- Uniform pricing policy: unit_price > 0 required for all items.
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

    -- Confirm-time intent validation (run pre-emptively when confirming immediately).
    if p_confirm_immediately then
      -- All items: intended_assignee_staff_id required.
      if (v_item->>'intended_assignee_staff_id') is null then
        raise exception 'TECHNICAL_ORDER_INTENT_REQUIRED: intended_assignee_staff_id required for confirm (item_type=%)', v_item_type
          using errcode = 'P0001';
      end if;

      -- maintenance and equipment_replacement: intended_equipment_id required.
      if v_item_type in ('maintenance', 'equipment_replacement')
         and (v_item->>'intended_equipment_id') is null then
        raise exception 'TECHNICAL_ORDER_INTENT_REQUIRED: intended_equipment_id required for confirm when item_type=% ', v_item_type
          using errcode = 'P0001';
      end if;

      -- equipment: product_id required.
      if v_item_type = 'equipment' and (v_item->>'product_id') is null then
        raise exception 'TECHNICAL_ORDER_PRODUCT_REQUIRED: product_id required for item_type=equipment'
          using errcode = 'P0001';
      end if;
    end if;
  end loop;

  -- ----------------------------------------------------------------
  -- 3. Insert order header
  -- ----------------------------------------------------------------
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

  -- ----------------------------------------------------------------
  -- 4. Insert items (technical orders do NOT explode quantity)
  -- ----------------------------------------------------------------
  foreach v_item in array p_items loop
    insert into public.technical_order_items (
      order_id,
      item_type,
      quantity,
      description,
      unit_price,
      product_id,
      intended_equipment_id,
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
      (v_item->>'intended_assignee_staff_id')::uuid,
      (v_item->>'building_id')::uuid,
      'pending'
    );
  end loop;

  -- ----------------------------------------------------------------
  -- 5. Optionally confirm inline
  -- ----------------------------------------------------------------
  if p_confirm_immediately then
    perform public.confirm_technical_order(v_order_id);
  end if;

  return v_order_id;
end;
$$;

-- -------------------------------------------------------
-- 3. CREATE OR REPLACE confirm_technical_order
-- -------------------------------------------------------
-- Key changes from migration 000089:
--   * Uses item.building_id directly (no longer derives from equipment).
--   * Derives administration_id from public.buildings (needed for ticket).
--   * REMOVES the "skip if building_id is null" guard — every non-cancelled
--     item MUST create a ticket.
--   * equipment_id on the ticket is NULL for installation items with no
--     pre-selected equipment (intended_equipment_id may be null for
--     installation item_type at confirm time).
create or replace function public.confirm_technical_order(
  p_order_id uuid
) returns void
language plpgsql
security definer
set search_path = public, support, extensions
as $$
declare
  v_order        record;
  v_item         record;
  v_item_count   int;
  v_category     text;
  v_admin_id     uuid;
begin
  -- 1. Row-lock and read current state.
  select id, status, administration_id
    into v_order
    from public.technical_orders
   where id = p_order_id
   for update;

  if not found then
    raise exception 'TECHNICAL_ORDER_NOT_FOUND: technical order % does not exist', p_order_id
      using errcode = 'P0001';
  end if;

  -- 2. Validate status = 'draft'.
  if v_order.status <> 'draft' then
    raise exception 'TECHNICAL_ORDER_NOT_DRAFT: technical order % is not in draft status (current: %)',
      p_order_id, v_order.status
      using errcode = 'P0001';
  end if;

  -- 3. Validate at least one non-cancelled item.
  select count(*) into v_item_count
    from public.technical_order_items
   where order_id = p_order_id
     and status <> 'cancelled';

  if v_item_count = 0 then
    raise exception 'TECHNICAL_ORDER_EMPTY: technical order % has no active items', p_order_id
      using errcode = 'P0001';
  end if;

  -- 4. Validate intent fields on every non-cancelled item.
  for v_item in
    select id, item_type, intended_equipment_id, intended_assignee_staff_id, building_id
      from public.technical_order_items
     where order_id = p_order_id
       and status <> 'cancelled'
  loop
    -- All items: intended_assignee_staff_id required.
    if v_item.intended_assignee_staff_id is null then
      raise exception 'TECHNICAL_ORDER_INTENT_REQUIRED: intended_assignee_staff_id required to confirm (order_id=%, item_id=%, item_type=%)',
        p_order_id, v_item.id, v_item.item_type
        using errcode = 'P0001';
    end if;

    -- maintenance, equipment_replacement: intended_equipment_id required.
    if v_item.item_type in ('maintenance', 'equipment_replacement')
       and v_item.intended_equipment_id is null then
      raise exception 'TECHNICAL_ORDER_INTENT_REQUIRED: intended_equipment_id required for item_type=% (order_id=%, item_id=%)',
        v_item.item_type, p_order_id, v_item.id
        using errcode = 'P0001';
    end if;
  end loop;

  -- 5. Transition order to 'confirmed' BEFORE creating tickets.
  --    (intent_immutable trigger fires on any subsequent UPDATE of items)
  update public.technical_orders
     set status = 'confirmed'
   where id = p_order_id;

  -- 6. Per-item side effects: ticket creation + stock reservations.
  for v_item in
    select id, item_type, product_id, intended_equipment_id,
           intended_assignee_staff_id, quantity, description, building_id
      from public.technical_order_items
     where order_id = p_order_id
       and status <> 'cancelled'
  loop
    -- ---- Category mapping ----
    v_category := case v_item.item_type
                    when 'installation'          then 'installation'
                    when 'equipment_replacement' then 'equipment_replacement'
                    when 'maintenance'           then 'maintenance'
                    when 'equipment'             then 'equipment_installation'
                    else null
                  end;

    -- ---- Derive administration_id from building ----
    -- building_id is always set on the item (added by this migration).
    -- administration_id comes from the building lookup.
    select b.administration_id
      into v_admin_id
      from public.buildings b
     where b.id = v_item.building_id;

    if v_admin_id is null then
      raise exception 'TECHNICAL_ORDER_BUILDING_NOT_FOUND: building % not found for item % (order_id=%)',
        v_item.building_id, v_item.id, p_order_id
        using errcode = 'P0001';
    end if;

    -- ---- Ticket creation (always — every non-cancelled item gets a ticket) ----
    -- equipment_id is NULL for installation items with no pre-selected equipment.
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
      -- key_order_item_id: NULL (not set)
    )
    values (
      v_admin_id,
      v_item.building_id,
      v_item.intended_equipment_id,       -- NULL for installation items is acceptable
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

    -- ---- Stock reservation ----
    -- Only for items that reference an inventory SKU.
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

-- -------------------------------------------------------
-- 4. CREATE OR REPLACE update_draft_technical_order_with_items
-- -------------------------------------------------------
-- Adds building_id to both INSERT (new items) and UPDATE (existing items) paths.
create or replace function public.update_draft_technical_order_with_items(
  p_order_id            uuid,
  p_patch               jsonb,
  p_items               jsonb[],
  p_expected_updated_at timestamptz
) returns timestamptz
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_order          record;
  v_new_updated_at timestamptz;
  v_item           jsonb;
  v_item_id        uuid;
  v_item_ids_kept  uuid[] := array[]::uuid[];
  v_unit_price     numeric(12, 2);
begin
  -- 1. Row-lock and verify.
  select id, status, updated_at
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

  if v_order.updated_at <> p_expected_updated_at then
    raise exception 'TECHNICAL_ORDER_STALE: technical order % was modified concurrently (expected %, actual %)',
      p_order_id, p_expected_updated_at, v_order.updated_at
      using errcode = 'P0001';
  end if;

  -- 2. Apply patch to header (whitelisted columns only).
  update public.technical_orders
     set
       notes                = coalesce(p_patch->>'notes',                 notes),
       client_type          = coalesce(p_patch->>'client_type',           client_type),
       administration_id    = case
                                when p_patch ? 'administration_id'
                                then (p_patch->>'administration_id')::uuid
                                else administration_id
                              end,
       particular_id        = case
                                when p_patch ? 'particular_id'
                                then (p_patch->>'particular_id')::uuid
                                else particular_id
                              end,
       particular_full_name = coalesce(p_patch->>'particular_full_name', particular_full_name),
       particular_dni       = coalesce(p_patch->>'particular_dni',       particular_dni),
       particular_phone     = coalesce(p_patch->>'particular_phone',     particular_phone),
       particular_email     = coalesce(p_patch->>'particular_email',     particular_email)
   where id = p_order_id
  returning updated_at into v_new_updated_at;

  -- 3. Item sync: upsert items present in payload; delete absent items.
  --    Technical order items are NOT exploded (quantity stays as-is).
  if p_items is not null then
    foreach v_item in array p_items loop
      v_item_id    := (v_item->>'id')::uuid;
      v_unit_price := nullif(v_item->>'unit_price', '')::numeric(12, 2);

      if v_item_id is not null then
        -- Existing item: UPDATE.
        -- Note: intended_equipment_id and intended_assignee_staff_id are mutable
        -- in draft (intent_immutable trigger only fires when parent is NOT draft).
        -- building_id is also mutable at draft time.
        update public.technical_order_items
           set
             item_type                   = coalesce(v_item->>'item_type', item_type),
             quantity                    = coalesce((v_item->>'quantity')::int, quantity),
             description                 = coalesce(v_item->>'description', description),
             unit_price                  = case when v_item ? 'unit_price'
                                                then v_unit_price
                                                else unit_price end,
             product_id                  = case when v_item ? 'product_id'
                                                then (v_item->>'product_id')::uuid
                                                else product_id end,
             intended_equipment_id       = case when v_item ? 'intended_equipment_id'
                                                then (v_item->>'intended_equipment_id')::uuid
                                                else intended_equipment_id end,
             intended_assignee_staff_id  = case when v_item ? 'intended_assignee_staff_id'
                                                then (v_item->>'intended_assignee_staff_id')::uuid
                                                else intended_assignee_staff_id end,
             building_id                 = case when v_item ? 'building_id'
                                                then (v_item->>'building_id')::uuid
                                                else building_id end
         where id = v_item_id
           and order_id = p_order_id;

        v_item_ids_kept := v_item_ids_kept || v_item_id;

      else
        -- New item: INSERT.
        insert into public.technical_order_items (
          order_id,
          item_type,
          quantity,
          description,
          unit_price,
          product_id,
          intended_equipment_id,
          intended_assignee_staff_id,
          building_id
        )
        values (
          p_order_id,
          v_item->>'item_type',
          coalesce((v_item->>'quantity')::int, 1),
          v_item->>'description',
          v_unit_price,
          (v_item->>'product_id')::uuid,
          (v_item->>'intended_equipment_id')::uuid,
          (v_item->>'intended_assignee_staff_id')::uuid,
          (v_item->>'building_id')::uuid
        )
        returning id into v_item_id;

        v_item_ids_kept := v_item_ids_kept || v_item_id;
      end if;
    end loop;

    -- Delete items not in the payload.
    delete from public.technical_order_items
     where order_id = p_order_id
       and id <> all(v_item_ids_kept);
  end if;

  return v_new_updated_at;
end;
$$;

-- -------------------------------------------------------
-- Grants (idempotent — functions already granted in 000089/000090)
-- -------------------------------------------------------
grant execute on function public.create_technical_order_with_items(jsonb, jsonb[], boolean) to authenticated, service_role;
grant execute on function public.confirm_technical_order(uuid) to authenticated, service_role;
grant execute on function public.update_draft_technical_order_with_items(uuid, jsonb, jsonb[], timestamptz) to authenticated, service_role;
