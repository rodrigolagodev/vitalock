---
name: openspec-workflow
description: How Spec-Driven Development (SDD) changes are structured, applied, verified, and archived in the Vitalock repo. Load when the user asks to "open a change", "propose", "spec", "design", or "apply" a change; when working in openspec/changes/, when touching proposal.md / design.md / tasks.md / spec.md / apply-progress.md / verify-report.md; or when references to size:exception, single-pr, chained-pr, review budget, or archive appear.
---

# openspec-workflow (Vitalock)

Spec-Driven Development for Vitalock lives in `openspec/`. Config: `openspec/config.yaml` (`execution_mode: auto`, `delivery_strategy: ask-on-risk`, `review_budget_lines: 800`, `strict_tdd: true`).

## Structure of a change

```
openspec/changes/<change-name>/
├── proposal.md          # Why / What / Impact / Success / Non-goals / Risks / Ready
├── design.md            # Decisions, options considered, chosen approach
├── tasks.md             # Phased checklist with review workload forecast
├── apply-progress.md    # Written during sdd-apply; per-phase progress + evidence
├── verify-report.md     # Written during sdd-verify; final CRITICAL/WARNING/SUGGESTION list
├── manual-verification.md   # Optional; steps a human performs post-apply
├── exploration.md       # Optional; captures explore-phase findings
└── specs/<capability>/spec.md   # Delta specs (ADDED/MODIFIED/REMOVED requirements)
```

Baseline specs (accepted, merged) live at `openspec/specs/<capability>/spec.md`.

## Naming

- **Change slug** — kebab-case, verb-object or feature name. Examples: `ticket-taxonomy-cleanup`, `terminal-state-immutability`, `admin-collapsible-sidebar`, `equipment-update-bundle-flow`.
- **Capability slug** — kebab-case, noun. Examples: `ticket-taxonomy`, `key-lifecycle`, `agent-harness`.
- **Migration files** — `supabase/migrations/YYYYMMDDHHMMSS_verb_object.sql` (wall-clock timestamp; must be greater than any predecessor).

## Phase files (order they appear)

1. **`proposal.md`** — Written first. Sections in this order:

   - `## Why` — the pain, with evidence (rows counts, past incidents, memory obs).
   - `## What Changes` — bullet list of concrete deltas.
   - `## Impact` — change size (**declare `size:exception` if > 800 lines**), data touched, users affected, migration count.
   - `## Success Criteria` — testable outcomes.
   - `## Non-goals` — explicit, with reasoning.
   - `## Risks` — numbered, each with mitigation.
   - `## Ready for Spec/Design` — one line, "Ready" or the blockers.

2. **`design.md`** — Written second. Decisions with options considered.

   - Each meaningful choice gets a `## Decision N — <question>` section with Options, Chosen, Why.
   - Includes: `## Runtime Behavior`, `## Rollback Plan`, `## Open Questions`.
   - Prefer 6–10 discrete decisions over a monolithic prose block.

3. **`specs/<capability>/spec.md`** — Delta spec.

   - Sections: `## ADDED Requirements` / `## MODIFIED Requirements` / `## REMOVED Requirements`.
   - Each requirement: `### Requirement: <name>` + one-paragraph rule + one or more `#### Scenario: <name>` blocks with `WHEN … THEN … AND …` steps.

4. **`tasks.md`** — Written after spec + design.

   - Opens with a **Review Workload Forecast** table (see § Size and delivery below).
   - Suggested Work Units table (unit / goal / PR / focused check / rollback).
   - Then phased checklists: `## Phase N · <name>` with `- [ ] N.M description`.

5. **`apply-progress.md`** — Written **during** `sdd-apply`. Per-phase status, files touched, tests run.

6. **`verify-report.md`** — Written by `sdd-verify`. Verdict (`PASS` / `FAIL`) + numbered `CRITICAL-N`, `WARNING-N`, `SUGGESTION-N` list.

## Size and delivery

The review budget is **800 lines**. Deliveries:

- **single-pr** (default) — everything ships as one PR. If projected > 800 lines, the proposal must acknowledge `size:exception` explicitly in `## Impact`, and `tasks.md § Review Workload Forecast` must record `Chain strategy: size-exception`.
- **chained-pr** — split into ≤ 3 sequential PRs, each < 800 lines, each independently verifiable. Used when the work has a clean seam and reviewers benefit from smaller diffs.

The Review Workload Forecast at the top of `tasks.md` is mandatory when `> 400` lines are expected. Fields:

```
| Field | Value |
|-------|-------|
| Estimated changed lines | <number or range> |
| 800-line budget risk | Low / Medium / High |
| Chained PRs recommended | Yes / No |
| Suggested split | <sentence> |
| Delivery strategy | single-pr / chained-pr |
| Chain strategy | size-exception / clean-seam / N/A |
```

## Task groups (phases)

- Use `## Phase N · <descriptive name>` (Phase 0 for prerequisites, Phase 1+ for work, final phase for `Verify`).
- Each item: `- [ ] N.M <imperative verb> <what> (<where>).`
- Mark as `- [x]` **only when the work is proven** — a passing test, a file that exists, a migration that reset-and-pushed cleanly. Not when "I intend to do it."

## Verifier gate

Nothing archives without the gate passing (see `AGENTS.md § Verifier gate`):

```bash
pnpm lint && pnpm typecheck && pnpm test
pnpm --filter @vitalock/supabase test:sql        # if SQL touched
```

Structural validation of the change folder (proposal + design + tasks + delta specs with acceptance scenarios, unique task IDs, no dangling references) is handled by the `sdd-verify` sub-agent. There is no `openspec` CLI installed in this repo — OpenSpec is a file-system convention here.

CI runs the equivalent path-filtered subset on PR open — do not merge on red.

## Archive lifecycle

After verify passes and the PR merges:

- `openspec/changes/<change-name>/` moves to `openspec/changes/archive/<YYYY-MM-DD>-<change-name>/`.
- Delta specs merge into the corresponding baseline spec under `openspec/specs/<capability>/spec.md`.
- The archive folder retains proposal + design + tasks + spec + verify-report as historical record.

## Common gotchas

- **Duplicated task ids** — `tasks.md` numbers must be unique. `openspec validate --strict` catches this.
- **Delta spec without a baseline** — for a **new** capability, the delta lives only under the change folder; on archive, it seeds `openspec/specs/<new-capability>/spec.md`.
- **Missing acceptance scenarios** — every requirement needs at least one `Scenario`. `--strict` will fail otherwise.
- **`size:exception` in tasks but not proposal** — the acknowledgment must be in `proposal.md § Impact`; `tasks.md` mirrors it.
- **Forgetting to update `apply-progress.md`** — the SDD orchestrator relies on it to resume interrupted apply runs.

## Precedent

Archive folder (`openspec/changes/archive/`) is the reference library. Latest exemplars to match style:

- `2026-09-01-ticket-taxonomy-cleanup` — full triad, delta specs across 4 capabilities, size:exception acknowledged.
- `2026-09-01-terminal-state-immutability` — smaller scope, single delta, clean apply-progress.
- `2026-08-30-consolidation-ap6-and-admin-order-twins` — larger refactor exemplar.

When in doubt, read the most recent archive that matches the current change's shape.
