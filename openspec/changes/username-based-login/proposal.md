# Proposal: username-based-login

Replace the email login identifier with a short, unique `username` on
`identity.staff` for both the admin and installer apps, resolved server-side
to the linked `auth.users.email` so Supabase Auth itself stays untouched.

---

## Why

- **User request (product owner, verbatim):** "No quiero mas que los usuarios
  se autentifiquen con su email, en cambio ahora tendran un usuario ya que es
  mas rapido y simple el logueo." Installers log in from a phone in the field;
  a 25-character email with `@` and `.` is slow and error-prone on a touch
  keyboard, while `bruno` is not.
- **Current state:** both `LoginPage.tsx` forms are Zod-validated on
  `z.string().email()` and call `useAuth.signIn(email, password)` →
  `supabase.auth.signInWithPassword({ email, password })`. Email is the only
  login identifier and the only identity shown in `UserMenu`.
- **Low coupling makes this cheap now:** no RLS policy references `email`
  (role checks go through `auth.uid()` → `auth_user_id`), provisioning is a
  manual Admin API step, and `identity.staff` already carries the profile the
  UI reads after login. See `exploration.md`.
- **Scale:** ~4 production staff rows — the backfill is trivial and reversible.

---

## What Changes

- **DB — new migration `supabase/migrations/2026091200000X_add_staff_username.sql`:**
  - `identity.staff.username text` — unique, lowercase, `CHECK (username ~ '^[a-z0-9._-]{3,32}$')`.
  - Backfill from the email local-part (lowercased, disallowed chars → `.`,
    collision suffix `-2`, `-3`, …), then `SET NOT NULL`.
  - `public.resolve_login_email(p_username text) RETURNS text` —
    `SECURITY DEFINER`, `search_path = pg_catalog, pg_temp` (hardening
    pattern from `20260910110000_harden_security_definer_rpcs.sql`), EXECUTE
    revoked from `PUBLIC` and granted to `anon` + `authenticated`. Lives in
    `public` because `anon` has no USAGE on schema `identity` and client RPC
    typing only covers `public` (see design). Normalizes input server-side
    and returns the linked email for an active, linked staff row; returns
    `NULL` (never an error) for anything else.
- **Shared auth — `packages/shared/src/auth/useAuth.ts` + `types.ts`:**
  `signIn(username, password)` calls the RPC, then `signInWithPassword` with
  the resolved email. A `NULL` resolution takes the same code path as a wrong
  password (`invalid_credentials`).
- **Login forms — `apps/{admin,installer}/src/routes/LoginPage.tsx`:** email
  field becomes `Usuario` (`autoComplete="username"`, lowercase-normalised,
  same regex). Error copy becomes a single generic "Usuario o contraseña
  incorrectos." for unknown username and wrong password alike.
- **UserMenu (admin, installer, `packages/ui`):** show `full_name` + `username`
  instead of `session.user.email`.
- **Admin staff form — `StaffFormSheet.tsx`, `useMutateStaff.ts`,
  `StaffTable.tsx`:** add a required `username` field with the same
  validation; show it in the table.
- **Tests:** update `LoginPage.test.tsx` (x2), `useAuth.test.ts`; new pgTAP
  `supabase/tests-sql/test_136_staff_username_login.sql` (constraint,
  backfill shape, RPC null-for-unknown/inactive/unlinked, RPC role guard).
- **Docs/generated:** `supabase/FLOWS.md` §4.2/§4.3 (provisioning now sets
  `username`), regenerate `SCHEMA.md` and `packages/supabase/src/database.types.ts`.

### Capabilities

- **Modified `auth`** — R2 login identifier becomes username; R4 error copy is
  generic and enumeration-safe; R8 staff row type gains `username`.
- **New `staff-identity`** — username invariants (format, uniqueness,
  NOT NULL, backfill rule), `resolve_login_email` contract, admin form field.

### Assumptions (orchestrator decisions baked in)

1. Approach 1 from exploration: RPC resolution, `auth.users.email` untouched.
2. Backfill is derived from the email local-part; admins fix names later in
   the Personal form.
3. `identity.staff.email` stays, stays unique, but is contact data only.
4. Unknown username and wrong password are indistinguishable to the client.

---

## Impact

- **Size:** ~450–550 authored lines (migration ~80, pgTAP ~90, shared hook +
  tests ~90, two login pages + tests ~80, staff form/hook/table ~70, UserMenu
  ~15, FLOWS.md ~30) plus regenerated `SCHEMA.md` / `database.types.ts`.
  Forecast was under the 800-line budget. **Post-apply actual: ~1,000
  authored lines** (pgTAP grew to 216 lines to pin 22 enumeration-safety
  scenarios; hook/login test extensions larger than forecast). The change is
  one tightly-coupled unit (RPC ⇄ hook ⇄ both login forms ⇄ staff form), so
  it ships as **single-pr with `size:exception`**, accepted by the product
  owner at session preflight (2026-09-12).
- **Data:** one new NOT NULL column on `identity.staff`; ~4 rows backfilled;
  no change to `auth.users`.
- **Users:** every admin and installer; their next login uses the derived
  username. Communicate the derived usernames before deploy.
- **Migrations:** 1. **RLS:** unchanged. **Password reset:** none exists,
  none added.

---

## Success Criteria

1. An active, linked staff member logs into the correct app with
   `username + password`; `auth.users.email` is unchanged.
2. Unknown username, wrong password, inactive staff, and unlinked staff all
   surface the same inline "Usuario o contraseña incorrectos." with no
   redirect and no `signOut()`.
3. `resolve_login_email` returns `NULL` (no error, same response shape) for
   unknown/inactive/unlinked usernames, and rejects callers outside the
   API-client roles.
4. `identity.staff.username` rejects uppercase, spaces, `@`, lengths < 3 or
   > 32, and duplicates; existing rows are backfilled and the column is
   > NOT NULL after migration.
5. Admin can set/edit `username` in the Personal form; the table shows it.
6. `UserMenu` no longer renders the email.
7. `pnpm lint && pnpm typecheck && pnpm test` and
   `pnpm --filter @vitalock/supabase test:sql` are green.

---

## Non-goals

- **Password reset / forgot-username** — unchanged ADR-6 decision from
  `auth-session`; still no deliverable-email dependency introduced.
- **In-app `auth.users` provisioning** — `useMutateStaff.createStaff` keeps
  inserting only `identity.staff`; the manual Admin API + link step stays.
- **Removing or relaxing `identity.staff.email`** — kept as unique contact
  data so a future reset flow has an address to use.
- **RLS or role-function changes** — none reference email.
- **Login by either username or email** — one identifier only; keeps the
  enumeration surface and the form simple.

---

## Risks

1. **Enumeration via the anon RPC** — mitigated by a constant `NULL` response
   for every non-success case, no distinguishing errors, and pgTAP coverage of
   each branch. Supabase Auth rate-limiting still applies to the password step.
2. **Derived usernames surprise users** (e.g. `rodrigo.n.lago`) — mitigated by
   the admin-editable field and by announcing derived names before deploy.
3. **Backfill collision or invalid local-part** (too short, all symbols) —
   mitigated by suffixing and by padding/falling back to `staff-<n>` in the
   migration; pgTAP asserts every backfilled row matches the regex.
4. **Test drift** — three existing test files assert on `email`; they are in
   scope and updated in the same PR.
5. **Rollback** — drop the RPC and column (`DROP FUNCTION …; ALTER TABLE …
DROP COLUMN username;`) and revert the app commit; `auth.users` was never
   modified, so email login works immediately after revert.

---

## Ready for Spec/Design

Ready — no blockers. Open confirmation for the user: accept the
email-local-part backfill rule and the derived usernames for the ~4 existing
staff (see Assumptions).
