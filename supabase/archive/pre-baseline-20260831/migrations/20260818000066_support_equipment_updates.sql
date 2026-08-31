-- ============================================================
-- Migration: support.equipment_updates table
-- ============================================================
-- New table co-located with support.tickets. Stores the frozen
-- snapshot of keys-to-activate / keys-to-disable for an equipment
-- update task, plus the .mdb storage path for the installer.
--
-- At-most-one open update per equipment enforced by partial unique index.
-- ============================================================

create table support.equipment_updates (
  id                    uuid        primary key default gen_random_uuid(),
  ticket_id             uuid        not null unique references support.tickets(id) on delete cascade,
  equipment_id          uuid        not null references operations.equipment(id) on delete restrict,
  mdb_storage_path      text        not null,
  keys_to_activate      uuid[]      not null default '{}',
  keys_to_disable       uuid[]      not null default '{}',
  created_at            timestamptz not null default now(),
  created_by_staff_id   uuid        references identity.staff(id) on delete set null,
  resolved_at           timestamptz,
  resolved_by_staff_id  uuid        references identity.staff(id) on delete set null,
  constraint equipment_updates_snapshot_nonempty
    check (cardinality(keys_to_activate) + cardinality(keys_to_disable) > 0)
);

-- At most one open (unresolved) update per equipment.
create unique index equipment_updates_one_open_per_equipment_uidx
  on support.equipment_updates (equipment_id)
  where resolved_at is null;

create index equipment_updates_ticket_id_idx on support.equipment_updates (ticket_id);
create index equipment_updates_equipment_id_idx on support.equipment_updates (equipment_id);

-- -------------------------------------------------------
-- RLS
-- -------------------------------------------------------
alter table support.equipment_updates enable row level security;

-- Admin: full CRUD
create policy "admin_all_equipment_updates" on support.equipment_updates
  for all to authenticated
  using (identity.is_admin())
  with check (identity.is_admin());

-- Installer: SELECT only on tasks assigned to them (via ticket)
create policy "installer_read_assigned_equipment_updates" on support.equipment_updates
  for select to authenticated
  using (
    exists (
      select 1
        from support.tickets t
       where t.id = equipment_updates.ticket_id
         and t.assigned_to_staff_id = auth.uid()
    )
  );
