-- ============================================================
-- pgTAP: equipment-updates-mdb storage bucket
-- ============================================================
-- Prerequisite: migration 071 applied.
-- Tests bucket existence and RLS policy configuration.
-- Identifier markers: PASS 071-S1 through PASS 071-S2 preserved.
-- Note: storage schema state is asserted via pg_policies /
-- storage.buckets catalog queries — wrapped in lives_ok because
-- the exact bucket/policy shape cannot be meaningfully expressed
-- as a single scalar ok() argument.
-- ============================================================

BEGIN;
SELECT plan(2);

-- ============================================================
-- Scenario 1 (PASS 071-S1): equipment-updates-mdb bucket exists and is private
-- ============================================================
SELECT lives_ok(
  $q$
    DO $$
    DECLARE
      v_bucket_id  text;
      v_is_public  boolean;
      v_size_limit bigint;
    BEGIN
      SELECT id, public, file_size_limit
        INTO v_bucket_id, v_is_public, v_size_limit
        FROM storage.buckets
       WHERE id = 'equipment-updates-mdb';

      ASSERT v_bucket_id IS NOT NULL, 'FAIL 071-S1: bucket equipment-updates-mdb does not exist';
      ASSERT v_is_public = false, 'FAIL 071-S1: bucket must be private (public=false)';
      ASSERT v_size_limit = 52428800, 'FAIL 071-S1: expected file_size_limit=52428800 (50 MB), got ' || v_size_limit::text;
    END $$;
  $q$,
  'PASS 071-S1: equipment-updates-mdb bucket exists, is private, 50 MB limit'
);

-- ============================================================
-- Scenario 2 (PASS 071-S2): RLS policies exist on storage.objects
-- ============================================================
SELECT lives_ok(
  $q$
    DO $$
    DECLARE
      v_admin_policy_count     int;
      v_installer_policy_count int;
    BEGIN
      SELECT count(*) INTO v_admin_policy_count
        FROM pg_policies
       WHERE schemaname = 'storage'
         AND tablename  = 'objects'
         AND policyname = 'admin_all_equipment_updates_mdb';

      ASSERT v_admin_policy_count = 1,
        'FAIL 071-S2: admin_all_equipment_updates_mdb policy not found';

      SELECT count(*) INTO v_installer_policy_count
        FROM pg_policies
       WHERE schemaname = 'storage'
         AND tablename  = 'objects'
         AND policyname = 'installer_read_assigned_equipment_updates_mdb';

      ASSERT v_installer_policy_count = 1,
        'FAIL 071-S2: installer_read_assigned_equipment_updates_mdb policy not found';
    END $$;
  $q$,
  'PASS 071-S2: RLS policies exist on storage.objects for equipment-updates-mdb'
);

SELECT * FROM finish();
ROLLBACK;
