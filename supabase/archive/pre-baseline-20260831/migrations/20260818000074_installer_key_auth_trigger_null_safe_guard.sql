-- Fix null-safety bug in operations.enforce_installer_key_auth_column_restrictions.
--
-- The original guard `if v_role <> 'installer' then return new;` short-circuits
-- fine when v_role resolves to a real non-installer role (e.g. 'admin'), but
-- silently falls through when v_role IS NULL. That happens whenever the writer
-- has no Supabase auth session — most notably: seed application, data
-- migrations, backfills, and any admin script run as the `postgres` superuser
-- via psql. Because `NULL <> 'installer'` yields NULL, and PL/pgSQL treats
-- NULL as FALSE in an `if` condition, execution enters the restricted block
-- with `v_staff_id = NULL`. A subsequent write of `installed_by_staff_id` to
-- any real UUID then trips the "installer can only attribute to self" check
-- (because `<uuid> IS DISTINCT FROM NULL` is TRUE).
--
-- Intended semantic: only sessions authenticated AS an installer are subject
-- to these restrictions. Unauthenticated / non-installer sessions must pass
-- through untouched. Replacing `<>` with `IS DISTINCT FROM` makes that true,
-- because `NULL IS DISTINCT FROM 'installer'` is TRUE.
--
-- Behavior for real installers (v_role = 'installer', v_staff_id = their id)
-- is unchanged: the guard returns FALSE for them, execution enters the
-- restricted block, and each self-attribution check works exactly as before.

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
  if v_role is distinct from 'installer' then
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
