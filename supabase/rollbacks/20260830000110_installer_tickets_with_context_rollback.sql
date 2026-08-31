-- ============================================================
-- ROLLBACK for 20260830000110_installer_tickets_with_context.sql
-- ============================================================
-- Kept outside supabase/migrations/ so it is not applied by
-- `supabase db reset` / `supabase db push`. Apply manually only when
-- recovering from a bad deploy after `git revert <slice-F commit>`.

drop view if exists support.installer_tickets_with_context;
