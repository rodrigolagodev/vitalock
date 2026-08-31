-- ============================================================
-- NEW RPC: complete_authorizations
-- ============================================================
-- Atomically completes a batch of key_authorizations, splitting install
-- and remove transitions in a single transaction. Replaces the two-step
-- sequential UPDATE pattern in
--   apps/installer/src/hooks/useCompleteAuthorizations.ts
-- which could leave the batch half-applied on network failure.
--
-- SECURITY INVOKER: relies on RLS + the installer column-restriction
-- trigger already on operations.key_authorizations.
--
-- Note on p_timestamp: the design draft included a p_timestamp arg that
-- was written directly into installed_at / removed_at. That path breaks
-- for installer callers because operations.enforce_installer_key_auth_
-- column_restrictions (migration 20260817000062) forbids the installer
-- role from mutating those audit columns; the auto-fill trigger
-- operations.key_authorizations_sync_timestamps handles them. The
-- signature therefore omits p_timestamp — a single now() timestamp is
-- shared across every row inside the same transaction anyway.

create or replace function public.complete_authorizations(
  p_install_ids uuid[],
  p_remove_ids  uuid[],
  p_staff_id    uuid
) returns void
language plpgsql
security invoker
as $$
declare
  v_expected int;
  v_actual   int;
begin
  if coalesce(array_length(p_install_ids, 1), 0) > 0 then
    v_expected := array_length(p_install_ids, 1);
    update operations.key_authorizations
       set sync_state           = 'installed',
           installed_by_staff_id = p_staff_id
     where id = any(p_install_ids)
       and sync_state = 'pending_install';
    get diagnostics v_actual = row_count;
    if v_actual <> v_expected then
      raise exception 'complete_authorizations: install batch mismatch (expected %, got %)',
        v_expected, v_actual using errcode = 'P0001';
    end if;
  end if;

  if coalesce(array_length(p_remove_ids, 1), 0) > 0 then
    v_expected := array_length(p_remove_ids, 1);
    update operations.key_authorizations
       set sync_state         = 'removed',
           removed_by_staff_id = p_staff_id
     where id = any(p_remove_ids)
       and sync_state = 'pending_removal';
    get diagnostics v_actual = row_count;
    if v_actual <> v_expected then
      raise exception 'complete_authorizations: remove batch mismatch (expected %, got %)',
        v_expected, v_actual using errcode = 'P0001';
    end if;
  end if;
end;
$$;

grant execute on function public.complete_authorizations(uuid[], uuid[], uuid)
  to authenticated;
