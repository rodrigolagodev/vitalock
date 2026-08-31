-- ============================================================
-- RLS policies for public.products + public.stock_movements
-- ============================================================
-- Mirrors the role model of 20260808000015_rls_real_policies.sql:
--   * ADMIN (identity.is_admin())  — full access to both tables.
--   * INSTALLER                    — NO access (RLS filters every row; the
--     spec explicitly forbids installer SELECT on stock tables).
--
-- RLS was already enabled on both tables (000028 / 000029); those migrations
-- shipped a stale comment pointing at "20260811000038_stock_rls_policies.sql"
-- (the design-doc number pre-empted by the particulares change). This
-- migration ships as 20260811000043_stock_rls_policies.sql.

create policy admin_all_products
  on public.products
  for all to authenticated
  using (identity.is_admin())
  with check (identity.is_admin());

create policy admin_all_stock_movements
  on public.stock_movements
  for all to authenticated
  using (identity.is_admin())
  with check (identity.is_admin());

-- Deliberately no installer policies: installers get zero rows on both
-- tables. All writes funnel through SECURITY DEFINER RPCs
-- (create_stock_movement, create_product_with_initial_stock,
-- configure_key_order_item, resolve_equipment_installation) or SECURITY
-- DEFINER triggers (order_items_create_tarea), so the ledger stays intact.
