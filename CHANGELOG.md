# Changelog

All notable changes to this repository are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow
[SemVer](https://semver.org/). Every workspace shares one version.

## [0.1.0] — 2026-09-10

First versioned release. Closes the enterprise-readiness audit
(`docs/architecture/ENTERPRISE-READINESS-PLAN.md`) phases 0–4 and most of 5.

### Security

- **RLS enabled on `public.rfid_key_intended_equipment`** — it was fully exposed to the anon key (`20260910100000`).
- **Authorization guards on all 22 business RPCs.** `SECURITY DEFINER` functions were anon-callable with no role check, bypassing RLS entirely. Each is now a guarded wrapper (`identity.require_admin` / `require_staff`) delegating to a revoked `_unguarded` inner function (`20260910110000`).
- **Audit actor derived server-side.** `p_actor_staff_id` from API clients is ignored in favour of the session's staff id; the parameter stays for one release.
- Pinned `search_path` on `change_key_status` (the one SECURITY DEFINER RPC without it).
- **`anon` cannot execute any SECURITY DEFINER function; `authenticated` can execute exactly the guarded ones** (detected by body — a new RPC without a guard is unreachable until it has one) (`20260911100000`).
- Convention documented in `supabase/README.md` § Authorization convention.
- Applied to production 2026-09-11. Live advisors: `rls_disabled_in_public` and `anon_security_definer_function_executable` cleared.

### Fixed

- **Free maintenance visits could not be created**: the row-level `CHECK (unit_price > 0)` contradicted `allow_zero_price_for_maintenance`. The CHECK now encodes the rule per item type (`20260910120000`).
- **18 of 49 pgTAP tests were failing** against the current schema (stale taxonomy after `ticket-taxonomy-cleanup`, missing `product_id` on install items, removed standalone-install path). All 54 files pass.
- Unhandled promise rejections on 24 cache invalidations; async handlers in React attributes are now the only exempt position.
- `no-unused-*` violations (16 dead `import React`, phantom generic, unused types).

### Added

- **pgTAP in CI** (`supabase-checks.yml`, `pages.yml` `verify-sql`): the 54-file SQL suite gates PRs and production deploys.
- **Error boundaries** (root + per route) and a **reporting log sink** (`VITE_ERROR_REPORTING_ENDPOINT`); shared `createQueryClient` with retry policy and central error logging.
- **Bundle budgets** (`apps/*/bundle-budget.json`, `scripts/check-bundle-size.mjs`) gated in CI; route-level code splitting and vendor chunking.
- **Type-aware ESLint** (`strictTypeChecked`, floating/misused promises) and **workspace import boundaries** (`@vitalock/config-eslint/boundaries`).
- **Generated schema reference** `supabase/SCHEMA.md` (`pnpm gen:schema-doc`), checked for drift in CI.
- **Playwright** journeys (`pnpm e2e`, `.github/workflows/e2e.yml`).
- Coverage floors per workspace with a ratchet policy; `pre-push` hook; CODEOWNERS; PR and issue templates.
- `Separator` and `ErrorFallback` in `@vitalock/ui`; `useMdbDownload` in `@vitalock/shared`.
- Covering indexes for 8 unindexed foreign keys (`20260910130000`).
- pgTAP: `test_130`–`test_134` (RLS, RPC guards, actor identity, terminal triggers, zero-price rule).

### Changed

- `packages/ui`, `packages/shared`, `packages/supabase` are `sideEffects: false` (installer initial bundle −15 kB gzip).
- Query keys have one home per app (`src/lib/queryKeys.ts`); inline literals fail lint. Installer keys are prefixed.
- `useStaff` delegates to `usePersonal` (one cache entry, one invalidation).
- Supabase RPC wrappers are typed against the generated `Database` type; `as unknown as` casts in production code 79 → 24, the remainder documented.
- CI runs `turbo` with a restored cache; `packages/ui` and `packages/shared` are actually checked; production deploys require lint + typecheck + test + pgTAP + bundle budget.
- OpenSpec: `equipment-update-bundle-flow` archived (delta merged into `specs/equipment-updates`); duplicate `terminal-state-immutability` folder removed.

### Known follow-ups

- Phase 4.5 (shared Zod domain schemas) resolves the remaining 11 `status: string → union` casts.
- Phase 5.1: split `KeyOrderForm`, `TechnicalOrderForm`, `TareaFormSheet`, `TaskDetailPage` into container + presentational pairs.
- ESLint ratchet targets: `no-unnecessary-condition`, `no-non-null-assertion`.
- `admin-collapsible-sidebar` OpenSpec change awaits manual verification.
