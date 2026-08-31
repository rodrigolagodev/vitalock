-- ============================================================
-- ROLLBACK for 20260830000107_create_and_assign_equipment.sql
-- ============================================================
-- Kept outside supabase/migrations/ so it is not picked up by
-- `supabase db reset` / `supabase db push`. Apply manually only when
-- recovering from a bad deploy after `git revert <slice-C commit>`.
--
-- Combined recovery flow:
--   1. git revert <slice-C commit>              (restores hook + wrapper + types)
--   2. psql "$DATABASE_URL" -f this file        (drops the RPC)
--   3. redeploy the reverted client
--
-- DROP ... IF EXISTS is idempotent — safe if the RPC was already reverted
-- or never applied.

drop function if exists public.create_and_assign_equipment(uuid, uuid, text, text, text, text);
