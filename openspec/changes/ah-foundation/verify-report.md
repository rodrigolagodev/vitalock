# Verify Report: ah-foundation

**Date:** 2026-09-02
**Verdict:** PASS (with 5 scope-adjacent unblockers recorded).

---

## 1. Structural Check on Change Folder

- `proposal.md` — present.
- `design.md` — present.
- `tasks.md` — present. Task IDs unique (0 duplicates).
- `specs/agent-harness/spec.md` — present. 3 Requirements, 9 Scenarios total (≥ 1 scenario per requirement).

**Result:** PASS.

## 2. Files Written

| Fase | Path                                                         | Kind                                                                                   |
| ---- | ------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| 0    | `AGENTS.md`                                                  | New (repo root convention doc)                                                         |
| 2    | `.claude/skills/admin-ui-patterns/SKILL.md`                  | New                                                                                    |
| 2    | `.claude/skills/openspec-workflow/SKILL.md`                  | New                                                                                    |
| 1    | `.github/workflows/admin-checks.yml`                         | New                                                                                    |
| 1    | `.github/workflows/installer-checks.yml`                     | New                                                                                    |
| 1    | `.github/workflows/supabase-checks.yml`                      | New                                                                                    |
| 1    | `.github/workflows/pr-title-lint.yml`                        | New                                                                                    |
| 1    | `.husky/pre-commit`                                          | New (executable)                                                                       |
| 1    | `package.json`                                               | Modified (add `prepare` script, `husky` + `lint-staged` devDeps, `lint-staged` config) |
| 1    | `packages/config-eslint/react.js`                            | Modified (add browser globals for `public/**/*.js`)                                    |
| SDD  | `openspec/changes/ah-foundation/proposal.md`                 | New                                                                                    |
| SDD  | `openspec/changes/ah-foundation/design.md`                   | New                                                                                    |
| SDD  | `openspec/changes/ah-foundation/tasks.md`                    | New                                                                                    |
| SDD  | `openspec/changes/ah-foundation/specs/agent-harness/spec.md` | New                                                                                    |
| SDD  | `openspec/changes/ah-foundation/verify-report.md`            | New (this file)                                                                        |

## 3. Scope-Adjacent Unblockers

The proposal promised "Zero source files under `apps/` or `packages/` are modified." That promise is intentionally broken by these unblockers, with the user's explicit consent. **Reason:** the newly-installed CI gate would fail on first PR from pre-existing lint/typecheck debt unrelated to `ah-foundation`, defeating the point of installing the gate.

| #   | File                                                                      | Change                                               | Root cause                                                                                             |
| --- | ------------------------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| 1   | `packages/shared/src/errors/__tests__/toastMutationError.test.ts:135`     | `let firedKeys` → `const firedKeys`                  | Introduced in commit `96e78b5` (2026-08-30, `refactor(shared): extract mapMutationError`)              |
| 2   | `apps/installer/public/theme-init.js`                                     | Wrap `catch (e) {}` → `catch (_e) { /* ignore */ }`  | Pre-existing browser IIFE; `no-empty` never surfaced without a workspace lint gate                     |
| 3   | `apps/admin/public/theme-init.js`                                         | Same as #2                                           | Same as #2 (mirror file)                                                                               |
| 4   | `apps/admin/src/hooks/__tests__/usePendingKeysForEquipment.test.ts:78-79` | `let schemaCallCount, publicFromCallCount` → `const` | Pre-existing counters never reassigned                                                                 |
| 5   | `apps/admin/src/hooks/usePendingKeysForEquipment.ts:81`                   | `let keyMap` → `const keyMap`                        | `Map` reference not reassigned; only `.set()` calls                                                    |
| 6   | `packages/supabase/src/rpc/__tests__/technicalOrders.test.ts:24`          | `item_type: 'maintenance'` → `'maintain_equipment'`  | Fallout from `ticket-taxonomy-cleanup` (archived 2026-09-01); test file missed during the rename sweep |

**Warning sweep (added late in the change, at user request):** the 25 lint warnings that survived the unblocker pass have been cleaned up as part of this change. Categorized as scope-adjacent because they were pre-existing debt of the same category as the errors already fixed. Fixes applied:

- Remove genuinely unused imports/vars (18): `vi` in `PendingKeysGuardrailBadge.test.tsx`; `Badge` import in `TechnicalOrderForm.tsx`; `ACCESS_TYPE_OPTIONS` block + `createAndAssignEquipment` destructure in `AssignEquipmentDialog.tsx`; `unresolvedRow` + `EquipmentUpdateHistoryRow` type import in `useEquipmentUpdateHistory.test.ts`; 10 dead hoisted mocks and counter consts in `usePendingKeysForEquipment.test.ts`; `ReactNode` type in `StockPage.test.tsx`; 6 dead hoisted mocks + a leaked `clickSpy` in `EquipmentUpdateResolveDetail.test.tsx`.
- Prefix `_` on args intentionally unused (5): `input` in `useMutateEquipmentUpdate.test.ts:101`; `order_id` in `useMutateKey.ts` `recordPickup` destructure; `schema` in two `mockSchema.mockImplementation` calls; `e` in two `extraHandlers` in `toastMutationError.test.ts`.
- `catch (_e) { ... }` → `catch { ... }` in both `theme-init.js` files (ES2019 optional catch binding).
- Wrap `toActivate`/`toDisable`/`unchanged` in `useMemo` inside `EquipmentKeySnapshotPanel.tsx` to stabilize the dependency array of the downstream `useMemo` (resolves `react-hooks/exhaustive-deps`).
- Inline `// eslint-disable-next-line` with context comment on: `CATEGORY_LABELS` export in `ProductFormFields.tsx` (react-refresh warning about mixed exports; keeping the label co-located with the form); `TStatus` generic in `createUseOrderList.ts` (public factory API, documents allowed values); `sriPlugin` in both `vite.config.ts` (kept for future re-enable per commit a3a3157).

**Also modified `packages/config-eslint/react.js`** to add `public/**/*.js` browser-globals scope. Extension to the shared eslint preset. Categorized as scope-adjacent because it exists solely to unblock the `theme-init.js` pattern used by both apps.

## 4. Verifier Gate Run

Executed on the change branch after all writes and unblockers:

```
pnpm install                                    → OK (husky + lint-staged installed, prepare hook registered)
pnpm lint                                       → 5/5 workspaces PASS, 0 errors, 0 warnings (post-sweep)
pnpm typecheck                                  → 5/5 workspaces PASS
pnpm test                                       → 5/5 workspaces PASS (673 admin tests + others)
pnpm --filter @vitalock/supabase test:sql       → 194 SQL tests PASS (39 files)
```

## 5. Sanity Checks

- `.husky/pre-commit` — exists, executable (`-rwxr-xr-x`), content: `pnpm exec lint-staged`.
- `.husky/_/` — Husky bootstrap installed by `prepare` on `pnpm install`.
- `.git/hooks/pre-commit` — registered via Husky's `core.hooksPath` (`.husky/_/pre-commit`).
- All 4 workflows have `name:`, `on:`, `jobs:` (validated via node structural check; `actionlint` not installed on host — final proof is a PR open triggering CI).

## 6. Success Criteria (from proposal)

- [x] `AGENTS.md` at repo root; a fresh agent can read it once and know the stack, verifier command, and where OpenSpec lives.
- [x] Both skills exist under `.claude/skills/<name>/SKILL.md` with valid frontmatter that would allow Claude Code to auto-invoke them on relevant prompts.
- [x] Four workflows in `.github/workflows/`; a PR that touches only `apps/admin/**` fires `admin-checks` and `pr-title-lint`, does not fire installer/supabase checks. **(Confirmed structurally via `paths:` filters; live confirmation deferred to first real PR.)**
- [x] `.husky/pre-commit` runs `lint-staged` and blocks a commit that fails prettier or eslint.
- [x] Structural check on `openspec/changes/ah-foundation/` passes.
- [x] `pnpm lint && pnpm typecheck && pnpm test` all green on the change branch after apply.

## 7. Follow-ups (not blockers)

- `apps/installer/src/routes/TaskDetailPage.tsx:306` still references the string `'installation'` at runtime — likely dead branch after `ticket-taxonomy-cleanup`. Investigate in a separate change (does not fail typecheck because the compared value is typed as `string`).
- Branch protection settings on `main` (require `admin-checks`, `installer-checks`, `supabase-checks`, `pr-title-lint`) — must be applied manually in GitHub Repo Settings. Documented in `AGENTS.md § Branch protection`.
- Enable "Automatically delete head branches" in repo settings. Documented in `AGENTS.md`.

## 8. Manual verification suggested post-merge

- Open a small PR touching only `apps/admin/**` and confirm only `admin-checks` and `pr-title-lint` fire.
- Open a small PR touching only `supabase/**` and confirm only `supabase-checks` and `pr-title-lint` fire.
- Attempt to commit a `.ts` file with a formatting issue locally — confirm the hook blocks.
- Open a PR titled `test bad title` (no Conventional Commits type) — confirm `pr-title-lint` fails and explains why.

---

**Final verdict: PASS.** Change is ready to open as a PR and merge.
