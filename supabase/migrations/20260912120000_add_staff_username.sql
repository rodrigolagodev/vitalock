-- ============================================================
-- identity.staff.username — login identifier + resolve_login_email RPC
-- ============================================================
-- Adds the username-based login identifier and the anon-callable RPC that
-- resolves it to the linked auth.users.email before signInWithPassword.
--
--   1. Add nullable `username`.
--   2. Backfill every existing row from the lowercased local-part of its
--      email (disallowed chars -> '.'), falling back to `staff-<id prefix>`
--      when the derived value is too short; collisions get a numeric
--      suffix (-2, -3, ...).
--   3. Enforce NOT NULL, format, and uniqueness.
--   4. Give the column a random-safe DEFAULT so any INSERT that omits
--      username (pgTAP fixtures, local seed scripts) still satisfies NOT
--      NULL/format/uniqueness. Every real app write goes through
--      useMutateStaff, which always supplies username explicitly.
--   5. Add public.resolve_login_email(text), SECURITY DEFINER, guarded by
--      privilege (anon is the intended caller — no role gate applies).
-- ============================================================

alter table identity.staff add column username text;

with base_calc as (
  select
    id,
    created_at,
    regexp_replace(lower(split_part(coalesce(email, ''), '@', 1)), '[^a-z0-9._-]', '.', 'g') as raw_base
  from identity.staff
),
resolved as (
  select
    id,
    created_at,
    case
      when length(raw_base) < 3 then 'staff-' || left(id::text, 8)
      else left(raw_base, 28)
    end as base
  from base_calc
),
numbered as (
  select id, base, row_number() over (partition by base order by created_at, id) as rn
  from resolved
)
update identity.staff s
   set username = case when n.rn = 1 then n.base else n.base || '-' || n.rn end
  from numbered n
 where n.id = s.id;

alter table identity.staff alter column username set not null;

alter table identity.staff
  add constraint staff_username_format check (username ~ '^[a-z0-9._-]{3,32}$');

alter table identity.staff
  add constraint staff_username_key unique (username);

-- Safety net for writers that don't specify username (see header note 4).
alter table identity.staff
  alter column username set default ('staff-' || left(gen_random_uuid()::text, 8));

comment on column identity.staff.username is
  'Login identifier resolved to auth.users.email via public.resolve_login_email. Lowercase, 3-32 chars, [a-z0-9._-], globally unique.';

-- ============================================================
-- public.resolve_login_email(p_username text) returns text
-- ============================================================
-- SECURITY DEFINER so anon (pre-auth) can look up the email without RLS on
-- identity.staff / auth.users. Normalizes and short-circuits on the same
-- format regex as the column CHECK before ever touching the index, and
-- returns NULL — never an error — for malformed/unknown/inactive/unlinked
-- input, so the caller cannot distinguish those cases from each other.

create or replace function public.resolve_login_email(p_username text)
returns text
language sql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
  with q as (select lower(btrim(p_username)) as u)
  select users.email
    from q
    join identity.staff s on s.username = q.u
    join auth.users users on users.id = s.auth_user_id
   where q.u ~ '^[a-z0-9._-]{3,32}$'
     and s.status = 'active'
   limit 1;
$$;

comment on function public.resolve_login_email(text) is
  'Resolves a staff username to its linked auth.users.email for pre-auth login. Returns NULL for malformed/unknown/inactive/unlinked input; never raises.';

revoke execute on function public.resolve_login_email(text) from public, anon, authenticated;
grant execute on function public.resolve_login_email(text) to anon, authenticated, service_role;

notify pgrst, 'reload schema';
