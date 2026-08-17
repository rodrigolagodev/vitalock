-- ============================================================
-- Migration: tickets category CHECK + require_equipment patch + cancel guard
-- ============================================================
-- (1) Adds 'equipment_update' to support.tickets.category CHECK.
-- (2) Updates tickets_require_equipment_on_resolve to include equipment_update.
-- (3) Installs cancel guard: BEFORE UPDATE trigger that blocks
--     in_progress → cancelled for equipment_update category.
--
-- Co-migrated as a critical CHECK+trigger pair (ref: 000061 lesson).
-- ============================================================

-- -------------------------------------------------------
-- (1) Expand tickets.category CHECK
-- -------------------------------------------------------
alter table support.tickets drop constraint tickets_category_check;
alter table support.tickets add constraint tickets_category_check
  check (category in (
    'maintenance',
    'installation',
    'key_configuration',
    'key_installation',
    'equipment_installation',
    'equipment_replacement',
    'equipment_update'
  ));

-- -------------------------------------------------------
-- (2) Update tickets_require_equipment_on_resolve to include equipment_update
-- -------------------------------------------------------
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
      'equipment_replacement',
      'equipment_update'
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

-- -------------------------------------------------------
-- (3) Cancel guard: block in_progress → cancelled for equipment_update
-- -------------------------------------------------------
create or replace function support.tickets_block_equipment_update_cancel_in_progress()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'cancelled'
     and old.status = 'in_progress'
     and old.category = 'equipment_update' then
    raise exception 'equipment_update in_progress tickets cannot be cancelled'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists tickets_block_equipment_update_cancel_in_progress
  on support.tickets;

create trigger tickets_block_equipment_update_cancel_in_progress
before update of status on support.tickets
for each row execute function support.tickets_block_equipment_update_cancel_in_progress();
