#!/usr/bin/env bash
set -euo pipefail

# Runs every *.sql file in supabase/tests-sql/ against the target database.
#
# Defaults to the local Supabase stack (postgres://postgres:postgres@127.0.0.1:54322/postgres).
# Override with DATABASE_URL for CI or remote runs.

DATABASE_URL="${DATABASE_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"

SUPABASE_DIR="$(cd "$(dirname "$0")/.." && pwd)/supabase"
TESTS_DIR="$SUPABASE_DIR/tests-sql"

if ! command -v psql > /dev/null 2>&1; then
  echo "error: 'psql' CLI not found on PATH." >&2
  echo "  install: apt install postgresql-client / brew install libpq" >&2
  exit 1
fi

if [ ! -d "$TESTS_DIR" ]; then
  echo "error: $TESTS_DIR does not exist." >&2
  exit 1
fi

shopt -s nullglob
files=("$TESTS_DIR"/*.sql)

if [ ${#files[@]} -eq 0 ]; then
  echo "no SQL tests found in $TESTS_DIR" >&2
  exit 0
fi

echo "→ running ${#files[@]} SQL test(s) against $DATABASE_URL"
failed=0
for f in "${files[@]}"; do
  name="$(basename "$f")"
  echo "  · $name"
  if ! psql "$DATABASE_URL" --quiet --set ON_ERROR_STOP=1 --file "$f" > /dev/null; then
    echo "    ✗ FAILED"
    failed=$((failed + 1))
  fi
done

if [ "$failed" -gt 0 ]; then
  echo "✗ $failed test(s) failed"
  exit 1
fi

echo "✓ all SQL tests passed"
