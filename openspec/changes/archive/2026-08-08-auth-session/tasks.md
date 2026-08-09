# Tasks: auth-session

**Change**: auth-session
**Phase**: tasks
**Date**: 2026-08-08
**Persistence**: openspec (file) + engram (`sdd/auth-session/tasks`)

---

## Ordered Task Checklist

### [x] T01 — Regenerate database.types.ts (isolated commit)

**Files modified**:
- `packages/supabase/src/database.types.ts`

**Requirements satisfied**: R8 (SC-R8-1)

**Depends on**: none

**Parallel with**: T02

**Definition of done**:
- `pnpm gen:types` exits 0 against a running local Supabase instance.
- `packages/supabase/src/database.types.ts` exports `Database['identity']['Tables']['staff']['Row']` containing at minimum: `id`, `auth_user_id`, `full_name`, `role`, `status`, `email`, `created_at`, `updated_at`.
- Committed alone: `chore(supabase): regenerate database.types.ts`.
- No other file is staged in this commit.

---

### [x] T02 — Extend supabase/seed.sql with auth users

**Files modified**:
- `supabase/seed.sql`

**Requirements satisfied**: R6 (SC-R6-1, SC-R6-2)

**Depends on**: none

**Parallel with**: T01

**Definition of done**:
- `supabase/seed.sql` contains two `INSERT INTO auth.users` blocks for Ana Alvarez (`aa000000-…-0001`) and Bruno Benitez (`bb000000-…-0001`) using `crypt('admin1234', gen_salt('bf'))` and `crypt('installer1234', gen_salt('bf'))` respectively, guarded with `ON CONFLICT (id) DO NOTHING`.
- Two `UPDATE identity.staff SET auth_user_id = …` statements link each user to the expected staff row by known UUID.
- A comment block clearly marks passwords as `LOCAL DEV ONLY — never use in production`.
- `supabase db reset` completes without error.
- `auth.users` table contains rows for Ana and Bruno after reset.
- `identity.staff` rows for Ana and Bruno have non-null `auth_user_id` after reset.
- `rg 'admin1234|installer1234' --glob '*.ts' --glob '*.tsx' --glob '*.js'` returns no matches in the project tree.

---

### [x] T03 — Create packages/shared auth types

**Files created**:
- `packages/shared/src/auth/types.ts`

**Requirements satisfied**: R1, R2, R3, R4, R5, R7 (foundational types for all state machine paths)

**Depends on**: T01

**Parallel with**: none (T04 depends on this)

**Definition of done**:
- `types.ts` exports: `StaffRole`, `StaffProfile`, `AuthErrorCode` (enum with `INVALID_CREDENTIALS`, `NETWORK_ERROR`, `NO_STAFF_ROW`, `INACTIVE_STAFF`, `WRONG_ROLE`, `SESSION_EXPIRED`, `VALIDATION_ERROR`), `AuthPhase`, `AuthState`, `UseAuthReturn`.
- `UseAuthReturn` includes `isLoading: boolean`, `signIn`, `signOut`, `refresh`.
- `pnpm typecheck` exits 0 in `packages/shared`.

---

### [x] T04 — Create useAuth hook

**Files created**:
- `packages/shared/src/auth/useAuth.ts`

**Requirements satisfied**: R1 (SC-R1-3), R2, R3, R4, R5, R7 (SC-R7-1, SC-R7-2)

**Depends on**: T01, T03

**Parallel with**: none (T05, T06 depend on this)

**Definition of done**:
- `useAuth(supabase: TypedSupabaseClient, expectedRole: StaffRole): UseAuthReturn` is exported.
- Hook subscribes to `onAuthStateChange`; `SIGNED_IN` triggers profile fetch via `.schema('identity').from('staff').select(…).eq('auth_user_id', user.id).single()`.
- Profile fetch forks into four terminal states: `authenticated`, `no_staff_row` (signOut + error), `inactive_staff` (signOut + error), `wrong_role` (signOut + error).
- `signIn` calls `supabase.auth.signInWithPassword`; on `AuthApiError` sets `error.code=INVALID_CREDENTIALS`; on network failure sets `error.code=NETWORK_ERROR`.
- `signOut` calls `supabase.auth.signOut` and resets state to `anonymous`.
- `SIGNED_OUT` event fires → `phase=anonymous`, session/staff/error cleared.
- `TOKEN_REFRESHED` event → state stays `authenticated` (no re-fetch).
- `getSession()` on mount: null → `anonymous`; session present → triggers `SIGNED_IN` path.
- `pnpm typecheck` exits 0 in `packages/shared`.

---

### [x] T05 — Write useAuth Vitest suite

**Files created**:
- `packages/shared/src/auth/useAuth.test.ts`

**Requirements satisfied**: R8 (SC-R8-3)

**Depends on**: T03, T04

**Parallel with**: T06

**Definition of done**:
- Suite contains exactly 6 test cases matching the design spec:
  1. Happy path — admin login: `phase=authenticated`, `staff.full_name='Ana Alvarez'`.
  2. Wrong password: `phase=error`, `error.code=INVALID_CREDENTIALS`.
  3. No staff row: `phase=error`, `error.code=NO_STAFF_ROW`; `signOut` called.
  4. Inactive staff: `phase=error`, `error.code=INACTIVE_STAFF`; `signOut` called.
  5. Session restore on mount: `phase=authenticated` without calling `signIn`.
  6. signOut: `phase=anonymous`, `staff=null`, `session=null`.
- All 6 tests pass: `pnpm test --filter @vitalock/shared` exits 0.
- Mock supabase client uses `vi.mock` / `createMockSupabase()` factory covering `signInWithPassword`, `getSession`, `signOut`, `onAuthStateChange`, and the `from('staff')` chain.
- `renderHook` from `@testing-library/react` is used; no `AuthProvider` wrapper required (hook is testable in isolation).

---

### [x] T06 — Create packages/shared auth barrel and re-export

**Files created**:
- `packages/shared/src/auth/index.ts`

**Files modified**:
- `packages/shared/src/index.ts`

**Requirements satisfied**: R1, R2, R3, R4, R5 (makes shared auth surface importable by apps)

**Depends on**: T03, T04

**Parallel with**: T05

**Definition of done**:
- `packages/shared/src/auth/index.ts` re-exports `useAuth` and all types from `types.ts`.
- `packages/shared/src/index.ts` contains `export * from './auth'`.
- `pnpm build --filter @vitalock/shared` exits 0.
- `pnpm typecheck --filter @vitalock/shared` exits 0.

---

### [x] T07 — Create admin app auth/ directory (AuthProvider + ProtectedRoute)

**Files created**:
- `apps/admin/src/auth/AuthProvider.tsx`
- `apps/admin/src/auth/ProtectedRoute.tsx`

**Requirements satisfied**: R1 (SC-R1-1, SC-R1-3), R2 (SC-R2-1), R3 (SC-R3-2), R5 (SC-R5-3)

**Depends on**: T01, T03, T04, T06

**Parallel with**: T08

**Definition of done**:
- `AuthProvider` accepts `{ supabase: TypedSupabaseClient; children: ReactNode }`, calls `useAuth(supabase, 'admin')`, and provides the result via `AuthContext`.
- `useAuthContext()` throws if called outside `AuthProvider`.
- `ProtectedRoute` renders `<FullScreenSpinner />` for `initializing` and `fetching_profile` phases.
- `ProtectedRoute` navigates to `/login` for `anonymous` and `authenticating` phases.
- `ProtectedRoute` navigates to `/error?reason=${error.code}` for `error` phase.
- `ProtectedRoute` renders `<Outlet />` for `authenticated` phase only.
- `pnpm typecheck --filter @vitalock/admin` exits 0.

---

### [x] T08 — Create admin app routes (LoginPage + AuthErrorPage)

**Files created**:
- `apps/admin/src/routes/LoginPage.tsx`
- `apps/admin/src/routes/AuthErrorPage.tsx`

**Requirements satisfied**: R2 (SC-R2-1), R4 (SC-R4-1, SC-R4-2, SC-R4-3), R5 (SC-R5-1, SC-R5-2)

**Depends on**: T03, T06

**Parallel with**: T07

**Definition of done**:
- `LoginPage` uses React Hook Form + Zod schema: `email` validated as valid email string, `password` validated as non-empty string, with Spanish error messages.
- `signIn(data.email, data.password)` is called on submit; button is disabled while `phase === 'authenticating'`.
- When `error.code === INVALID_CREDENTIALS`, "Email o contraseña incorrectos." is displayed inline; no redirect.
- When `error.code === NETWORK_ERROR`, "Error de conexión. Intentá de nuevo." is displayed inline; no redirect.
- Empty field submission is caught by Zod before any network request.
- `AuthErrorPage` reads `?reason=` query param and renders the corresponding Spanish message from a lookup map matching the error catalog in the design.
- `AuthErrorPage` renders a "Volver al inicio" button that navigates to `/login`.
- `pnpm typecheck --filter @vitalock/admin` exits 0.

---

### [x] T09 — Restructure admin app router (main.tsx + App.tsx)

**Files modified**:
- `apps/admin/src/main.tsx`
- `apps/admin/src/App.tsx`

**Requirements satisfied**: R1 (SC-R1-1), R2 (SC-R2-1), R3 (SC-R3-2)

**Depends on**: T07, T08

**Parallel with**: T12 (installer router, after its own auth dependencies are done)

**Definition of done**:
- `main.tsx` uses `BrowserRouter` (not `createBrowserRouter`).
- `<AuthProvider supabase={supabase}>` wraps `<Routes>` in `main.tsx`.
- Route tree: `/login` → `<LoginPage />`, `/error` → `<AuthErrorPage />`, all other paths inside `<ProtectedRoute>` → `<App>` → `<IndexRoute />` (or equivalent).
- `App.tsx` retains its layout shell with `<Outlet />` but does not instantiate `AuthProvider` (it lives in `main.tsx`).
- `pnpm build --filter @vitalock/admin` exits 0.
- `pnpm typecheck --filter @vitalock/admin` exits 0.

---

### [x] T10 — Create installer app auth/ directory (AuthProvider + ProtectedRoute)

**Files created**:
- `apps/installer/src/auth/AuthProvider.tsx`
- `apps/installer/src/auth/ProtectedRoute.tsx`

**Requirements satisfied**: R1 (SC-R1-2, SC-R1-3), R2 (SC-R2-2), R3 (SC-R3-1), R5 (SC-R5-3)

**Depends on**: T01, T03, T04, T06

**Parallel with**: T11

**Definition of done**:
- Same shape as T07 but `useAuth(supabase, 'installer')`.
- Expected role is `'installer'`; a user with `role='admin'` triggers `error.code=WRONG_ROLE` + signOut.
- `pnpm typecheck --filter @vitalock/installer` exits 0.

---

### [x] T11 — Create installer app routes (LoginPage + AuthErrorPage)

**Files created**:
- `apps/installer/src/routes/LoginPage.tsx`
- `apps/installer/src/routes/AuthErrorPage.tsx`

**Requirements satisfied**: R2 (SC-R2-2), R4 (SC-R4-1, SC-R4-2, SC-R4-3), R5 (SC-R5-1, SC-R5-2)

**Depends on**: T03, T06

**Parallel with**: T10

**Definition of done**:
- Same shape as T08 but with installer app branding.
- Spanish error messages identical to admin app (sourced from shared error catalog / same lookup map).
- `pnpm typecheck --filter @vitalock/installer` exits 0.

---

### [x] T12 — Restructure installer app router (main.tsx + App.tsx)

**Files modified**:
- `apps/installer/src/main.tsx`
- `apps/installer/src/App.tsx`

**Requirements satisfied**: R1 (SC-R1-2), R2 (SC-R2-2), R3 (SC-R3-1)

**Depends on**: T10, T11

**Parallel with**: none (must follow T10, T11; analogous to T09 for admin)

**Definition of done**:
- Same router restructure as T09 but for installer app; `AuthProvider` declares `expectedRole='installer'` via `useAuth(supabase, 'installer')` inside the provider.
- `pnpm build --filter @vitalock/installer` exits 0.
- `pnpm typecheck --filter @vitalock/installer` exits 0.

---

### [x] T13 — Full pipeline verification

**Files modified**: none (verification only)

**Requirements satisfied**: R8 (SC-R8-2)

**Depends on**: T01, T02, T05, T06, T09, T12

**Parallel with**: none

**Definition of done**:
- `pnpm install && pnpm build && pnpm typecheck && pnpm lint && pnpm test` exits 0 for the full monorepo.
- No TypeScript errors, no lint errors, all Vitest tests (including the 6 `useAuth` tests from T05) pass.

---

### [x] T14 — Commit code changes (auto-chain Commit B)

**Files staged**: all files from T02–T12 (excluding database.types.ts committed in T01)

**Requirements satisfied**: R1–R8 (delivery)

**Depends on**: T13

**Parallel with**: none

**Definition of done**:
- All authored files staged: `supabase/seed.sql`, `packages/shared/src/auth/`, `apps/admin/src/auth/`, `apps/admin/src/routes/LoginPage.tsx`, `apps/admin/src/routes/AuthErrorPage.tsx`, `apps/admin/src/main.tsx`, `apps/admin/src/App.tsx`, `apps/installer/src/auth/`, `apps/installer/src/routes/LoginPage.tsx`, `apps/installer/src/routes/AuthErrorPage.tsx`, `apps/installer/src/main.tsx`, `apps/installer/src/App.tsx`.
- Commit message: `feat(auth): session management and route protection`.
- `database.types.ts` is NOT in this commit (already committed as T01's Commit A).
- Review budget for this commit: ≤400 authored lines changed.

---

## Execution Order and Parallelism

```
T01 ──┐
T02 ──┤ (parallel)
      │
      ▼
      T03
      │
      ▼
      T04
      │
      ├── T05 (parallel)
      └── T06 (parallel)
            │
            ├── T07 (parallel with T08, T10, T11)
            ├── T08 (parallel with T07, T10, T11)
            ├── T10 (parallel with T07, T08, T11)
            └── T11 (parallel with T07, T08, T10)
                  │
                  ├── T09 (depends on T07 + T08)
                  └── T12 (depends on T10 + T11)
                        │
                        ▼
                        T13
                        │
                        ▼
                        T14
```

Sequential gates: T03 → T04 → (T05, T06) → app tasks → T13 → T14.
T01 and T02 can be done in any order or in parallel before T03.

---

## Requirement-to-Task Traceability

| Requirement | Tasks |
|-------------|-------|
| R1 — Unauthenticated route protection | T03, T04, T07, T09, T10, T12 |
| R2 — Successful login and role-matched home | T03, T04, T07, T08, T09, T10, T11, T12 |
| R3 — Cross-app role enforcement | T03, T04, T07, T09, T10, T12 |
| R4 — Auth error handling | T04, T08, T11 |
| R5 — Post-login profile states | T04, T07, T08, T10, T11 |
| R6 — Seed test users | T02 |
| R7 — Session persistence and logout | T04, T06 |
| R8 — Type generation, pipeline, tests | T01, T05, T06, T13 |

---

## Review Workload Forecast

| Commit | Contents | Estimated changed lines | Budget risk |
|--------|----------|------------------------|-------------|
| Commit A (`chore(supabase): regenerate database.types.ts`) | T01 only — generated file | 800–2000 lines (generated golden) | N/A — generated file excluded from authored review budget |
| Commit B (`feat(auth): session management and route protection`) | T02–T14 — all authored code | ~280–380 lines | Low–Med |

**Authored line estimate breakdown (Commit B)**:
- `supabase/seed.sql` addition: ~30 lines
- `packages/shared/src/auth/types.ts`: ~45 lines
- `packages/shared/src/auth/useAuth.ts`: ~90 lines
- `packages/shared/src/auth/useAuth.test.ts`: ~80 lines
- `packages/shared/src/auth/index.ts` + `src/index.ts` mod: ~6 lines
- `apps/admin/src/auth/AuthProvider.tsx`: ~25 lines
- `apps/admin/src/auth/ProtectedRoute.tsx`: ~20 lines
- `apps/admin/src/routes/LoginPage.tsx`: ~55 lines
- `apps/admin/src/routes/AuthErrorPage.tsx`: ~20 lines
- `apps/admin/src/main.tsx` (restructure): ~20 lines net change
- `apps/admin/src/App.tsx` (minor): ~5 lines net change
- Installer app mirrors (AuthProvider, ProtectedRoute, LoginPage, AuthErrorPage, main, App): ~130 lines

**Total Commit B estimate**: ~310–380 lines authored.

**Chained PRs recommended**: yes — one PR per commit (A then B).

**400-line budget risk**: low for Commit B. The generated `database.types.ts` diff is large but is classified as a generated golden and does not count against the authored review budget.

**Decision needed before apply**: no. The two-commit split is already the plan. The only open question flagged in the design (supabase-js `schema()` API availability) should be confirmed during T04 by checking `pnpm list @supabase/supabase-js` in `packages/supabase`.

---

## Key Learnings

1. T01 must be committed alone before any code task runs — not because of sequencing in the file graph, but because mixing the generated types diff (800–2000 lines) with authored code would blow the 400-line review budget.
2. T03 (types) and T04 (hook) are the true bottleneck of the critical path — everything app-level is blocked on them. T01 and T02 are the only tasks that can run truly independently.
3. T07/T08 and T10/T11 are symmetric pairs (admin vs installer). They can run in parallel once T06 is done, cutting wall-clock time roughly in half for the app-layer work.
4. The `useAuth` hook signature takes `supabase` and `expectedRole` as arguments (not context), which is what makes T05 testable without a provider wrapper — a critical design constraint that shapes the test approach.
5. Installer app tasks (T10–T12) are structural mirrors of admin tasks (T07–T09); the only differing value is `expectedRole: 'installer'`. Treat them as a copy-and-adjust, not an independent design problem.
6. `AuthErrorPage` is a stub in v1 — Spanish message lookup map + a "Volver al inicio" nav button. No design spec beyond that exists, so keep it minimal.
7. T13 (pipeline verify) must run against the result of both commits applied: T01's Commit A must already be present when T13 runs, even though T01 is logically separate.
