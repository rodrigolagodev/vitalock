# Archive Report: auth-session

**Change**: auth-session
**Archived**: 2026-08-08
**Archive path**: `openspec/changes/archive/2026-08-08-auth-session/`
**Verdict at close**: PASS WITH WARNINGS (no CRITICALs)

---

## Final State Summary

All 14 implementation tasks completed. Three commits landed on main. Pipeline green at close.

| Fact | Source | Authority rank |
|------|--------|---------------|
| 14/14 tasks complete | `tasks.md` (all `[x]`), orchestrator prompt | 2 (tasks artifact) + 3 (launch prompt) |
| Pipeline green | Orchestrator prompt (confirmed) | 3 |
| W1 (SC-R6-2) resolved | Commit `6fceca6` — replaced `admin1234` with `test-password` | 3 (launch prompt) |
| W2 (string not literal union) | Carried forward as non-blocking design note | 4 (verify-report #24) |
| S1 (localStorage ExperimentalWarning) | Carried forward as cosmetic | 4 (verify-report #24) |

No CRITICAL issues were present at any point in the cycle.

---

## Commits

| SHA | Message | Scope |
|-----|---------|-------|
| `4968e79` | `chore(supabase): regenerate database.types.ts + seed auth users for local dev` | T01 + T02 — generated types + seed |
| `7a1aee2` | `feat(auth): session management and route protection for admin and installer apps` | T03–T14 — all authored auth code |
| `6fceca6` | `test(shared): use generic test-password literal to satisfy no-secrets rule` | Post-verify fix for W1 (SC-R6-2) |

All three commits are on `main`. No git remote exists at archive time.

---

## Artifact Inventory

| Artifact | File path (archived) | Engram observation ID |
|----------|---------------------|-----------------------|
| explore | `explore.md` | `sdd/auth-session/explore` (search result) |
| proposal | `proposal.md` | #17 |
| spec | `spec.md` | #19 |
| design | `design.md` | #18 |
| tasks | `tasks.md` | #20 |
| apply-progress | `apply-progress.md` | n/a (file only) |
| verify-report | `verify-report.md` | #24 |
| archive-report | `archive-report.md` (this file) | `sdd/auth-session/archive-report` |

---

## Spec Sync

No prior `openspec/specs/auth/spec.md` existed. `auth-session` introduces this domain from scratch.

**Action taken**: `spec.md` copied mechanically (shell `cp`) to `openspec/specs/auth/spec.md` as the new main spec.

**Readback**: `diff -r openspec/changes/auth-session/spec.md openspec/specs/auth/spec.md` — empty (status 0). Checksums match: `e1a9d15326c7d9d88d474ed273e4fe28`.

---

## Archive Move Readback

**Source**: `openspec/changes/auth-session/` (moved via `mv`)
**Destination**: `openspec/changes/archive/2026-08-08-auth-session/`

Post-move verification:
- Source directory is gone (confirmed).
- Archive contains all 7 expected artifacts.
- `diff -r` between archived `spec.md` and `openspec/specs/auth/spec.md` — empty (status 0).
- MD5 checksums of archived artifacts:

```
4f6b348d3fa509ae6f81b14a3a839ea8  apply-progress.md
36d04d43a099a2a3692d51697c1934a5  design.md
a25704af68add77e715bb4cb00c06c24  explore.md
a13742355c0423cdf749196b1d863771  proposal.md
e1a9d15326c7d9d88d474ed273e4fe28  spec.md
4f6e54ff312ed610312b36314b3a6044  tasks.md
97ba3a02ddc983bb4772a6420c52bc9d  verify-report.md
```

Note: the snapshot was captured in a subshell whose EXIT trap cleaned it up before a cross-shell `diff -r` could run. Byte identity is confirmed instead via (a) MD5 checksums of all archived files, (b) empty `diff -r` between the archived spec and main spec copy (same bytes), and (c) `mv` being an atomic rename within the same filesystem — no byte routing through the model at any step.

---

## Verification Report Summary

**Verify-report engram ID**: #24
**Verdict at verification time**: PASS WITH WARNINGS (2W, 1S)

Per the Final-State Authority hierarchy, intermediate snapshot claims are ranked below explicit final-state facts in the launch prompt:

### W1 — SC-R6-2: seed password literal in test file
- **At verify time**: `admin1234` literal present in `packages/shared/src/auth/useAuth.test.ts` line 98.
- **Final state**: RESOLVED in commit `6fceca6` — string replaced with `test-password`.

### W2 — role/status typed as `string` not literal union
- **Status**: Carried forward as a non-blocking design note.
- **Detail**: `identity.staff.role` and `identity.staff.status` in `database.types.ts` are `string` (DB column is not a Postgres enum). TypeScript cannot auto-narrow the union. Not a spec requirement violation.
- **Recommended action for next change**: If role-checking logic needs narrowing, add a runtime type guard or an explicit cast at the query boundary.

### S1 — localStorage ExperimentalWarning in test output
- **Status**: Carried forward as cosmetic.
- **Detail**: Node emits `ExperimentalWarning: localStorage is not available because --localstorage-file was not provided` during vitest runs. jsdom handles localStorage correctly in the test environment; the warning is benign.
- **Recommended action**: Add a vitest setup file that silences the Node warning, if test output cleanliness matters.

---

## Auth Infrastructure Delivered

### Shared package (`packages/shared/src/auth/`)
- `types.ts` — `StaffRole`, `StaffProfile`, `AuthErrorCode` enum, `AuthPhase`, `AuthState`, `UseAuthReturn`
- `useAuth.ts` — core hook (~200 LOC); supabase-js `onAuthStateChange` subscription; four-terminal profile fetch; `signIn`/`signOut`/`refresh`
- `useAuth.test.ts` — 6 Vitest unit tests (mock supabase, no provider wrapper needed)
- `index.ts` — barrel re-export

### Admin app (`apps/admin/src/`)
- `auth/AuthProvider.tsx` — provides `AuthContext` with `useAuth(supabase, 'admin')`
- `auth/ProtectedRoute.tsx` — spinner | redirect /login | redirect /error | Outlet
- `routes/LoginPage.tsx` — RHF + Zod, Spanish error messages, `signIn` on submit
- `routes/AuthErrorPage.tsx` — `?reason=` lookup + "Volver al inicio" nav
- `main.tsx` — migrated to `BrowserRouter`, `AuthProvider` wraps `Routes`

### Installer app (`apps/installer/src/`)
- Mirror of admin with `useAuth(supabase, 'installer')`

### Backend
- `packages/supabase/src/database.types.ts` — regenerated with all 5 schemas (public, identity, keys, billing, auth)
- `supabase/seed.sql` — extended with `auth.users` for Ana Alvarez + Bruno Benitez (LOCAL DEV ONLY)

### Pipeline at close
| Command | Exit code |
|---------|-----------|
| pnpm install | 0 |
| pnpm build | 0 |
| pnpm typecheck | 0 (5 packages) |
| pnpm lint | 0 (0 errors) |
| pnpm test | 0 (9 tests: 3 env + 6 useAuth) |

---

## Requirement Coverage

| Requirement | Scenarios | Final result |
|-------------|-----------|-------------|
| R1 — Unauthenticated route protection | SC-R1-1, SC-R1-2, SC-R1-3 | PASS |
| R2 — Successful login and role match | SC-R2-1, SC-R2-2 | PASS |
| R3 — Cross-app role enforcement | SC-R3-1, SC-R3-2 | PASS |
| R4 — Auth error handling | SC-R4-1, SC-R4-2, SC-R4-3 | PASS |
| R5 — Post-login profile states | SC-R5-1, SC-R5-2, SC-R5-3 | PASS |
| R6 — Seed test users | SC-R6-1, SC-R6-2 | PASS (W1 resolved in 6fceca6) |
| R7 — Session persistence and logout | SC-R7-1, SC-R7-2 | PASS |
| R8 — Type generation, pipeline, tests | SC-R8-1, SC-R8-2, SC-R8-3 | PASS |

---

## Carry-Forward Notes

These are non-blocking and do not require action before the next change:

1. **W2 — Literal union types for role/status**: If a future change adds role-conditional logic, add a runtime type guard at the `from('staff')` query boundary rather than waiting for the DB column to become a Postgres enum.
2. **S1 — localStorage ExperimentalWarning**: Add a vitest setup file (`vitest.setup.ts`) that intercepts and silences the Node process warning if clean test output becomes a project standard.
3. **No git remote yet**: Commits are on local `main` only. Push and PR setup is out of scope for this change but needed before any team collaboration.

---

## Recommended Next Change

`installer-worklist` — Installer's home page showing their assigned `key_authorizations` pending install/removal and assigned tickets. This is the installer's daily driver, has the tightest value-to-scope ratio, and directly exercises the newly deployed auth layer (ProtectedRoute → authenticated → content).

Alternative candidates if priority differs:
- `admin-dashboard` — admin landing with counts (open tickets, pending requests)
- `staff-management` — admin CRUD for `identity.staff` (invite, deactivate, reassign)
- `key-requests-list` — admin CRUD list of `key_requests`

---

## Key Learnings

1. Sharing the `useAuth` hook in `packages/shared` while keeping per-app `AuthProvider` and `ProtectedRoute` eliminates role coupling without duplicating supabase call logic.
2. Designing `useAuth` to accept `supabase` and `expectedRole` as function arguments (not React context) makes the hook unit-testable without a provider wrapper — a critical testability constraint.
3. The generated `database.types.ts` diff (800–2000 lines) must be committed alone before any authored code to stay within the 400-line review budget; mixing it inflates reviewer cognitive load for no gain.
4. `rg` (ripgrep) pattern matching for secret literals in tests requires replacing the literal even in fully-mocked contexts where no network call occurs — the scanner cannot distinguish execution paths.
5. A `mv` within the same filesystem is an atomic rename with no byte routing through the model; this is the only safe mechanism for archival moves when a subshell EXIT trap cannot be shared across shell calls.
