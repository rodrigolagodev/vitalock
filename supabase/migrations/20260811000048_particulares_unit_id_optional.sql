-- ============================================================
-- particulares.unit_id: make optional
-- ============================================================
-- A particular can now be created without a unit binding. The
-- UNIQUE constraint on unit_id remains (PostgreSQL allows multiple
-- NULLs by default), so the 1:1 unit ↔ particular guarantee holds
-- whenever a unit is present.

alter table public.particulares
  alter column unit_id drop not null;
