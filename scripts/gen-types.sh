#!/usr/bin/env bash
set -euo pipefail

# Generates typed Supabase Database types from local schema.
# Requires: supabase CLI + local stack running (`supabase start` inside ./supabase).

SUPABASE_DIR="$(cd "$(dirname "$0")/.." && pwd)/supabase"
OUT_FILE="$(cd "$(dirname "$0")/.." && pwd)/packages/supabase/src/database.types.ts"

if ! command -v supabase > /dev/null 2>&1; then
  echo "error: 'supabase' CLI not found on PATH." >&2
  echo "  install: https://supabase.com/docs/guides/cli" >&2
  exit 1
fi

if ! (cd "$SUPABASE_DIR" && supabase status > /dev/null 2>&1); then
  echo "error: Supabase local stack is not running." >&2
  echo "  run: (cd supabase && supabase start)" >&2
  echo "  or:  generate against remote with: supabase gen types typescript --project-id <id> > $OUT_FILE" >&2
  exit 2
fi

echo "→ generating types from local Supabase schema..."
(cd "$SUPABASE_DIR" && supabase gen types typescript --local --schema public) > "$OUT_FILE"
echo "✓ wrote $OUT_FILE"
