# Staff Identity Specification

## Purpose

Defines the `identity.staff.username` login identifier: its format and
uniqueness invariants, the deterministic backfill rule applied to existing
rows, the `public.resolve_login_email` RPC contract that the shared
`useAuth` hook depends on, and the admin-facing form field that creates and
edits it.

## Requirements

### Requirement: Username Format and Uniqueness

`identity.staff.username` MUST be `text`, `NOT NULL`, globally unique,
lowercase-only, and MUST match `^[a-z0-9._-]{3,32}$` (3–32 characters:
lowercase letters, digits, `.`, `_`, `-`). Any INSERT or UPDATE violating the
format or uniqueness MUST be rejected at the database layer.

#### Scenario: Valid username accepted

- GIVEN the constraint is in place
- WHEN a row is inserted or updated with `username = 'ana.alvarez'`
- THEN the write succeeds

#### Scenario: Invalid format rejected

- GIVEN the constraint is in place
- WHEN a row is inserted with `username = 'Ana Alvarez'` (uppercase, space)
  or a value shorter than 3 or longer than 32 characters
- THEN the write is rejected by the CHECK constraint

#### Scenario: Duplicate username rejected

- GIVEN a staff row already has `username = 'bruno.benitez'`
- WHEN a second row is inserted or updated with the same `username`
- THEN the write is rejected by the unique constraint

### Requirement: Deterministic Backfill from Email Local-Part

The migration MUST backfill `username` for every pre-existing
`identity.staff` row from the lowercased local-part of `email` (the
substring before `@`), replacing any character outside `[a-z0-9._-]` with
`.`. If the derived value fails the format check (too short or all-symbol)
it MUST fall back to `staff-<n>`. If a derived value collides with another
row's derived value, each subsequent collision MUST receive a numeric
suffix (`-2`, `-3`, …) until unique. The column MUST be set `NOT NULL` only
after every row holds a valid, unique value.

#### Scenario: Local-part becomes username

- GIVEN a staff row has `email = 'rodrigo.n.lago@vitalock.com'`
- WHEN the backfill migration runs
- THEN the row's `username` is set to `rodrigo.n.lago`

#### Scenario: Colliding local-parts get a numeric suffix

- GIVEN two staff rows share the same normalized email local-part
- WHEN the backfill migration runs
- THEN the first row keeps the base value and the second receives the same
  value suffixed with `-2`

#### Scenario: Backfill satisfies the format check for every row

- GIVEN the backfill migration has committed
- WHEN every `identity.staff.username` value is checked against
  `^[a-z0-9._-]{3,32}$`
- THEN all rows match and the column is `NOT NULL`

### Requirement: resolve_login_email RPC Contract

`public.resolve_login_email(p_username text) RETURNS text` MUST be
`SECURITY DEFINER` with `search_path = pg_catalog, pg_temp`, and MUST be
executable by the `anon` and `authenticated` roles (pre-auth login), with
EXECUTE revoked from `PUBLIC` so no other role can call it. It MUST
normalize its input server-side (`lower(btrim(p_username))`) and MUST return
the linked `auth.users.email` only when the matching `identity.staff` row
has `status = 'active'` AND a non-null `auth_user_id`. For every other case —
malformed input, unknown username, inactive staff, or unlinked staff — it
MUST return `NULL` and MUST NOT raise a distinguishing error.

#### Scenario: Active, linked staff resolves to email

- GIVEN a staff row with `username = 'ana.alvarez'`, `status = 'active'`,
  and a non-null `auth_user_id`
- WHEN `public.resolve_login_email('ana.alvarez')` is called by `anon`
- THEN the linked `auth.users.email` is returned

#### Scenario: Unknown, inactive, or unlinked username returns NULL uniformly

- GIVEN a username that does not exist, or exists with `status != 'active'`,
  or exists with `auth_user_id IS NULL`
- WHEN `public.resolve_login_email` is called with that username
- THEN `NULL` is returned in every case, with no error raised and no
  distinguishable response shape

#### Scenario: Case and whitespace are normalized server-side

- GIVEN an active, linked staff row with `username = 'ana.alvarez'`
- WHEN `public.resolve_login_email('  Ana.Alvarez ')` is called
- THEN the linked `auth.users.email` is returned

#### Scenario: Role without EXECUTE privilege is rejected

- GIVEN a database role that is neither `anon`, `authenticated`, nor
  `service_role`
- WHEN it attempts to execute `public.resolve_login_email`
- THEN Postgres denies the call with a permission error before the function
  body runs

### Requirement: Admin Staff Form Username Field

The admin "Personal" form (`StaffFormSheet`) MUST include a required
`username` field, client-side validated against the same
`^[a-z0-9._-]{3,32}$` pattern (lowercase-normalized on input) before
submission. A duplicate-username error from the database MUST surface as an
inline field error, not a generic toast. `StaffTable` MUST display the
`username` column.

#### Scenario: Valid username submitted

- GIVEN an admin fills the Personal form with a well-formed, unused username
- WHEN the form is submitted
- THEN the staff row is created/updated with that `username` and no
  validation error is shown

#### Scenario: Client-side format rejection

- GIVEN an admin types an uppercase or too-short username
- WHEN they attempt to submit
- THEN an inline validation error is shown and no request is sent

#### Scenario: Duplicate username surfaces inline

- GIVEN the submitted username already belongs to another staff row
- WHEN the database rejects the INSERT/UPDATE with a unique-constraint
  violation
- THEN the form shows an inline error on the username field naming the
  conflict, not a generic toast
