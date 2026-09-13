# Tasks: username-based-login

## Review Workload Forecast

| Field                   | Value                                                                                                                                                                                                                                         |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Estimated changed lines | ~450–550 (migration ~80, pgTAP ~90, shared hook+tests ~90, two login pages+tests ~80, staff form/hook/table ~70, UserMenu ~15, FLOWS.md ~30), plus regenerated `SCHEMA.md`/`database.types.ts` (generated, excluded from authored risk count) |
| 800-line budget risk    | High (post-apply actual ~1,000 authored lines; forecast ~450–550)                                                                                                                                                                             |
| Chained PRs recommended | No                                                                                                                                                                                                                                            |
| Suggested split         | Single PR — tightly coupled unit; over budget, shipped under `size:exception`                                                                                                                                                                 |
| Delivery strategy       | single-pr                                                                                                                                                                                                                                     |
| Chain strategy          | size-exception                                                                                                                                                                                                                                |

```text
Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: size-exception
800-line budget risk: High (size:exception accepted)
```

### Suggested Work Units

| Unit | Goal                                                                      | Likely PR | Focused test command                                                                                              | Runtime harness                | Rollback boundary                                                                                                         |
| ---- | ------------------------------------------------------------------------- | --------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| 1    | DB: `identity.staff.username` column, backfill, `resolve_login_email` RPC | PR 1      | `pnpm --filter @vitalock/supabase test:sql`                                                                       | local `supabase start` + pgTAP | New forward migration: `drop function public.resolve_login_email(text); alter table identity.staff drop column username;` |
| 2    | Shared auth: `username.ts` schema + `useAuth.signIn(username, password)`  | PR 1      | `pnpm --filter @vitalock/shared test`                                                                             | Vitest, mocked Supabase client | Revert `useAuth.ts` / `types.ts` / `username.ts` to email-only, independent of DB layer                                   |
| 3    | UI: both `LoginPage.tsx` forms + `UserMenu` `subtitle` rename             | PR 1      | `pnpm --filter @vitalock/admin test && pnpm --filter @vitalock/installer test && pnpm --filter @vitalock/ui test` | Vitest + Testing Library       | Revert `LoginPage`/`UserMenu` diffs independently of DB and hook layers                                                   |
| 4    | Admin: `StaffFormSheet`/`useMutateStaff`/`StaffTable` + docs              | PR 1      | `pnpm --filter @vitalock/admin test`                                                                              | Vitest + Testing Library       | Revert admin Personal-form diff; DB column and RPC stay intact                                                            |

## Phase 1 · Database — column, backfill, RPC (RED → GREEN)

- [x] 1.1 Write failing pgTAP in `supabase/tests-sql/test_136_staff_username_login.sql`: CHECK rejects `Ab`, `a b`, `a@b`, 2-char, 33-char; UNIQUE rejects duplicate; NOT NULL; backfilled rows match `^[a-z0-9._-]{3,32}$`; `resolve_login_email` returns email for active+linked, `NULL` for inactive/unlinked/unknown and for malformed input (`'a@b'`, `'ab'`, 33-char, `NULL`) with no error; normalizes `' Juan.Perez '` → `juan.perez`; `SET LOCAL role anon` can execute; `has_function_privilege` true for `anon`/`authenticated`/`service_role`, false for `public`. Test: `pnpm --filter @vitalock/supabase test:sql` (RED — table/function don't exist yet).
- [x] 1.2 Create `supabase/migrations/20260912120000_add_staff_username.sql`: add nullable `identity.staff.username text`; backfill via `UPDATE … FROM` CTE (`base` = lowercased email local-part, disallowed chars → `.`, fallback `'staff-' || left(id::text,8)` when null/short, `left(base,28)`, `row_number() over (partition by base order by created_at, id)` → suffix `-2, -3, …` on collision); `ALTER COLUMN username SET NOT NULL`; `ADD CONSTRAINT staff_username_format CHECK (username ~ '^[a-z0-9._-]{3,32}$')`; `ADD CONSTRAINT staff_username_key UNIQUE (username)`.
- [x] 1.3 In the same migration file, add `public.resolve_login_email(p_username text) RETURNS text`: `SECURITY DEFINER`, `LANGUAGE sql STABLE`, `SET search_path = pg_catalog, pg_temp`; schema-qualified CTE normalizing (`lower(btrim(p_username))`) and short-circuiting on the format regex before joining `identity.staff`/`auth.users` and filtering `status = 'active'`; `REVOKE EXECUTE ... FROM PUBLIC, anon, authenticated`; `GRANT EXECUTE ... TO anon, authenticated, service_role`; `NOTIFY pgrst, 'reload schema'`.
- [x] 1.4 Run `pnpm --filter @vitalock/supabase test:sql` — all pgTAP cases from 1.1 pass (GREEN).

## Phase 2 · Type generation

- [x] 2.1 Run `pnpm gen:types` against local Supabase; confirm `packages/supabase/src/database.types.ts` exports `identity.Tables.staff` with `username` and `Database['public']['Functions']` includes `resolve_login_email`. Test: `pnpm typecheck`.

## Phase 3 · Shared username schema (RED → GREEN)

- [x] 3.1 Write failing `packages/shared/src/auth/username.test.ts`: accepts `juan.perez`; rejects uppercase, space, `@`, 2-char, 33-char; normalizes case/whitespace on parse. Test: `pnpm --filter @vitalock/shared test` (RED — module doesn't exist).
- [x] 3.2 Create `packages/shared/src/auth/username.ts` exporting `USERNAME_PATTERN` and `usernameSchema = z.string().trim().toLowerCase().regex(USERNAME_PATTERN, 'Usuario inválido')`; re-export from `packages/shared/src/auth/index.ts`. Test: `pnpm --filter @vitalock/shared test` (GREEN).

## Phase 4 · useAuth signIn(username, password) (RED → GREEN)

- [x] 4.1 Extend `packages/shared/src/auth/useAuth.test.ts`: add `rpc` mock to `createMockSupabase`; assert RPC-null → `INVALID_CREDENTIALS` with `signInWithPassword` never called; RPC error → `NETWORK_ERROR`; RPC email → `signInWithPassword({ email, password })`; `fetchProfile` returns `username`; ≥5 total passing cases covering happy path, wrong password, unknown/inactive/unlinked username, wrong role. Test: `pnpm --filter @vitalock/shared test` (RED).
- [x] 4.2 Update `packages/shared/src/auth/types.ts`: `signIn: (username: string, password: string) => Promise<void>`; `StaffProfile` gains `username: string`.
- [x] 4.3 Update `packages/shared/src/auth/useAuth.ts`: `signIn` calls `supabase.rpc('resolve_login_email', { p_username: username })`, maps a `NULL`/error result per Decision 3 (`NULL` → `INVALID_CREDENTIALS`, RPC error → `NETWORK_ERROR`), then `signInWithPassword({ email, password })`; `fetchProfile` selects `username`; update the `INVALID_CREDENTIALS` copy to "Usuario o contraseña incorrectos." in `useAuth.ts` and `packages/shared/src/auth/AuthErrorPage.tsx`. Test: `pnpm --filter @vitalock/shared test` (GREEN).

## Phase 5 · Login forms (RED → GREEN)

- [x] 5.1 Extend `apps/admin/src/routes/__tests__/LoginPage.test.tsx` and `apps/installer/src/routes/__tests__/LoginPage.test.tsx`: assert "Usuario" label, `autoComplete="username"`, lowercased/trimmed username on submit, inline regex-rejection message, empty-field validation. Test: `pnpm --filter @vitalock/admin test && pnpm --filter @vitalock/installer test` (RED).
- [x] 5.2 Update `apps/admin/src/routes/LoginPage.tsx` and `apps/installer/src/routes/LoginPage.tsx`: replace the email field with a `usernameSchema`-validated `Usuario` field (`id="username"`, `type="text"`, `autoComplete="username"`, `autoCapitalize="none"`, `autoCorrect="off"`, `spellCheck={false}`); call `signIn(username, password)`. Test: `pnpm --filter @vitalock/admin test && pnpm --filter @vitalock/installer test` (GREEN).

## Phase 6 · UserMenu subtitle rename (RED → GREEN)

- [x] 6.1 Update `packages/ui/src/components/__tests__/UserMenu.test.tsx` and `apps/admin/src/**/__tests__/UserMenu.test.tsx` to assert a `subtitle` prop rendering `@username`, never `email`. Test: `pnpm --filter @vitalock/ui test && pnpm --filter @vitalock/admin test` (RED).
- [x] 6.2 Rename `UserMenuProps.email` → `subtitle` in the `packages/ui` `UserMenu` component (doc comment: "secondary line, e.g. `@username`"). Test: `pnpm --filter @vitalock/ui test` (GREEN).
- [x] 6.3 Update both app wrappers (`apps/admin`, `apps/installer`) to pass `subtitle={staff?.username ? \`@${staff.username}\` : ''}`and stop reading`session.user.email`. Test: `pnpm --filter @vitalock/admin test && pnpm --filter @vitalock/installer test` (GREEN).

## Phase 7 · Admin staff form, mutations, table (RED → GREEN)

- [x] 7.1 Extend `apps/admin/src/components/personal/__tests__/StaffTable.test.tsx` to assert a "Usuario" column, and the `StaffFormSheet` test to assert the required `username` field, client-side format rejection, and an inline error (not a toast) on a `23505` duplicate. Test: `pnpm --filter @vitalock/admin test` (RED).
- [x] 7.2 Update `apps/admin/src/components/personal/StaffFormSheet.tsx`: add required `username` field (`usernameSchema`), label "Usuario \*", placeholder `ej. juan.perez`, positioned after Nombre; send on create and update.
- [x] 7.3 Update `apps/admin/src/hooks/useMutateStaff.ts`: `CreateStaffInput.username: string`, `UpdateStaffInput.username?: string`, pass `username` on insert/update.
- [x] 7.4 Update `apps/admin/src/hooks/usePersonal.ts`: `StaffRow.username: string`, select it, include it in the client-side search filter.
- [x] 7.5 Update `apps/admin/src/components/personal/StaffTable.tsx`: add "Usuario" column after Nombre.
- [x] 7.6 Update `apps/admin/src/lib/errors/toast.ts` `adminExtraHandlers['23505']`: when `details.includes('staff_username_key')`, surface an inline "Ese usuario ya existe." field error on `username` instead of the generic toast. Test: `pnpm --filter @vitalock/admin test` (GREEN).

## Phase 8 · Docs and generated artifacts

- [x] 8.1 Run `scripts/gen-schema-doc.sh` to regenerate `supabase/SCHEMA.md` with `identity.staff.username` and `public.resolve_login_email`.
- [x] 8.2 Update `supabase/FLOWS.md` §4.2 (provisioning insert sets `username`; step 3 updates by `username`) and §4.3 (RPC resolution runs before `signInWithPassword`).

## Phase 9 · Verify

- [x] 9.1 Run `pnpm lint && pnpm typecheck && pnpm test && pnpm --filter @vitalock/supabase test:sql` — confirm every command exits 0.

---

## Post-apply / delivery (not sdd-apply tasks)

- Run `pnpm db:rehearse` before `supabase db push`.
- Announce the derived usernames to the ~4 affected staff before/at deploy (proposal Risk 2, design Open Question).
