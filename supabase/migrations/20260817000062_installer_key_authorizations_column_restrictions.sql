-- Restrict which columns installers can UPDATE on operations.key_authorizations.
--
-- Context: RLS policy `installer_update_key_authorizations` allows installers
-- to UPDATE any row where they can SELECT it, without column-level restriction.
-- Existing triggers already protect `equipment_id` / `rfid_key_id` (via
-- prevent_reassignment) and auto-fill `installed_at` / `removed_at` (via
-- sync_timestamps), but installers can still mutate audit columns freely —
-- e.g. attribute an installation to a different staff member, or overwrite
-- historical timestamps.
--
-- This trigger closes those gaps:
--   * timestamps: never editable by installer.
--   * *_by_staff_id: only self-attribution allowed.
--   * created_at: never editable.
--
-- Admin path is unaffected (identity.is_admin() short-circuits the check).

create or replace function operations.enforce_installer_key_auth_column_restrictions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := identity.current_staff_role();
  v_staff_id uuid := identity.current_staff_id();
begin
  if v_role <> 'installer' then
    return new;
  end if;

  if new.installed_at is distinct from old.installed_at then
    raise exception 'installer cannot modify installed_at (auto-filled)'
      using errcode = 'insufficient_privilege';
  end if;

  if new.removed_at is distinct from old.removed_at then
    raise exception 'installer cannot modify removed_at (auto-filled)'
      using errcode = 'insufficient_privilege';
  end if;

  if new.created_at is distinct from old.created_at then
    raise exception 'installer cannot modify created_at'
      using errcode = 'insufficient_privilege';
  end if;

  if new.installed_by_staff_id is distinct from old.installed_by_staff_id
     and new.installed_by_staff_id is distinct from v_staff_id then
    raise exception 'installer can only attribute installed_by_staff_id to self'
      using errcode = 'insufficient_privilege';
  end if;

  if new.removed_by_staff_id is distinct from old.removed_by_staff_id
     and new.removed_by_staff_id is distinct from v_staff_id then
    raise exception 'installer can only attribute removed_by_staff_id to self'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

comment on function operations.enforce_installer_key_auth_column_restrictions is
  'Blocks installer role from modifying audit columns on key_authorizations '
  '(timestamps, created_at) and forces self-attribution on *_by_staff_id.';

drop trigger if exists key_authorizations_enforce_installer_columns
  on operations.key_authorizations;

create trigger key_authorizations_enforce_installer_columns
before update on operations.key_authorizations
for each row execute function operations.enforce_installer_key_auth_column_restrictions();
