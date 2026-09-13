# Delta for Auth

**Change**: username-based-login

## MODIFIED Requirements

### Requirement: R2 — Successful Login and Role-Matched Home

A staff member with a valid `username`, the correct password, active status,
and a role matching the target app MUST be authenticated via
`useAuth().signIn(username, password)`, which resolves `username` to the
linked `auth.users.email` server-side (via `public.resolve_login_email`)
before calling `signInWithPassword`. The staff profile MUST load and the app
home page MUST render with the staff's full name in the navbar. The account
menu (`UserMenu`) MUST display the staff `full_name` and `username`, and MUST
NOT render `session.user.email` under any circumstance.
(Previously: the identifier was a raw email passed straight to
`signInWithPassword`; `UserMenu` displayed `session.user.email`.)

#### Scenario: Admin user logs in to admin app with username

- GIVEN Ana Alvarez has `identity.staff.username = 'ana.alvarez'`, active
  status, role `'admin'`, and a linked `auth.users` entry
- WHEN she submits the admin login form with `ana.alvarez` and her correct
  password
- THEN she is redirected to the admin app home page
- AND the account menu shows "Ana Alvarez" and "ana.alvarez", never her email

#### Scenario: Installer user logs in to installer app with username

- GIVEN Bruno Benitez has `identity.staff.username = 'bruno.benitez'`, active
  status, role `'installer'`, and a linked `auth.users` entry
- WHEN he submits the installer login form with `bruno.benitez` and his
  correct password
- THEN he is redirected to the installer app home page
- AND the account menu shows "Bruno Benitez" and "bruno.benitez", never his
  email

### Requirement: R4 — Authentication Error Handling

The login form MUST handle every authentication failure with the single
inline message "Usuario o contraseña incorrectos.", no redirect, and no
`signOut()` call. This message MUST cover, indistinguishably to the client:
an unknown username, a wrong password for a known username, an inactive
staff row, and a staff row with no linked `auth.users` account.
`useAuth().signIn(username, password)` MUST first call
`public.resolve_login_email(username)`; a `NULL` result MUST short-circuit
before any `signInWithPassword` call and MUST set the same
`AuthErrorCode.INVALID_CREDENTIALS` state as a rejected password. Empty
fields MUST be caught client-side before any network request.
(Previously: message was "Email o contraseña incorrectos." and only covered
a Supabase Auth rejection; unknown/inactive/unlinked accounts had no
pre-auth handling.)

#### Scenario: Wrong password for a known username

- GIVEN a staff member submits a valid, resolvable username and an incorrect
  password
- WHEN `public.resolve_login_email` returns an email and
  `signInWithPassword` rejects it
- THEN "Usuario o contraseña incorrectos." is shown inline, the form stays
  visible, and `signOut()` is not called

#### Scenario: Unknown username

- GIVEN no `identity.staff` row has the submitted username
- WHEN the login form is submitted
- THEN `public.resolve_login_email` returns `NULL`, `signInWithPassword` is
  never called, and "Usuario o contraseña incorrectos." is shown inline

#### Scenario: Inactive staff username

- GIVEN a staff row matches the submitted username but `status != 'active'`
- WHEN the login form is submitted
- THEN `public.resolve_login_email` returns `NULL` and "Usuario o
  contraseña incorrectos." is shown inline with no `signOut()` call

#### Scenario: Unlinked staff username

- GIVEN a staff row matches the submitted username but `auth_user_id IS NULL`
- WHEN the login form is submitted
- THEN `public.resolve_login_email` returns `NULL` and "Usuario o
  contraseña incorrectos." is shown inline

#### Scenario: Empty fields

- GIVEN the login form is displayed
- WHEN the user submits with an empty username or empty password
- THEN client-side validation prevents the network request and an inline
  validation message is shown

#### Scenario: Network failure

- GIVEN the network is unavailable when the login form is submitted
- WHEN the fetch attempt fails with a network error
- THEN "Error de conexión. Intentá de nuevo." is shown inline and the form
  stays visible

### Requirement: R8 — Type Generation and Pipeline Health

`packages/supabase/src/database.types.ts` MUST include typed definitions for
the `identity` schema, and the generated `identity.Tables.staff` row type
MUST include `username` alongside `id, auth_user_id, email, role, status,
full_name`. The full pipeline MUST exit green. The `useAuth` hook Vitest
suite MUST include ≥5 passing tests covering the happy path and each error
branch, including the unknown/inactive/unlinked-username branches now
resolved via `public.resolve_login_email`.
(Previously: the staff row type list omitted `username`; coverage bullets
did not name the pre-auth resolution branches.)

#### Scenario: identity schema present in generated types with username

- GIVEN `pnpm gen:types` has run against a running local Supabase instance
- WHEN `packages/supabase/src/database.types.ts` is inspected
- THEN it exports `identity.Tables.staff` including `username` plus the
  existing minimum fields

#### Scenario: Pipeline passes

- GIVEN all change artifacts are in place
- WHEN `pnpm install && pnpm build && pnpm typecheck && pnpm lint && pnpm test`
  is run
- THEN every command exits with code 0

#### Scenario: useAuth hook Vitest coverage includes resolution branches

- GIVEN the useAuth hook Vitest suite exists
- WHEN `pnpm test` is run
- THEN at least 5 test cases pass, covering the happy path, wrong password,
  unknown/inactive/unlinked username (mocked `resolve_login_email` → `NULL`),
  and wrong role
