#!/usr/bin/env bash
# Rehearse pending migrations against a copy of PRODUCTION data, locally.
#
#   pnpm db:rehearse            # full rehearsal, resets local back to seeds at the end
#   pnpm db:rehearse --keep     # leave the local DB holding prod data for manual poking
#
# Why: the pgTAP suite proves migrations against an empty, seeded database. A
# migration can still fail on real rows (the 2026-09 taxonomy rename would
# have). Staging infrastructure would cover that; for a one-developer project
# this two-minute rehearsal covers the same risk at zero cost.
#
# What it does, in order:
#   1. snapshot   full dump of production (schema + data) into supabase/backups/
#                 - your rollback point if a `db push` goes wrong
#   2. baseline   reset the LOCAL database to exactly production's migration
#                 version (no seeds), so the schema matches prod
#   3. restore    load production data into it
#   4. migrate    apply only the migrations production does not have yet
#   5. verify     pgTAP suite + generated SCHEMA.md drift check
#   6. cleanup    reset local back to the normal seeded state (unless --keep)
#
# Exit 0 means: safe to `supabase db push`. Any other exit names the step.
# Never touches the linked project except for read-only dumps.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BACKUPS="$ROOT/supabase/backups"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
LOCAL_DB="postgresql://postgres:postgres@127.0.0.1:54322/postgres"
KEEP=0
[ "${1:-}" = "--keep" ] && KEEP=1

cd "$ROOT"
step() { printf '\n\033[1;36m▸ %s\033[0m\n' "$*"; }
ok()   { printf '  \033[32m✓\033[0m %s\n' "$*"; }
die()  { printf '  \033[31m✗ %s\033[0m\n' "$*" >&2; exit "${2:-1}"; }

# ── preflight ──────────────────────────────────────────────────────────────
step "preflight"
command -v supabase >/dev/null || die "supabase CLI not found"
command -v psql     >/dev/null || die "psql not found"
pg_isready -q -h 127.0.0.1 -p 54322 || die "local Supabase is not running (supabase start)"
[ -n "${SUPABASE_ACCESS_TOKEN:-}" ] || die "SUPABASE_ACCESS_TOKEN is not set (it lives in ~/.env; the CLI needs it to dump the linked project)"
supabase projects list 2>/dev/null | grep -q '●' || die "no linked project (supabase link --project-ref …)"
mkdir -p "$BACKUPS"
ok "local stack up, project linked"

# ── migration state ───────────────────────────────────────────────────────
step "migration state"
# `migration list` prints "  local | remote | time" rows; blank remote = pending.
LIST="$(supabase migration list 2>/dev/null | grep -E '^\s*[0-9]{14}?\s*\|')"
PROD_HEAD="$(printf '%s\n' "$LIST" | awk -F'|' '{gsub(/ /,"",$2); if ($2!="") v=$2} END {print v}')"
PENDING="$(printf '%s\n' "$LIST" | awk -F'|' '{gsub(/ /,"",$1); gsub(/ /,"",$2); if ($1!="" && $2=="") print $1}')"
REMOTE_ONLY="$(printf '%s\n' "$LIST" | awk -F'|' '{gsub(/ /,"",$1); gsub(/ /,"",$2); if ($1=="" && $2!="") print $2}')"
[ -n "$PROD_HEAD" ] || die "could not read production's migration head"
[ -z "$REMOTE_ONLY" ] || die "production has migrations this checkout lacks: $REMOTE_ONLY — run \`git pull\` or reconcile with \`supabase migration repair\` first"
ok "production is at $PROD_HEAD"
if [ -z "$PENDING" ]; then
  ok "no pending migrations — rehearsal will validate restore + tests only"
else
  printf '  pending:\n'; printf '%s\n' "$PENDING" | sed 's/^/    · /'
fi

# ── 1. snapshot production ────────────────────────────────────────────────
step "1/6 snapshot production → supabase/backups/$STAMP-*"
supabase db dump --linked -f "$BACKUPS/$STAMP-schema.sql" >/dev/null 2>&1 \
  || die "schema dump failed (is SUPABASE_DB_PASSWORD set?)"
# App schemas only: storage/auth rows are recreated by migrations + seeds locally
# and would collide (storage.buckets) or reference objects that do not exist here.
supabase db dump --linked --data-only --use-copy \
  --schema public,identity,operations,sales,support \
  -f "$BACKUPS/$STAMP-data.sql" >/dev/null 2>&1 \
  || die "data dump failed"
ok "schema $(wc -l < "$BACKUPS/$STAMP-schema.sql") lines · data $(wc -l < "$BACKUPS/$STAMP-data.sql") lines"
ok "rollback point: restore these two files if a push goes wrong"

# ── 2. local baseline = production schema ─────────────────────────────────
step "2/6 reset local to production's version ($PROD_HEAD), no seeds"
supabase db reset --local --version "$PROD_HEAD" --no-seed >/dev/null 2>&1 \
  || die "local reset to $PROD_HEAD failed"
ok "local schema == production schema"

# ── 3. restore production data ────────────────────────────────────────────
step "3/6 restore production data"
# replica mode: skip FK ordering and triggers while loading a consistent snapshot
psql "$LOCAL_DB" --quiet --set ON_ERROR_STOP=1 \
  -c "set session_replication_role = replica" \
  -f "$BACKUPS/$STAMP-data.sql" >/dev/null 2>"$BACKUPS/$STAMP-restore.log" \
  || die "restore failed — see $BACKUPS/$STAMP-restore.log"
ROWS="$(psql "$LOCAL_DB" -Atc "select sum(n_live_tup) from pg_stat_user_tables where schemaname in ('public','identity','operations','sales','support')")"
ok "restored (~${ROWS:-?} rows across app schemas)"

# ── 4. apply pending migrations against real data ─────────────────────────
step "4/6 apply pending migrations"
if [ -z "$PENDING" ]; then
  ok "nothing to apply"
else
  if ! supabase migration up --local 2>&1 | tee "$BACKUPS/$STAMP-migrate.log" | grep -Ei 'applying|error' | sed 's/^/  /'; then :; fi
  grep -qi 'error' "$BACKUPS/$STAMP-migrate.log" && die "a pending migration FAILED against production data — see $BACKUPS/$STAMP-migrate.log. Do NOT push." 2
  ok "pending migrations applied on top of production data"
fi

# ── 5. verify ─────────────────────────────────────────────────────────────
step "5/6 verify: pgTAP + SCHEMA.md drift"
bash scripts/test-sql.sh >"$BACKUPS/$STAMP-pgtap.log" 2>&1 \
  || die "pgTAP failed against production data — see $BACKUPS/$STAMP-pgtap.log. Do NOT push." 3
ok "$(ls supabase/tests-sql/*.sql | wc -l | tr -d " ") pgTAP files green against production data"
bash scripts/gen-schema-doc.sh >/dev/null 2>&1
if git diff --quiet -- supabase/SCHEMA.md; then
  ok "SCHEMA.md is current"
else
  die "SCHEMA.md is stale after these migrations — commit the regenerated file first" 4
fi

# ── 6. cleanup ────────────────────────────────────────────────────────────
step "6/6 cleanup"
if [ "$KEEP" = 1 ]; then
  ok "--keep: local DB left with production data + pending migrations applied"
else
  supabase db reset --local >/dev/null 2>&1 || die "final reset failed"
  ok "local DB back to seeded dev state"
fi
rm -f "$BACKUPS/$STAMP-restore.log" "$BACKUPS/$STAMP-migrate.log" "$BACKUPS/$STAMP-pgtap.log"

printf '\n\033[1;32m✔ rehearsal passed'
[ -n "$PENDING" ] && printf ' — safe to run: supabase db push' || printf ' — nothing pending to push'
printf '\033[0m\n  snapshot kept at supabase/backups/%s-{schema,data}.sql\n\n' "$STAMP"
