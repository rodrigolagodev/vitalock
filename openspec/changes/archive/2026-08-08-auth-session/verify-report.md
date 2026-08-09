# Verification Report: auth-session

**Change**: auth-session
**Phase**: verify
**Date**: 2026-08-08
**Verdict**: PASS WITH WARNINGS
**Requirements**: 8 (R1–R8) | **Scenarios**: 17 (SC-R1-1 through SC-R8-3)

---

## Pipeline Results

| Command | Exit code | Notes |
|---------|-----------|-------|
| `pnpm install` | 0 | Lockfile up to date |
| `pnpm build` | 0 | admin + installer both compiled |
| `pnpm typecheck` | 0 | 5 packages (shared, supabase, admin, installer + config) |
| `pnpm lint` | 0 | 0 errors (5 packages, full turbo cache hit) |
| `pnpm test` | 0 | 9 tests pass: 3 env + 6 useAuth |

---

## Git State

| Check | Result |
|-------|--------|
| Commit count | 3 (bootstrap + Commit A + Commit B) |
| Commit messages | Conventional commits, no AI attribution |
| Working tree | Clean (only untracked `openspec/` directory) |
| Author | rodrigolagodev |

Commits in order:
- `7f52713` — `chore: initial monorepo bootstrap`
- `4968e79` — `chore(supabase): regenerate database.types.ts + seed auth users for local dev`
- `7a1aee2` — `feat(auth): session management and route protection for admin and installer apps`

---

## Task Completeness

All 14 tasks marked `[x]` in tasks.md. Spot checks:

| Task | File existence check | Result |
|------|---------------------|--------|
| T01 | `packages/supabase/src/database.types.ts` — `identity.Tables.staff` present | PASS |
| T02 | `supabase/seed.sql` — auth.users + UPDATE linkage + LOCAL DEV ONLY comment | PASS |
| T03 | `packages/shared/src/auth/types.ts` — all exports present | PASS |
| T04 | `packages/shared/src/auth/useAuth.ts` — hook signature matches design | PASS |
| T05 | `packages/shared/src/auth/useAuth.test.ts` — 6 tests, all pass | PASS |
| T06 | `packages/shared/src/auth/index.ts` + `src/index.ts` updated | PASS |
| T07 | `apps/admin/src/auth/AuthProvider.tsx` + `ProtectedRoute.tsx` | PASS |
| T08 | `apps/admin/src/routes/LoginPage.tsx` + `AuthErrorPage.tsx` | PASS |
| T09 | `apps/admin/src/main.tsx` — BrowserRouter + AuthProvider wrapping Routes | PASS |
| T10 | `apps/installer/src/auth/AuthProvider.tsx` + `ProtectedRoute.tsx` | PASS |
| T11 | `apps/installer/src/routes/LoginPage.tsx` + `AuthErrorPage.tsx` | PASS |
| T12 | `apps/installer/src/main.tsx` — same structure as admin | PASS |
| T13 | Full pipeline — all 5 commands exit 0 | PASS |
| T14 | Commit B `7a1aee2` — 20 files, conventional commit message | PASS |

---

## Requirement Compliance Matrix

| Req | Scenarios | Automated coverage | Verdict |
|-----|-----------|-------------------|---------|
| R1 — Unauthenticated route protection | SC-R1-1, SC-R1-2, SC-R1-3 | ProtectedRoute navigates to `/login` for `anonymous`/`authenticating` phases; `SIGNED_OUT` event → `anonymous`. Test 6 covers signOut→anonymous. | PASS |
| R2 — Successful login and role-matched home | SC-R2-1, SC-R2-2 | Test 1 covers happy path (admin); installer AuthProvider uses `'installer'` role via `useAuth(supabase, 'installer')`. | PASS |
| R3 — Cross-app role enforcement | SC-R3-1, SC-R3-2 | `fetchProfile` wrong_role branch: calls `signOut()`, sets `WRONG_ROLE` error. `ProtectedRoute` redirects to `/error?reason=wrong_role`. `AuthErrorPage` renders "Esta cuenta no tiene acceso a esta aplicación." | PASS |
| R4 — Auth error handling | SC-R4-1, SC-R4-2, SC-R4-3 | Test 2 covers INVALID_CREDENTIALS. Zod schema catches empty email/password client-side before any signIn call. Network error caught in `catch` block → NETWORK_ERROR. | PASS |
| R5 — Post-login profile states | SC-R5-1, SC-R5-2, SC-R5-3 | Test 3 (NO_STAFF_ROW + signOut); Test 4 (INACTIVE_STAFF + signOut). ProtectedRoute shows `<FullScreenSpinner />` for `fetching_profile` phase. | PASS |
| R6 — Seed test users | SC-R6-1, SC-R6-2 | SC-R6-1: seed.sql has auth.users blocks + UPDATE linkage with `crypt()`/`ON CONFLICT DO NOTHING`. SC-R6-2: **WARNING** — see issues. | PASS WITH WARNINGS |
| R7 — Session persistence and logout | SC-R7-1, SC-R7-2 | Test 5 (session restore on mount via `getSession` → SIGNED_IN event). Test 6 (signOut → SIGNED_OUT event → `anonymous`). `TOKEN_REFRESHED` keeps `authenticated` without re-fetch. | PASS |
| R8 — Type generation and pipeline health | SC-R8-1, SC-R8-2, SC-R8-3 | `identity.Tables.staff.Row` present in `database.types.ts`. Pipeline green (all 5 commands exit 0). 6 useAuth tests all pass. | PASS |

---

## Design Conformance

| Design element | Expected | Actual | Result |
|---------------|----------|--------|--------|
| `useAuth` signature | `useAuth(supabase: TypedSupabaseClient, expectedRole: StaffRole): UseAuthReturn` | Exact match | PASS |
| `AuthProvider` expected role — admin | `'admin'` | `useAuth(supabase, 'admin')` | PASS |
| `AuthProvider` expected role — installer | `'installer'` | `useAuth(supabase, 'installer')` | PASS |
| `ProtectedRoute` phase logic | initializing/fetching_profile → spinner; anonymous/authenticating → /login; error → /error?reason=; authenticated → Outlet | Exact match | PASS |
| `LoginPage` schema | `z.string().email(...)` + `z.string().min(1, ...)` with Spanish messages | Exact match | PASS |
| Router structure | `BrowserRouter` + `AuthProvider` wraps `Routes` + `/login`, `/error`, `ProtectedRoute` layout | Exact match in both apps | PASS |
| `App.tsx` unchanged | Design ADR-2: AuthProvider in main.tsx; App keeps `<Outlet />` | No changes needed (already correct) | PASS (Deviation 5 acceptable) |
| `identity.staff` role/status typing | Design: `'admin'|'installer'` and `'active'|'inactive'` literals | Generated types: `string` (no DB enum) | WARNING (design-level, not spec violation) |
| AuthErrorPage lookup map | Full error catalog in Spanish | All 6 error codes mapped | PASS |
| `refresh()` method | Re-fetch profile on TOKEN_REFRESHED | Implemented; TOKEN_REFRESHED keeps session without re-fetch (ref tracking) | PASS |

---

## Issues

### WARNING (2)

**W1 — SC-R6-2 strict violation: seed password literal in test file**

The spec SC-R6-2 states: "searched for the local-dev seed passwords — no match found in any .ts, .tsx, or .js file". The string `'admin1234'` appears at `packages/shared/src/auth/useAuth.test.ts` line 98. In context, this is passed to a fully-mocked `signIn` function whose implementation ignores the password argument (the mock triggers a `SIGNED_IN` event directly). No network call occurs. The string is illustrative, not functional — but it is a literal match for the banned pattern.

Corrective action: replace `'admin1234'` with a neutral string such as `'test-password'`. Low-risk one-line change.

**W2 — `identity.staff.role` and `identity.staff.status` typed as `string` not as literal unions**

Design expected `role: 'admin' | 'installer'` and `status: 'active' | 'inactive'`. Generated types produce `string` because the DB columns are not Postgres enum types. The hook's `StaffProfile` interface declares the narrower types (`StaffRole`, `'active' | 'inactive'`) and uses `as unknown as StaffProfile` to cast. This works at runtime but bypasses type-narrowing. Not a spec violation (spec only requires field presence), but it weakens the type safety benefit of code-gen.

Not a blocker for archive.

### SUGGESTION (1)

**S1 — Node localStorage warning in test output**

`ExperimentalWarning: localStorage is not available because --localstorage-file was not provided` appears in test output. Benign — jsdom handles localStorage in the jsdom environment. Can be suppressed in `packages/shared/vitest.config.ts` with a setupFiles entry that filters the node warning. Not a correctness issue.

---

## Deviation Acceptability

| # | Deviation | Assessment |
|---|-----------|-----------|
| 1 | `scripts/gen-types.sh` fixed to pass all schema flags | ACCEPTABLE — required correctness fix; improves database.types.ts completeness |
| 2 | `packages/shared` new deps added | ACCEPTABLE — necessary for hook (`react`, `@supabase/supabase-js`, `@vitalock/supabase`) and tests (`@testing-library/react`, `jsdom`) |
| 3 | `packages/shared/vitest.config.ts` created | ACCEPTABLE — required to set jsdom environment; root config uses node environment |
| 4 | `@hookform/resolvers@3.9.0` pinned | ACCEPTABLE — v5.x peer dep on `zod@^3.25.0` broken at that patch; pin works correctly with `zod@3.23.8` |
| 5 | `App.tsx` unchanged in both apps | ACCEPTABLE — design ADR-2 clarifies AuthProvider lives in main.tsx; App's existing `<Outlet />` shape was already correct |

---

## Secrets Audit

| Check | Result |
|-------|--------|
| `.env` files gitignored | PASS — `.gitignore` includes `.env`, `.env.local`, `.env.*.local` |
| `SUPABASE_ANON_KEY` in source | PASS — referenced only as `env.VITE_SUPABASE_ANON_KEY` (env var), never hardcoded value |
| JWT tokens (eyJ*) in source | PASS — `rg 'eyJ'` returns no matches in apps/ or packages/ |
| Seed passwords in app source | WARNING — `admin1234` literal in useAuth.test.ts (see W1) |

---

## Final Verdict: PASS WITH WARNINGS

2 WARNINGS, 0 CRITICALS, 1 SUGGESTION.

The implementation satisfies all 8 requirements and all 17 scenarios at the functional level. The single WARNING that touches a spec (W1 / SC-R6-2) is a minor literal match in a test file where the string is never evaluated against a real auth system. Archive is not blocked but the W1 corrective action (one-line change) should be applied before or shortly after archive.

**Corrective actions before archive (recommended)**:
1. `packages/shared/src/auth/useAuth.test.ts` line 98: change `'admin1234'` → `'test-password'` (or any non-seed string).

**Corrective actions post-archive (optional)**:
2. Investigate whether `identity.staff.role` and `identity.staff.status` can be made Postgres enum types to generate literal union types in database.types.ts.
3. Suppress the `ExperimentalWarning: localStorage` node warning in vitest config.
