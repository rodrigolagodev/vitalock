# Proposal: ah-foundation

## Why

Vitalock already ships spec-driven work through OpenSpec (25 baseline specs, 18 archived changes, 4 active) and a monorepo scaffolded on pnpm + Turborepo. Agent sessions are productive but drift on three axes that cost time every week:

1. **No root convention file.** A fresh agent session (or a fresh human) has to re-derive stack, layout, invariants, and how to prove work is done. There is no `AGENTS.md` at the repo root — only `openspec/config.yaml` (structured metadata, not narrative). Agents re-explore CodeGraph and files that a 200-line convention doc would answer in one read.
2. **Recurring UI patterns are memory-only.** Six patterns already exist in this admin (EditableTitle inline, `StatusBadge` via `titleAdornment`, StatCard snapshot rows, action buttons inside `SectionHeading`, references-as-links in tables, segmented control category picker). Each one was discovered by dialogue. Nothing prevents the next agent from proposing the same “add a download button that already exists” regression that happened this week.
3. **No verifier gate on CI.** The only workflow is `pages.yml` (deploy). Merges to `main` are trusted on local pre-commit discipline that does not exist yet (there is no `.husky/`). PR titles are unlint-ed. This is the biggest single risk if Vitalock ever grows past one committer, and the fix is cheap now.

The Agent Harness Standard (AH) is the reference model — four principles, one pipeline, an invariants set, a delegation model, a PR loop, and a categorized skill library. We do **not** adopt it whole. We adopt the three pieces that trade high ROI for low overhead in a solo-dev codebase:

- **P1 · Spec before code** — already covered by OpenSpec; this change codifies it in `AGENTS.md`.
- **P2 · Convention as code** — encode the two conventions that repeat: admin UI patterns and OpenSpec workflow.
- **P4 · Nothing ships unverified** — install a minimum viable verifier gate: path-filtered CI + Husky pre-commit + Conventional-Commit PR title lint.

Deferred (documented in Non-goals): P3 delegation (scoped sub-agents), supply-chain guard (`≥ 7d` install age), doc lanes, and comms-note/slack-ping skills. Each is overhead-heavy for one committer.

## What Changes

Three fases in one change, one PR:

**Fase 0 · Root conventions**

- Create `AGENTS.md` at repo root: stack, monorepo layout, scope authority (OpenSpec), invariants (RLS + terminal-state immutability, tenancy via `organization_id`, migrations naming), verifier gate contract, delegation notes for future expansion.

**Fase 2 · Two convention-as-code skills** (recortada — solo dos, alto ROI)

- Create `.claude/skills/admin-ui-patterns/SKILL.md`. Codifies six recurring admin patterns with the exact component names, prop shapes, and evidence sources (memory obs #345, #347, #297, #296 and current source files).
- Create `.claude/skills/openspec-workflow/SKILL.md`. Codifies how SDD changes are structured in this repo: phase files, task groups, `size:exception` rule, `apply-progress.md` conventions, archive lifecycle.

**Fase 1 · Verifier gate on CI**

- Add `.github/workflows/admin-checks.yml` (paths: `apps/admin/**`, `packages/ui/**`, `packages/shared/**`, `packages/config-*/**`) → `pnpm install --frozen-lockfile && pnpm --filter @vitalock/admin lint typecheck test`.
- Add `.github/workflows/installer-checks.yml` (paths: `apps/installer/**`, `packages/ui/**`, `packages/shared/**`, `packages/config-*/**`) → same shape, `@vitalock/installer`.
- Add `.github/workflows/supabase-checks.yml` (paths: `supabase/**`, `packages/supabase/**`) → `pnpm --filter @vitalock/supabase lint typecheck test`.
- Add `.github/workflows/pr-title-lint.yml` → `amannn/action-semantic-pull-request@v5` (Conventional Commits enforced on PR titles).
- Add `.husky/pre-commit` running `lint-staged`.
- Root `package.json`: add `husky` + `lint-staged` devDeps, `prepare` script, `lint-staged` config that runs `prettier --write` and `eslint --fix` on staged JS/TS files.

**Delta spec**

- New capability `agent-harness` (single delta added to `openspec/specs/`). Three requirements: convention discoverability, UI-pattern discipline, and merge gate. Each with acceptance scenarios.

## Impact

- **Change size:** ~1400 changed lines (~700 SDD artifacts + ~740 implementation). Above the 800-line review budget. `size:exception` acknowledged in this proposal; single-PR delivery.
- **Data:** none. Zero DB migrations, zero code changes to product logic.
- **Runtime:** none. No new runtime dependencies for admin/installer. New devDeps at root: `husky@^9`, `lint-staged@^15`.
- **Users affected:** none directly. Contributors (currently one) get Husky auto-installed on `pnpm install` via the `prepare` script.
- **CI cost:** four new workflows, each path-filtered. A typical PR will fire one workflow, not four. `pages.yml` is unaffected.
- **Existing tests / lint / typecheck:** must remain green — the change adds files, does not modify product code. This is a hard gate before merge.

## Success Criteria

- `AGENTS.md` at repo root; a fresh agent can read it once and know the stack, verifier command, and where OpenSpec lives.
- Both skills exist under `.claude/skills/<name>/SKILL.md` with valid frontmatter that would allow Claude Code to auto-invoke them on relevant prompts.
- Four workflows in `.github/workflows/`; a PR that touches only `apps/admin/**` fires `admin-checks` and `pr-title-lint`, does **not** fire installer/supabase checks.
- `.husky/pre-commit` runs `lint-staged` and blocks a commit that fails prettier or eslint.
- Structural check on `openspec/changes/ah-foundation/` passes: required files present, each requirement has ≥ 1 scenario, task IDs unique. (Manual check — no `openspec` CLI is installed; the `openspec` npm package is a placeholder.)
- `pnpm lint && pnpm typecheck && pnpm test` all green on the change branch after apply.

## Non-goals

- **P3 delegation (scoped sub-agents).** Deferred as a future spike. Requires `.claude/agents/` scaffolding that does not exist today; hook-restriction infrastructure needs iteration before it earns its keep for one committer.
- **Supply chain guard (`≥ 7d` install age).** Renovate config and dependency-review action deferred — value scales with team size and dependency churn, both low today.
- **Doc lanes (`spec` / `clarity` / `communication`).** Deferred with the same reasoning as slack-ping / comms-note. Vitalock's docs today are the OpenSpec change folder and `README.md`; no need for triage yet.
- **Skills `data-conventions`, `api-contract`, `migrations`.** Deferred. Search across memory returned zero recurring-pain observations on the DB side — RLS + triggers + `pg_prove` tests already enforce the invariants. Codifying now would be low-ROI toil.
- **AI PR reviewer (Copilot / claude-review action).** Not adopted. Advisory-only value; not blocking on any current workflow.
- **Product code changes.** Zero source files under `apps/` or `packages/` are modified.

## Risks

1. **Path filters may miss transitive impact.** A change to `packages/ui/` affects both admin and installer; both filters explicitly include `packages/ui/**` and `packages/shared/**` to catch this. Mitigation: any diff touching those packages runs both admin-checks and installer-checks.
2. **Husky `prepare` script surprises existing clones.** `pnpm install` after this merge will install Husky hooks on every collaborator's clone. Mitigation: `prepare` is idempotent and standard; documented in AGENTS.md.
3. **`lint-staged` misses a case ESLint --fix would fail loudly on.** Mitigation: CI workflows run full `pnpm lint` on the PR, so lint-staged is a helper, not the last line of defense.
4. **`pr-title-lint` blocks legitimate work if a contributor forgets Conventional Commits.** Mitigation: message on failure directs to `AGENTS.md § Commit style`.
5. **Skill trigger descriptions may not fire in-context.** Skills are auto-invoked by Claude Code based on the `description` field in frontmatter. If descriptions are too narrow, they will not fire when needed. Mitigation: descriptions written to match observed prompt shapes (see `admin-ui-patterns` design note).

## Ready for Spec/Design

- **Ready.** Scope is fixed. `size:exception` is acknowledged. Non-goals are explicit. No unresolved product decisions.
