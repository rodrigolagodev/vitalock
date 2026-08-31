-- ============================================================
-- Key items: one order_item per physical key (explode quantity)
-- ============================================================
-- The order form lets the operator add a "pack" line with a quantity of keys
-- (e.g. 1 item × 3 llaves + 1 item × 2 llaves = 5 keys). Every other part of
-- the keys flow is strictly 1:1 — configure_key_order_item mints exactly ONE
-- rfid_key per order_item, confirm_order creates one key_configuration
-- ticket and one stock reservation per order_item, the order detail view
-- shows one row (and one "Configurar" action) per order_item.
--
-- A pack row in the DB therefore showed a single Configurar button, could
-- only ever mint one key (the RPC is idempotent once the item is
-- 'configured'), and consumed the WHOLE pack quantity from stock at once.
--
-- This migration normalizes at write time: every key pack is exploded into
-- N order_items of quantity 1.
--   * create_order_with_items       — explodes packs on order creation
--   * update_draft_order_with_items — explodes packs on draft save
--   * confirm_order                 — explodes legacy pending packs before
--                                     per-item side effects
--   * data backfill                 — explodes existing packs in actionable
--                                     orders and mints the missing per-key
--                                     tickets/reservations
--
-- The view and the order form are unchanged: the form keeps the pack
-- quantity input; the detail view naturally shows one row per key.
--
-- ROLLBACK INSTRUCTIONS (no down migration — Supabase CLI convention):
-- To revert this migration manually, re-apply the previous bodies of
-- create_order_with_items (000054), update_draft_order_with_items and
-- confirm_order (000055). Data already exploded by the backfill is NOT
-- re-collapsed; treat the backfill as a one-way normalization.
-- ============================================================

-- ============================================================
-- 1. create_order_with_items — explode key packs on creation
-- ============================================================
create or replace function public.create_order_with_items(
  p_order  jsonb,
  p_items  jsonb[]
) returns uuid
language plpgsql
security definer
as $$
declare
  v_order_id       uuid;
  v_client_type    text;
  v_order_type     text;
  v_particular_id  uuid;
  v_item           jsonb;
  v_part_full_name text;
  v_part_dni       text;
  v_part_phone     text;
  v_part_email     text;
  v_unit_price     numeric(12, 2);
  v_item_type      text;
  v_key_idx        int;
begin
  v_client_type := p_order->>'client_type';
  v_order_type  := coalesce(p_order->>'order_type', 'keys');

  if v_order_type not in ('keys', 'technical') then
    raise exception 'create_order: invalid order_type %', v_order_type
      using errcode = 'P0001';
  end if;

  if v_client_type = 'administration' then
    if (p_order->>'administration_id') is null then
      raise exception 'create_order: administration_id is required when client_type=administration'
        using errcode = 'P0001';
    end if;
  elsif v_client_type = 'particular' then
    v_particular_id := coalesce(
      (p_order->>'particular_id')::uuid,
      (select id from public.particulares where dni = p_order->>'particular_dni')
    );
    if v_particular_id is null then
      raise exception 'create_order: particular_id is required when client_type=particular'
        using errcode = 'P0001';
    end if;

    select full_name, dni, phone, email
      into v_part_full_name, v_part_dni, v_part_phone, v_part_email
      from public.particulares
     where id = v_particular_id;

    if v_part_full_name is null then
      raise exception 'create_order: particular % not found', v_particular_id
        using errcode = 'P0001';
    end if;
  else
    raise exception 'create_order: invalid client_type %', v_client_type
      using errcode = 'P0001';
  end if;

  if p_items is null or array_length(p_items, 1) = 0 then
    raise exception 'create_order: at least one item is required'
      using errcode = 'P0001';
  end if;

  foreach v_item in array p_items loop
    v_item_type := v_item->>'item_type';

    if v_order_type = 'keys' and v_item_type <> 'key' then
      raise exception 'create_order: order_type=keys only accepts item_type=key (got %)', v_item_type
        using errcode = 'P0001';
    end if;
    if v_order_type = 'technical'
       and v_item_type not in (
         'equipment', 'maintenance', 'installation', 'equipment_replacement'
       ) then
      raise exception 'create_order: order_type=technical only accepts equipment/maintenance/installation/equipment_replacement (got %)', v_item_type
        using errcode = 'P0001';
    end if;

    if v_item_type = 'key' then
      if (v_item->>'building_id') is null then
        raise exception 'create_order: building_id is required for key items'
          using errcode = 'P0001';
      end if;
    end if;

    -- Uniform pricing policy: every item requires a positive price.
    v_unit_price := nullif(v_item->>'unit_price', '')::numeric(12, 2);
    if v_unit_price is null or v_unit_price <= 0 then
      raise exception 'create_order: unit_price > 0 is required for every item (item_type=%)', v_item_type
        using errcode = 'P0001';
    end if;
  end loop;

  insert into public.orders (
    order_type,
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
    v_order_type,
    v_client_type,
    (p_order->>'administration_id')::uuid,
    v_particular_id,
    coalesce(nullif(trim(p_order->>'particular_full_name'), ''), v_part_full_name),
    coalesce(nullif(trim(p_order->>'particular_dni'), ''), v_part_dni),
    coalesce(nullif(trim(p_order->>'particular_phone'), ''), v_part_phone),
    coalesce(nullif(trim(p_order->>'particular_email'), ''), v_part_email),
    p_order->>'notes',
    coalesce(p_order->>'status', 'draft')
  )
  returning id into v_order_id;

  foreach v_item in array p_items loop
    -- Key "pack" lines (quantity > 1) are exploded into one order_item per
    -- key: the config flow mints exactly one key per item. Non-key lines
    -- keep their quantity as-is.
    if v_item->>'item_type' = 'key' and (v_item->>'quantity')::int > 1 then
      for v_key_idx in 1..(v_item->>'quantity')::int loop
        insert into public.order_items (
          order_id,
          item_type,
          quantity,
          description,
          building_id,
          product_id,
          unit_price,
          unit_id,
          pickup_particular_id
        )
        values (
          v_order_id,
          'key',
          1,
          v_item->>'description',
          (v_item->>'building_id')::uuid,
          (v_item->>'product_id')::uuid,
          nullif(v_item->>'unit_price', '')::numeric(12, 2),
          (v_item->>'unit_id')::uuid,
          (v_item->>'pickup_particular_id')::uuid
        );
      end loop;
    else
      insert into public.order_items (
        order_id,
        item_type,
        quantity,
        description,
        building_id,
        product_id,
        unit_price,
        unit_id,
        pickup_particular_id
      )
      values (
        v_order_id,
        v_item->>'item_type',
        (v_item->>'quantity')::int,
        v_item->>'description',
        (v_item->>'building_id')::uuid,
        (v_item->>'product_id')::uuid,
        nullif(v_item->>'unit_price', '')::numeric(12, 2),
        (v_item->>'unit_id')::uuid,
        (v_item->>'pickup_particular_id')::uuid
      );
    end if;
  end loop;

  return v_order_id;
end;
$$;

-- ============================================================
-- 2. update_draft_order_with_items — explode key packs on draft save
-- ============================================================
-- The payload items (jsonb[]) may still contain pack lines from the order
-- form. Each key pack becomes N quantity-1 rows: the first copy keeps the
-- payload id when present (UPDATE), the rest are INSERTed. The id-keeping
-- logic in the item sync (upsert by id, delete missing) stays intact.
create or replace function public.update_draft_order_with_items(
  p_order_id            uuid,
  p_patch               jsonb,
  p_items               jsonb[],
  p_expected_updated_at timestamptz
) returns timestamptz
language plpgsql
security definer
set search_path = public, support
as $$
declare
  v_order           record;
  v_new_updated_at  timestamptz;
  v_item            jsonb;
  v_item_id         uuid;
  v_item_ids_kept   uuid[] := array[]::uuid[];
  v_key_idx         int;
begin
  -- 1. Lock the row and read current state.
  select id, status, updated_at
    into v_order
    from public.orders
   where id = p_order_id
   for update;

  if not found then
    raise exception 'ORDERS_UPDATE_NOT_FOUND: order % does not exist', p_order_id
      using errcode = 'P0001';
  end if;

  -- 2. Validate status = 'draft'.
  if v_order.status <> 'draft' then
    raise exception 'ORDERS_UPDATE_NOT_DRAFT: order % is not in draft status (current: %)',
      p_order_id, v_order.status
      using errcode = 'P0001';
  end if;

  -- 3. Optimistic concurrency guard.
  if v_order.updated_at <> p_expected_updated_at then
    raise exception 'ORDERS_UPDATE_CONFLICT: order % was modified concurrently (expected %, actual %)',
      p_order_id, p_expected_updated_at, v_order.updated_at
      using errcode = 'P0001';
  end if;

  -- 4. Update the order header with any provided patch fields.
  --    Only non-null patch keys are applied; absent keys are left unchanged.
  update public.orders
     set
       notes                = coalesce(p_patch->>'notes',                 notes),
       client_type          = coalesce(p_patch->>'client_type',           client_type),
       order_type           = coalesce(p_patch->>'order_type',            order_type),
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

  -- 5. Item sync: upsert items present in payload; delete items absent.
  if p_items is not null then
    foreach v_item in array p_items loop
      v_item_id := (v_item->>'id')::uuid;

      -- Key "pack" lines (quantity > 1) are exploded into one order_item per
      -- key. The first copy keeps the payload id when present (UPDATE); the
      -- remaining keys are INSERTed as new rows. Non-key lines keep their
      -- original single-copy behavior.
      if v_item->>'item_type' = 'key'
         and coalesce((v_item->>'quantity')::int, 1) > 1 then
        if v_item_id is not null then
          update public.order_items
             set
               item_type            = 'key',
               quantity             = 1,
               description          = coalesce(v_item->>'description', description),
               building_id          = case
                                        when v_item ? 'building_id'
                                        then (v_item->>'building_id')::uuid
                                        else building_id
                                      end,
               product_id           = case
                                        when v_item ? 'product_id'
                                        then (v_item->>'product_id')::uuid
                                        else product_id
                                      end,
               unit_price           = case
                                        when v_item ? 'unit_price'
                                        then nullif(v_item->>'unit_price', '')::numeric(12, 2)
                                        else unit_price
                                      end,
               unit_id              = case
                                        when v_item ? 'unit_id'
                                        then (v_item->>'unit_id')::uuid
                                        else unit_id
                                      end,
               pickup_particular_id = case
                                        when v_item ? 'pickup_particular_id'
                                        then (v_item->>'pickup_particular_id')::uuid
                                        else pickup_particular_id
                                      end
           where id = v_item_id
             and order_id = p_order_id;

          v_item_ids_kept := v_item_ids_kept || v_item_id;
        else
          -- New pack line without an id: the first copy is a plain INSERT.
          insert into public.order_items (
            order_id,
            item_type,
            quantity,
            description,
            building_id,
            product_id,
            unit_price,
            unit_id,
            pickup_particular_id
          )
          values (
            p_order_id,
            'key',
            1,
            v_item->>'description',
            (v_item->>'building_id')::uuid,
            (v_item->>'product_id')::uuid,
            nullif(v_item->>'unit_price', '')::numeric(12, 2),
            (v_item->>'unit_id')::uuid,
            (v_item->>'pickup_particular_id')::uuid
          )
          returning id into v_item_id;

          v_item_ids_kept := v_item_ids_kept || v_item_id;
        end if;

        -- Remaining keys of the pack become new order_items.
        for v_key_idx in 2..(v_item->>'quantity')::int loop
          insert into public.order_items (
            order_id,
            item_type,
            quantity,
            description,
            building_id,
            product_id,
            unit_price,
            unit_id,
            pickup_particular_id
          )
          values (
            p_order_id,
            'key',
            1,
            v_item->>'description',
            (v_item->>'building_id')::uuid,
            (v_item->>'product_id')::uuid,
            nullif(v_item->>'unit_price', '')::numeric(12, 2),
            (v_item->>'unit_id')::uuid,
            (v_item->>'pickup_particular_id')::uuid
          )
          returning id into v_item_id;

          v_item_ids_kept := v_item_ids_kept || v_item_id;
        end loop;
      elsif v_item_id is not null then
        -- Existing item: UPDATE.
        update public.order_items
           set
             item_type           = coalesce(v_item->>'item_type',     item_type),
             quantity            = coalesce((v_item->>'quantity')::int, quantity),
             description         = coalesce(v_item->>'description',   description),
             building_id         = case
                                     when v_item ? 'building_id'
                                     then (v_item->>'building_id')::uuid
                                     else building_id
                                   end,
             product_id          = case
                                     when v_item ? 'product_id'
                                     then (v_item->>'product_id')::uuid
                                     else product_id
                                   end,
             unit_price          = case
                                     when v_item ? 'unit_price'
                                     then nullif(v_item->>'unit_price', '')::numeric(12, 2)
                                     else unit_price
                                   end,
             unit_id             = case
                                     when v_item ? 'unit_id'
                                     then (v_item->>'unit_id')::uuid
                                     else unit_id
                                   end,
             pickup_particular_id = case
                                     when v_item ? 'pickup_particular_id'
                                     then (v_item->>'pickup_particular_id')::uuid
                                     else pickup_particular_id
                                   end
         where id = v_item_id
           and order_id = p_order_id;

        v_item_ids_kept := v_item_ids_kept || v_item_id;
      else
        -- New item: INSERT.
        insert into public.order_items (
          order_id,
          item_type,
          quantity,
          description,
          building_id,
          product_id,
          unit_price,
          unit_id,
          pickup_particular_id
        )
        values (
          p_order_id,
          v_item->>'item_type',
          (v_item->>'quantity')::int,
          v_item->>'description',
          (v_item->>'building_id')::uuid,
          (v_item->>'product_id')::uuid,
          nullif(v_item->>'unit_price', '')::numeric(12, 2),
          (v_item->>'unit_id')::uuid,
          (v_item->>'pickup_particular_id')::uuid
        )
        returning id into v_item_id;

        v_item_ids_kept := v_item_ids_kept || v_item_id;
      end if;
    end loop;

    -- Delete order_items that were NOT in the payload.
    delete from public.order_items
     where order_id = p_order_id
       and id <> all(v_item_ids_kept);
  end if;

  return v_new_updated_at;
end;
$$;

grant execute on function public.update_draft_order_with_items(uuid, jsonb, jsonb[], timestamptz) to authenticated;

-- ============================================================
-- 3. confirm_order — explode legacy pending key packs before side effects
-- ============================================================
-- Drafts created before key-item normalization could still carry a pack
-- line when confirmed. Explode them into one item per key first so the
-- per-item ticket + reservation loop below runs for each key.
create or replace function public.confirm_order(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public, support
as $$
declare
  v_order         record;
  v_item          record;
  v_pack          record;
  v_admin_id      uuid;
  v_ticket_id     uuid;
  v_category      text;
  v_item_count    int;
  v_key_idx       int;
begin
  -- 1. Lock the order row and read current state.
  select id, status, order_type, administration_id
    into v_order
    from public.orders
   where id = p_order_id
   for update;

  if not found then
    raise exception 'ORDERS_CONFIRM_NOT_FOUND: order % does not exist', p_order_id
      using errcode = 'P0001';
  end if;

  -- 2. Validate status = 'draft'.
  if v_order.status <> 'draft' then
    raise exception 'ORDERS_CONFIRM_NOT_DRAFT: order % is not in draft status (current: %)',
      p_order_id, v_order.status
      using errcode = 'P0001';
  end if;

  -- 3. Validate at least one item exists.
  select count(*) into v_item_count
    from public.order_items
   where order_id = p_order_id;

  if v_item_count = 0 then
    raise exception 'ORDERS_CONFIRM_NO_ITEMS: order % has no items', p_order_id
      using errcode = 'P0001';
  end if;

  -- 4. Transition the order to 'confirmed'.
  update public.orders
     set status = 'confirmed'
   where id = p_order_id;

  -- 5. Explode legacy key packs (quantity > 1) into one item per key.
  for v_pack in
    select id, quantity
      from public.order_items
     where order_id = p_order_id
       and item_type = 'key'
       and status = 'pending'
       and quantity > 1
  loop
    for v_key_idx in 2..v_pack.quantity loop
      insert into public.order_items (
        order_id,
        item_type,
        quantity,
        description,
        building_id,
        product_id,
        unit_price,
        unit_id,
        pickup_particular_id
      )
      select order_id, item_type, 1, description, building_id,
             product_id, unit_price, unit_id, pickup_particular_id
        from public.order_items
       where id = v_pack.id;
    end loop;

    update public.order_items
       set quantity = 1
     where id = v_pack.id;
  end loop;

  -- 6. Per-item side effects (mirrors order_items_create_tarea from 000052).
  for v_item in
    select id, item_type, product_id, building_id, quantity, description
      from public.order_items
     where order_id = p_order_id
  loop
    -- Reset ticket tracking per item.
    v_ticket_id := null;
    v_admin_id  := null;

    -- ----------------------------------------------------------------
    -- Maintenance / installation items (technical order)
    -- ----------------------------------------------------------------
    if v_item.item_type in ('maintenance', 'installation') then
      -- Try the order-level administration first.
      v_admin_id := v_order.administration_id;

      -- Particular orders: derive administration from the building.
      if v_admin_id is null and v_item.building_id is not null then
        select administration_id into v_admin_id
          from public.buildings
         where id = v_item.building_id;
      end if;

      -- Skip if still no administration or no building (same guard as trigger).
      if v_admin_id is null or v_item.building_id is null then
        continue;
      end if;

      insert into support.tickets (
        administration_id, building_id, category, description, status, notes,
        order_item_id
      ) values (
        v_admin_id,
        v_item.building_id,
        v_item.item_type,
        coalesce(nullif(trim(v_item.description), ''),
                 'Item de orden (' || v_item.item_type || ')'),
        'open',
        'Generado automáticamente desde order_item ' || v_item.id::text,
        v_item.id
      );

      continue;
    end if;

    -- ----------------------------------------------------------------
    -- equipment_replacement (technical order) — distinct category
    -- ----------------------------------------------------------------
    if v_item.item_type = 'equipment_replacement' then
      v_admin_id := v_order.administration_id;

      if v_admin_id is null and v_item.building_id is not null then
        select administration_id into v_admin_id
          from public.buildings
         where id = v_item.building_id;
      end if;

      if v_item.building_id is not null and v_admin_id is not null then
        insert into support.tickets (
          administration_id, building_id, category, description, status, notes,
          order_item_id
        ) values (
          v_admin_id,
          v_item.building_id,
          'equipment_replacement',
          coalesce(nullif(trim(v_item.description), ''), 'Cambio de equipo'),
          'open',
          'Generado automáticamente desde order_item ' || v_item.id::text,
          v_item.id
        );
      end if;

      continue;
    end if;

    -- ----------------------------------------------------------------
    -- Stock-backed lines: key / equipment
    -- Skip items with no product_id (no inventory SKU → no ticket, no
    -- reservation) — matches the original trigger behavior.
    -- ----------------------------------------------------------------
    if v_item.item_type not in ('key', 'equipment') then
      continue;  -- unknown item_type: skip silently
    end if;

    if v_item.product_id is null then
      continue;
    end if;

    v_category := case v_item.item_type
                    when 'key'       then 'key_configuration'
                    when 'equipment' then 'equipment_installation'
                  end;

    -- Resolve administration: order-level first, then building-level
    -- (particulares fallback — particular orders are NOT exempt for stock lines).
    v_admin_id := v_order.administration_id;

    if v_admin_id is null and v_item.building_id is not null then
      select administration_id into v_admin_id
        from public.buildings
       where id = v_item.building_id;
    end if;

    -- Create ticket when building and administration are both known.
    if v_item.building_id is not null and v_admin_id is not null then
      insert into support.tickets (
        administration_id, building_id, category, description, status, notes,
        order_item_id
      ) values (
        v_admin_id,
        v_item.building_id,
        v_category,
        coalesce(nullif(trim(v_item.description), ''),
                 'Item de orden (' || v_item.item_type || ')'),
        'open',
        'Generado automáticamente desde order_item ' || v_item.id::text,
        v_item.id
      )
      returning id into v_ticket_id;
    end if;

    -- Reservation movement (negative quantity).
    -- Idempotent per order_item via the partial UNIQUE index on
    -- stock_movements (order_item_id, type) WHERE type = 'reserva'.
    insert into public.stock_movements (
      product_id, type, quantity, note, order_id, order_item_id, ticket_id
    ) values (
      v_item.product_id,
      'reserva',
      -v_item.quantity,
      'Reserva de stock desde order_item ' || v_item.id::text,
      p_order_id,
      v_item.id,
      v_ticket_id
    )
    on conflict (order_item_id, type)
      where type = 'reserva' and order_item_id is not null
      do nothing;

  end loop;
end;
$$;

grant execute on function public.confirm_order(uuid) to authenticated;

-- ============================================================
-- 4. Backfill — explode existing key packs in actionable orders
-- ============================================================
-- Orders created before this migration may hold pending/configured key
-- packs (1 item × N llaves) with only one produced key possible. Explode
-- them into N quantity-1 items:
--   * the original row keeps its id and becomes the first key;
--   * the extra keys become new pending items;
--   * for already-confirmed orders, each new item gets the same side
--     effects confirm_order would have created (key_configuration ticket +
--     stock reservation), and the original row's reservation is corrected
--     to -1 (it previously reserved the whole pack at once);
--   * draft orders get no side effects (confirm_order creates them later);
--   * cancelled/completed/invoiced orders are left untouched.
do $$
declare
  v_pack        record;
  v_key_idx     int;
  v_new_item    uuid;
  v_admin_id    uuid;
  v_ticket_id   uuid;
begin
  for v_pack in
    select oi.id, oi.order_id, oi.quantity, oi.product_id, oi.building_id,
           oi.description, o.status as order_status, o.administration_id
      from public.order_items oi
      join public.orders o on o.id = oi.order_id
     where oi.item_type = 'key'
       and oi.quantity > 1
       and oi.status in ('pending', 'configured')
       and o.status in ('draft', 'confirmed', 'in_progress', 'ready_for_pickup')
  loop
    -- First copy keeps the original id; its quantity becomes 1.
    update public.order_items
       set quantity = 1
     where id = v_pack.id;

    -- Resolve the administration once per pack (shared by all new items).
    v_admin_id := null;
    if v_pack.product_id is not null and v_pack.order_status <> 'draft' then
      v_admin_id := v_pack.administration_id;
      if v_admin_id is null and v_pack.building_id is not null then
        select administration_id into v_admin_id
          from public.buildings
         where id = v_pack.building_id;
      end if;
    end if;

    for v_key_idx in 2..v_pack.quantity loop
      insert into public.order_items (
        order_id,
        item_type,
        quantity,
        description,
        building_id,
        product_id,
        unit_price,
        unit_id,
        pickup_particular_id
      )
      select order_id, item_type, 1, description, building_id,
             product_id, unit_price, unit_id, pickup_particular_id
        from public.order_items
       where id = v_pack.id
      returning id into v_new_item;

      -- Already-confirmed orders: give the new item its own side effects
      -- (mirrors confirm_order).
      if v_pack.order_status <> 'draft' and v_pack.product_id is not null then
        v_ticket_id := null;

        if v_pack.building_id is not null and v_admin_id is not null then
          insert into support.tickets (
            administration_id, building_id, category, description, status,
            notes, order_item_id
          ) values (
            v_admin_id,
            v_pack.building_id,
            'key_configuration',
            coalesce(nullif(trim(v_pack.description), ''),
                     'Item de orden (key)'),
            'open',
            'Generado automáticamente al normalizar pack de llaves (order_item ' || v_pack.id || ')',
            v_new_item
          )
          returning id into v_ticket_id;
        end if;

        insert into public.stock_movements (
          product_id, type, quantity, note, order_id, order_item_id, ticket_id
        ) values (
          v_pack.product_id,
          'reserva',
          -1,
          'Reserva de stock al normalizar pack de llaves (order_item ' || v_pack.id || ')',
          v_pack.order_id,
          v_new_item,
          v_ticket_id
        )
        on conflict (order_item_id, type)
          where type = 'reserva' and order_item_id is not null
          do nothing;
      end if;
    end loop;
  end loop;

  -- Correct the original row's reservation for pending packs in
  -- already-confirmed orders. stock_movements is an append-only ledger, so
  -- the pack's single reserva of -quantity must be compensated with a
  -- liberacion_reserva of (quantity - 1): the first copy now represents a
  -- single key and the new rows each carry their own -1 reserva. Configured
  -- packs keep their historical movements.
  insert into public.stock_movements (
    product_id, type, quantity, note, order_id, order_item_id
  )
  select oi.product_id,
         'liberacion_reserva',
         -sm.quantity - 1,
         'Liberacion de reserva al normalizar pack de llaves (order_item ' || oi.id || ')',
         oi.order_id,
         oi.id
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    join public.stock_movements sm
      on sm.order_item_id = oi.id
     and sm.type = 'reserva'
   where oi.item_type = 'key'
     and oi.status = 'pending'
     and oi.quantity = 1
     and o.status in ('confirmed', 'in_progress', 'ready_for_pickup')
     and sm.quantity < -1;
end $$;
