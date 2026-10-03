-- ============================================================
-- Installers may only update key authorizations that are still pending
-- ============================================================
-- Business rule (confirmed 2026-10): the key-authorization worklist is
-- SHARED — every installer sees and may complete every pending
-- authorization, in any building. There is deliberately no per-installer
-- scoping (authorizations are not linked to an installer or a ticket).
--
-- What was too broad: the baseline policy let an installer UPDATE *any*
-- row, including settled ones (installed / removed / cancelled), e.g. to
-- rewrite notes or remove_reason on history. Now:
--   USING      — the row must currently be pending_install or pending_removal
--                (exactly what the worklist shows and complete_authorizations
--                targets).
--   WITH CHECK — the new row may only be a pending state or the completion
--                states an installer produces (installed / removed).
--                `cancelled` stays admin-only. Transition validity is still
--                enforced by operations.key_authorizations_validate, and
--                column restrictions by
--                operations.enforce_installer_key_auth_column_restrictions.
-- Admins are unaffected (admin_all_key_authorizations).
-- ============================================================

drop policy if exists installer_update_key_authorizations on operations.key_authorizations;

create policy installer_update_key_authorizations
  on operations.key_authorizations
  for update
  to authenticated
  using (
    identity.is_installer()
    and sync_state in ('pending_install', 'pending_removal')
  )
  with check (
    identity.is_installer()
    and sync_state in ('pending_install', 'pending_removal', 'installed', 'removed')
  );
