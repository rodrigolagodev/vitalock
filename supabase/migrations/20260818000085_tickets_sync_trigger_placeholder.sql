-- ============================================================
-- Migration: tickets_sync_order_status trigger rewrite (placeholder)
--            + technical_order_items intent-immutability trigger
-- ============================================================
-- Rewrites the existing tickets_sync_order_status trigger function to
-- branch on the dual-FK columns introduced in 20260818000084.
--
-- PR-1 PLACEHOLDER: recompute_key_order_status and
-- recompute_technical_order_status RPCs do not exist yet — they land in
-- PR-2 (migration 09). For now the trigger is a NO-OP stub that will be
-- extended in migration 09 (W4/W5 apply phase).
--
-- NOTE: This function will be replaced in migration 09 with the real
-- recompute calls once recompute_key_order_status(uuid) and
-- recompute_technical_order_status(uuid) are defined.
--
-- Also creates the intent-immutability trigger on technical_order_items
-- per design §3 — this guard IS complete and production-ready in PR-1.
--
-- Depends on: 20260818000084 (dual FK columns exist on tickets)
--             20260818000082 (technical_order_items exists)

-- -------------------------------------------------------
-- tickets_sync_order_status — rewritten for dual-FK schema
-- -------------------------------------------------------
-- NOTE: Placeholder body — will be extended in migration 09 (PR-2) once
-- recompute_key_order_status and recompute_technical_order_status exist.
create or replace function public.tickets_sync_order_status()
returns trigger
language plpgsql
security definer
set search_path = public, support, extensions
as $$
begin
  -- Both FKs null: ticket is not linked to any order item.
  -- No recompute needed. This is the only live path in PR-1.
  -- NOTE: Extended in migration 09 to call recompute_key_order_status and
  -- recompute_technical_order_status once those functions are created (W4/W5).
  if new.key_order_item_id is null and new.technical_order_item_id is null then
    return new;
  end if;

  -- Placeholder: branches below will be filled in migration 09.
  -- They are structured here to make the extension point explicit.
  if new.technical_order_item_id is not null then
    -- Will call: perform public.recompute_technical_order_status(order_id);
    null; -- no-op until migration 09
  end if;

  if new.key_order_item_id is not null then
    -- Will call: perform public.recompute_key_order_status(order_id);
    null; -- no-op until migration 09
  end if;

  return new;
end;
$$;

-- Re-wire the trigger on support.tickets.
-- The old trigger was created in 20260811000050 on the old schema.
-- We drop-and-recreate to bind the updated function body.
drop trigger if exists tickets_sync_order_status_trigger on support.tickets;

create trigger tickets_sync_order_status_trigger
after insert or update of status on support.tickets
for each row execute function public.tickets_sync_order_status();

-- -------------------------------------------------------
-- technical_order_items_intent_immutable — design §3
-- -------------------------------------------------------
-- Prevents mutation of intended_equipment_id and
-- intended_assignee_staff_id after the parent order leaves 'draft'.
-- This is a fast-path trigger: if neither intent column is being changed,
-- it returns immediately at near-zero cost.
create or replace function public.technical_order_items_intent_immutable()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_parent_status text;
begin
  -- Fast path: neither intent column is being changed.
  if new.intended_equipment_id is not distinct from old.intended_equipment_id
     and new.intended_assignee_staff_id is not distinct from old.intended_assignee_staff_id
  then
    return new;
  end if;

  select status into v_parent_status
    from public.technical_orders
   where id = new.order_id;

  if v_parent_status <> 'draft' then
    raise exception 'TECHNICAL_ORDER_ITEM_INTENT_LOCKED: intended_equipment_id and intended_assignee_staff_id are immutable once the order leaves draft (order_id=%, status=%)',
      new.order_id, v_parent_status
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

create trigger technical_order_items_intent_immutable_trigger
before update on public.technical_order_items
for each row execute function public.technical_order_items_intent_immutable();

-- Grant execute on new/updated functions.
grant execute on function public.tickets_sync_order_status          to authenticated, service_role;
grant execute on function public.technical_order_items_intent_immutable to authenticated, service_role;
