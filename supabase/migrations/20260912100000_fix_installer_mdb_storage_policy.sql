-- ============================================================
-- Fix: installers could not download the .mdb of their assigned
-- equipment-update task.
-- ============================================================
-- The original storage policy assumed the object path started with the
-- ticket id (`<ticket_id>/<file>`). The admin app never wrote that shape:
-- the ticket is created by create_equipment_update *after* the upload, so
-- the client uploads to `pending-<equipment_id>/<file>` and the policy's
-- split_part(name, '/', 1) = ticket.id check never matched. Admins were
-- unaffected because admin_all_equipment_updates_mdb bypasses the check.
--
-- Bind the object to the row that references it instead of to a path
-- convention: an installer may read an object iff some equipment_update
-- points at it via mdb_storage_path and its ticket is assigned to them.
-- ============================================================

drop policy if exists "installer_read_assigned_equipment_updates_mdb" on storage.objects;

create policy "installer_read_assigned_equipment_updates_mdb"
  on storage.objects
  for select to authenticated
  using (
    bucket_id = 'equipment-updates-mdb'
    and identity.is_installer()
    and exists (
      select 1
        from support.equipment_updates eu
        join support.tickets t on t.id = eu.ticket_id
       where eu.mdb_storage_path = storage.objects.name
         and t.assigned_to_staff_id = identity.current_staff_id()
    )
  );

comment on policy "installer_read_assigned_equipment_updates_mdb" on storage.objects is
  'Installer reads an .mdb only when an equipment_update references it and its ticket is assigned to them. Fixed 2026-09-12: the previous ticket-id path prefix never matched the pending-<equipment_id>/ paths the admin app writes.';
