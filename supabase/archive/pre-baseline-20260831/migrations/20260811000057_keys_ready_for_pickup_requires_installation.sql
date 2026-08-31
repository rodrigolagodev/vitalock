-- ============================================================
-- Keys orders: ready_for_pickup requires installation done
-- ============================================================
-- Change: fix lifecycle bug — a keys order was promoted to
-- 'ready_for_pickup' as soon as ALL key items reached
-- status='configured'. But 'configured' only means the admin
-- programmed the key; the technician still has to install it on
-- the reader (key_installation ticket). The order must stay
-- 'in_progress' until the installer resolves every installation
-- task, and only then become 'ready_for_pickup'.
--
-- Root causes fixed here:
--   1. support.tickets_resolution_chain spawned the follow-up
--      key_installation ticket WITHOUT order_item_id, so
--      tickets_sync_order_status never recomputed the order when
--      the installer resolved it, and recompute could not count
--      pending installation work per order.
--   2. recompute_order_status (keys branch) promoted to
--      ready_for_pickup purely from configured item counts,
--      ignoring the installation tickets entirely.
--
-- Also heals existing data:
--   * stamps order_item_id on orphan key_installation tickets
--     (matched by provenance note -> source ticket_number)
--   * re-evaluates every actionable keys order, demoting
--     wrongly-ready orders back to in_progress when installation
--     is still pending.
--
-- ROLLBACK INSTRUCTIONS (no down migration — Supabase CLI convention):
-- To revert this migration manually, apply the following in order:
--   1. Restore recompute_order_status keys branch from migration 000055
--      (promote to ready_for_pickup on all non-cancelled configured;
--      keys guard back to ('confirmed', 'in_progress')).
--   2. Restore support.tickets_resolution_chain body from migration
--      000039 (spawn key_installation WITHOUT order_item_id).
--   3. order_item_id stamped by the backfill is NOT un-stamped here;
--      linked key_installation tickets remain linked (harmless and
--      more correct even under the old state machine).
-- ============================================================

-- ============================================================
-- STEP 1: Backfill — link orphan key_installation tickets
-- ============================================================
-- The chain trigger always writes notes = 'Generado automáticamente al
-- resolver ' || source_ticket_number. ticket_number is UNIQUE, so this
-- provenance match is deterministic: exactly the tickets the chain
-- spawned before this migration get their order_item_id restored.
update support.tickets ki
   set order_item_id = kc.order_item_id
  from support.tickets kc
 where ki.category = 'key_installation'
   and ki.order_item_id is null
   and kc.category = 'key_configuration'
   and ki.notes = 'Generado automáticamente al resolver ' || kc.ticket_number;

-- ============================================================
-- STEP 2: Chain trigger — spawn key_installation linked to the item
-- ============================================================
-- The key_configuration ticket being resolved carries order_item_id
-- (stamped by confirm_order). Copy it onto the follow-up
-- key_installation ticket so ticket status changes flow back into
-- recompute_order_status via tickets_sync_order_status.
create or replace function support.tickets_resolution_chain()
returns trigger
language plpgsql
security definer
set search_path = support, public
as $$
begin
  -- Only a genuine transition into 'resolved' triggers the chain.
  if new.status <> 'resolved' or old.status = 'resolved' then
    return null;
  end if;

  if new.category = 'key_configuration' then
    insert into support.tickets (
      administration_id,
      building_id,
      unit_id,
      category,
      description,
      status,
      notes,
      order_item_id
    ) values (
      new.administration_id,
      new.building_id,
      new.unit_id,
      'key_installation',
      coalesce(nullif(trim(new.description), ''),
               'Instalación de llave'),
      'open',
      'Generado automáticamente al resolver ' || new.ticket_number,
      new.order_item_id
    );
  end if;

  return null;
end;
$$;

-- ============================================================
-- STEP 3: recompute_order_status — installation-gated keys flow
-- ============================================================
-- Keys branch:
--   * confirmed -> in_progress on the first key 'configured' (unchanged).
--   * in_progress -> ready_for_pickup ONLY when ALL non-cancelled key
--     items are 'configured' AND no unresolved (non-cancelled)
--     key_installation ticket remains for a non-cancelled key item.
--   * ready_for_pickup -> in_progress demote when the condition no
--     longer holds. This covers the configure transaction window: the
--     item flips to 'configured' before the key_configuration ticket is
--     resolved, so for an instant the install ticket does not exist yet
--     and a naive promote would fire; the chain spawn + sync trigger then
--     recompute and demote. Explicit demotion makes the final state
--     correct regardless of trigger ordering.
create or replace function public.recompute_order_status(p_order_id uuid)
returns void
language plpgsql
as $$
declare
  v_current_status     text;
  v_order_type         text;
  v_total_key_items    int;
  v_configured         int;
  v_unresolved_install int;
  v_total_tickets      int;
  v_open               int;
  v_in_progress_t      int;
  v_resolved           int;
begin
  select status, order_type
    into v_current_status, v_order_type
    from public.orders
   where id = p_order_id
   for update;

  -- Terminal states never auto-transition again.
  if v_current_status in ('completed', 'invoiced', 'cancelled') then
    return;
  end if;

  if v_order_type = 'keys' then
    -- Keys flow: transitions from 'confirmed', 'in_progress' or
    -- 'ready_for_pickup' (the latter only for demotion).
    if v_current_status not in ('confirmed', 'in_progress', 'ready_for_pickup') then
      return;
    end if;

    select
      count(*) filter (where item_type = 'key' and status <> 'cancelled'),
      count(*) filter (where item_type = 'key' and status = 'configured')
    into v_total_key_items, v_configured
    from public.order_items
    where order_id = p_order_id;

    if v_total_key_items = 0 then
      return;  -- all key items cancelled → no transition
    end if;

    -- Installation work still pending: a configured key is not ready for
    -- pickup until the technician installed it on the reader.
    select count(*)
      into v_unresolved_install
      from support.tickets t
      join public.order_items oi on oi.id = t.order_item_id
     where oi.order_id = p_order_id
       and oi.item_type = 'key'
       and oi.status <> 'cancelled'
       and t.category = 'key_installation'
       and t.status not in ('resolved', 'cancelled');

    if v_configured > 0 and v_current_status = 'confirmed' then
      -- At least one key configured: advance to in_progress.
      update public.orders
         set status = 'in_progress'
       where id = p_order_id;
      -- Re-read status for the next check.
      v_current_status := 'in_progress';
    end if;

    if v_configured = v_total_key_items and v_unresolved_install = 0 then
      -- All keys produced AND all installations done: ready for pickup.
      if v_current_status <> 'ready_for_pickup' then
        update public.orders
           set status = 'ready_for_pickup'
         where id = p_order_id;
      end if;
    elsif v_current_status = 'ready_for_pickup' then
      -- Keys and/or installation no longer complete: never stay ready.
      update public.orders
         set status = 'in_progress'
       where id = p_order_id;
    end if;

    return;
  end if;

  -- Technical flow: derive from generated tickets.
  -- Source states: 'confirmed' or 'in_progress'.
  if v_current_status not in ('confirmed', 'in_progress') then
    return;
  end if;

  select
    count(*) filter (where status <> 'cancelled'),
    count(*) filter (where status = 'open'),
    count(*) filter (where status = 'in_progress'),
    count(*) filter (where status = 'resolved')
  into v_total_tickets, v_open, v_in_progress_t, v_resolved
  from support.tickets
  where order_item_id in (
    select id from public.order_items where order_id = p_order_id
  );

  if v_total_tickets = 0 then
    return;  -- nothing to derive from
  end if;

  if v_resolved = v_total_tickets then
    update public.orders set status = 'completed' where id = p_order_id;
  elsif v_in_progress_t > 0 or v_resolved > 0 then
    -- Any active work: advance order to in_progress if still at confirmed.
    if v_current_status = 'confirmed' then
      update public.orders set status = 'in_progress' where id = p_order_id;
    end if;
  end if;
end;
$$;

-- ============================================================
-- STEP 4: Heal existing orders
-- ============================================================
-- Re-evaluate every actionable keys order after the backfill so orders
-- wrongly parked in ready_for_pickup (installation pending) drop back to
-- in_progress, and orders that are genuinely ready stay put.
do $$
declare
  v_order_id uuid;
begin
  for v_order_id in
    select distinct oi.order_id
      from public.order_items oi
      join public.orders o on o.id = oi.order_id
     where oi.item_type = 'key'
       and o.status in ('confirmed', 'in_progress', 'ready_for_pickup')
  loop
    perform public.recompute_order_status(v_order_id);
  end loop;
end $$;
