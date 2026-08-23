-- ============================================================
-- Install pgTAP extension for the SQL test suite (W17 / PR-10a)
-- ============================================================
-- This migration enables pgTAP so that supabase/tests-sql/*.sql
-- files can use the standard TAP assertion helpers (plan, ok, is,
-- throws_ok, lives_ok, finish, etc.) instead of bare DO-block
-- assert statements.
--
-- pgTAP is installed into the `extensions` schema following the
-- same convention used for other extensions in this project.
-- The Supabase Docker image ships the pgtap extension server-side,
-- so no additional OS package installation is required on the DB
-- host.  On the developer machine, pg_prove must be installed
-- separately (see supabase/tests-sql/README.md).
-- ============================================================

create extension if not exists pgtap with schema extensions;
