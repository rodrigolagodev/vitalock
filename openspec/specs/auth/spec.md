# Spec: auth-session

**Change**: auth-session
**Phase**: spec
**Date**: 2026-08-08
**Persistence**: openspec (file) + engram (`sdd/auth-session/spec`)

## Overview

Formal requirements for the `auth-session` change. Describes WHAT the system MUST do after the change is applied. Implementation (HOW) is design's job.

All user-visible messages in Spanish per the proposal's acceptance criteria.

## Requirements

### R1 — Unauthenticated Route Protection

**Statement**: Every route in the admin app and installer app MUST redirect an unauthenticated visitor to `/login` before any protected content is rendered.

#### SC-R1-1 — Fresh browser, admin app (automated)
```
Given  a browser with no Supabase session in localStorage
When   the user navigates directly to the admin app root URL
Then   the browser is redirected to /login
And    no protected content is visible
```

#### SC-R1-2 — Fresh browser, installer app (automated)
```
Given  a browser with no Supabase session in localStorage
When   the user navigates directly to the installer app root URL
Then   the browser is redirected to /login
And    no protected content is visible
```

#### SC-R1-3 — Expired token on reload (automated)
```
Given  a browser that had a valid session that has since expired
When   supabase-js fires onAuthStateChange(SIGNED_OUT)
Then   the app redirects to /login without a server-side page reload
```

**Verifiability**: SC-R1-1, SC-R1-2 via Vitest render test with null mock session. SC-R1-3 via `useAuth` hook unit test.

### R2 — Successful Login and Role-Matched Home

**Statement**: A staff member with valid credentials and the role expected by the target app MUST be authenticated, have their staff profile loaded, and see the app home page with their full name in the navbar.

#### SC-R2-1 — Admin user logs in to admin app
```
Given  Ana Alvarez has a valid auth.users entry linked to her identity.staff row
  And  her staff role is 'admin' and status is 'active'
When   she submits the login form in the admin app with correct credentials
Then   she is redirected to the admin app home page
  And  the navbar displays "Ana Alvarez"
  And  the Supabase session is stored in localStorage
```

#### SC-R2-2 — Installer user logs in to installer app
```
Given  Bruno Benitez has a valid auth.users entry linked to his identity.staff row
  And  his staff role is 'installer' and status is 'active'
When   he submits the login form in the installer app with correct credentials
Then   he is redirected to the installer app home page
  And  the navbar displays "Bruno Benitez"
  And  the Supabase session is stored in localStorage
```

### R3 — Cross-App Role Enforcement

**Statement**: A staff member whose role does not match the target application MUST be signed out automatically and shown "Esta cuenta no tiene acceso a esta aplicación". No protected content of the wrong app MUST ever be rendered.

#### SC-R3-1 — Admin user on installer app
```
Given  Ana Alvarez is authenticated with role 'admin'
When   she opens the installer app
Then   the app calls signOut()
  And  "Esta cuenta no tiene acceso a esta aplicación" is displayed
  And  she is returned to the installer app /login
  And  no installer home content is rendered
```

#### SC-R3-2 — Installer user on admin app
```
Given  Bruno Benitez is authenticated with role 'installer'
When   he opens the admin app
Then   the app calls signOut()
  And  "Esta cuenta no tiene acceso a esta aplicación" is displayed
  And  he is returned to the admin app /login
  And  no admin home content is rendered
```

### R4 — Authentication Error Handling

**Statement**: The login form MUST handle authentication failures gracefully. Wrong credentials MUST show an inline Spanish error without redirect and without `signOut()`. Empty fields MUST be caught client-side before any network request.

#### SC-R4-1 — Wrong password
```
Given  a user submits the login form with a valid email and an incorrect password
When   Supabase returns AuthApiError "Invalid login credentials"
Then   "Email o contraseña incorrectos." is displayed inline
  And  the form remains visible (no redirect)
  And  signOut() is not called
```

#### SC-R4-2 — Empty fields
```
Given  the login form is displayed
When   the user submits with an empty email or empty password
Then   client-side validation prevents the network request
  And  an inline validation message is shown
```

#### SC-R4-3 — Network failure
```
Given  the network is unavailable when the login form is submitted
When   the fetch attempt fails with a network error
Then   "Error de conexión. Intentá de nuevo." is displayed inline
  And  the form remains visible
```

### R5 — Post-Login Staff Profile States

**Statement**: After a successful Supabase auth event, the system MUST fetch the staff profile from `identity.staff`. If absent or inactive, the system MUST call `signOut()` and display an explanatory Spanish error. No half-authenticated state MUST persist.

#### SC-R5-1 — No staff row
```
Given  an auth.users entry exists with no matching identity.staff row
When   that user successfully authenticates
Then   profile fetch returns empty
  And  signOut() is called
  And  "Cuenta no provisionada. Contactar a soporte." is displayed
  And  the user is returned to /login
```

#### SC-R5-2 — Inactive staff
```
Given  Elena Espinoza has a valid auth.users entry
  And  her identity.staff record has status != 'active'
When   she successfully authenticates
Then   signOut() is called
  And  "Cuenta desactivada." is displayed
  And  she is returned to /login
```

#### SC-R5-3 — Loading state during profile fetch
```
Given  a user has just authenticated
When   the identity.staff profile fetch is in progress
Then   ProtectedRoute renders a loading indicator
  And  no protected content children are mounted until session, profile, and role are all resolved
```

### R6 — Seed Test Users

**Statement**: `supabase/seed.sql` MUST include local-dev `auth.users` entries for Ana Alvarez (admin) and Bruno Benitez (installer), each linked to the corresponding `identity.staff` row. Seed passwords MUST be commented as local-only and MUST NOT appear in any app source file.

#### SC-R6-1 — Seed produces usable local users (manual)
```
Given  `supabase db reset` is run against a clean local Supabase instance
When   the seed completes
Then   auth.users contains entries for Ana and Bruno
  And  identity.staff rows for Ana and Bruno each have a non-null auth_user_id
  And  the seed passwords authenticate successfully via the login form
```

#### SC-R6-2 — Seed passwords not in app source code (automated)
```
Given  the project source tree excluding supabase/seed.sql
When   searched for the local-dev seed passwords
Then   no match is found in any .ts, .tsx, or .js file
```

### R7 — Session Persistence and Logout

**Statement**: A session established via the login form MUST persist across browser reloads without re-authentication. An explicit logout MUST clear the session from `localStorage` and redirect to `/login`.

#### SC-R7-1 — Session persists across reload
```
Given  a user has successfully logged in
When   the browser tab is refreshed
Then   the session is restored from localStorage without a new signIn call
  And  the user sees the home page without being redirected to /login
```

#### SC-R7-2 — Logout clears session
```
Given  a user is authenticated and viewing the home page
When   the user triggers the logout action
Then   signOut() is called
  And  localStorage no longer contains a Supabase session
  And  the user is redirected to /login
```

### R8 — Type Generation and Pipeline Health

**Statement**: `packages/supabase/src/database.types.ts` MUST include typed definitions for the `identity` schema (including `identity.Tables.staff`) after `pnpm gen:types`. The full pipeline MUST exit green. The `useAuth` hook Vitest suite MUST include ≥5 passing tests covering happy path and each error branch.

#### SC-R8-1 — identity schema present in generated types
```
Given  `pnpm gen:types` has been run against a running local Supabase instance
When   packages/supabase/src/database.types.ts is inspected
Then   it exports a typed definition that includes identity.Tables.staff
  And  the staff row type includes at minimum: id, auth_user_id, email, role, status, full_name
```

#### SC-R8-2 — Pipeline passes
```
Given  all change artifacts are in place
When   `pnpm install && pnpm build && pnpm typecheck && pnpm lint && pnpm test` is run
Then   every command exits with code 0
```

#### SC-R8-3 — useAuth hook Vitest coverage
```
Given  the useAuth hook Vitest suite exists
When   `pnpm test` is run
Then   at least 5 test cases pass, covering:
  - Happy path: successful sign-in with correct role
  - Wrong credentials error path
  - No staff row error path
  - Inactive staff error path
  - Wrong role error path
```

## Out of Scope

- Password reset flow
- Magic link, OAuth, MFA, SMS auth
- User onboarding UI / provisioning
- Server-side session termination beyond `signOut()`
- Profile page or navbar redesign beyond displaying staff name
- Production auth user creation (seed is local-dev only)

## Requirement-to-Success-Criteria Traceability

| Proposal criterion | Requirement | Scenario(s) |
|---|---|---|
| 1. Fresh browser → /login | R1 | SC-R1-1, SC-R1-2 |
| 2. Ana on admin → home + "Ana Alvarez" | R2 | SC-R2-1 |
| 3. Bruno on installer → home + "Bruno Benitez" | R2 | SC-R2-2 |
| 4. Ana on installer → error + signOut | R3 | SC-R3-1 |
| 5. Wrong password → inline, no redirect | R4 | SC-R4-1 |
| 6. Elena (inactive) → error + signOut | R5 | SC-R5-2 |
| 7. No staff row → error + signOut | R5 | SC-R5-1 |
| 8. Reload → session persists | R7 | SC-R7-1 |
| 9. Logout → /login + localStorage cleared | R7 | SC-R7-2 |
| 10. database.types.ts has identity.Tables.staff | R8 | SC-R8-1 |
| 11. ≥5 useAuth Vitest tests pass | R8 | SC-R8-3 |
| 12. Pipeline green | R8 | SC-R8-2 |

## Key Learnings

1. The four post-login terminal states (authorized, not-provisioned, deactivated, wrong-role) map to requirement scenarios exhaustively.
2. R4 (auth-layer errors) and R5 (post-auth profile errors) are distinct paths.
3. R7 has no new implementation — supabase-js provides it — but stating it makes it a testable acceptance scenario.
4. R6 (seed users) is first-class: without it, R2/R3/R5 manual QA can't run locally.
5. SC-R6-2 turns a documentation risk into an automatable lint rule.
