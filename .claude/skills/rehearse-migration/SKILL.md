---
name: rehearse-migration
description: 'Trigger: db push, supabase db push, apply migration to production, deploy migration, ensayar migración, rehearse migration, before pushing migrations. Rehearse pending migrations against a copy of production data before any db push.'
license: Apache-2.0
metadata:
  author: 'rodrigolagodev'
  version: '1.0'
---

## Activation Contract

Load before running `supabase db push`, when asked to apply, deploy, or push migrations to the linked project, or when a migration under `supabase/migrations/` is ready and the user wants it in production. Also load when a `db push` failed and the user asks what to do.

## Hard Rules

- Never run `supabase db push` without a passing rehearsal in the same session. No exceptions, including "small" migrations.
- Never apply migrations to production by any other route (MCP `apply_migration`, dashboard SQL editor, psql). File + `db push` only — anything else desyncs the migration history.
- The rehearsal reads production; it never writes to it. Do not add `--linked` to reset/migration commands.
- `supabase/backups/` holds real production data and is gitignored. Never commit, upload, paste, or summarize its contents.
- On any non-zero exit, stop. Report the failing step and the log path. Do not "fix forward" by editing production.

## Decision Gates

| Situation                                       | Action                                                                                                                                                        |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rehearsal exit 0, pending migrations listed     | Run `supabase db push`, then `pnpm gen:schema-doc`, then re-run the Supabase security advisors and report                                                     |
| Exit 0, "nothing pending"                       | Nothing to push; say so                                                                                                                                       |
| Exit 2 (migration failed on real data)          | Fix the migration file; re-run rehearsal; never push                                                                                                          |
| Exit 3 (pgTAP failed)                           | Fix code or tests; re-run                                                                                                                                     |
| Exit 4 (SCHEMA.md stale)                        | Commit regenerated `supabase/SCHEMA.md`; re-run                                                                                                               |
| "production has migrations this checkout lacks" | `git pull`; if the version is not in the repo, reconcile with `supabase migration repair` after reading `supabase_migrations.schema_migrations` — never guess |
| Local stack down / not linked                   | `supabase start` / `supabase link --project-ref lhzvvcmqjlsrfgchlvry`, then retry                                                                             |

## Execution Steps

1. Confirm `git status` shows the migration files committed or at least staged; confirm `supabase migration list` shows them as local-only.
2. Run `pnpm db:rehearse` (~5 min; dumps are remote). Stream its output; it prints one ✓/✗ per step.
3. Read the final line. Follow the Decision Gates table literally.
4. After a successful push: `pnpm gen:schema-doc`, commit if changed; run `mcp__supabase__get_advisors` (security) and report ERROR/WARN deltas.
5. Tell the user the snapshot path (`supabase/backups/<stamp>-{schema,data}.sql`) as the rollback point.

## Output Contract

Return: rehearsal verdict (step-by-step ✓/✗), pending migrations applied, pgTAP result, whether `db push` ran, advisor deltas, and the snapshot path. On failure: the failing step, the exact log path, and the recommended fix — nothing pushed.

## References

- `scripts/rehearse-migration.sh` — the script; comments document each step.
- `supabase/README.md` § Authorization convention — rules every new RPC must meet.
- `docs/architecture/ENTERPRISE-READINESS-PLAN.md` § 7 — why this replaces a staging environment.
