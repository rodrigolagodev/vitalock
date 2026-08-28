-- ============================================================
-- Migration: fix installer RLS on equipment-updates-mdb storage bucket
-- ============================================================
-- Same bug as the table-level RLS closed in migration 20260828000105 but
-- on the storage.objects side.
--
-- The policy `installer_read_assigned_equipment_updates_mdb` (migration
-- 20260818000071) compared `t.assigned_to_staff_id = auth.uid()`. Those
-- are distinct UUIDs — `assigned_to_staff_id` references
-- `identity.staff.id` while `auth.uid()` returns `auth.users.id`. The
-- installer therefore could not create a signed URL nor download the
-- `.mdb` file for their own assigned ticket, even after the table-level
-- fix landed.
--
-- Fix: use `identity.current_staff_id()` — matches the pattern of every
-- other installer_* policy in the codebase.
-- ============================================================

drop policy if exists "installer_read_assigned_equipment_updates_mdb"
  on storage.objects;

create policy "installer_read_assigned_equipment_updates_mdb"
  on storage.objects
  for select to authenticated
  using (
    bucket_id = 'equipment-updates-mdb'
    and identity.is_installer()
    and exists (
      select 1
        from support.tickets t
       where t.id::text = split_part(name, '/', 1)
         and t.assigned_to_staff_id = identity.current_staff_id()
    )
  );
