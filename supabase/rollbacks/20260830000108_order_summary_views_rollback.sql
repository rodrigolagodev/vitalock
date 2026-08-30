-- ============================================================
-- ROLLBACK for 20260830000108_order_summary_views.sql
-- ============================================================
-- Kept outside supabase/migrations/ so it is not picked up by
-- `supabase db reset` / `supabase db push`. Apply manually only when
-- recovering from a bad deploy after `git revert <slice-D commit>`.

drop view if exists public.technical_orders_summary;
drop view if exists public.key_orders_summary;
drop index if exists public.administrations_company_name_trgm_idx;
-- pg_trgm extension is not dropped: other objects may depend on it.
