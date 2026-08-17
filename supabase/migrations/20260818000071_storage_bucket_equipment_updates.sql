-- ============================================================
-- Migration: equipment-updates-mdb storage bucket + policies
-- ============================================================
-- Private bucket for .mdb files attached to equipment_update tasks.
-- Path scheme: {ticket_id}/{filename}.mdb
-- Size cap: 50 MB (Access databases rarely exceed 10 MB; 50 MB is safe ceiling).
-- ============================================================

-- -------------------------------------------------------
-- Bucket
-- -------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values (
    'equipment-updates-mdb',
    'equipment-updates-mdb',
    false,
    52428800,  -- 50 MB
    array['application/x-msaccess', 'application/msaccess', 'application/octet-stream']
  )
  on conflict (id) do update
    set public          = false,
        file_size_limit = 52428800;

-- -------------------------------------------------------
-- Admin: full CRUD
-- -------------------------------------------------------
create policy "admin_all_equipment_updates_mdb" on storage.objects
  for all to authenticated
  using  (bucket_id = 'equipment-updates-mdb' and identity.is_admin())
  with check (bucket_id = 'equipment-updates-mdb' and identity.is_admin());

-- -------------------------------------------------------
-- Installer: SELECT only for assigned tickets
-- Path prefix: {ticket_id}/...
-- -------------------------------------------------------
create policy "installer_read_assigned_equipment_updates_mdb" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'equipment-updates-mdb'
    and exists (
      select 1
        from support.tickets t
       where t.id::text = split_part(name, '/', 1)
         and t.assigned_to_staff_id = auth.uid()
    )
  );
