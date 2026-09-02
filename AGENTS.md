# AGENTS.md

> Convention file for AI coding agents and new human contributors. Read this end-to-end before opening a PR. If any of the rules below are wrong or outdated, edit this file in the same PR as the code that changed the underlying convention.

## What Vitalock is

A property-management platform. Two client apps and a Supabase backend:

- `apps/admin` — desktop-first React SPA for building/unit/equipment administration, technical orders, key orders, stock, particulares.
- `apps/installer` — mobile-first React PWA for the technician worklist.
- `supabase/` — Postgres schema, RPCs, RLS policies, triggers, `pg_prove` SQL tests.

Everything below assumes this shape.

## Stack

| Layer              | Tooling                                                                                         |
| ------------------ | ----------------------------------------------------------------------------------------------- |
| Package manager    | pnpm 9 workspaces + Turborepo 2                                                                 |
| Node               | 20+ (`.nvmrc`)                                                                                  |
| Frontend framework | React 18 + TypeScript 5.6 (strict) + Vite 5                                                     |
| Data / state       | TanStack Query 5, react-hook-form 7, Zod 3                                                      |
| UI                 | Tailwind CSS + `@vitalock/ui` (Radix primitives + shadcn-flavored components + Tailwind preset) |
| Backend            | Supabase (Postgres + RLS + RPCs + realtime)                                                     |
| Testing            | Vitest 2 + Testing Library + jsdom; `pg_prove` for SQL                                          |
| Quality            | ESLint 9 (flat), Prettier 3 + `prettier-plugin-tailwindcss`                                     |

## Monorepo layout

```
Vitalock/
├── apps/
│   ├── admin/                 # @vitalock/admin — desktop SPA
│   └── installer/             # @vitalock/installer — mobile PWA
├── packages/
│   ├── ui/                    # @vitalock/ui — components, tokens, cn()
│   ├── supabase/              # @vitalock/supabase — typed client + generated types
│   ├── shared/                # @vitalock/shared — Zod env loaders, domain utils
│   ├── config-typescript/     # shared tsconfig bases
│   └── config-eslint/         # shared eslint flat configs
├── supabase/
│   ├── migrations/            # timestamp-prefixed SQL migrations
│   ├── tests-sql/             # pg_prove tests
│   └── seed*.sql
├── openspec/                  # SDD state — see § Scope authority
├── scripts/
├── docs/
└── .github/workflows/         # path-filtered CI
```

## Scope authority

Non-trivial work is spec-driven through **OpenSpec**. The authority for what a change should do is the `proposal.md` + `design.md` + `tasks.md` triad under `openspec/changes/<change-name>/`, not the conversation, not the prompt, not the commit message.

- **New non-trivial work:** open an OpenSpec change first (`openspec/changes/<change-name>/`). See `.claude/skills/openspec-workflow/SKILL.md` for the exact structure.
- **Trivial fixes / docs-only:** direct commit is fine. If in doubt, spec it.
- **Baseline specs:** `openspec/specs/` holds the accepted capability specs; changes ship as **delta specs** under the change folder and are merged in on archive.
- **Config:** `openspec/config.yaml` (strict TDD, review budget 800 lines, single-PR delivery default).

## Invariants

Rules that hold across the codebase. If your change would break one, name it explicitly in your `proposal.md § Risks`.

**Data / DB**

- Every mutation goes through Postgres RLS + RPCs. No direct table writes from the client.
- Terminal-state rows (resolved tickets, invoiced/cancelled orders) are immutable — enforced by `BEFORE UPDATE` trigger functions in `supabase/migrations/20260901170000_add_terminal_immutability_triggers.sql`. Do not add UI edit paths that bypass this.
- Migrations are timestamp-prefixed (`YYYYMMDDHHMMSS_verb_object.sql`), additive where possible, reversible when it is cheap.
- SQL tests live in `supabase/tests-sql/`, run under `pg_prove`, and are part of the verifier gate.

**Frontend**

- `apps/admin/*` and `apps/installer/*` do NOT define their own components when `packages/ui` has an equivalent. If `@vitalock/ui` is missing a primitive, add it to `packages/ui` — do not duplicate in the app.
- Tokens > utilities > components. No raw hex colors, no arbitrary Tailwind values (`w-[347px]`) — extend the token/preset if you need a new value.
- UI patterns already discovered live in `.claude/skills/admin-ui-patterns/SKILL.md`. Read it before touching detail-page headers, StatCards, tables, or editable titles.

**Types**

- Supabase database types are generated (`pnpm gen:types` → `packages/supabase/src/database.types.ts`). Do not edit by hand.
- Zod schemas at the client boundary; server trusts nothing.

## Verifier gate

Nothing is "done" until this passes. Copy-paste from a clean tree on your change branch:

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm --filter @vitalock/supabase test:sql   # requires local Supabase up
```

For spec-driven work, structural validation of the OpenSpec change folder (proposal + design + tasks + delta specs with acceptance scenarios) is performed by the `sdd-verify` sub-agent — there is **no `openspec` CLI installed**; the `openspec` npm package is a placeholder and OpenSpec is used here as a file-system convention.

CI runs the equivalent path-filtered subset automatically on PR open. See `.github/workflows/`.

## Commit style

- **Conventional Commits** enforced on PR titles by `.github/workflows/pr-title-lint.yml`.
- Format: `type(scope): subject` — e.g. `fix(admin-shell): drop main bottom padding so sticky footers reach viewport`.
- Types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `perf`, `build`, `ci`.
- Scope is the app / package / area — `admin`, `installer`, `ui`, `db`, `sdd`, or a specific route/component when helpful.
- Body is optional but preferred for the "why". Do not add `Co-Authored-By` unless the user asked for it.
- Never `git commit --no-verify` unless the user explicitly asks — if the hook fails, fix the underlying issue.

## Pre-commit hook

`pnpm install` registers Husky's `pre-commit` hook via the `prepare` script. On `git commit`:

- `lint-staged` runs `prettier --write` on staged files (`.ts/.tsx/.js/.jsx/.json/.md/.yml/.yaml/.css`).

ESLint is intentionally NOT run in the pre-commit hook: there is no root `eslint.config.js` (configs live per-workspace under `packages/config-eslint/`), and running eslint per-file from root does not respect workspace context. The full workspace lint is enforced by the path-filtered CI workflows on PR.

The hook is a helper, not the last line of defense — CI runs the full lint/typecheck/test in workflows.

## CI (path-filtered)

Four workflows in `.github/workflows/`, each fires only when its paths change:

- `admin-checks.yml` — `apps/admin/**`, `packages/ui/**`, `packages/shared/**`, `packages/config-*/**`, root package files.
- `installer-checks.yml` — `apps/installer/**` + shared packages + root.
- `supabase-checks.yml` — `supabase/**`, `packages/supabase/**`.
- `pr-title-lint.yml` — every PR, always (Conventional Commits on the title).

`pages.yml` handles GitHub Pages deploys and is separate from the verifier gate.

## Where things live (quick index)

- Admin routes → `apps/admin/src/routes/<domain>/`
- Admin domain hooks → `apps/admin/src/hooks/use<Thing>.ts`
- Shared UI components → `packages/ui/src/components/`
- Migrations → `supabase/migrations/`
- RLS policies + triggers → `supabase/migrations/*.sql`
- SQL tests → `supabase/tests-sql/test_<nnn>_<name>.sql`
- OpenSpec changes → `openspec/changes/<name>/`
- OpenSpec baseline specs → `openspec/specs/<capability>/`
- OpenSpec archive → `openspec/changes/archive/<YYYY-MM-DD>-<name>/`

## Skills auto-loaded in agent sessions

Under `.claude/skills/`, per-repo. Auto-invoked by Claude Code when the prompt matches a skill's frontmatter `description`:

- **`admin-ui-patterns`** — recurring admin UI patterns (title-adornment badges, StatCard rows, EditableTitle, action buttons in SectionHeading, references-as-links, segmented-control category pickers).
- **`openspec-workflow`** — how SDD changes are structured in this repo (phase files, task groups, size:exception, apply-progress, archive lifecycle).

## Delegation (deferred)

The Agent Harness Standard proposes area-scoped sub-agents (`admin-impl`, `installer-impl`, `db-impl`) with directory-restricted `allowedEditRoots`. Not adopted today — Vitalock is one committer and the infrastructure (`.claude/agents/`) does not exist yet. Revisit when the project grows beyond one contributor.

## Branch protection (manual repo setup)

After this file merges, apply these settings in GitHub Repo Settings → Branches → `main`:

- Require pull request before merging.
- Require status checks to pass: `admin-checks`, `installer-checks`, `supabase-checks`, `pr-title-lint` (mark them required as their filters match).
- Automatically delete head branches on merge.

## Deploy

GitHub Pages via `.github/workflows/pages.yml` on push to `main`. No hand-deploys.
