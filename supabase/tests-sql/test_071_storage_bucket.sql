-- ============================================================
-- DB smoke test: equipment-updates-mdb storage bucket
-- ============================================================
-- Prerequisite: migration 071 applied.
-- Tests bucket existence and configuration.
-- ============================================================

-- ============================================================
-- Scenario 1: equipment-updates-mdb bucket exists and is private
-- ============================================================
begin;
do $$
declare
  v_bucket_id  text;
  v_is_public  boolean;
  v_size_limit bigint;
begin
  select id, public, file_size_limit
    into v_bucket_id, v_is_public, v_size_limit
    from storage.buckets
   where id = 'equipment-updates-mdb';

  assert v_bucket_id is not null, 'FAIL 071-S1: bucket equipment-updates-mdb does not exist';
  assert v_is_public = false, 'FAIL 071-S1: bucket must be private (public=false)';
  assert v_size_limit = 52428800, 'FAIL 071-S1: expected file_size_limit=52428800 (50 MB), got ' || v_size_limit::text;

  raise notice 'PASS scenario-1: equipment-updates-mdb bucket exists, is private, 50 MB limit';
end $$;
rollback;

-- ============================================================
-- Scenario 2: RLS policies exist on storage.objects for this bucket
-- ============================================================
begin;
do $$
declare
  v_admin_policy_count   int;
  v_installer_policy_count int;
begin
  -- Check admin policy exists
  select count(*) into v_admin_policy_count
    from pg_policies
   where schemaname = 'storage'
     and tablename = 'objects'
     and policyname = 'admin_all_equipment_updates_mdb';

  assert v_admin_policy_count = 1,
    'FAIL 071-S2: admin_all_equipment_updates_mdb policy not found';

  -- Check installer policy exists
  select count(*) into v_installer_policy_count
    from pg_policies
   where schemaname = 'storage'
     and tablename = 'objects'
     and policyname = 'installer_read_assigned_equipment_updates_mdb';

  assert v_installer_policy_count = 1,
    'FAIL 071-S2: installer_read_assigned_equipment_updates_mdb policy not found';

  raise notice 'PASS scenario-2: RLS policies exist on storage.objects';
end $$;
rollback;
