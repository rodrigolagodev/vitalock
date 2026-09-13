# Exploration: username-based-login

## Current State

**Auth stack** (Supabase Auth, email+password only):

- `packages/supabase/src/client.ts` — `createSupabaseClient()` builds a typed client, `persistSession: true, autoRefreshToken: true`.
- `packages/shared/src/auth/useAuth.ts` — the single hook owning all supabase-js auth calls. `signIn(email, password)` → `supabase.auth.signInWithPassword({ email, password })`. On `SIGNED_IN`/`INITIAL_SESSION` fetches `identity.staff` by `auth_user_id`, checks `status==='active'` and `role===expectedRole`.
- `packages/shared/src/auth/AuthProvider.tsx` / `ProtectedRoute.tsx` — per-app context + route guard.
- `apps/admin/src/routes/LoginPage.tsx`, `apps/installer/src/routes/LoginPage.tsx` — near-duplicate RHF+Zod forms, `schema = z.object({ email: z.string().email(...), password: ... })`, call `signIn(data.email, data.password)`.
- Tests: `apps/admin/src/routes/__tests__/LoginPage.test.tsx`, `apps/installer/src/routes/__tests__/LoginPage.test.tsx`, `packages/shared/src/auth/useAuth.test.ts` all assert on the `email` field and `signIn(email, password)` signature.
- No i18n library — copy is hardcoded inline Spanish strings.

**DB / provisioning** (`supabase/FLOWS.md` §4.2, confirmed in code):

- No public signup. Real provisioning: an admin calls `supabase.auth.admin.createUser({ email, password, email_confirm: true })` via Admin API/dashboard (outside any Vitalock app), then links `auth.users.id` into `identity.staff.auth_user_id`.
- The admin app's own `useMutateStaff.createStaff` (`apps/admin/src/hooks/useMutateStaff.ts`) only INSERTs into `identity.staff` — it never creates an `auth.users` row. Pre-existing gap, not this change's job to fix, but usernames will still need the same manual/dashboard linking step.
- `identity.staff` (baseline `supabase/migrations/20260831000000_baseline.sql:4929-4948`): `id uuid pk`, `auth_user_id uuid unique nullable fk→auth.users(id) ON DELETE SET NULL`, `full_name`, **`email text UNIQUE` (`staff_email_key`)**, `phone`, `role check(admin|installer)`, `status check(active|inactive)`.
- No RLS policy anywhere references `email` (grep-verified across baseline) — role checks go through `identity.current_staff_role()`/`is_admin()`/`is_installer()` keyed off `auth.uid()`→`auth_user_id`. Low coupling to email.
- Password reset explicitly out of scope (archived `auth-session` design, ADR-6) — no forgot-password UI in either app.
- No edge functions, no `packages/e2e` (e2e disabled per `openspec/config.yaml`).
- Migration convention: `supabase/migrations/YYYYMMDDHHMMSS_verb_object.sql`, latest is `20260910130000_add_missing_fk_indexes.sql`.
- pgTAP: `supabase/tests-sql/test_NNN_*.sql`, highest is `test_135_installer_mdb_storage_policy.sql` → next `test_136_*`.
- Precedent for a public anon-callable `SECURITY DEFINER` RPC: `supabase/migrations/20260910110000_harden_security_definer_rpcs.sql` (`identity.is_api_client_role()` guard, `set search_path = pg_catalog, pg_temp`, rename-and-wrap strategy). Directly reusable pattern for a "resolve username → email" RPC that must be reachable pre-auth by `anon` without becoming an enumeration oracle.
- `SCHEMA.md` regenerates via `scripts/gen-schema-doc.sh`; `database.types.ts` via `pnpm gen:types`.

## Affected Areas

- `apps/admin/src/routes/LoginPage.tsx`, `apps/installer/src/routes/LoginPage.tsx` — email field → username field (schema/label/autoComplete/copy).
- `apps/admin/src/routes/__tests__/LoginPage.test.tsx`, `apps/installer/src/routes/__tests__/LoginPage.test.tsx` — update assertions.
- `packages/shared/src/auth/useAuth.ts` + `useAuth.test.ts` — `signIn(username, password)`, add pre-`signInWithPassword` resolution step.
- `packages/shared/src/auth/types.ts` — `UseAuthReturn.signIn` signature; possibly a new/folded `AuthErrorCode`.
- `packages/supabase/src/database.types.ts` — regenerate after DB changes.
- New migration (`supabase/migrations/2026091200000X_add_staff_username.sql`) — add `identity.staff.username` unique + backfill + resolution RPC.
- New pgTAP `supabase/tests-sql/test_136_*.sql`.
- `apps/admin/src/hooks/useMutateStaff.ts`, `StaffFormSheet.tsx`, `StaffTable.tsx` — add `username` field (only in-app place staff records are created/edited).
- `UserMenu` (admin, installer, `packages/ui`) — currently shows `session?.user?.email`; decide replacement.
- `supabase/FLOWS.md` §4.2/§4.3 + `SCHEMA.md` regeneration.
- Not affected: RLS policies, `identity.current_staff_role()`/`is_admin()`/`is_installer()`.

## Approaches

1. **RPC username→email resolution (`identity.resolve_login_email`), `auth.users.email` untouched** — RECOMMENDED

   - Pros: zero `auth.users`/GoTrue changes; existing linked accounts unaffected; admin-API provisioning flow unaffected; small reversible migration (1 column + 1 RPC + 1 pgTAP test); RLS untouched; reuses existing anon-RPC hardening pattern.
   - Cons: one extra round-trip before `signInWithPassword`; new anon-reachable RPC needs enumeration-safe design (constant-shape null response, no distinguishing errors).
   - Effort: Low.

2. **Synthetic email domain written into `auth.users.email`**

   - Pros: no new anon-callable RPC.
   - Cons: requires rewriting `auth.users.email` for all existing accounts via Admin API; every username change now needs a second Admin API call instead of one table UPDATE; breaks the latent assumption that `auth.users.email` is a deliverable address (future password reset/notifications); higher migration risk for a manual, dashboard-driven process.
   - Effort: Medium.

3. **Custom auth (drop `signInWithPassword`)**
   - Cons: discards the entire `useAuth` session state machine, Supabase's hashing/rate-limiting; wildly disproportionate to a login-field UX request at ~4 users.
   - Effort: High. Rejected.

## Recommendation

Approach 1 (RPC username→email resolution). Smallest, most reversible change; reuses the existing `SECURITY DEFINER` anon-RPC hardening pattern; keeps manual admin provisioning (`auth.admin.createUser` + link) unchanged; only `identity.staff` gains a `username` column set alongside `full_name`/`role` in the existing "Personal" admin form.

## Risks

- New anon-callable RPC is an enumeration surface if not designed to return a uniform null/generic-error shape for unknown usernames.
- Backfilling `username` for the ~4 existing production users needs an explicit decision (auto-derive from email local-part vs. manual assignment) before the column can go `NOT NULL`.
- `openspec/changes/admin-collapsible-sidebar/` is an existing unarchived change with a FAILED verify-report — unrelated to this change; does not block starting `username-based-login`.

## Ready for Proposal

Yes. Scope is well-bounded (1 migration, 1 RPC, 2 login forms, 1 shared hook, 1 admin form, ~2 unit test files + 1 pgTAP test). Recommend `single-pr` delivery — well under the 800-line budget.
