# Design: username-based-login

Approach 1 from `exploration.md`: add `identity.staff.username`, resolve it to
the linked `auth.users.email` through one anon-callable RPC, then reuse the
untouched `signInWithPassword` path. Supabase Auth, RLS and provisioning stay
as they are.

---

## Decision 1 — Where does the resolution RPC live, and how is it guarded?

**Options**

| Option                                                        | Tradeoff                                                                                                                                                                                                                                                                                                                                         |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A. `identity.resolve_login_email` (as proposed)               | `anon` has no `USAGE` on schema `identity` (baseline L7507-7508 grant it only to `authenticated`/`service_role`); would need `GRANT USAGE ON SCHEMA identity TO anon`, widening the anon surface to a whole schema for one function. `client.rpc()` typing (`packages/supabase/src/types/rpc.ts`) only covers `Database['public']['Functions']`. |
| B. `public.resolve_login_email(p_username text) returns text` | Same schema as all 22 existing client RPCs; typed by `RpcName`; `anon` already has schema usage. Requires explicit privilege management because `public` default privileges grant EXECUTE to `anon`.                                                                                                                                             |

**Chosen:** B. `SECURITY DEFINER`, `language sql stable`, `set search_path = pg_catalog, pg_temp`; body fully schema-qualified, normalising first and short-circuiting on the same regex as the column CHECK so garbage input never reaches the index:

```sql
with q as (select lower(btrim(p_username)) as u)
select users.email
  from q
  join identity.staff s on s.username = q.u
  join auth.users users on users.id = s.auth_user_id
 where q.u ~ '^[a-z0-9._-]{3,32}$'
   and s.status = 'active'
 limit 1;
```

Privileges follow `20260911100000_revoke_anon_execute_on_internal_functions.sql`: `revoke execute on function public.resolve_login_email(text) from public, anon, authenticated; grant execute ... to anon, authenticated, service_role;` plus `notify pgrst, 'reload schema'`.

**Why:** consistency with the existing RPC surface and no new schema grant. The `identity.is_api_client_role()`/`require_*` guard is **N/A here**: `anon` is the intended caller, so a role gate has nothing to gate. Proposal Success Criterion 3 ("rejects callers outside the API-client roles") is therefore satisfied by privilege, not by a guard: pgTAP asserts `has_function_privilege('anon', 'public.resolve_login_email(text)', 'execute')` and the same for `authenticated`/`service_role` are true, and that the `public` pseudo-role's is false. Safety comes from the contract: constant `NULL` for null/malformed/unknown/inactive/unlinked input, never an exception; server-side `lower(btrim())` means the client cannot skip normalisation.

## Decision 2 — Column, constraints, backfill: one migration or two?

**Options:** (A) two migrations (add nullable + backfill, then NOT NULL); (B) one migration doing add → backfill → constraints → RPC.

**Chosen:** B — `supabase/migrations/20260912120000_add_staff_username.sql` (`20260912100000` is already taken by `fix_installer_mdb_storage_policy.sql`).

- `alter table identity.staff add column username text;`
- Backfill in one `UPDATE ... FROM` CTE: `base = regexp_replace(lower(split_part(email,'@',1)), '[^a-z0-9._-]', '.', 'g')`; if `email` is null or `length(base) < 3` → `'staff-' || left(id::text, 8)`; `left(base, 28)`; `row_number() over (partition by base order by created_at, id)`; rn > 1 → `base || '-' || rn`.
- `alter column username set not null`, `add constraint staff_username_format check (username ~ '^[a-z0-9._-]{3,32}$')`, `add constraint staff_username_key unique (username)`.
- Then the RPC from Decision 1.

**Why:** ~4 rows, single transaction, atomic rollback; a two-step migration buys nothing. Lowercase is enforced by CHECK, so a plain UNIQUE constraint is already case-insensitive. Note: the backfill `UPDATE` fires `staff_audit_update`; audit rows for the backfill are expected.

## Decision 3 — `signIn(username, password)` flow in `useAuth`

**Options:** (A) resolve inside `useAuth.signIn` as a pre-step before `signInWithPassword`, state machine untouched; (B) resolve in each `LoginPage` and keep `signIn(email, password)`; (C) add a distinct `UNKNOWN_USERNAME` error code.

**Chosen:** A — two sequential awaits inside the existing `try`, state machine untouched:

```
authenticating ─→ rpc('resolve_login_email', { p_username })
   │ rpc error (any)      → error: NETWORK_ERROR ("Error de conexión…")
   │ data === null        → error: INVALID_CREDENTIALS
   └ email                → signInWithPassword({ email, password })
                              error → INVALID_CREDENTIALS ; ok → SIGNED_IN listener
```

**Why:** B would duplicate the resolution in two apps and leak a supabase call out of the single hook that owns auth I/O today. C is rejected because a distinguishable code is an enumeration oracle (proposal assumption 4). RPC errors map to `NETWORK_ERROR`, not `INVALID_CREDENTIALS`: the RPC never errors on bad input, so any error is infrastructure and an outage must not read as a typo.

`types.ts`: `signIn: (username: string, password: string)`; `StaffProfile` gains `username: string`; `fetchProfile` selects it. `INVALID_CREDENTIALS` copy becomes "Usuario o contraseña incorrectos." in both `useAuth.ts` and `AuthErrorPage.tsx`.

## Decision 4 — Shared username schema vs. duplicated per form

**Options:** duplicate the regex in three forms (2 login pages + StaffFormSheet) vs. one exported schema.

**Chosen:** new `packages/shared/src/auth/username.ts` exporting `USERNAME_PATTERN` and `usernameSchema = z.string().trim().toLowerCase().regex(USERNAME_PATTERN, 'Usuario inválido')`, re-exported via `./auth/index.ts`. `packages/shared` already depends on `zod@3.23.8`.

**Why:** three consumers must agree byte-for-byte with the DB CHECK; one source of truth. Login forms: `<Label>Usuario</Label>`, `<Input id="username" type="text" autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false}>`; the two `LoginPage.tsx` files stay separate (pre-existing near-duplication is out of scope).

## Decision 5 — UserMenu identity line

**Options:** keep the `email` prop and feed it `@username`; rename the prop.

**Chosen:** rename `packages/ui` `UserMenuProps.email` → `subtitle` (doc: "secondary line, e.g. `@username`"); both app wrappers pass `subtitle={staff?.username ? `@${staff.username}` : ''}` and stop reading `session`.

**Why:** a prop named `email` that renders a username is a lie the next reader pays for; the rename is ~6 lines plus test-prop updates in `packages/ui/.../__tests__/UserMenu.test.tsx` and `apps/admin/.../__tests__/UserMenu.test.tsx`.

## Decision 6 — Admin staff form, mutations, table, unique violation

**Options:** (A) required `username` field in the existing Personal sheet, 23505 surfaced through the established `adminExtraHandlers` toast; (B) same field, but a field-level `setError('username')` on 23505; (C) auto-derive `username` from `full_name` and hide the field.

**Chosen:** A —

- `StaffFormSheet.tsx`: required `username` field (`usernameSchema`), label "Usuario \*", placeholder `ej. juan.perez`, positioned after Nombre; sent on both create and update.
- `useMutateStaff.ts`: `CreateStaffInput.username: string`, `UpdateStaffInput.username?: string`, insert passes it.
- `usePersonal.ts`: `StaffRow.username: string`, select it, include in client-side search.
- `StaffTable.tsx`: column "Usuario" after Nombre.
- 23505 → `apps/admin/src/lib/errors/toast.ts` `adminExtraHandlers['23505']`: `details.includes('staff_username_key')` → "Ese usuario ya existe."

**Why:** B double-reports — `useMutateStaff.onError` already toasts every failure — and breaks the one error-mapping pattern all admin mutations share. C hides the identifier the user must type at login; admins need to see and edit it (proposal risk 2).

## Decision 7 — Testing (strict TDD, vitest + pgTAP)

**Options:** (A) update the three existing test files only; (B) A plus a dedicated `username.test.ts` for the shared schema and a new pgTAP file covering constraint, backfill and RPC branches.

**Chosen:** B —

| Layer | File                                                                            | Cases                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ----- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit  | `packages/shared/src/auth/useAuth.test.ts`                                      | add `rpc` mock to `createMockSupabase`; RPC null → `INVALID_CREDENTIALS`, no `signInWithPassword` call; RPC error → `NETWORK_ERROR`; email → `signInWithPassword({ email, password })`; profile includes `username`                                                                                                                                                                                                                               |
| Unit  | `apps/{admin,installer}/src/routes/__tests__/LoginPage.test.tsx`                | renders "Usuario" label, `autoComplete="username"`; submits lowercased/trimmed username; regex rejection message                                                                                                                                                                                                                                                                                                                                  |
| Unit  | `packages/shared/src/auth/username.test.ts` (new, sibling of `useAuth.test.ts`) | accepts `juan.perez`, rejects uppercase/space/`@`/2-char/33-char, normalises case                                                                                                                                                                                                                                                                                                                                                                 |
| Unit  | `packages/ui` + admin `UserMenu.test.tsx`                                       | `subtitle` prop, `@username` rendered, no email                                                                                                                                                                                                                                                                                                                                                                                                   |
| Unit  | `apps/admin/src/components/personal/__tests__/StaffTable.test.tsx`              | "Usuario" column                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| pgTAP | `supabase/tests-sql/test_136_staff_username_login.sql`                          | CHECK rejects `Ab`, `a b`, `a@b`, 2 chars, 33 chars; UNIQUE rejects duplicate; NOT NULL; backfilled rows match regex; RPC: active+linked → email; inactive → NULL; unlinked → NULL; unknown → NULL; `' Juan.Perez '` matches `juan.perez`; malformed input (`'a@b'`, `'ab'`, 33 chars, NULL) → NULL without error; `SET LOCAL role anon` can execute; `has_function_privilege` true for `anon`/`authenticated`/`service_role`, false for `public` |

**Why:** strict TDD is on (`openspec/config.yaml`); the schema is shared by three forms so it deserves its own RED test rather than three indirect ones, and the RPC's enumeration-safety is a contract that only pgTAP can pin per branch.

## Decision 8 — Regeneration and delivery sequencing

**Options:** (A) apply migration → `pnpm gen:types` → hook/UI, docs regenerated last; (B) hand-edit `database.types.ts` to unblock the hook and regenerate later.

**Chosen:** A. Apply order: migration → `pnpm gen:types` (adds `resolve_login_email` to `Database['public']['Functions']`) → hook/UI. Then `scripts/gen-schema-doc.sh`, `FLOWS.md` §4.2 (insert sets `username`; step 3 updates by `username`) and §4.3 (RPC then `signInWithPassword`). Delivery step, not apply: `pnpm db:rehearse` before push (project skill `rehearse-migration`).

**Why:** B risks a hand-typed signature drifting from the generated one, which is exactly what `packages/supabase/src/types/rpc.ts` exists to prevent; A costs one local `supabase` start, which the pgTAP run needs anyway.

---

## Runtime Behavior

```
LoginPage ──usernameSchema──▶ useAuth.signIn(username, pw)
    │                              │
    │                     rpc resolve_login_email (anon)
    │                              │ NULL ─▶ error INVALID_CREDENTIALS (inline, no signOut)
    │                              ▼ email
    │                     auth.signInWithPassword ─▶ SIGNED_IN ─▶ fetchProfile (+username)
    ▼                                                                   │
  <Navigate "/">  ◀───────────── phase 'authenticated' ◀────────────────┘
UserMenu: staff.full_name + "@" + staff.username
```

Unknown username, wrong password, inactive and unlinked staff all end in the same inline message; inactive/wrong-role after a successful password step keep today's `fetchProfile` handling.

## Rollback Plan

1. Revert the app commit (email login form/hook return).
2. Reverse `20260912120000_add_staff_username.sql` with a new forward migration: `drop function public.resolve_login_email(text); alter table identity.staff drop column username;` (drops CHECK/UNIQUE with it).
3. `pnpm gen:types` + `scripts/gen-schema-doc.sh`. `auth.users` was never modified, so email login works immediately after step 1.

## Threat Matrix

N/A — no routing, shell, subprocess, VCS/PR automation, executable-file classification, or process-integration boundary.

## Open Questions

- [ ] Accept that anyone holding the anon key can map a _known active_ username to its email (no PostgREST rate limit exists; only the password step is rate-limited by GoTrue). Acceptable for ~4 internal `@vitalock.com` accounts; revisit if staff grows or emails become personal.
- [ ] Confirm the derived usernames for the existing rows before deploy (product owner; proposal assumption 2).
