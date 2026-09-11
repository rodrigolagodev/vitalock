-- ============================================================
-- Close anon EXECUTE on every internal SECURITY DEFINER function
-- ============================================================
-- After 20260910110000 the 22 business RPCs are guarded and revoked from
-- anon. The security advisor still listed 21 SECURITY DEFINER functions as
-- anon-executable — not through a direct grant but through Postgres' default
-- `GRANT EXECUTE ... TO PUBLIC` on every function. Revoking from `anon` alone
-- therefore changes nothing; PUBLIC has to go too.
--
-- What `authenticated` legitimately needs and is re-granted explicitly:
--   - the identity.* predicates used inside RLS policies and guards
--     (policies evaluate as the querying role)
--   - every guarded RPC: the 22 wrappers plus the two stock RPCs with an
--     inline is_admin() guard (detected by body, see below)
-- Everything else — trigger functions, number generators, status recomputes,
-- the `_unguarded` bodies — runs as the owner from inside other functions and
-- needs no client-role grant at all.
-- ============================================================

do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where p.prosecdef
      and n.nspname in ('public', 'identity', 'operations', 'sales', 'support')
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', r.sig);
  end loop;

  -- Re-grant to authenticated exactly the functions that carry a guard. The
  -- guard is detected in the body, so a future RPC written per the convention
  -- (supabase/README.md) is covered and one written without a guard is not
  -- reachable by clients until it gets one — the safe default.
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where p.prosecdef
      and n.nspname = 'public'
      and p.proname not like '%\_unguarded'
      and pg_get_functiondef(p.oid) ~ 'identity\.(require_admin|require_staff|is_admin)\('
  loop
    execute format('grant execute on function %s to authenticated, service_role', r.sig);
  end loop;
end $$;

-- RLS predicates + guard helpers: evaluated as `authenticated` inside policies
-- and wrappers.
grant execute on function identity.current_staff_id() to authenticated, service_role;
grant execute on function identity.current_staff_role() to authenticated, service_role;
grant execute on function identity.is_admin() to authenticated, service_role;
grant execute on function identity.is_installer() to authenticated, service_role;
grant execute on function identity.is_api_client_role() to authenticated, service_role;
grant execute on function identity.require_admin(text) to authenticated, service_role;
grant execute on function identity.require_staff(text) to authenticated, service_role;
grant execute on function identity.effective_actor(uuid) to authenticated, service_role;

-- The 22 guarded wrappers and the two inline-guarded stock RPCs are re-granted
-- by the guard-detection loop above.

notify pgrst, 'reload schema';
