-- ============================================================
-- Migration: technical_order_items.intended_replacement_equipment_id
-- ============================================================
-- Adds a second equipment FK to distinguish OLD vs NEW equipment on
-- equipment_replacement items.
--
-- Domain: when the tech replaces a piece of equipment, TWO equipment
-- instances are involved:
--   * intended_equipment_id             — the equipment currently installed
--                                         at the building (being removed).
--   * intended_replacement_equipment_id — the equipment sitting in the
--                                         warehouse that will be installed
--                                         (serial number is filled by the
--                                         installer in the field).
--
-- Both equipment records exist in operations.equipment before the order is
-- created; the warehouse unit has no serial yet.
--
-- Rules:
--   * intended_replacement_equipment_id is nullable in draft, required at
--     confirm for equipment_replacement items (enforced by the RPC).
--   * It MUST be null for non-replacement item types (CHECK).
--   * It cannot equal intended_equipment_id (CHECK).
--   * It is subject to the same intent-immutability trigger as the other
--     intent columns once the parent order leaves draft.

alter table public.technical_order_items
  add column intended_replacement_equipment_id uuid
    references operations.equipment(id) on delete set null;

create index technical_order_items_intended_replacement_equipment_id_idx
  on public.technical_order_items (intended_replacement_equipment_id)
  where intended_replacement_equipment_id is not null;

-- Only equipment_replacement items may set the replacement FK.
alter table public.technical_order_items
  add constraint technical_order_items_replacement_only_for_replacement_type
    check (
      intended_replacement_equipment_id is null
      or item_type = 'equipment_replacement'
    );

-- Replacement cannot be the same equipment as the target.
alter table public.technical_order_items
  add constraint technical_order_items_replacement_not_equal_to_target
    check (
      intended_replacement_equipment_id is null
      or intended_equipment_id is null
      or intended_replacement_equipment_id <> intended_equipment_id
    );

-- Extend the intent-immutability trigger to cover the new column.
create or replace function public.technical_order_items_intent_immutable()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_parent_status text;
begin
  if new.intended_equipment_id is not distinct from old.intended_equipment_id
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

grant execute on function public.technical_order_items_intent_immutable to authenticated, service_role;
