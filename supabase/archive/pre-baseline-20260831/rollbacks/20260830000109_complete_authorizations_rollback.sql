-- ============================================================
-- ROLLBACK for 20260830000109_complete_authorizations.sql
-- ============================================================
-- Kept outside supabase/migrations/ so it is not applied by
-- `supabase db reset` / `supabase db push`. Apply manually only when
-- recovering from a bad deploy after `git revert <slice-E commit>`.

drop function if exists public.complete_authorizations(uuid[], uuid[], uuid);
