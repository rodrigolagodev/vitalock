# Design: ah-foundation

## Scope

Adopt three high-ROI slices of the Agent Harness Standard: (1) a root convention doc, (2) two convention-as-code skills, (3) a minimum verifier gate on CI. All other AH pieces are Non-goals per proposal.

## Architecture Overview

Everything the change introduces lives at repository infrastructure level — nothing under `apps/` or `packages/src/`. Two categories:

- **Human-facing docs** — read once by contributors and by agents at session start: `AGENTS.md` at root, two `SKILL.md` files under `.claude/skills/`.
- **Machine-enforced gates** — fire without human trigger: four GitHub workflows, one Husky hook.

There is **no runtime code**. There are **no product-code edits**. Verification is: does the doc render, do the workflows validate, does the hook fire.

## Decision 1 — Where does `AGENTS.md` live?

**Options:**

- (A) `AGENTS.md` at repo root.
- (B) `docs/AGENTS.md`.
- (C) Extend `openspec/config.yaml`.

**Chosen:** (A). Root.

**Why:** Repo root is the convention for AI harnesses (Claude Code, Cursor, Codex all check root first). `docs/` is fine for humans but tools do not scan it by default. `openspec/config.yaml` is structured metadata, not narrative; overloading it degrades both purposes.

## Decision 2 — Skill file location: repo-local vs. user-global

**Options:**

- (A) `.claude/skills/<name>/SKILL.md` (per-repo).
- (B) `~/.claude/skills/<name>/SKILL.md` (user-global).

**Chosen:** (A). Per-repo.

**Why:** The two skills are Vitalock-specific (`admin-ui-patterns` references `EditableTitle`, a component in `packages/ui/src/patterns/`; `openspec-workflow` references phase files and archive paths under `openspec/`). Global installation would leak Vitalock names into unrelated projects. Repo-local skills are auto-discovered by Claude Code when the CWD is inside the repo.

## Decision 3 — Verifier gate: pre-commit hook vs. CI-only

**Options:**

- (A) CI-only.
- (B) Pre-commit (Husky + lint-staged) + CI.

**Chosen:** (B). Both layers.

**Why:** Pre-commit catches formatting and simple lint before push, saving CI minutes and turnaround time. CI is the enforced gate (cannot be bypassed by `--no-verify`). The layers are complementary, not duplicative — pre-commit runs `prettier + eslint --fix` on staged files only; CI runs full `pnpm lint`, `typecheck`, `test` on the whole workspace filtered by path.

## Decision 4 — CI granularity: one workflow with `matrix` vs. three per-area workflows

**Options:**

- (A) One workflow with a `matrix` over `[admin, installer, supabase]`, one job per area.
- (B) Three per-area workflows with independent `paths:` filters.

**Chosen:** (B). Three workflows.

**Why:** The AH standard's motivation for path filtering is: don't fire jobs for areas the diff does not touch. GitHub Actions `paths:` filters live at the workflow level, not at the matrix-job level. A matrix workflow either runs all jobs or none. Per-workflow filters give the actual saving.

Trade-off accepted: three files instead of one. All three share the same shape (Node 20, pnpm 9, `pnpm install --frozen-lockfile`, workspace filter) — divergence risk is low, and workflow files are short.

## Decision 5 — PR title lint: block or advise?

**Options:**

- (A) Block on non-Conventional titles.
- (B) Advise (comment, do not fail).

**Chosen:** (A). Block.

**Why:** The commit history already uses Conventional Commits (`fix(app-shell): …`, `feat(db): …`). A block gate makes the discipline consistent without requiring reviewer vigilance. `amannn/action-semantic-pull-request` fails the workflow on non-conforming titles; the failure message is enough to redirect the author.

## Decision 6 — Where do the two skills' trigger descriptions come from?

Skills auto-invoke based on the `description:` field in frontmatter. The description must match the shape of prompts where the skill should fire.

- **`admin-ui-patterns` description drivers** (from memory + this session):
  - "hagamos algo más lindo" / redesign a section in a `*DetailPage`
  - anything mentioning `PageHeader`, `SectionHeading`, `StatCard`, `EditableTitle`
  - adding action buttons, category badges, snapshot rows
- **`openspec-workflow` description drivers**:
  - "quiero abrir un cambio", "propose a change"
  - anything referencing `openspec/changes/`, task groups, `size:exception`
  - archive / verify / apply-progress requests

Descriptions are written to match these shapes, not to be exhaustive documentation.

## Decision 7 — `size:exception` acknowledgment

The change totals ~1400 lines. `openspec/config.yaml` sets `review_budget_lines: 800`. Following the pattern from `2026-09-01-ticket-taxonomy-cleanup` (proposal explicitly acknowledged size:exception, single-PR delivery), this proposal also acknowledges `size:exception`. Splitting would create three trivial PRs whose only value would be smaller diffs — the change is coherent as a single unit.

## Decision 8 — Do we delegate implementation to sub-agents?

**Chosen:** No. Direct inline execution.

**Why:** Every artifact is a small, mechanical write with fully-understood requirements. The delegation rules in the parent orchestrator prompt say direct-inline is the correct route for `≤ 3-file, already-understood mechanical writes`. This change writes ~9 files, but each is independent and short (< 200 lines), and all context is already in this session. Spinning up a `writer` sub-agent would inflate cost without changing quality.

## Runtime Behavior (post-apply)

**Fresh clone flow:**

1. Developer clones repo.
2. `pnpm install` runs — Husky auto-installs via `prepare` script; `.husky/pre-commit` is registered on `.git/hooks/`.
3. First commit runs `lint-staged` → `prettier --write` + `eslint --fix` on staged files.
4. On `git push` opening a PR, GitHub Actions fires only the workflow(s) matching the diff's paths, plus `pr-title-lint`.
5. PR cannot merge unless all triggered checks pass (once branch protection is configured — a manual step documented in `AGENTS.md`).

**Agent session flow:**

1. Claude Code opens in repo root.
2. `AGENTS.md` at root is auto-loaded into the session prompt.
3. When a user prompt matches one of the two skill descriptions, that skill's `SKILL.md` is auto-fetched.
4. Agent operates with correct convention context on the first prompt, not the fifth.

## Rollback Plan

Trivial. Every file added is standalone. Rollback = `git rm` the new files and `pnpm install`. No data migration, no runtime state, no downstream dependencies.

## Open Questions

None. All decisions above are final; no product-scope questions unresolved.
