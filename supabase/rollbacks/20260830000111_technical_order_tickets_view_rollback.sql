-- ============================================================
-- ROLLBACK for 20260830000111_technical_order_tickets_view.sql
-- ============================================================
-- Kept outside supabase/migrations/ so it is not applied by
-- `supabase db reset` / `supabase db push`. Apply manually only when
-- recovering from a bad deploy after `git revert <slice-A commit>`.

DROP VIEW IF EXISTS support.technical_order_tickets;
