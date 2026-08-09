# Exploration: auth-session

**Change**: auth-session
**Phase**: explore
**Date**: 2026-08-08
**Persistence**: openspec (file) + engram (`sdd/auth-session/explore`)

## Summary

Auth infrastructure (DB helpers, RLS, supabase-js client) is production-ready.
The change scope is the app-layer auth: `AuthProvider`, `ProtectedRoute`,
`LoginPage`, plus one prerequisite fix (regenerate `database.types.ts` to
include the `identity` schema) and one dev-experience fix (extend seed with
test auth users).

## Findings by question

### Q1. Auth provider setup

Config from `supabase/config.toml`:
- Email + password: **enabled** (`enable_signup = true`, `enable_confirmations = false`)
- Magic link / OAuth / MFA / SMS: not configured
- `jwt_expiry = 3600` (1h access tokens), refresh token rotation on
- Local email testing via inbucket (port 54324)

Conclusion: email + password is the sole auth method.

### Q2. Auth users table

`auth.users` is GoTrue-managed. Minimum insert columns: `id`, `instance_id`,
`email`, `aud='authenticated'`, `role='authenticated'`, `created_at`, `updated_at`.

No auth users are seeded today.

### Q3. Staff linkage

`identity.staff.auth_user_id` populated **manually**. No trigger / webhook.

Onboarding sequence (FLOWS.md §4.2):
1. `supabase.auth.admin.createUser({email, password, email_confirm: true})` (service_role)
2. `UPDATE identity.staff SET auth_user_id = '<user.id>' WHERE email = '...'`

### Q4. Seed data

Existing staff rows in `seed.sql` (all with `auth_user_id = NULL`):
- Ana Alvarez (admin, active)
- Bruno Benitez (installer, active)
- Carla Cordoba (installer, active)
- Elena Espinoza (installer, inactive)

Local login testing requires extending seed with `auth.users` entries.

### Q5. Session model in supabase-js

`packages/supabase/src/client.ts` already sets `persistSession: true` +
`autoRefreshToken: true`. Session persists in `localStorage`; auto-refresh
scheduled ~10min before expiry. `onAuthStateChange` fires on `SIGNED_IN`,
`SIGNED_OUT`, `TOKEN_REFRESHED`, `PASSWORD_RECOVERY`.

### Q6. RLS assumption verification

`identity.current_staff_role()`, `is_admin()`, `is_installer()` are `SECURITY
DEFINER`, `STABLE`, `search_path=''`. They filter for `status='active'` — an
inactive staff member with valid JWT gets 0 rows on any RLS-protected query.

Three edge cases the app must handle:
- Valid JWT + no staff row → "Cuenta no provisionada"
- Valid JWT + inactive staff → "Cuenta desactivada"
- Valid JWT + wrong role for the app → "Sin acceso a esta aplicación"

### Q7. Route protection strategy

React Router v6.27.0 installed. **Recommendation: `AuthProvider` + `ProtectedRoute` wrapper** (Option A):

- `AuthProvider` at app root holds `{session, staffProfile, isLoading}`
- `ProtectedRoute` checks: loading → spinner; !session → `<Navigate to="/login" />`; wrong role → `<Navigate to="/error" />`
- Reactive to `onAuthStateChange`

Rejected: loader-based auth (Option B) adds unnecessary async waterfall; per-component checks (Option C) don't scale.

### Q8. Role-based rendering (two apps)

Each app must verify its expected role post-login. An installer with a valid session navigating to the admin URL would otherwise get a valid session + empty UI (confusing).

Implementation: after `SIGNED_IN`, fetch `identity.staff` profile and verify `role`. If mismatch → `signOut()` + explicit error.

### Q9. Password reset

**Out of scope for v1**. No SMTP configured; admin can reset via Supabase dashboard for now.

### Q10. User onboarding UI

**Out of scope for v1**. Provisioning requires `service_role`; must never be in frontend. Continues manual via Studio.

### Q11. Error handling matrix

| Trigger | Source | UI response |
|---|---|---|
| Empty email/password | Client | Inline validation |
| Wrong credentials | `AuthApiError` "Invalid login credentials" | "Email o contraseña incorrectos." |
| Network failure | Fetch error | "Error de conexión. Intentá de nuevo." |
| Valid auth, no staff row | Post-login profile query returns empty | "Cuenta no provisionada. Contactar a soporte." + signOut |
| Valid auth, inactive staff | `is_installer()`/`is_admin()` = false | "Cuenta desactivada." + signOut |
| Valid auth, wrong role | `role !== expected` | "Esta cuenta no tiene acceso a esta aplicación." + signOut |
| Token expired on reload | `onAuthStateChange(SIGNED_OUT)` | Redirect to `/login` |

### Q12. Persistence and refresh

Already handled by supabase-js client config. No custom logic needed.

## Critical gap: `database.types.ts` incomplete

Current file only covers `public` schema. `identity`, `operations`, `sales`,
`support` are absent. Any query to `identity.staff` has no type safety.

**Prerequisite**: run `pnpm gen:types` with local Supabase running to
regenerate.

## Affected areas

- `apps/{admin,installer}/src/main.tsx` — router restructure (login + protected layout)
- `apps/{admin,installer}/src/App.tsx` — wrap with `AuthProvider`
- `packages/supabase/src/database.types.ts` — regenerate
- New files (per app): `AuthProvider`, `ProtectedRoute`, `LoginPage`
- New files (shared): `useAuth` hook, auth types
- `supabase/seed.sql` — add auth users for Ana + Bruno for local dev

## Recommended architecture

**Hybrid** (Option 3): shared reusable logic in `packages/shared`, per-app UI:

- `packages/shared/src/auth/useAuth.ts` — hook: session state, profile fetch, signIn, signOut
- `packages/shared/src/auth/types.ts` — shared TypeScript types
- `apps/{admin,installer}/src/auth/AuthProvider.tsx` — app-specific context wrapper
- `apps/{admin,installer}/src/auth/ProtectedRoute.tsx` — app-specific role assertion
- `apps/{admin,installer}/src/routes/LoginPage.tsx` — app-specific branding

RLS is defense-in-depth: even if app-level role check is bypassed, DB denies operations. App check is for UX correctness.

## Ready for propose

**Locked (safe to proceed)**:
1. Email + password only
2. No onboarding UI, no password reset in v1
3. Client factory config unchanged
4. Auth helpers ready — no schema changes
5. Post-login role verification is mandatory per app
6. `AuthProvider` + `ProtectedRoute` pattern

**Needs decision (recommend defaults, confirm if desired)**:

1. **Shared vs per-app code**: recommend **hybrid** (Option 3).
2. **Seed test users**: recommend **yes**, add Ana (`ana@vitalock.example` / `admin1234`) and Bruno (`bruno@vitalock.example` / `installer1234`). Password only for local dev; production users are provisioned by admin via dashboard.
3. **`database.types.ts` regen**: recommend **explicit task** in this change.

## Risks

- `enable_signup = true` leaves signup endpoint open. Mitigated by RLS (any signup without staff row gets 0 access), but worth documenting.
- Stale `database.types.ts` blocks type-safe development.
- Seed test users insertion pattern is Supabase-version-sensitive; use FLOWS.md §16.2 pattern as canonical.

## Key Learnings

1. `identity.staff` rows have no `auth_user_id` in seed; local login testing requires manual seeding or a seed extension.
2. `database.types.ts` covers only `public` schema — regeneration is a prerequisite for type-safe `identity` queries.
3. `is_admin()`/`is_installer()` filter for `status='active'`; inactive staff with valid JWT get zero DB access — app must detect and explain.
4. supabase-js is already configured with `persistSession` + `autoRefreshToken`; no custom token management needed.
5. `enable_signup = true` is safe due to RLS but worth documenting; any unlinked auth user gets zero data access.
