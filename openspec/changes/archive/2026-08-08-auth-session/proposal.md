# Proposal: auth-session

**Change**: auth-session
**Phase**: propose
**Date**: 2026-08-08
**Persistence**: openspec (file) + engram (`sdd/auth-session/proposal`)

## Intent

Enable real user authentication in both Vitalock apps (admin and installer) so
that only provisioned, active staff members can access their respective
application. Today the DB layer (auth helpers, RLS, supabase-js client) is
production-ready, but the apps have no login flow, no session context, and no
route protection — anyone who reaches the URL sees the placeholder home route.

This change delivers the app-layer auth surface: a login page per app, a
reactive session provider, protected routes with role verification, and the
prerequisite type/data plumbing (regenerated `database.types.ts` and seeded
local auth users) that unblocks type-safe development and local login testing.

Success means an installer cannot open the admin app, an inactive staff member
cannot bypass the front-end, and a valid user's session persists across reloads
without extra work.

## Scope

### In scope

- Regenerate `packages/supabase/src/database.types.ts` to cover all schemas
  (`public`, `identity`, `operations`, `sales`, `support`).
- Shared auth primitives in `packages/shared/src/auth/`:
  - `useAuth` hook (session state, profile fetch, `signIn`, `signOut`).
  - Session and profile TypeScript types.
  - Any pure auth utilities reusable by both apps.
- Per-app auth UI in `apps/{admin,installer}/src/auth/`:
  - `AuthProvider` — app-scoped context wrapper around `useAuth`.
  - `ProtectedRoute` — asserts the app's expected role
    (`admin` for admin app, `installer` for installer app).
  - `LoginPage` — email + password form with app-specific branding.
- Router restructure in each app: public `/login` route and protected `/`
  (existing hello route) as the default landing.
- Post-login profile fetch against `identity.staff` by `auth_user_id`,
  resolving staff record and role in a single query.
- Per-app role verification post-login; mismatch triggers `signOut()` and an
  explanatory error.
- Error UI covering the seven cases from the exploration matrix (wrong
  credentials, network failure, no staff row, inactive staff, wrong role,
  token expired, empty form fields).
- Seed extension in `supabase/seed.sql`:
  - Two `auth.users` rows (Ana admin, Bruno installer) with local-dev
    passwords, clearly commented as local-only.
  - `UPDATE identity.staff SET auth_user_id = …` linking those users.
- Vitest coverage for the `useAuth` hook (happy path plus each error branch)
  using a mock supabase client.

### Out of scope (deferred)

- Password reset flow (no SMTP configured; admin resets via Supabase dashboard).
- Magic link, OAuth, MFA, SMS.
- User onboarding UI (staff provisioning stays manual via Supabase Studio /
  service_role script; FLOWS.md §4.2 remains the canonical procedure).
- Server-side session termination beyond `supabase.auth.signOut()`.
- Any UI beyond login + minimal error surface (no profile page, no navbar
  redesign — navbar only needs to show the staff name for the success-criteria
  check).
- Production auth users; only local-dev seed users are added.

## Approach

The change follows a **hybrid architecture** already validated in exploration:
purely reusable logic lives in `packages/shared/src/auth/`, while the pieces
that must know which app they are (branding, expected role, provider tree
placement) live under `apps/{admin,installer}/src/auth/`. The `useAuth` hook
becomes the single place that talks to `supabase.auth` and to
`identity.staff`; the per-app `AuthProvider` composes it into a React context,
and `ProtectedRoute` reads that context to gate rendering. This keeps the
role-verification policy explicit at the app boundary (each app declares the
role it accepts) while avoiding duplicated session-handling code.

Route protection uses the `AuthProvider` + `ProtectedRoute` pattern on top of
React Router v6: `/login` is public, everything else is wrapped by a protected
layout. `AuthProvider` subscribes to `onAuthStateChange` so token refresh,
sign-out from another tab, and expiry all propagate reactively without page
reloads. Post-login, the hook fetches the staff profile in one query and
resolves the four terminal states — authenticated-and-authorized,
not-provisioned, deactivated, wrong-role — mapping each to a user-facing
Spanish message and, when appropriate, an automatic `signOut()` to prevent a
half-authenticated state from lingering in `localStorage`.

The prerequisite work (regenerating `database.types.ts` and extending
`seed.sql`) is grouped into this change because it directly unblocks the
feature: without regenerated types, `identity.staff` queries would be untyped;
without seeded auth users, no one can actually log in against the local stack
to validate the flow. RLS remains the security backstop — the app-level role
check is for UX correctness, not for security, since even a bypass would still
produce zero rows on any protected query.

## Affected areas

| Area | Change |
|---|---|
| `packages/supabase/src/database.types.ts` | Regenerate to include all schemas |
| `packages/shared/src/auth/` (new) | `useAuth` hook, types, utilities |
| `apps/admin/src/auth/` (new) | `AuthProvider`, `ProtectedRoute` (role=admin), `LoginPage` |
| `apps/installer/src/auth/` (new) | `AuthProvider`, `ProtectedRoute` (role=installer), `LoginPage` |
| `apps/admin/src/main.tsx` | Router restructure: `/login` public, `/` protected |
| `apps/installer/src/main.tsx` | Router restructure: `/login` public, `/` protected |
| `apps/admin/src/App.tsx` | Wrap tree with `AuthProvider` |
| `apps/installer/src/App.tsx` | Wrap tree with `AuthProvider` |
| `supabase/seed.sql` | Add 2 auth users + link to `identity.staff` (local dev only) |
| Test files | Vitest suite for `useAuth` hook |

## Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| `enable_signup = true` leaves the signup endpoint reachable | Anonymous account creation possible | RLS ensures no data access without a linked `identity.staff` row; document this explicitly in seed comment and README follow-up |
| Seed auth-user insertion pattern is Supabase-version-sensitive | `supabase db reset` fails locally | Use the FLOWS.md §16.2 canonical pattern; verify locally as part of the change |
| Regenerated `database.types.ts` diff is large and noisy in review | Reviewer fatigue, harder to catch other changes | Commit type regeneration in its own commit (or clearly named hunk) so reviewers can diff app code separately |
| Local dev passwords accidentally referenced from non-seed code | False sense of "real" credentials | Comment in `seed.sql` clearly marks passwords as local-only; no reference from app code |
| Wrong-role user reaches the wrong app during the async profile fetch | Brief flash of protected UI | `ProtectedRoute` renders a loading state until `{session, profile, role}` are all resolved; no children mount before that |
| Post-login `identity.staff` query fails (network, RLS misconfig) | User stuck in loading | Treat as `signOut()` + "Error de conexión" and return to `/login`; covered in test matrix |

## Rollback plan

The change is additive at the DB layer (new seed rows only, no schema
migrations) and structural at the app layer. Rollback options:

1. **Revert commit(s)**: the change lives entirely under
   `packages/shared/src/auth/`, `apps/{admin,installer}/src/auth/`,
   `apps/{admin,installer}/src/{main,App}.tsx`, `supabase/seed.sql`, and
   `packages/supabase/src/database.types.ts`. Reverting the merge commit
   restores the previous placeholder hello route in both apps.
2. **Local DB rollback**: `supabase db reset` re-runs migrations + seed;
   without the seed change, the two dev auth users simply do not exist.
3. **Production**: no production data is created by this change (no
   migrations, no production auth users provisioned here). Rolling back the
   frontend deploy is sufficient.

No data migration, no destructive DB operation, no long-lived flag.

## Success criteria

Each criterion is independently verifiable in the local stack.

1. Fresh browser session → navigating to the admin app redirects to `/login`.
2. Valid Ana credentials on admin app → home visible; navbar shows
   "Ana Alvarez".
3. Valid Bruno credentials on installer app → home visible; navbar shows
   "Bruno Benitez".
4. Ana credentials on installer app → error
   "Esta cuenta no tiene acceso a esta aplicación" + automatic `signOut()`.
5. Wrong password → error "Email o contraseña incorrectos"; no redirect,
   form remains mounted.
6. Inactive staff (Elena, once given an auth user manually) → error
   "Cuenta desactivada" + automatic `signOut()`.
7. Auth user without matching `identity.staff` row (manual test) → error
   "Cuenta no provisionada. Contactar a soporte" + automatic `signOut()`.
8. Reload page while logged in → session persists; no re-login required.
9. Logout → redirect to `/login`; `localStorage` session cleared.
10. `database.types.ts` includes `identity.Tables.staff` typed correctly.
11. Vitest suite: at least 5 tests on `useAuth` hook, all pass.
12. Pipeline green: `pnpm install && pnpm build && pnpm typecheck && pnpm
    lint && pnpm test`.

## Dependencies

- **DB helpers** (already deployed): `identity.current_staff_role()`,
  `identity.is_admin()`, `identity.is_installer()` — `SECURITY DEFINER`,
  `STABLE`, `search_path=''`, filter for `status='active'`.
- **RLS policies** (already in place) on `identity.staff` and downstream
  tables; provide defense-in-depth to app-level role checks.
- **supabase-js client** (`packages/supabase/src/client.ts`): already
  configured with `persistSession: true` and `autoRefreshToken: true`; no
  change required.
- **Supabase auth config** (`supabase/config.toml`): email + password enabled,
  no confirmations, `jwt_expiry = 3600`.
- **React Router v6.27.0**: already installed in both apps.
- **`pnpm gen:types`** script: available for regenerating `database.types.ts`
  against the local stack.
- **FLOWS.md §4.2 / §16.2**: canonical patterns for staff provisioning and
  seeding `auth.users`.

## Key Learnings

1. The auth work splits cleanly into three concerns — session (shared hook),
   context wiring (per-app provider), and role gate (per-app protected route)
   — which is why the hybrid architecture is the natural fit rather than a
   forced compromise.
2. Regenerating `database.types.ts` and seeding two `auth.users` are not
   "nice-to-haves"; they are prerequisites without which the feature cannot be
   type-safely built or locally verified, so they belong in this change rather
   than a follow-up.
3. The four post-login terminal states (authorized, not-provisioned,
   deactivated, wrong-role) are the real success-criteria backbone — naming
   them explicitly in the proposal makes the test matrix and the error UI fall
   out for free.
4. RLS is the security boundary; the app-level role check is UX correctness.
   Framing it that way avoids treating `ProtectedRoute` as a security control
   and keeps the review focused on user experience.
5. Explicit out-of-scope list (password reset, onboarding UI, MFA, OAuth,
   magic link, server-side session termination) is what keeps v1 small enough
   to ship inside the 400-line review budget.
