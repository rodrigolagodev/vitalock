# Agent Harness Specification

## Purpose

Defines the shape of Vitalock's agent-harness convention layer: a canonical root convention doc (`AGENTS.md`), the two auto-invoked skills that codify recurring admin UI patterns and OpenSpec workflow (`.claude/skills/admin-ui-patterns/`, `.claude/skills/openspec-workflow/`), and the path-filtered CI gate that runs on every pull request (`admin-checks`, `installer-checks`, `supabase-checks`, `pr-title-lint`) plus a local Husky pre-commit hook. Together these deliver Principles P1 (Spec before code — via OpenSpec), P2 (Convention as code — via skills), and P4 (Nothing ships unverified — via CI gate) from the Agent Harness Standard. P3 (Delegate via scoped sub-agents) and supply-chain / doc-lanes / comms skills are deferred.

## Requirements

### Requirement: Convention Discoverability

The repository SHALL expose its conventions, stack, layout, verifier contract, and scope authority in a single canonical file at repo root (`AGENTS.md`), such that a fresh agent session or a new contributor can operate on-convention after a single read.

#### Scenario: Fresh agent session opens the repo

- **WHEN** an AI coding agent starts a session in the Vitalock repo root
- **THEN** `AGENTS.md` at root is present and includes: stack summary, monorepo layout, scope authority (link to `openspec/config.yaml`), the verifier command as a copy-pasteable code block, and commit-style rules
- **AND** the agent can identify the current tech stack and the exact command to prove work is done without additional file reads

#### Scenario: New contributor clones the repo

- **WHEN** a human contributor clones Vitalock for the first time
- **THEN** reading `AGENTS.md` end-to-end gives them the workspace filter commands (`pnpm --filter @vitalock/<app>`), the location of OpenSpec changes, the pre-commit and CI expectations
- **AND** no tribal knowledge is required to open the first PR

### Requirement: UI Pattern Discipline

The admin app's recurring UI patterns SHALL be codified as a discoverable skill file (`.claude/skills/admin-ui-patterns/SKILL.md`), such that AI agents reuse them instead of proposing regressions.

#### Scenario: Agent is asked to redesign a detail-page section

- **WHEN** a user prompt matches the shape "redesign X section in a `*DetailPage`" or references `PageHeader`, `SectionHeading`, `StatCard`, `EditableTitle`
- **THEN** the skill `admin-ui-patterns` auto-invokes via its frontmatter description
- **AND** the agent applies the correct pattern (title-adornment badge, StatCard row, action buttons inside SectionHeading, etc.) on the first proposal, not after correction

#### Scenario: Agent is asked to add an action button to a detail-page section

- **WHEN** the prompt asks to add an action button
- **THEN** the skill provides the exact placement rule (inside `SectionHeading` as children of `PageHeader`, standard header size, `variant="outline"` for secondary and default filled for primary)
- **AND** the agent does not propose an alternative placement that contradicts the codified pattern

### Requirement: Merge Gate

Every pull request opened against `main` SHALL trigger at minimum one path-filtered check workflow and one Conventional-Commit title lint; contributors' commits SHALL be filtered by a local pre-commit hook that runs `lint-staged`.

#### Scenario: PR opened touching only admin files

- **WHEN** a PR is opened with changes limited to `apps/admin/**` (and optionally `packages/ui/**` or `packages/shared/**`)
- **THEN** GitHub Actions fires `admin-checks.yml` (running `pnpm --filter @vitalock/admin lint typecheck test`) and `pr-title-lint.yml`
- **AND** does NOT fire `installer-checks.yml` or `supabase-checks.yml`

#### Scenario: PR opened touching only supabase migrations

- **WHEN** a PR is opened with changes limited to `supabase/**`
- **THEN** GitHub Actions fires `supabase-checks.yml` and `pr-title-lint.yml`
- **AND** does NOT fire admin or installer checks

#### Scenario: PR title is not Conventional Commits

- **WHEN** a PR is opened with a title like "fix stuff" (missing type prefix and scope)
- **THEN** `pr-title-lint.yml` fails with a message pointing the author to `AGENTS.md § Commit style`
- **AND** the PR cannot be merged until the title is corrected

#### Scenario: Developer commits a poorly-formatted TypeScript file

- **WHEN** a developer runs `git commit` with a staged `.tsx` file containing prettier errors
- **THEN** the Husky `pre-commit` hook runs `lint-staged` which invokes `prettier --write` on the staged file
- **AND** the commit is either automatically fixed and proceeds, or fails and blocks the commit

#### Scenario: Fresh clone bootstrap

- **WHEN** a developer runs `pnpm install` after cloning
- **THEN** the `prepare` script runs `husky` and registers `.husky/pre-commit` under `.git/hooks/`
- **AND** the first `git commit` triggers the hook without requiring any manual setup
