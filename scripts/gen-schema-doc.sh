#!/usr/bin/env bash
set -euo pipefail

# Generates supabase/SCHEMA.md from the live local database: every table in the
# app schemas with its columns, RLS state, policies, and the RPC surface.
#
# Why generated: supabase/FLOWS.md was hand-written and silently drifted — four
# core tables (key_orders, technical_orders, technical_order_items,
# stock_movements) were absent from the "Specification for App Development".
# A document produced from the schema cannot lie about the schema.
#
#   pnpm gen:schema-doc            # against local supabase (default)
#   DATABASE_URL=... pnpm gen:schema-doc

DATABASE_URL="${DATABASE_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
OUT="$(cd "$(dirname "$0")/.." && pwd)/supabase/SCHEMA.md"
Q() { psql "$DATABASE_URL" --quiet --tuples-only --no-align --field-separator='|' -c "$1"; }

{
  echo "# Vitalock — Database Schema Reference"
  echo
  LATEST="$(ls "$(dirname "$OUT")/migrations" | grep -E '^[0-9]{14}_' | sort | tail -1)"
  echo "> **Generated** by \`scripts/gen-schema-doc.sh\` from the database as of migration \`${LATEST}\`."
  echo "> Do not edit by hand — re-run \`pnpm gen:schema-doc\` after a migration; CI fails if this file is stale. For narrative (flows, auth model, business rules) see \`FLOWS.md\`."
  echo
  echo "## Tables"
  echo
  echo "| Table | Columns | RLS | Policies |"
  echo "|---|---:|:---:|---:|"
  Q "select n.nspname||'.'||c.relname,
            (select count(*) from pg_attribute a where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped),
            case when c.relrowsecurity then '✅' else '❌' end,
            (select count(*) from pg_policies p where p.schemaname=n.nspname and p.tablename=c.relname)
     from pg_class c join pg_namespace n on n.oid=c.relnamespace
     where c.relkind='r' and n.nspname in ('public','identity','operations','sales','support')
     order by 1" | awk -F'|' '{printf "| `%s` | %s | %s | %s |\n", $1, $2, $3, $4}'
  echo
  echo "## Columns"
  Q "select n.nspname||'.'||c.relname as t, a.attname, format_type(a.atttypid,a.atttypmod), a.attnotnull, coalesce(pg_get_expr(d.adbin,d.adrelid),'')
     from pg_class c join pg_namespace n on n.oid=c.relnamespace
     join pg_attribute a on a.attrelid=c.oid and a.attnum>0 and not a.attisdropped
     left join pg_attrdef d on d.adrelid=c.oid and d.adnum=a.attnum
     where c.relkind='r' and n.nspname in ('public','identity','operations','sales','support')
     order by 1, a.attnum" | awk -F'|' '
       $1!=prev { if (prev!="") print ""; printf "\n### `%s`\n\n| Column | Type | Null | Default |\n|---|---|:---:|---|\n", $1; prev=$1 }
       { printf "| `%s` | %s | %s | %s |\n", $2, $3, ($4=="t"?"no":"yes"), ($5==""?"":"`"$5"`") }'
  echo
  echo "## Row-level security policies"
  echo
  echo "| Table | Policy | Command | Roles |"
  echo "|---|---|---|---|"
  Q "select schemaname||'.'||tablename, policyname, cmd, array_to_string(roles, ', ')
     from pg_policies where schemaname in ('public','identity','operations','sales','support') order by 1,2" |
    awk -F'|' '{printf "| `%s` | `%s` | %s | %s |\n", $1, $2, $3, $4}'
  echo
  echo "## RPC surface (functions callable through PostgREST)"
  echo
  echo "Every \`SECURITY DEFINER\` RPC is wrapped by an authorization guard (see \`README.md\` § Authorization convention). \`_unguarded\` inner functions are revoked from all client roles."
  echo
  echo "| Function | Returns | Security | Guard |"
  echo "|---|---|---|---|"
  Q "select p.proname||'('||pg_get_function_identity_arguments(p.oid)||')', pg_get_function_result(p.oid),
            case when p.prosecdef then 'DEFINER' else 'INVOKER' end,
            case when pg_get_functiondef(p.oid) ~ 'identity\.require_admin' then 'admin'
                 when pg_get_functiondef(p.oid) ~ 'identity\.require_staff' then 'staff'
                 when pg_get_functiondef(p.oid) ~ 'identity\.is_admin\(\)' then 'admin (inline)'
                 when p.proname like '%_unguarded' then 'revoked'
                 else '' end
     from pg_proc p join pg_namespace n on n.oid=p.pronamespace
     where n.nspname='public' and p.prokind='f' and pg_get_function_result(p.oid) <> 'trigger'
     order by 1" | awk -F'|' '{printf "| `%s` | `%s` | %s | %s |\n", $1, $2, $3, $4}'
  echo
  echo "## Views"
  echo
  Q "select n.nspname||'.'||c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
     where c.relkind='v' and n.nspname in ('public','identity','operations','sales','support') order by 1" |
    awk '{printf "- `%s`\n", $1}'
} > "$OUT"

echo "→ wrote $OUT ($(wc -l < "$OUT") lines)"
