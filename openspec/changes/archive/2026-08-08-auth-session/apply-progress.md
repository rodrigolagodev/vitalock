# Apply Progress: auth-session

**Date**: 2026-08-08
**Mode**: Standard (no strict TDD)
**Status**: complete — all 14 tasks done, both commits landed

---

## Tasks Completed

- [x] T01 — Regenerate database.types.ts
- [x] T02 — Extend supabase/seed.sql with auth users
- [x] T03 — Create packages/shared auth types
- [x] T04 — Create useAuth hook
- [x] T05 — Write useAuth Vitest suite (6 tests, all pass)
- [x] T06 — Create packages/shared auth barrel and re-export
- [x] T07 — Create admin app auth/ directory (AuthProvider + ProtectedRoute)
- [x] T08 — Create admin app routes (LoginPage + AuthErrorPage)
- [x] T09 — Restructure admin app router (main.tsx + App.tsx)
- [x] T10 — Create installer app auth/ directory (AuthProvider + ProtectedRoute)
- [x] T11 — Create installer app routes (LoginPage + AuthErrorPage)
- [x] T12 — Restructure installer app router (main.tsx + App.tsx)
- [x] T13 — Full pipeline verification
- [x] T14 — Commit code changes (auto-chain Commit B)

---

## Commits

- **Commit A** `4968e79` — `chore(supabase): regenerate database.types.ts + seed auth users for local dev`
  - `packages/supabase/src/database.types.ts` (regenerated with all schemas)
  - `scripts/gen-types.sh` (updated to include identity, operations, sales, support schemas)
  - `supabase/seed.sql` (extended with auth.users + UPDATE linkage)

- **Commit B** `7a1aee2` — `feat(auth): session management and route protection for admin and installer apps`
  - 20 files changed (excluding database.types.ts and gen-types.sh which are in Commit A)

---

## Files Created

| File | Task |
|------|------|
| `packages/shared/src/auth/types.ts` | T03 |
| `packages/shared/src/auth/useAuth.ts` | T04 |
| `packages/shared/src/auth/useAuth.test.ts` | T05 |
| `packages/shared/src/auth/index.ts` | T06 |
| `packages/shared/vitest.config.ts` | T05 (jsdom env) |
| `apps/admin/src/auth/AuthProvider.tsx` | T07 |
| `apps/admin/src/auth/ProtectedRoute.tsx` | T07 |
| `apps/admin/src/routes/LoginPage.tsx` | T08 |
| `apps/admin/src/routes/AuthErrorPage.tsx` | T08 |
| `apps/installer/src/auth/AuthProvider.tsx` | T10 |
| `apps/installer/src/auth/ProtectedRoute.tsx` | T10 |
| `apps/installer/src/routes/LoginPage.tsx` | T11 |
| `apps/installer/src/routes/AuthErrorPage.tsx` | T11 |

## Files Modified

| File | Task |
|------|------|
| `scripts/gen-types.sh` | T01 (added multi-schema flags) |
| `packages/supabase/src/database.types.ts` | T01 |
| `supabase/seed.sql` | T02 |
| `packages/shared/src/index.ts` | T06 |
| `packages/shared/package.json` | T04/T05 (added react, supabase-js, @vitalock/supabase, testing-library, jsdom) |
| `apps/admin/src/main.tsx` | T09 |
| `apps/admin/package.json` | T08 (added react-hook-form, @hookform/resolvers@3.9.0, zod@3.23.8) |
| `apps/installer/src/main.tsx` | T12 |
| `apps/installer/package.json` | T11 (added react-hook-form, @hookform/resolvers@3.9.0, zod@3.23.8) |
| `pnpm-lock.yaml` | (generated) |

---

## Pipeline Results

| Command | Result |
|---------|--------|
| `pnpm install` | exit 0 |
| `pnpm build` | exit 0 (admin + installer) |
| `pnpm typecheck` | exit 0 (5 packages) |
| `pnpm lint` | exit 0 (warnings only, 0 errors) |
| `pnpm test` | exit 0 (9 tests: 3 env + 6 useAuth) |

---

## Deviations from Design

1. **`scripts/gen-types.sh` modified**: The script only generated `--schema public`. Added all schemas to produce the full `Database` type including `identity`. This was a required fix not mentioned in the design (design assumed the command was correct).

2. **`packages/shared` new dependencies added**: `react`, `@types/react`, `@supabase/supabase-js`, `@vitalock/supabase`, `@testing-library/react`, `jsdom` were not in the original `shared` package. These were needed for the hook and tests.

3. **`packages/shared/vitest.config.ts` created**: Required to set `environment: 'jsdom'` for `renderHook` to work. The root vitest config uses `environment: 'node'`.

4. **`@hookform/resolvers@3.9.0` used instead of latest**: `@hookform/resolvers@5.x` requires `zod@^3.25.0` which has a broken dist at that patch, so pinned to `3.9.0` which works with `zod@3.23.8`.

5. **`App.tsx` unchanged in both apps**: The design mentions modifying it, but it already had the correct `<Outlet />` shape — no changes needed. `AuthProvider` lives in `main.tsx` per design ADR-2.

---

## Work Unit Evidence

| Evidence | Value |
|----------|-------|
| Focused test command | `pnpm test --filter @vitalock/shared` → 6 tests pass, exit 0 |
| Runtime harness | `supabase db reset` exit 0; auth.users + identity.staff confirmed linked |
| Rollback boundary | Revert commits `7a1aee2` and `4968e79`; `supabase db reset` removes seed users |
