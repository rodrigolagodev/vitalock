-- ============================================================
-- AUTH HELPERS — funciones que la RLS de todas las tablas consume
-- ============================================================
-- Vinculan auth.users con identity.staff. SECURITY DEFINER para que puedan
-- leer identity.staff aunque el caller no tenga privilegios directos.

------------------------------------------------------------
-- current_staff_id: retorna el id del staff logueado, o NULL si no es staff.
------------------------------------------------------------
create or replace function identity.current_staff_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from identity.staff where auth_user_id = auth.uid();
$$;

comment on function identity.current_staff_id is
  'Returns the identity.staff.id of the currently authenticated user, or NULL.';

------------------------------------------------------------
-- current_staff_role: 'admin' | 'installer' | 'viewer' | NULL.
------------------------------------------------------------
create or replace function identity.current_staff_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select role from identity.staff where auth_user_id = auth.uid();
$$;

comment on function identity.current_staff_role is
  'Returns the role of the currently authenticated staff, or NULL if not staff.';

------------------------------------------------------------
-- is_admin / is_installer: booleans para uso directo en policies.
------------------------------------------------------------
create or replace function identity.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select role = 'admin' from identity.staff
      where auth_user_id = auth.uid() and status = 'active'),
    false
  );
$$;

create or replace function identity.is_installer()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select role = 'installer' from identity.staff
      where auth_user_id = auth.uid() and status = 'active'),
    false
  );
$$;

comment on function identity.is_admin is
  'True when the current auth user is an active staff member with role=admin.';
comment on function identity.is_installer is
  'True when the current auth user is an active staff member with role=installer.';

-- Los grants a authenticated + service_role los hereda del schema. Estas
-- funciones son SECURITY DEFINER así que corren con los privilegios del
-- creator (postgres). No hace falta grant explícito adicional.
grant execute on function identity.current_staff_id, identity.current_staff_role,
                          identity.is_admin, identity.is_installer
   to authenticated, service_role;
