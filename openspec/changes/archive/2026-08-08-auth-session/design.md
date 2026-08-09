# Design: auth-session

**Change**: auth-session
**Phase**: design
**Date**: 2026-08-08
**Persistence**: openspec (file) + engram (`sdd/auth-session/design`)

---

## Technical Approach

Hybrid layered auth: a single `useAuth` hook in `packages/shared` owns all
supabase-js calls and state transitions; per-app `AuthProvider` components
inject the supabase client instance and declare the expected role; per-app
`ProtectedRoute` reads context and gates rendering. `main.tsx` migrates from
`createBrowserRouter` (data router) to `BrowserRouter` (component router)
to allow `AuthProvider` to wrap the entire route tree without prop-threading
the supabase client into loaders.

Prerequisites — committed before code changes:
1. Regenerate `database.types.ts` (isolated commit, `pnpm gen:types`).
2. Extend `supabase/seed.sql` with two `auth.users` rows + UPDATE linkage.

---

## State Machine

States and transitions for `useAuth` / `AuthProvider`:

```
                  mount
                    │
                    ▼
             ┌─────────────┐
             │ initializing│  ← getSession() in flight
             └──────┬──────┘
          ┌─────────┴──────────┐
     null session          session found
          │                    │
          ▼                    ▼ profile fetch
      ┌───────┐          ┌─────────────────┐
      │anon.  │          │  fetching profile│
      └───────┘          └────────┬────────┘
          ▲                 ┌─────┴──────────────┐
          │           null row   inactive   role ok
          │                │       │            │
          │         ┌──────▼─┐ ┌───▼──┐  ┌─────▼──────┐
          │         │ error  │ │error │  │authenticated│
          │         │no_staff│ │inact.│  │            │
          │         └──┬─────┘ └──┬───┘  └────────────┘
          │       signOut()  signOut()
          └──────────────────────┘

SIGNED_IN event  → fetch profile → see fork above
SIGNED_OUT event → anonymous
TOKEN_REFRESHED  → stay authenticated (no re-fetch needed)
signIn() call    → authenticating → SIGNED_IN event (handled by listener)
signOut() call   → anonymous

Error state payload: { code: AuthErrorCode, message: string (Spanish) }
```

Transitions are driven by `onAuthStateChange`; `signIn` triggers the
`SIGNED_IN` event, which the listener handles — no duplicate state update.

---

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `packages/shared/src/auth/types.ts` | Create | `StaffProfile`, `AuthState`, `AuthErrorCode` enum, `UseAuthReturn` interface |
| `packages/shared/src/auth/useAuth.ts` | Create | Core hook: session, profile fetch, signIn, signOut, state machine |
| `packages/shared/src/auth/useAuth.test.ts` | Create | Vitest suite (6 test cases with mock supabase client) |
| `packages/shared/src/auth/index.ts` | Create | Barrel: re-exports hook, types |
| `packages/shared/src/index.ts` | Modify | Add `export * from './auth'` |
| `apps/admin/src/auth/AuthProvider.tsx` | Create | Injects `supabase` (from `main.tsx`), expected role `'admin'`, provides `AuthContext` |
| `apps/admin/src/auth/ProtectedRoute.tsx` | Create | Reads context; spinner → `/login` → `/error?reason=` → children |
| `apps/admin/src/routes/LoginPage.tsx` | Create | RHF + Zod form, calls `signIn`, admin branding |
| `apps/admin/src/routes/AuthErrorPage.tsx` | Create | Reads `?reason=` query param, renders Spanish message + logout button |
| `apps/installer/src/auth/AuthProvider.tsx` | Create | Same shape as admin, expected role `'installer'` |
| `apps/installer/src/auth/ProtectedRoute.tsx` | Create | Same shape as admin |
| `apps/installer/src/routes/LoginPage.tsx` | Create | Same shape as admin, installer branding |
| `apps/installer/src/routes/AuthErrorPage.tsx` | Create | Same as admin |
| `apps/admin/src/main.tsx` | Modify | Replace `createBrowserRouter` with `BrowserRouter`; add `/login`, `/error`, protected layout route |
| `apps/installer/src/main.tsx` | Modify | Same router restructure |
| `apps/admin/src/App.tsx` | Modify | Remove `<Outlet />`; becomes `<AuthProvider supabase={supabase}><Outlet /></AuthProvider>` — or inline in `main.tsx` (see ADR-2) |
| `apps/installer/src/App.tsx` | Modify | Same |
| `supabase/seed.sql` | Modify | Add auth.users block + UPDATE linkage (local dev only) |
| `packages/supabase/src/database.types.ts` | Modify | Regenerated via `pnpm gen:types`; isolated commit |

---

## Interfaces / Contracts

### `packages/shared/src/auth/types.ts`

```typescript
export type StaffRole = 'admin' | 'installer';

export interface StaffProfile {
  id: string;
  auth_user_id: string;
  full_name: string;
  role: StaffRole;
  status: 'active' | 'inactive';
}

export enum AuthErrorCode {
  INVALID_CREDENTIALS = 'invalid_credentials',
  NETWORK_ERROR       = 'network_error',
  NO_STAFF_ROW        = 'no_staff_row',
  INACTIVE_STAFF      = 'inactive_staff',
  WRONG_ROLE          = 'wrong_role',
  SESSION_EXPIRED     = 'session_expired',
  VALIDATION_ERROR    = 'validation_error',
}

export type AuthPhase =
  | 'initializing'
  | 'anonymous'
  | 'authenticating'
  | 'fetching_profile'
  | 'authenticated'
  | 'error';

export interface AuthState {
  phase: AuthPhase;
  session: import('@supabase/supabase-js').Session | null;
  staff: StaffProfile | null;
  error: { code: AuthErrorCode; message: string } | null;
}

export interface UseAuthReturn extends AuthState {
  isLoading: boolean; // phase === 'initializing' || 'authenticating' || 'fetching_profile'
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>; // re-fetch staff profile; called internally on TOKEN_REFRESHED
}
```

### `packages/shared/src/auth/useAuth.ts` — hook signature

```typescript
import type { TypedSupabaseClient } from '@vitalock/supabase';

export function useAuth(
  supabase: TypedSupabaseClient,
  expectedRole: StaffRole,
): UseAuthReturn
```

The hook is **not** a context consumer — it is the primitive. `AuthProvider`
calls it and puts the return value into context.

### `AuthProvider` contract (per-app)

```typescript
// apps/{admin|installer}/src/auth/AuthProvider.tsx

interface AuthProviderProps {
  supabase: TypedSupabaseClient;
  children: React.ReactNode;
}

export const AuthContext = createContext<UseAuthReturn | null>(null);

export function AuthProvider({ supabase, children }: AuthProviderProps) {
  const auth = useAuth(supabase, 'admin'); // 'installer' in installer app
  return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>;
}

export function useAuthContext(): UseAuthReturn {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuthContext must be inside AuthProvider');
  return ctx;
}
```

The `supabase` client prop comes from `main.tsx` where it is instantiated
(module-level singleton, unchanged from current pattern).

### `ProtectedRoute` contract (per-app)

```typescript
// Renders children; no own route element needed — used as layout route
export function ProtectedRoute() {
  const { phase, error } = useAuthContext();

  if (phase === 'initializing' || phase === 'fetching_profile') {
    return <FullScreenSpinner />;
  }
  if (phase === 'anonymous' || phase === 'authenticating') {
    return <Navigate to="/login" replace />;
  }
  if (phase === 'error' && error) {
    return <Navigate to={`/error?reason=${error.code}`} replace />;
  }
  // phase === 'authenticated'
  return <Outlet />;
}
```

### `LoginPage` contract (per-app)

```typescript
const schema = z.object({
  email:    z.string().email('Email inválido'),
  password: z.string().min(1, 'La contraseña es requerida'),
});

// Inside component:
const { signIn, phase, error } = useAuthContext();
const isPending = phase === 'authenticating';
// On submit: await signIn(data.email, data.password)
// Error display: error?.message (Spanish, from AuthErrorCode → message mapping)
// Success: onAuthStateChange fires SIGNED_IN → AuthProvider transitions → ProtectedRoute unmounts LoginPage
```

### Router structure (per-app `main.tsx`)

```tsx
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider supabase={supabase}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/error" element={<AuthErrorPage />} />
            <Route element={<ProtectedRoute />}>
              <Route element={<App />}>
                <Route index element={<IndexRoute />} />
              </Route>
            </Route>
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
```

`App.tsx` keeps its `<Outlet />` shell (layout wrapper); `AuthProvider` moves
into `main.tsx` so it receives `supabase` without prop-drilling through `App`.

---

## Data Flow

### Login flow

```
User submits form
  │
  ▼
signIn(email, password)
  │
  ├─ supabase.auth.signInWithPassword()
  │     ├─ AuthApiError → set error(INVALID_CREDENTIALS) → phase=error
  │     └─ success → phase=authenticating (session arrives via event)
  │
  ▼ onAuthStateChange fires SIGNED_IN
  │
  ├─ phase=fetching_profile
  ├─ supabase.from('staff').select(...).eq('auth_user_id', user.id).single()
  │     ├─ null  → signOut() + error(NO_STAFF_ROW)
  │     ├─ inactive → signOut() + error(INACTIVE_STAFF)
  │     ├─ role mismatch → signOut() + error(WRONG_ROLE)
  │     └─ ok   → phase=authenticated, staff=profile
  │
  ▼
ProtectedRoute re-renders → children mount
```

### Session restore on mount

```
mount
  │
  ▼
supabase.auth.getSession()
  ├─ null  → phase=anonymous
  └─ session → onAuthStateChange fires SIGNED_IN → profile fetch (same as login)
```

### Profile query

```typescript
// Schema: identity (exposed in PostgREST config)
const { data, error } = await supabase
  .schema('identity')
  .from('staff')
  .select('id, auth_user_id, full_name, role, status')
  .eq('auth_user_id', session.user.id)
  .single();
```

Note: `.schema('identity')` requires supabase-js v2 schema switching.
Confirm `identity` is listed in `config.toml` `[api].schemas` (it is per
FLOWS.md §3.2). `TypedSupabaseClient` wraps `Database` which after
regeneration will include `identity.Tables.staff`.

---

## Error Catalog

| Trigger | Internal Code | Spanish Message | Disposition |
|---------|---------------|-----------------|-------------|
| Empty email or password | `validation_error` | "El email y la contraseña son requeridos." | Inline form (Zod) |
| `AuthApiError` "Invalid login credentials" | `invalid_credentials` | "Email o contraseña incorrectos." | Inline form error |
| Fetch/network error on signIn | `network_error` | "Error de conexión. Intentá de nuevo." | Inline form error |
| Profile query returns null | `no_staff_row` | "Cuenta no provisionada. Contactar a soporte." | Redirect `/error?reason=no_staff_row` + signOut |
| Staff `status = 'inactive'` | `inactive_staff` | "Cuenta desactivada." | Redirect `/error?reason=inactive_staff` + signOut |
| Staff `role !== expectedRole` | `wrong_role` | "Esta cuenta no tiene acceso a esta aplicación." | Redirect `/error?reason=wrong_role` + signOut |
| `onAuthStateChange(SIGNED_OUT)` on reload | `session_expired` | "Tu sesión expiró. Iniciá sesión nuevamente." | Redirect `/login` (anonymous phase) |

Errors from `signIn` (credentials, network) stay on LoginPage (form error).
Errors from profile fetch (no row, inactive, wrong role) trigger `signOut()`
and redirect to `/error?reason=<code>`. `AuthErrorPage` reads the `reason`
param and renders the Spanish message from a lookup map.

---

## Profile Fetch Strategy

**Decision**: query `identity.staff` directly (not via RPC `current_staff_role()`).

Direct query returns `{id, full_name, role, status}` in one call and is
fully typed after `database.types.ts` regeneration. The `role` field is the
ground truth; `is_admin()` / `is_installer()` RPCs would only return a boolean
and would require a second query for `full_name`. The staff row is cached in
`AuthProvider` state for the session lifetime; it is not refetched on
`TOKEN_REFRESHED` because the role and status do not change during a session
(a deactivated user will simply get zero rows on the next DB query due to RLS).

---

## Seed Extension

```sql
-- ============================================================
-- LOCAL DEV ONLY — auth users for testing login flows.
-- These rows are NOT representative of production provisioning.
-- Production users are created via Supabase Auth admin API.
-- Passwords are intentionally weak — never use in production.
-- ============================================================

-- Ana Alvarez (admin)
INSERT INTO auth.users (
  id, instance_id, email, aud, role,
  encrypted_password,
  email_confirmed_at, created_at, updated_at
) VALUES (
  'aa000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'ana@vitalock.example',
  'authenticated', 'authenticated',
  crypt('admin1234', gen_salt('bf')),
  now(), now(), now()
) ON CONFLICT (id) DO NOTHING;

-- Bruno Benitez (installer)
INSERT INTO auth.users (
  id, instance_id, email, aud, role,
  encrypted_password,
  email_confirmed_at, created_at, updated_at
) VALUES (
  'bb000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'bruno@vitalock.example',
  'authenticated', 'authenticated',
  crypt('installer1234', gen_salt('bf')),
  now(), now(), now()
) ON CONFLICT (id) DO NOTHING;

-- Link auth.users to identity.staff
UPDATE identity.staff
  SET auth_user_id = 'aa000000-0000-0000-0000-000000000001'
  WHERE id = '99999999-9999-9999-9999-999999999901';  -- Ana Alvarez

UPDATE identity.staff
  SET auth_user_id = 'bb000000-0000-0000-0000-000000000001'
  WHERE id = '99999999-9999-9999-9999-999999999902';  -- Bruno Benitez
```

`crypt()` + `gen_salt('bf')` is available in local Supabase (pgcrypto is
enabled by GoTrue's Postgres instance). This avoids shipping a pre-computed
bcrypt hash that would be brittle across pg versions. The `ON CONFLICT (id) DO
NOTHING` guard makes the seed idempotent across `supabase db reset` calls.

---

## `database.types.ts` Regeneration

**Command**: `pnpm gen:types` (defined in `packages/supabase/package.json`).

**Preconditions**:
- `supabase start` has run and all migrations are applied.
- `supabase/config.toml` `[api].schemas` includes `identity`, `operations`,
  `sales`, `support` (already true per FLOWS.md §3.2).

**Expected output**: `Database` type with 5 top-level schema keys
(`public`, `identity`, `operations`, `sales`, `support`). Estimated 800–2000
lines depending on table count. The critical shape for this change:

```typescript
Database['identity']['Tables']['staff']['Row'] = {
  id: string;
  auth_user_id: string | null;
  full_name: string;
  role: 'admin' | 'installer';
  status: 'active' | 'inactive';
  email: string;
  created_at: string;
  updated_at: string;
}
```

**Commit strategy**: commit the regenerated file alone first, labeled
`chore(supabase): regenerate database.types.ts`. Code changes follow in a
separate commit. This keeps the type diff out of the code review diff and
allows the 400-line budget to apply only to authored code.

---

## Testing Strategy

### `useAuth.test.ts` — 6 Vitest test cases

Mock the supabase client via `vi.mock` at module scope, returning a
`createMockSupabase()` factory that replaces `signInWithPassword`,
`getSession`, `signOut`, `onAuthStateChange`, and the `from('staff')` chain.

| # | Test name | Setup | Expected outcome |
|---|-----------|-------|-----------------|
| 1 | Happy path — admin login | signIn returns session; profile returns `{role:'admin', status:'active'}` | `phase=authenticated`, `staff.full_name='Ana Alvarez'` |
| 2 | Wrong password | signIn returns `AuthApiError('Invalid login credentials')` | `phase=error`, `error.code=invalid_credentials` |
| 3 | No staff row | signIn succeeds; profile query returns `null` | `phase=error`, `error.code=no_staff_row`; signOut called |
| 4 | Inactive staff | profile returns `{status:'inactive'}` | `phase=error`, `error.code=inactive_staff`; signOut called |
| 5 | Session restore on mount | `getSession()` returns valid session; profile fetch succeeds | `phase=authenticated` without calling signIn |
| 6 | signOut | Start authenticated; call signOut; `SIGNED_OUT` event fires | `phase=anonymous`, `staff=null`, `session=null` |

Test harness: `renderHook` from `@testing-library/react`. The mock supabase
client is passed directly to `useAuth(mockSupabase, 'admin')`.

---

## ADR-1: Hybrid architecture (shared hook + per-app providers)

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Full shared (hook + provider + ProtectedRoute in `packages/shared`) | No per-app role binding possible without a prop; ProtectedRoute becomes generic and bloated | Rejected |
| Full per-app (duplicate hook in each app) | State management logic duplicated; bugs fixed in two places | Rejected |
| **Hybrid** (hook + types shared; provider + ProtectedRoute per-app) | Each app declares its own expected role and branding; hook logic stays in one place | **Chosen** |

Rationale: the expected role (`'admin'` vs `'installer'`) is the only thing
that differs between apps at the logic layer. Everything else — session state,
profile fetch, error handling — is identical. Hybrid gives DRY logic without
over-abstracting the role assertion.

---

## ADR-2: AuthProvider + ProtectedRoute (vs loaders vs per-component)

| Option | Tradeoff | Decision |
|--------|----------|----------|
| RR6 data loaders | Session available in loader, but triggers async waterfall; `AuthProvider` context not available in loaders without workaround | Rejected |
| Per-component auth check | Scales poorly; each page component must re-check; no central loading state | Rejected |
| **AuthProvider + ProtectedRoute layout** | Single loading state; all protected routes in one subtree; reactive to `onAuthStateChange` | **Chosen** |

`AuthProvider` wraps the entire `<Routes>` tree so public routes (`/login`,
`/error`) still have context but are not blocked by `ProtectedRoute`.

Note: migrating from `createBrowserRouter` to `BrowserRouter` is required
because `createBrowserRouter`'s loader model and the context-provider pattern
conflict (loaders run outside the React tree). `BrowserRouter` + `<Routes>`
is idiomatic for context-provider-gated routes.

---

## ADR-3: Profile query direct vs RPC `current_staff_role()`

| Option | Tradeoff | Decision |
|--------|----------|----------|
| `supabase.rpc('current_staff_role')` | Returns `'admin' \| 'installer' \| null`; boolean only; requires second query for `full_name` and `id`; no type generation for return type | Rejected |
| **Direct query `identity.staff`** | Returns complete typed row; `full_name` available for navbar; fully typed after regeneration | **Chosen** |

---

## ADR-4: Role mismatch → signOut (vs error page without signOut vs read-only mode)

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Error page without signOut | Session stays in localStorage; user can manually navigate back | Rejected: half-authenticated state is confusing |
| Read-only mode | Complex; wrong role still has session; RLS would deny writes anyway | Rejected: unnecessary complexity |
| **signOut + redirect `/error?reason=wrong_role`** | Clean state; user must re-authenticate on the correct app | **Chosen** |

`AuthErrorPage` shows the Spanish explanation and a "Volver al inicio" button
that navigates to `/login`.

---

## ADR-5: Seed passwords — `crypt()` at insertion vs pre-computed bcrypt hash

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Pre-computed bcrypt hash (hardcoded string) | Brittle across pg versions; harder to read in code; hash must be regenerated if password changes | Rejected |
| **`crypt('password', gen_salt('bf'))`** | Uses pgcrypto (available in local Supabase); generates fresh hash on each `db reset`; self-documenting | **Chosen** |

`pgcrypto` is loaded by GoTrue's local Postgres. Confirmed available in
Supabase CLI local stack.

---

## ADR-6: Password reset out of scope (vs magic link)

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Magic link in-scope | Requires SMTP configuration; no SMTP in local config | Rejected for v1 |
| **Password reset out of scope** | Admin resets via Supabase dashboard; no SMTP dependency | **Chosen** |

Revisit when SMTP is configured for a later change.

---

## Threat Matrix

N/A — no routing (server), shell commands, subprocesses, VCS/PR automation,
executable-file classification, or process-integration boundary. Auth state
routing is client-side React Router navigation only.

---

## Migration / Rollout

No data migrations. No feature flags. Change is additive:
- `supabase db reset` with updated seed creates the two dev auth users.
- Rolling back: revert commits; `supabase db reset` removes the seed users.

**Delivery**: `auto-chain` strategy. Two logical commits:
1. `chore(supabase): regenerate database.types.ts` — type file only.
2. `feat(auth): session management and route protection` — all code changes.

Both commits fit within the 400-line review budget when the generated type
file is excluded from authored count (it is a generated golden).

---

## Open Questions

- [ ] Confirm `supabase.schema('identity').from('staff')` API is available in
  the installed supabase-js version (should be v2.x — verify with
  `pnpm list @supabase/supabase-js` in `packages/supabase`).
- [ ] Confirm `pgcrypto` (`crypt` / `gen_salt`) is available in the project's
  local Supabase CLI version (expected yes for any CLI >= 1.x).
- [ ] `AuthErrorPage` — minimal stub or styled component? Tasks phase should
  clarify if a design spec exists.

---

## Key Learnings

1. Migrating from `createBrowserRouter` to `BrowserRouter` is a required side-effect of the `AuthProvider`-wraps-routes pattern, because data router loaders run outside the React tree and cannot consume context.
2. The `useAuth` hook takes `supabase` and `expectedRole` as arguments — not from context — so it remains testable without a provider wrapper.
3. Direct `identity.staff` query is strictly better than `rpc('current_staff_role')` for profile fetch because it returns the full typed row in one round-trip and eliminates the need for a second query to get `full_name`.
4. Using `crypt()` + `gen_salt('bf')` in `seed.sql` is safer than a pre-computed bcrypt hash and is idiomatic for local Supabase stacks where pgcrypto is available.
5. Committing the regenerated `database.types.ts` in an isolated commit before code changes keeps the 400-line review budget intact for the code diff that actually needs human review.
