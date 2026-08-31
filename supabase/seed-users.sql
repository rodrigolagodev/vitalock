-- ============================================================
-- Seed users para testing E2E manual (LOCAL DEV ONLY)
-- ============================================================
-- Idempotente: podés correrlo cuantas veces quieras.
-- No lo apliques a producción — passwords hardcodeados.
--
-- Uso:
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--     -f supabase/seed-users.sql
--
-- Credenciales creadas:
--   admin@vitalock.local     / Admin123!     (rol admin)
--   installer@vitalock.local / Installer123! (rol installer)
-- ============================================================

do $$
declare
  v_admin_id     uuid;
  v_installer_id uuid;
begin
  ------------------------------------------------------------
  -- Admin
  ------------------------------------------------------------
  select id into v_admin_id
    from auth.users
   where email = 'admin@vitalock.local' and is_sso_user = false;

  if v_admin_id is null then
    v_admin_id := gen_random_uuid();
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at,
      confirmation_token, email_change, email_change_token_new, recovery_token
    ) values (
      '00000000-0000-0000-0000-000000000000',
      v_admin_id,
      'authenticated', 'authenticated',
      'admin@vitalock.local',
      crypt('Admin123!', gen_salt('bf')),
      now(),
      jsonb_build_object('provider', 'email', 'providers', array['email']),
      '{}'::jsonb,
      now(), now(),
      '', '', '', ''
    );
  else
    update auth.users
       set encrypted_password = crypt('Admin123!', gen_salt('bf')),
           email_confirmed_at = coalesce(email_confirmed_at, now()),
           updated_at         = now()
     where id = v_admin_id;
  end if;

  insert into identity.staff (auth_user_id, full_name, email, role, status)
       values (v_admin_id, 'Admin Vitalock', 'admin@vitalock.local', 'admin', 'active')
  on conflict (email) do update
    set auth_user_id = excluded.auth_user_id,
        role         = excluded.role,
        status       = excluded.status,
        updated_at   = now();

  ------------------------------------------------------------
  -- Installer
  ------------------------------------------------------------
  select id into v_installer_id
    from auth.users
   where email = 'installer@vitalock.local' and is_sso_user = false;

  if v_installer_id is null then
    v_installer_id := gen_random_uuid();
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at,
      confirmation_token, email_change, email_change_token_new, recovery_token
    ) values (
      '00000000-0000-0000-0000-000000000000',
      v_installer_id,
      'authenticated', 'authenticated',
      'installer@vitalock.local',
      crypt('Installer123!', gen_salt('bf')),
      now(),
      jsonb_build_object('provider', 'email', 'providers', array['email']),
      '{}'::jsonb,
      now(), now(),
      '', '', '', ''
    );
  else
    update auth.users
       set encrypted_password = crypt('Installer123!', gen_salt('bf')),
           email_confirmed_at = coalesce(email_confirmed_at, now()),
           updated_at         = now()
     where id = v_installer_id;
  end if;

  insert into identity.staff (auth_user_id, full_name, email, role, status)
       values (v_installer_id, 'Installer Vitalock', 'installer@vitalock.local', 'installer', 'active')
  on conflict (email) do update
    set auth_user_id = excluded.auth_user_id,
        role         = excluded.role,
        status       = excluded.status,
        updated_at   = now();

  raise notice 'Seed users ready: admin@vitalock.local (Admin123!), installer@vitalock.local (Installer123!)';
end $$;

select s.email, s.role, s.status, u.email_confirmed_at is not null as confirmed
  from identity.staff s
  join auth.users u on u.id = s.auth_user_id
 order by s.role;
