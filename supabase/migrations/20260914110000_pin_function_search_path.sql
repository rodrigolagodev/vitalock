-- ============================================================
-- Pin search_path on every non-definer function in the app schemas
-- ============================================================
-- The security advisor (function_search_path_mutable) and the 2026-08-17
-- audit (#9) flag the invoker trigger/helper functions below: without a
-- pinned search_path their unqualified references resolve against whatever
-- search_path the calling session has.
--
-- The pinned value is `pg_catalog, public, extensions`, i.e. exactly the
-- effective path these functions run with today (the client roles have no
-- per-role search_path, so they inherit the server default
-- `"$user", public, extensions`; no schema is named after a role). This is
-- behavior-preserving: bodies that already qualify identity./operations./
-- sales./support. keep working, unqualified public objects keep resolving.
-- `''` was not used: it would require auditing every body for full
-- qualification, for no security gain over a path made only of schemas
-- client roles cannot write to. test_138 asserts no app function is left
-- unpinned.
-- ============================================================

alter function operations.equipment_close_authorizations_on_dead()
  set search_path = pg_catalog, public, extensions;
alter function operations.equipment_prevent_reassignment()
  set search_path = pg_catalog, public, extensions;
alter function operations.equipment_sync_decommissioned_at()
  set search_path = pg_catalog, public, extensions;
alter function operations.equipment_validate_replacement()
  set search_path = pg_catalog, public, extensions;
alter function operations.equipment_validate_status_transition()
  set search_path = pg_catalog, public, extensions;
alter function operations.key_authorizations_prevent_reassignment()
  set search_path = pg_catalog, public, extensions;
alter function operations.key_authorizations_sync_timestamps()
  set search_path = pg_catalog, public, extensions;
alter function operations.replace_equipment(p_old_equipment_id uuid, p_new_serial_number text, p_new_model text, p_new_description text, p_new_access_type text, p_decommission_reason text, p_replacement_staff_id uuid, p_activate_keys_directly boolean)
  set search_path = pg_catalog, public, extensions;
alter function operations.revoke_key_from_all_equipment(p_rfid_key_id uuid, p_reason text)
  set search_path = pg_catalog, public, extensions;
alter function public.complete_authorizations(p_install_ids uuid[], p_remove_ids uuid[], p_staff_id uuid)
  set search_path = pg_catalog, public, extensions;
alter function public.create_and_assign_equipment(p_ticket_id uuid, p_building_id uuid, p_serial text, p_model text, p_description text, p_access_type text)
  set search_path = pg_catalog, public, extensions;
alter function public.key_orders_terminal_immutable()
  set search_path = pg_catalog, public, extensions;
alter function public.rfid_keys_auto_revoke_on_status_change()
  set search_path = pg_catalog, public, extensions;
alter function public.rfid_keys_prevent_reassignment()
  set search_path = pg_catalog, public, extensions;
alter function public.rfid_keys_sync_deactivated_at()
  set search_path = pg_catalog, public, extensions;
alter function public.rfid_keys_trigger_request_recompute()
  set search_path = pg_catalog, public, extensions;
alter function public.rfid_keys_validate_pickup()
  set search_path = pg_catalog, public, extensions;
alter function public.rfid_keys_validate_request_link()
  set search_path = pg_catalog, public, extensions;
alter function public.set_updated_at()
  set search_path = pg_catalog, public, extensions;
alter function public.stock_movements_prevent_modification()
  set search_path = pg_catalog, public, extensions;
alter function public.technical_orders_terminal_immutable()
  set search_path = pg_catalog, public, extensions;
alter function sales.bill_items_check_parent_editable()
  set search_path = pg_catalog, public, extensions;
alter function sales.bills_prevent_cancel_with_payments()
  set search_path = pg_catalog, public, extensions;
alter function sales.bills_validate()
  set search_path = pg_catalog, public, extensions;
alter function sales.compute_item_subtotal()
  set search_path = pg_catalog, public, extensions;
alter function sales.gen_bill_number()
  set search_path = pg_catalog, public, extensions;
alter function sales.gen_key_request_number()
  set search_path = pg_catalog, public, extensions;
alter function sales.gen_quote_number()
  set search_path = pg_catalog, public, extensions;
alter function sales.generate_recurring_charges(p_year integer, p_month integer)
  set search_path = pg_catalog, public, extensions;
alter function sales.key_request_items_validate()
  set search_path = pg_catalog, public, extensions;
alter function sales.key_requests_validate()
  set search_path = pg_catalog, public, extensions;
alter function sales.payments_validate()
  set search_path = pg_catalog, public, extensions;
alter function sales.quote_items_check_parent_editable()
  set search_path = pg_catalog, public, extensions;
alter function sales.quotes_validate()
  set search_path = pg_catalog, public, extensions;
alter function sales.recompute_bill_total()
  set search_path = pg_catalog, public, extensions;
alter function sales.recompute_quote_total()
  set search_path = pg_catalog, public, extensions;
alter function sales.recompute_request_status(p_request_id uuid)
  set search_path = pg_catalog, public, extensions;
alter function sales.validate_product_active_on_reference()
  set search_path = pg_catalog, public, extensions;
alter function support.auto_transition_equipment_on_maintenance()
  set search_path = pg_catalog, public, extensions;
alter function support.enforce_installer_ticket_column_restrictions()
  set search_path = pg_catalog, public, extensions;
alter function support.gen_ticket_number()
  set search_path = pg_catalog, public, extensions;
alter function support.ticket_comments_prevent_modification()
  set search_path = pg_catalog, public, extensions;
alter function support.tickets_block_equipment_update_cancel_in_progress()
  set search_path = pg_catalog, public, extensions;
alter function support.tickets_require_equipment_on_resolve()
  set search_path = pg_catalog, public, extensions;
alter function support.tickets_terminal_immutable()
  set search_path = pg_catalog, public, extensions;
alter function support.tickets_validate()
  set search_path = pg_catalog, public, extensions;
