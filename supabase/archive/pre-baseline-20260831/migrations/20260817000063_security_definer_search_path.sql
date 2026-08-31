-- Harden SECURITY DEFINER functions by pinning their search_path.
--
-- Context: several business SECURITY DEFINER functions were created without
-- SET search_path, so they inherit whatever schema list the caller session
-- carries. That is a search-path-injection vector: an attacker who could
-- create an object in a higher-priority schema than expected could redirect
-- unqualified references (e.g. `bills`) to a rogue table, and have the
-- function run against it with owner (postgres) privileges.
--
-- In Supabase, anon/authenticated cannot CREATE in any of these schemas, so
-- the vulnerability is currently latent. This migration closes it as
-- defense-in-depth by pinning a deterministic schema list on every affected
-- function. We do NOT change function bodies — many of them use unqualified
-- references that depend on `public` being on the path, so an empty
-- search_path would break them. The pinned list matches the schemas the
-- bodies actually reference.

do $$
declare
  target_functions text[] := array[
    -- public schema business RPCs and triggers
    'public.order_items_trigger_recompute()',
    'public.rfid_keys_validate_pickup()',
    'public.recompute_order_status(uuid)',
    -- operations
    'operations.key_authorizations_validate()'
  ];
  fn text;
begin
  foreach fn in array target_functions loop
    execute format(
      'alter function %s set search_path = pg_catalog, public, support, operations, sales, identity',
      fn
    );
  end loop;
end;
$$;

-- Overloaded functions must be pinned by signature. Fetch every current
-- overload from pg_proc so we hit exactly the live definitions without
-- guessing signatures that have changed across migrations.
do $$
declare
  r record;
begin
  for r in
    select p.oid, p.proname, n.nspname,
           pg_catalog.pg_get_function_identity_arguments(p.oid) as args
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where p.prosecdef = true
      and n.nspname in ('public', 'operations', 'sales', 'support')
      and p.proname in (
        'configure_key_order_item',
        'create_order_with_items',
        'create_stock_movement',
        'create_product_with_initial_stock',
        'resolve_equipment_installation',
        'resolve_equipment_replacement'
      )
      -- Skip functions that already have search_path pinned via ALTER/CREATE.
      and not exists (
        select 1
        from unnest(coalesce(p.proconfig, array[]::text[])) as cfg
        where cfg like 'search_path=%'
      )
  loop
    execute format(
      'alter function %I.%I(%s) set search_path = pg_catalog, public, support, operations, sales, identity',
      r.nspname, r.proname, r.args
    );
  end loop;
end;
$$;

comment on schema public is
  'search_path hardening applied 2026-08-17: every SECURITY DEFINER function '
  'in public/operations/sales/support now runs with a fixed schema list. New '
  'SECURITY DEFINER functions MUST include SET search_path in their definition.';
