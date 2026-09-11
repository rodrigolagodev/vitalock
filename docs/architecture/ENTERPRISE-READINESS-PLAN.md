# Vitalock — Enterprise Readiness: Audit & Remediation Plan

**Date:** 2026-09-09
**Scope:** `apps/admin`, `apps/installer`, `packages/*`, `supabase/*`, `.github/workflows`
**Baseline:** commit `bd56c57`, ~48k LOC TS/TSX, 125 Vitest files, 49 pgTAP files, 29 DB tables, 5 schemas
**Live project cross-checked:** `lhzvvcmqjlsrfgchlvry` (vitalock, ca-central-1, ACTIVE_HEALTHY)

---

## 1. Verdict

Vitalock is **a well-modelled product sitting on an unguarded backend**.

The domain model is genuinely good: five schemas with clear ownership, logical deletion for legal traceability, terminal-state immutability enforced by triggers, an SDD process with 19 archived changes, a shared design system, and a disciplined error/toast layer. That is above average for a project this age.

But three structural facts disqualify it from "enterprise" today, and all three are verified against the live database, not inferred:

1. **The authorization model is decorative on the write path.** RLS is correctly designed and enabled on 28 of 29 tables — and then bypassed wholesale by 22 unguarded `SECURITY DEFINER` RPCs that any holder of the public anon key can call without a session.
2. **The tests that prove the business rules do not run.** 49 pgTAP files covering RLS, order-cancellation atomicity and constraints are wired into no workflow, no Turbo task and no hook.
3. **Production has no eyes.** Zero error boundaries, zero error reporting, no sourcemaps, no bundle budget, and a deploy workflow that ships to production on `build` alone.

Everything else in this document is secondary to those three.

---

## 2. What is already right (do not regress it)

| Area                            | Evidence                                                                                                                               |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Domain modelling                | 5 schemas, 29 tables, logical deletion, `supabase/FLOWS.md` permission matrix                                                          |
| Terminal-state invariants in DB | `supabase/migrations/20260901170000_add_terminal_immutability_triggers.sql:32-97` — 3 `BEFORE UPDATE` triggers                         |
| Error/toast single source       | `packages/shared/src/errors/toastMutationError.ts` + `parseSupabaseError.ts`, 57 call sites                                            |
| Auth hook quality               | `packages/shared/src/auth/useAuth.test.ts:1-272` — real `NO_STAFF_ROW` / `INACTIVE_STAFF` / `NETWORK_ERROR` / session-restore coverage |
| Design system boundary          | `packages/ui` with `DataTable`, `ErrorState`, `EmptyState`, `StatCard`, `createStatusHelpers`                                          |
| Batched reads                   | `use*ByIds` hooks; **no N+1 hook-in-loop pattern found anywhere**                                                                      |
| Dependency hygiene              | No version drift on `typescript`, `eslint`, `vite`, `vitest`, `zod`, `@tanstack/react-query`; lockfile committed; no moment/lodash     |
| Build hardening                 | CSP injection plugin active in prod; SRI plugin disabled _with documented rationale_ (`apps/admin/vite.config.ts:35-81`)               |
| TS baseline                     | `strict: true` + `noUncheckedIndexedAccess: true` (`packages/config-typescript/base.json:9-10`)                                        |
| Process                         | SDD/OpenSpec with 19 archived changes and baseline capability specs                                                                    |

---

## 3. Findings

### P0 — CRITICAL (security; fix before any production traffic)

#### P0-1 · `public.rfid_key_intended_equipment` has no RLS and is granted to `anon`

- Table created at `supabase/migrations/20260831000000_baseline.sql:5369`.
- `GRANT ALL ... TO "anon"` at `:8118`; `authenticated` at `:8119`.
- **No `ENABLE ROW LEVEL SECURITY` for this table anywhere.** The baseline enables RLS 28 times; this table is not among them.
- **Live confirmation:** advisor `rls_disabled_in_public`, level **ERROR**, count 1 — _"Table `public.rfid_key_intended_equipment` is public, but RLS has not been enabled."_

Anyone with the anon key — shipped in every client bundle — can read, insert, update and delete the key↔equipment intent mapping, unauthenticated.

#### P0-2 · 22 business RPCs are `SECURITY DEFINER`, `anon`-executable, and perform no authorization check

- Only **2** of 42 `SECURITY DEFINER` functions check a role: `create_product_with_initial_stock` (`baseline.sql:1683`) and `create_stock_movement` (`:1743`). Repo-wide `is_admin()`/`is_installer()` in function bodies: **2 hits**.
- Blanket grant: `ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";` at `:8289`. **Zero `REVOKE` statements exist in any migration.**
- **Live confirmation:** advisor `anon_security_definer_function_executable`, count **40**. Filtering out trigger/helper functions leaves **22 unguarded business RPCs**:

  `cancel_key_order`, `cancel_technical_order`, `confirm_key_order`, `confirm_technical_order`,
  `create_key_order_with_items`, `create_technical_order_with_items`,
  `update_draft_key_order_with_items`, `update_draft_technical_order_with_items`,
  `configure_key_order_item`, `configure_technical_ticket_equipment`,
  `mark_key_order_invoiced`, `mark_technical_order_invoiced`, `mark_key_order_item_installed`,
  `record_order_key_pickup`, `request_key_disable`, `cancel_key_disable`, `change_key_status`,
  `create_equipment_update`, `resolve_equipment_update`, `resolve_equipment_installation`,
  `resolve_equipment_replacement`, `resolve_ticket`

**Why this nullifies the RLS design.** `key_orders`, `technical_orders`, `*_items`, `particulares`, `products`, `stock_movements` and all `sales.*` tables carry a single `admin_all_*` policy — installer has no direct row access by design. But `SECURITY DEFINER` runs as the function owner and bypasses RLS by definition. So the exact tables RLS was built to protect are freely mutable through the RPC surface, by an installer _or by no one at all_.

An unauthenticated `POST /rest/v1/rpc/cancel_key_order` with the public anon key and a UUID cancels an order.

#### P0-3 · `public.change_key_status` is `SECURITY DEFINER` with a mutable `search_path`

- `baseline.sql:783-784` — `LANGUAGE "plpgsql" SECURITY DEFINER`, no `SET search_path` in the definition (verified by direct read of `783-845`).
- This contradicts the repo's own hardening claim at `baseline.sql:58`: _"every SECURITY DEFINER function in public/operations/sales/support now runs with a fixed schema list."_
- Combined with P0-2 (anon-callable) this is a live privilege-escalation vector.
- Live advisor `function_search_path_mutable`: 47 functions (the other 46 are trigger functions — lower severity, same fix).

#### P0-4 · Audit trail is forgeable — actor identity is client-supplied

- `p_actor_staff_id` is an optional caller parameter on `change_key_status`, `resolve_ticket`, `request_key_disable`, `cancel_key_disable`, `create_equipment_update`, `resolve_equipment_update`, `record_order_key_pickup` and more.
- The client passes it straight through: `apps/admin/src/hooks/useMutateKey.ts:81,139`; `packages/supabase/src/rpc/tickets.ts:31,58,77`; `resolveEquipmentUpdate.ts:19`; `requestKeyDisable.ts:15`; `cancelKeyDisable.ts:15`.
- No RPC asserts `p_actor_staff_id = identity.current_staff_id()`. Any caller can attribute any action to any staff member in `key_events` / `identity.audit_log`.

For a system whose stated purpose includes _legal traceability_, an audit log the caller can write freely is worse than no audit log — it manufactures false confidence.

#### P0-5 · Role gating exists only in the client

- `packages/shared/src/auth/useAuth.ts:93-105` — the `profile.role !== expectedRole → signOut()` check is the **only** thing separating admin from installer.
- Nothing server-side stops an authenticated installer JWT from calling admin RPCs directly. Given P0-2, nothing stops `anon` either.

---

### P1 — HIGH (correctness & release safety)

| ID    | Finding                                                                                                                                                                                                                                                                                                                      | Evidence                                                                                                                                                                                                       |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1-1  | **49 pgTAP tests gate nothing.** `test:sql` appears in no workflow, no `turbo.json` task, no husky hook. RLS enforcement, order-cancellation atomicity and constraint tests only run if a human remembers.                                                                                                                   | `packages/supabase/package.json:26-27`; `.github/workflows/supabase-checks.yml:24-31` runs `lint`/`typecheck`/`test` only                                                                                      |
| P1-2  | **`packages/ui` and `packages/shared` are never checked by CI.** Both appear in `paths:` filters, so changes _trigger_ workflows — which then run only `--filter @vitalock/admin` / `--filter @vitalock/installer`. Their 16 test files are invisible to CI.                                                                 | `admin-checks.yml:6-10` vs `:40,43,46`                                                                                                                                                                         |
| P1-3  | **Production deploys with no test gate.** `pages.yml` fires on every push to `main` and runs only the two `build` commands. No lint, no typecheck, no test.                                                                                                                                                                  | `.github/workflows/pages.yml:3-6, 40, 45, 63`                                                                                                                                                                  |
| P1-4  | **Zero error boundaries repo-wide.** No `ErrorBoundary`, `componentDidCatch` or `getDerivedStateFromError` anywhere. Any render exception white-screens the whole SPA.                                                                                                                                                       | verified absent across `apps/`, `packages/`                                                                                                                                                                    |
| P1-5  | **No error reporting.** No Sentry/Bugsnag/Rollbar. The `logger` abstraction exists (`packages/shared/src/logger/logger.ts:1-65`) but has **2 call sites total**, both in installer; admin has zero. Combined with `build.sourcemap` absent, production crashes are invisible _and_ unsymbolicated.                           | —                                                                                                                                                                                                              |
| P1-6  | **79 `as unknown as` casts**, concentrated at the Supabase RPC boundary — the codebase routes _around_ `no-explicit-any: error` rather than typing the boundary. Worst: `useEquipmentById.ts` (9), `rpc/tickets.ts` (7), `rpc/technicalOrders.ts` / `keyOrders.ts` / `createEquipmentUpdate.ts` / `useWorklist.ts` (4 each). | `packages/config-eslint/base.js:20`                                                                                                                                                                            |
| P1-7  | **`no-floating-promises` is documented but never wired.** `base.js:22-24` says it's "enabled per-project where a tsconfig with project is configured" — no `parserOptions.project` / `projectService` exists in any eslint config. In a Supabase-RPC-heavy async codebase, unawaited promises are uncaught by lint.          | —                                                                                                                                                                                                              |
| P1-8  | **`QueryClient` has zero configuration** in both apps: no `retry`, `staleTime`, `gcTime`, and no `QueryCache`/`MutationCache` global error handler. Error surfacing is hand-repeated per hook across 30+ files.                                                                                                              | `apps/admin/src/main.tsx:38`; `apps/installer/src/main.tsx:20`                                                                                                                                                 |
| P1-9  | **Signed-URL logic duplicated 3× across 2 apps, bypassing the hook layer.** Identical `supabase.storage.from('equipment-updates-mdb').createSignedUrl(...)` inline in components/routes.                                                                                                                                     | `apps/installer/src/routes/TaskDetailPage.tsx:135,148`; `apps/installer/src/components/work/EquipmentUpdateResolveDetail.tsx:91,104`; `apps/admin/src/components/equipment/EquipmentUpdateHistoryPanel.tsx:37` |
| P1-10 | **`useStaff` and `usePersonal` query the same `identity.staff` table under two different keys**, forcing every staff mutation to double-invalidate.                                                                                                                                                                          | `useMutateStaff.ts:32-35`                                                                                                                                                                                      |
| P1-11 | **`packages/ui` boundary is convention-only.** `apps/installer/src/components/ui/{popover,skeleton}.tsx` reimplement `packages/ui/src/index.ts:62,73`, pulling `@radix-ui/react-popover` as a direct installer dep. No lint rule would ever flag it.                                                                         | `apps/installer/package.json:16-17`                                                                                                                                                                            |
| P1-12 | **`supabase/FLOWS.md` — the 1693-line "Specification for App Development" — is drifted.** Zero mentions of `key_orders`, `technical_orders`, `technical_order_items`, `stock_movements`, which appear 62/53/62/61 times in the baseline. Four core business tables absent from the onboarding contract.                      | —                                                                                                                                                                                                              |

---

### P2 — MEDIUM (quality, scale, maintainability)

| ID    | Finding                                                                                                                                                                                                                                                                              | Evidence                                        |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------- |
| P2-1  | No coverage thresholds anywhere; `--passWithNoTests` means an empty workspace passes silently.                                                                                                                                                                                       | `vitest.config.ts:11`; `apps/*/package.json:10` |
| P2-2  | RLS pgTAP coverage is thin: only 3 files actually role-switch. 15+ of 28 RLS tables have no direct policy assertion — including all of `sales.*`, `identity.staff`, `public.administrations`, `rfid_keys`.                                                                           | `test_112`, `test_121`, `test_125`              |
| P2-3  | The 3 terminal-immutability triggers have **no pgTAP test**. Existing tests assert the older in-RPC guard (`*_TERMINAL_STATE`), not the trigger codes (`*_TERMINAL`). A raw table UPDATE bypassing the RPC is untested.                                                              | `test_103:156`, `test_106:178`                  |
| P2-4  | 8 FK columns lack a covering index (`identity.audit_log.actor_id`, `public.key_events.actor_staff_id`, `key_order_items.{pickup_particular_id,produced_key_id,unit_id}`, `key_orders.pickup_particular_id`, `support.equipment_updates.{created_by_staff_id,resolved_by_staff_id}`). | live advisor `unindexed_foreign_keys`           |
| P2-5  | 17+ ad-hoc `queryKey` literals bypass `lib/queryKeys.ts`. `['admin','tarea',id]` is duplicated across 4 invalidation sites; `usePendingKeysForEquipment.ts:21` omits the `'admin'` prefix entirely. Installer's factory has no app prefix at all.                                    | —                                               |
| P2-6  | Domain status enums redefined instead of imported — `'active'\|'maintenance'\|'dead'` duplicated in `useMutateEquipment.ts:23` and `EquipmentFormSheet.tsx:117`, while `lib/status/*` establishes the canonical pattern for other entities.                                          | —                                               |
| P2-7  | 19 files each define their own inline `z.object(...)`. No shared domain-schema layer; `packages/shared` has exactly one Zod schema (env validation).                                                                                                                                 | —                                               |
| P2-8  | No import-boundary lint (`eslint-plugin-boundaries` / `no-restricted-imports`). Nothing stops `packages/ui` importing app code. ESLint uses `recommended`, not `strict-type-checked`. `no-unused-vars` at `warn`.                                                                    | `packages/config-eslint/base.js:12,19`          |
| P2-9  | Project references are decorative: root `tsconfig.json:3-9` lists 5 projects, all `composite: true`, none reference each other; `ui`/`shared`/`supabase` have **no `build` script**, so `turbo.json`'s `dependsOn: ["^build"]` silently no-ops.                                      | —                                               |
| P2-10 | Turbo cache unused in CI — workflows call `pnpm --filter` directly, never `turbo run`. No remote cache, no `.turbo` cache step.                                                                                                                                                      | `.github/workflows/*`                           |
| P2-11 | Pre-commit runs `prettier --write` only. No pre-push hook. All enforcement lives in CI, which has the gaps above.                                                                                                                                                                    | `.husky/pre-commit:1`                           |
| P2-12 | Three SDD changes dangling in `openspec/changes/` (`admin-collapsible-sidebar`, `equipment-update-bundle-flow`, `terminal-state-immutability`), the last duplicating its own archive entry.                                                                                          | —                                               |
| P2-13 | No versioning/changelog — every `package.json` pinned at `0.0.0`, no changesets, no `CHANGELOG.md`.                                                                                                                                                                                  | —                                               |
| P2-14 | `auth_leaked_password_protection` disabled; `minimum_password_length = 6`.                                                                                                                                                                                                           | live advisor; `supabase/config.toml:182`        |
| P2-15 | 14 tables carry multiple permissive policies evaluated per row per query. Correct, but adds policy-evaluation overhead.                                                                                                                                                              | live advisor                                    |
| P2-16 | No MSW, no shared Supabase mock. Each of 92 admin test files reimplements its own client chain-mock — a client-shape change touches N files.                                                                                                                                         | —                                               |

---

### P3 — LOW (polish / track for scale)

- No code-splitting: zero `React.lazy` / `Suspense`; 20+ admin routes ship as one bundle.
- No bundle budget or analyzer; no `manualChunks`; no production sourcemaps.
- No i18n layer — UI copy is hardcoded Spanish inline throughout.
- No virtualization; pagination substitutes (acceptable at current row counts).
- 71 unused indexes (expected on a low-traffic project; revisit post-launch).
- No `CODEOWNERS`, PR template, or issue templates.
- `README.md:9` says Node 20+; `package.json:6` requires 22. `VITE_BASE_PATH` undocumented.
- Dead file `apps/admin/src/routes/index.tsx` duplicating inline `main.tsx` logic.
- Two pages use ad-hoc error markup instead of `ErrorState`: `TechnicalOrderEditarPage.tsx:36`, `KeyOrderEditarPage.tsx:36`.
- `main.tsx` boot sequence near-identical across both apps, never extracted.

---

## 4. Remediation plan

Sequenced by leverage, not by area. Each phase is independently shippable.

### Phase 0 — Close the front door (1 migration + 1 workflow edit)

> Nothing else matters while an unauthenticated caller can cancel orders.

| #   | Task                                                                                                                                                                                                                                                                    | Deliverable                                                             |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| 0.1 | Wire `test:sql` into `supabase-checks.yml` **first**, so every subsequent DB change is gated. Add a `test:sql` task to `turbo.json`.                                                                                                                                    | CI job running 49 pgTAP files against a service-container Postgres      |
| 0.2 | Write failing pgTAP tests for P0-1..P0-5: anon `SELECT` on `rfid_key_intended_equipment` returns 0 rows; anon `rpc(cancel_key_order)` raises `insufficient_privilege`; installer JWT cannot call admin RPCs; `p_actor_staff_id` mismatch is rejected. **Red first.**    | `test_130_rpc_authorization.sql`, `test_131_rls_intended_equipment.sql` |
| 0.3 | Migration `enable_rls_rfid_key_intended_equipment` — `ENABLE ROW LEVEL SECURITY` + policies mirroring `rfid_keys` (admin all, installer read scoped by building).                                                                                                       | 1 migration                                                             |
| 0.4 | Migration `harden_security_definer_rpcs` — add `identity.is_admin()` / `identity.is_installer()` guards to all 22 business RPCs, per the pattern at `baseline.sql:1683`. In-function checks, **not** `REVOKE`-only: several RPCs legitimately serve the installer app.  | 1 migration                                                             |
| 0.5 | In the same migration, derive the actor server-side: `v_actor := identity.current_staff_id()`. Keep `p_actor_staff_id` in the signature for one release but **ignore it**, then drop it. Update `packages/supabase/src/rpc/*` and `useMutateKey.ts` to stop sending it. | migration + RPC wrapper cleanup                                         |
| 0.6 | Add `SET search_path` to `change_key_status` and to the 46 trigger functions.                                                                                                                                                                                           | 1 migration                                                             |
| 0.7 | Enable leaked-password protection; raise `minimum_password_length` to 12.                                                                                                                                                                                               | Supabase Auth settings + `config.toml`                                  |

**Exit criterion:** live `get_advisors(security)` returns zero ERROR and zero `anon_security_definer_function_executable` for business RPCs; the new pgTAP tests pass in CI.

### Phase 1 — Make CI tell the truth

| #   | Task                                                                                                                                                               |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1.1 | Add `ui-shared-checks.yml`, or extend the existing workflows to run `--filter @vitalock/ui` and `--filter @vitalock/shared`. Their 16 test files must gate merges. |
| 1.2 | Gate `pages.yml` behind the check workflows (`workflow_run` on success, or inline lint/typecheck/test jobs with `needs:`). No deploy on `build` alone.             |
| 1.3 | Switch CI to `turbo run <task>` with remote cache (`TURBO_TOKEN`/`TURBO_TEAM`) so `dependsOn: ["^build"]` is actually enforced and CI stops rebuilding everything. |
| 1.4 | Add `build` scripts to `ui`/`shared`/`supabase`, wire real project references, and make `tsc -b` meaningful.                                                       |
| 1.5 | Coverage thresholds in the root `vitest.config.ts` — start at current measured levels, ratchet up. Drop `--passWithNoTests`.                                       |
| 1.6 | Add `pre-push` hook running `turbo run typecheck lint` on affected packages.                                                                                       |
| 1.7 | Mark all checks required on `main` in GitHub branch protection (currently only documented in `AGENTS.md:151-157`).                                                 |

### Phase 2 — Give production eyes

| #   | Task                                                                                                                                                                                     |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2.1 | `AppErrorBoundary` in `packages/shared` — route-level and root-level, rendering `packages/ui`'s `ErrorState` with a reset action. Wire into both apps.                                   |
| 2.2 | Error reporting sink: implement a `LogSink` that forwards to Sentry (or a webhook if you want zero vendor). Hook the boundary, `QueryCache.onError` and `MutationCache.onError` into it. |
| 2.3 | Enable `build.sourcemap: 'hidden'` and upload sourcemaps to the reporter — do not serve them publicly.                                                                                   |
| 2.4 | Shared `createQueryClient()` in `packages/shared` with deliberate `retry` (no retry on 4xx), `staleTime`, `gcTime`, and global cache error handlers. Both apps consume it.               |
| 2.5 | Adopt `logger` in `apps/admin` (currently zero call sites) at mutation and auth boundaries.                                                                                              |

### Phase 3 — Type the boundary, enforce the boundaries

| #   | Task                                                                                                                                                                                                                                                     |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 3.1 | Eliminate the 79 `as unknown as` casts by typing the RPC layer against generated `Database['public']['Functions']` types. Start with `rpc/tickets.ts` (7) and `useEquipmentById.ts` (9). Add a lint rule banning `as unknown as` once the count is zero. |
| 3.2 | Wire `parserOptions.projectService` into `packages/config-eslint` and turn on `no-floating-promises`, `no-misused-promises`, `await-thenable`. Move to `strict-type-checked`.                                                                            |
| 3.3 | Add `eslint-plugin-boundaries` (or `no-restricted-imports`) enforcing: apps may not import each other; `packages/*` may not import `apps/*`; apps may not reimplement `packages/ui` primitives.                                                          |
| 3.4 | Delete `apps/installer/src/components/ui/{popover,skeleton}.tsx`; import from `@vitalock/ui`; promote `separator` **into** `packages/ui`; drop the two direct Radix deps.                                                                                |
| 3.5 | Promote `no-unused-vars` to `error`; add `noUnusedLocals`/`noUnusedParameters` to the tsconfig base.                                                                                                                                                     |

### Phase 4 — Consolidate the data layer

| #   | Task                                                                                                                                                                                                      |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 4.1 | Make `lib/queryKeys.ts` the only source of query keys in both apps. Add the missing `tareaKey` factory. Prefix installer keys. Add a lint rule banning inline `queryKey: [` literals outside the factory. |
| 4.2 | Collapse `useStaff` / `usePersonal` into one hook over `identity.staff`; remove the double invalidation.                                                                                                  |
| 4.3 | Extract `useSignedMdbUrl()` into `packages/shared`; delete the 3 inline `supabase.storage` call sites.                                                                                                    |
| 4.4 | Single source of truth for domain enums: derive status unions from the generated DB enums, re-export through `lib/status/*`, delete the redefinitions.                                                    |
| 4.5 | Shared Zod domain schemas in `packages/shared/src/schemas/`, derived from DB types where possible; forms consume them instead of 19 inline definitions.                                                   |
| 4.6 | Introduce MSW + a shared Supabase mock factory in `packages/shared/src/test/`; migrate the heaviest test files off ad-hoc `vi.mock` chains.                                                               |

### Phase 5 — Decompose, split, document

| #   | Task                                                                                                                                                                                                                                                                                                                       |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 5.1 | Split the four worst containers into container + presentational pairs: `KeyOrderForm.tsx` (788), `TechnicalOrderForm.tsx` (772), `TareaFormSheet.tsx` (615), `TaskDetailPage.tsx` (420). Data hooks move to the container; the form becomes a pure props-driven component — and becomes testable without mocking Supabase. |
| 5.2 | Route-level `React.lazy` + `Suspense` with the existing `Skeleton` as fallback. Add `manualChunks` for the React/Radix/Query vendor split.                                                                                                                                                                                 |
| 5.3 | Add `rollup-plugin-visualizer` + a `size-limit` budget gate in CI.                                                                                                                                                                                                                                                         |
| 5.4 | Rewrite `supabase/FLOWS.md` to cover `key_orders`, `technical_orders`, `technical_order_items`, `stock_movements` — or generate the schema section from the DB so it cannot drift again.                                                                                                                                   |
| 5.5 | Close or archive the 3 dangling OpenSpec changes; remove the duplicated `terminal-state-immutability` folder.                                                                                                                                                                                                              |
| 5.6 | Add `CODEOWNERS`, PR template, `CHANGELOG.md` + changesets, and real package versions.                                                                                                                                                                                                                                     |
| 5.7 | Add the 8 missing FK indexes; consolidate the 14 multiple-permissive-policy pairs into single `OR` policies.                                                                                                                                                                                                               |
| 5.8 | Introduce Playwright for the four documented critical journeys (create administration+building, create stock items, full installation order, key order). E2E is the only layer that would have caught the auth gaps end-to-end.                                                                                            |

---

## 5. What I would deliberately _not_ do

- **Do not add an i18n layer yet.** Single market, single language, one contributor. It would add friction to every string with no current payoff. Revisit at second-market.
- **Do not virtualize tables.** Pagination is already in place and row counts are small. Measure before adding a dependency.
- **Do not chase the 71 unused indexes.** They are unused because there is no traffic. Re-run the advisor after a month of production use.
- **Do not adopt micro-frontends, DDD folder rewrites, or a full hexagonal refactor.** The current technical layering (routes / components / hooks / lib) is coherent and consistently applied. The problems are at the _boundaries_ — auth, types, CI — not in the folder structure. Rewriting the structure would burn weeks and fix none of the P0s.
- **Do not fix P2/P3 before Phase 0 and Phase 1.** Every one of them is cosmetic next to an anon-callable `cancel_key_order`.

---

## 6. Suggested sequencing as OpenSpec changes

| Change                           | Phase   | Risk     | Delivery                    |
| -------------------------------- | ------- | -------- | --------------------------- |
| `sql-tests-in-ci`                | 0.1     | low      | single-pr                   |
| `rpc-authorization-hardening`    | 0.2–0.6 | **high** | single-pr, `size:exception` |
| `auth-password-policy`           | 0.7     | low      | single-pr                   |
| `ci-coverage-gaps`               | 1.1–1.7 | medium   | single-pr                   |
| `production-observability`       | 2.1–2.5 | medium   | single-pr                   |
| `rpc-type-safety`                | 3.1     | medium   | chained-pr                  |
| `lint-boundaries`                | 3.2–3.5 | low      | single-pr                   |
| `query-layer-consolidation`      | 4.1–4.6 | medium   | chained-pr                  |
| `container-presentational-split` | 5.1     | medium   | chained-pr                  |
| `bundle-optimization`            | 5.2–5.3 | low      | single-pr                   |
| `docs-and-process-cleanup`       | 5.4–5.6 | low      | single-pr                   |
| `db-index-and-policy-tuning`     | 5.7     | low      | single-pr                   |
| `e2e-critical-journeys`          | 5.8     | low      | chained-pr                  |

`rpc-authorization-hardening` is the one change that genuinely warrants full SDD treatment: it touches 22 functions, changes an audit-trail contract, and has a real breaking-change surface for the installer app.

---

## 7. Execution status (2026-09-10)

Verified gate at the end of execution: `pnpm typecheck` 8/8 · `pnpm lint` 5/5, zero warnings · `pnpm test` 1000 tests across 5 workspaces, coverage floors met · `pnpm test:sql` 54 files / 215 assertions · `pnpm size` both apps within budget. Local Supabase reset from scratch with all 11 migrations.

| Phase | Item                                     | Status                                                                                                                                                                                                          | Where                                                                                                                            |
| ----- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| 0     | 0.1 pgTAP in CI                          | ✅                                                                                                                                                                                                              | `supabase-checks.yml` `test-sql`, `pages.yml` `verify-sql`, `turbo.json`                                                         |
| 0     | 0.2 red-first tests                      | ✅                                                                                                                                                                                                              | `tests-sql/test_130…134`                                                                                                         |
| 0     | 0.3 RLS on `rfid_key_intended_equipment` | ✅ **applied to prod 2026-09-11**                                                                                                                                                                               | `20260910100000`                                                                                                                 |
| 0     | 0.4 guards on 22 RPCs                    | ✅ **applied to prod 2026-09-11**; plus `20260911100000` closes anon EXECUTE on every SECURITY DEFINER                                                                                                          | `20260910110000` — rename + wrapper, bodies untouched                                                                            |
| 0     | 0.5 server-derived actor                 | ✅                                                                                                                                                                                                              | `identity.effective_actor`                                                                                                       |
| 0     | 0.6 search_path                          | ✅ for the one SECURITY DEFINER RPC; 46 trigger fns left as-is (not client-callable)                                                                                                                            | —                                                                                                                                |
| 0     | 0.7 password policy                      | ⏳ Dashboard → Authentication → Sign In / Providers → Email: min length 12 + all character classes. **Leaked-password protection (HIBP) requires the Pro plan** — the advisor WARN stays until the plan changes | dashboard                                                                                                                        |
| 1     | 1.1–1.7                                  | ✅                                                                                                                                                                                                              | workflows, `turbo.json`, coverage floors, `pre-push`, CODEOWNERS/templates. Branch protection (1.7) is a GitHub setting — manual |
| 2     | 2.1–2.5                                  | ✅                                                                                                                                                                                                              | `packages/shared/src/{errors,query,logger/sinks}`, both `main.tsx`, `components/common/BoundaryFallbacks.tsx`                    |
| 3     | 3.1 RPC typing                           | ✅ rpc layer; casts 79 → 24 in prod code, remainder documented                                                                                                                                                  | `packages/supabase/src/types`                                                                                                    |
| 3     | 3.2 type-aware lint                      | ✅ `strictTypeChecked` + promise rules; 5 rules off with written rationale                                                                                                                                      | `config-eslint/base.js`                                                                                                          |
| 3     | 3.3 boundaries                           | ✅                                                                                                                                                                                                              | `config-eslint/boundaries.js`                                                                                                    |
| 3     | 3.4 ui duplicates                        | ✅                                                                                                                                                                                                              | `Separator` promoted; installer Radix deps removed                                                                               |
| 3     | 3.5 unused → error                       | ✅                                                                                                                                                                                                              | tsconfig base + eslint                                                                                                           |
| 4     | 4.1 query keys                           | ✅ + lint rule                                                                                                                                                                                                  | `lib/queryKeys.ts`, `react.js`                                                                                                   |
| 4     | 4.2 staff hooks                          | ✅                                                                                                                                                                                                              | `useStaff` → `usePersonal`                                                                                                       |
| 4     | 4.3 signed URL hook                      | ✅                                                                                                                                                                                                              | `shared/src/storage`                                                                                                             |
| 4     | 4.4 enums                                | ✅                                                                                                                                                                                                              | `lib/status/*` (DB uses CHECK, not enums — this is the source)                                                                   |
| 4     | 4.5 shared Zod schemas                   | ⏳                                                                                                                                                                                                              | resolves the 11 remaining `status: string → union` casts                                                                         |
| 4     | 4.6 MSW                                  | ⏳                                                                                                                                                                                                              | —                                                                                                                                |
| 5     | 5.1 container split                      | ⏳                                                                                                                                                                                                              | deliberately last: highest regression risk, needs browser verification                                                           |
| 5     | 5.2 lazy routes + chunks                 | ✅                                                                                                                                                                                                              | `routes/lazy.ts`, `vendorChunk`, `sideEffects:false`                                                                             |
| 5     | 5.3 bundle budget                        | ✅                                                                                                                                                                                                              | `scripts/check-bundle-size.mjs`, `bundle-budget.json`                                                                            |
| 5     | 5.4 FLOWS.md                             | ✅ structural                                                                                                                                                                                                   | generated `supabase/SCHEMA.md` + CI drift check + banner; narrative not rewritten                                                |
| 5     | 5.5 OpenSpec cleanup                     | ✅                                                                                                                                                                                                              | 1 archived (delta merged), 1 duplicate removed, `admin-collapsible-sidebar` left open (manual verification pending)              |
| 5     | 5.6 changelog                            | ✅ `CHANGELOG.md`; changesets tooling skipped (single committer)                                                                                                                                                | —                                                                                                                                |
| 5     | 5.7 FK indexes                           | ✅ ; policy consolidation deliberately skipped                                                                                                                                                                  | `20260910130000`                                                                                                                 |
| 5     | 5.8 Playwright                           | ✅ scaffold + auth/navigation journeys + `e2e.yml` (not a required check yet)                                                                                                                                   | `e2e/`, `playwright.config.ts`                                                                                                   |

### Found during execution (not in the original audit)

- **18 of 49 pgTAP tests were already failing** before any change — fixtures used the pre-`ticket-taxonomy-cleanup` taxonomy. Nobody knew because the suite never ran in CI. Fixed.
- **Free maintenance visits could not be created** — `CHECK (unit_price > 0)` contradicted migration `20260901150000`. Fixed with `20260910120000` + `test_134`.
- **Turbo cached lint across shared-config changes** — `packages/config-eslint/**` was not an input. Fixed via `globalDependencies`.
- 9 of the 12 casts in `useEquipmentById`/`useKeyById` were unnecessary (flat selects infer correctly); the other 3 were real and are now Zod-validated.
- `eslint --fix` for `no-unnecessary-type-assertion` removes `as HTMLInputElement` casts tsc needs in Testing Library tests. Rule disabled for tests.

### Applied in production (2026-09-11)

Migration history had drifted (`20260902004113` applied via MCP with the same content as local `20260901180000`); reconciled with `migration repair` (reverted the orphan, marked the local file applied), then `supabase db push` ×2. Live `get_advisors(security)` after: **0 ERROR**; `anon_security_definer_function_executable` **cleared**; `authenticated_…` lists exactly the 24 guarded RPCs + 7 `identity` helpers. Remaining: `function_search_path_mutable` on 46 trigger/internal functions (deliberate) and `auth_leaked_password_protection` (dashboard setting).
