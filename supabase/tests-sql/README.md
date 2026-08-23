# SQL Integration Tests (pgTAP)

This directory contains pgTAP-based SQL integration tests for the Vitalock
database layer.  Each file tests one migration slice and runs entirely inside a
rolled-back transaction — no persistent data is written to the database.

## What is pgTAP?

[pgTAP](https://pgtap.org) is a PostgreSQL extension that provides TAP
(Test Anything Protocol) assertion helpers (`ok`, `is`, `isnt`, `throws_ok`,
`lives_ok`, etc.) and a `plan` / `finish` lifecycle.  The `pg_prove` CLI
runner collects TAP output across multiple `.sql` files and reports a unified
pass/fail summary, making it suitable for CI pipelines.

## Prerequisites

### 1. pg_prove (runner)

`pg_prove` ships with the Perl module `TAP::Parser::SourceHandler::pgTAP`.

**Arch Linux / CachyOS**:

```
yay -S perl-pgtap-git
```

**Other distros (cpanm)**:

```
cpanm TAP::Parser::SourceHandler::pgTAP
```

Verify installation:

```
pg_prove --version   # should print pg_prove 3.37 or later
```

### 2. Local Supabase DB

You need a running local Supabase instance with all migrations applied:

```
supabase start
```

The pgtap extension is enabled by migration
`supabase/migrations/20260823000095_install_pgtap.sql`, which is applied
automatically when you run `supabase start` or `supabase db reset`.

## Running the tests

Set the connection environment variables and invoke the runner via pnpm:

```bash
PGDATABASE=postgres \
PGUSER=postgres \
PGPASSWORD=postgres \
PGHOST=127.0.0.1 \
PGPORT=54322 \
pnpm --filter @vitalock/supabase test:sql
```

The Supabase local DB listens on **port 54322** by default.

Or run `pg_prove` directly from the repo root:

```bash
PGDATABASE=postgres PGUSER=postgres PGPASSWORD=postgres \
PGHOST=127.0.0.1 PGPORT=54322 \
pg_prove --ext .sql -r supabase/tests-sql
```

## Directory layout

```
supabase/tests-sql/
├── README.md               ← this file
├── test_064_*.sql          ← vigente tests (pgTAP idiom)
├── test_065_*.sql
├── ...
└── archive/
    ├── README.md           ← archived / broken tests
    └── test_*.sql
```

Files in `archive/` are excluded from `pg_prove`'s recursive glob because
the runner is invoked with `-r supabase/tests-sql` and all archive entries
reference legacy schema objects (e.g. `public.orders`) that were dropped in
the PR-3 bounded-context split.

## Writing new tests

Follow the pgTAP idiom:

```sql
BEGIN;
SELECT plan(2);   -- declare the number of assertions

SELECT ok(1 = 1, 'trivial truth holds');
SELECT is((SELECT 1), 1, 'SELECT 1 returns 1');

SELECT * FROM finish();
ROLLBACK;
```

Use `throws_ok` for expected errors and `lives_ok` for DO-blocks whose
internal semantics are hard to assert on directly.

Every test scenario must carry the original identifier string so that grep
searches for markers like `PASS 064-S1` continue to work across the codebase.
