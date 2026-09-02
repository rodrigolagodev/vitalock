# Tasks: ah-foundation

## Review Workload Forecast

| Field                   | Value                                                            |
| ----------------------- | ---------------------------------------------------------------- |
| Estimated changed lines | ~1400 (~700 SDD artifacts + ~740 implementation)                 |
| 800-line budget risk    | High                                                             |
| Chained PRs recommended | No — single-pr strategy; size:exception acknowledged in proposal |
| Suggested split         | Single PR                                                        |
| Delivery strategy       | single-pr                                                        |
| Chain strategy          | size-exception                                                   |

Decision needed before apply: Yes → **Accepted** (acknowledged in proposal § Impact).
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: High

### Suggested Work Units

| Unit | Goal                  | Likely PR     | Focused check                                          | Rollback boundary               |
| ---- | --------------------- | ------------- | ------------------------------------------------------ | ------------------------------- |
| 1    | Root convention doc   | PR 1 (single) | Read-through; renders as GFM                           | Delete `AGENTS.md`              |
| 2    | Two convention skills | PR 1 (single) | Skills load with valid frontmatter                     | Delete `.claude/skills/<name>/` |
| 3    | Four CI workflows     | PR 1 (single) | GitHub Actions parses YAML on push                     | Delete workflow files           |
| 4    | Husky + lint-staged   | PR 1 (single) | `pnpm install` installs hook; `git commit` triggers it | Remove devDeps + hook + config  |

---

## Phase 0 · Root conventions

- [x] 0.1 Create `AGENTS.md` at repo root with sections: Stack, Layout, Scope authority (OpenSpec), Invariants, Verifier gate, Commit style, Delegation (deferred), Where things live.
- [x] 0.2 Include the exact verifier command as a fenced code block: `pnpm lint && pnpm typecheck && pnpm test && pnpm --filter @vitalock/supabase test:sql && openspec validate <change> --strict`.
- [x] 0.3 Reference OpenSpec as the authority for non-trivial work, with a pointer to `openspec/config.yaml`.

## Phase 2 · Convention-as-code skills (recortada, dos skills)

- [x] 2.1 Create `.claude/skills/admin-ui-patterns/SKILL.md` with YAML frontmatter (`name`, `description`) and body listing the six patterns with source file paths and evidence links (memory obs IDs where applicable).
- [x] 2.2 Create `.claude/skills/openspec-workflow/SKILL.md` with YAML frontmatter and body covering: change folder structure, phase files, task groups, `size:exception` rule, `apply-progress.md` conventions, verify/archive lifecycle.
- [x] 2.3 Both skills declare their trigger descriptions matching observed prompt shapes (see design § Decision 6).

## Phase 1 · Verifier gate

- [x] 1.1 Add `.github/workflows/admin-checks.yml`: on `pull_request` with `paths:` filter for `apps/admin/**`, `packages/ui/**`, `packages/shared/**`, `packages/config-*/**`, root package files. Job runs Node 20 + pnpm 9, `pnpm install --frozen-lockfile`, then `pnpm --filter @vitalock/admin lint typecheck test`.
- [x] 1.2 Add `.github/workflows/installer-checks.yml`: same shape, filter for `apps/installer/**` + shared packages, filter `@vitalock/installer`.
- [x] 1.3 Add `.github/workflows/supabase-checks.yml`: filter for `supabase/**`, `packages/supabase/**`; runs `pnpm --filter @vitalock/supabase lint typecheck test`.
- [x] 1.4 Add `.github/workflows/pr-title-lint.yml`: on `pull_request` opened/edited/synchronize; runs `amannn/action-semantic-pull-request@v5` with allowed types matching Conventional Commits.
- [x] 1.5 Add `husky@^9` and `lint-staged@^15` to root `package.json` devDeps. Add `prepare: "husky"` script. Add `lint-staged` config: `*.{ts,tsx,js,jsx}` → `eslint --fix` + `prettier --write`; `*.{json,md,yml,yaml,css}` → `prettier --write`.
- [x] 1.6 Create `.husky/pre-commit` (executable) running `pnpm exec lint-staged`.

## Phase 3 · Delta spec

- [x] 3.1 Create `openspec/changes/ah-foundation/specs/agent-harness/spec.md` with three requirements: Convention Discoverability, UI Pattern Discipline, Merge Gate. Each with `WHEN … THEN …` acceptance scenarios.

## Phase 4 · Verify

- [x] 4.1 Structural check: `openspec/changes/ah-foundation/` contains `proposal.md`, `design.md`, `tasks.md`, `specs/agent-harness/spec.md`; each requirement has ≥ 1 scenario; task IDs are unique. (Manual — no `openspec` CLI available.)
- [x] 4.2 Run `pnpm install` (installs new devDeps + registers Husky hook).
- [x] 4.3 Run `pnpm lint && pnpm typecheck && pnpm test` and confirm all green.
- [x] 4.4 Run `pnpm --filter @vitalock/supabase test:sql` and confirm green (unaffected but part of the verifier contract; requires local Supabase up — skip if unavailable and record in verify-report).
- [x] 4.5 Sanity-check: `.husky/pre-commit` is executable; running `git commit` on a staged JS file with a formatting issue is blocked by lint-staged.
- [x] 4.6 Sanity-check: YAML workflows parse (`actionlint` if available; final proof is a PR open triggering CI).
