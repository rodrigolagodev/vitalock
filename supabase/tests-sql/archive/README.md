# Archived SQL tests

Tests here are kept for historical reference. They asserted models that
were later replaced by a schema change, and would fail against the
current DB by design — not because the DB is wrong, but because the
assertion no longer describes reality.

They are **not** picked up by `pnpm test:sql` — the runner (`scripts/test-sql.sh`)
globs `supabase/tests-sql/*.sql`, which is non-recursive.

If you need to understand why an assertion here fails, look at the
migration that superseded it (referenced in each file's header) and at
the live regression coverage that replaced it.

## Contents

- `test_keys_ready_for_pickup_requires_installation.sql` — asserted the
  pre-`20260812000060` ticket-gated readiness model. Superseded by the
  `key_authorizations`-driven model; live coverage in
  `../test_unify_work_tracking.sql`.
