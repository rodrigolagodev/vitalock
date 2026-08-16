# Vitalock

Vitalock is a monorepo hosting the **admin SPA**, **mobile installer PWA**, shared UI/data/config packages, and the Supabase project. No domain features live here yet — this is the foundational scaffold.

---

## Prerequisites

- **Node 20+** (managed via `.nvmrc`; use `nvm use` or `fnm use`)
- **pnpm 9+** — `corepack enable && corepack prepare pnpm@9.12.0 --activate`
- **Supabase CLI** (optional) — for local dev and type generation: <https://supabase.com/docs/guides/cli>

---

## Quick start

```bash
# 1. Copy env example for each app (fill in real values)
cp .env.example apps/admin/.env.local
cp .env.example apps/installer/.env.local

# 2. Install all workspace dependencies
pnpm install

# 3. Start both apps in parallel via Turbo
pnpm dev
```

---

## Monorepo layout

```
Vitalock/
├── apps/
│   ├── admin/          # Vite + React 18 SPA (desktop-first)
│   └── installer/      # Vite + React 18 PWA (mobile-first)
├── packages/
│   ├── ui/             # Tailwind preset, cn() util, shared components
│   ├── supabase/       # Typed Supabase client factory + generated types
│   ├── shared/         # Zod env loaders, domain types, cross-app utilities
│   ├── config-typescript/  # Shared tsconfig bases
│   └── config-eslint/      # Shared ESLint flat configs
├── scripts/
│   └── gen-types.sh    # Supabase type generation
├── supabase/           # Supabase CLI project (pre-existing)
└── ...
```

---

## Common commands

| Command | Description |
|---|---|
| `pnpm dev` | Start all apps in dev mode (Turbo) |
| `pnpm build` | Production build for all apps |
| `pnpm test` | Run all Vitest suites |
| `pnpm lint` | ESLint across all workspaces |
| `pnpm typecheck` | TypeScript check across all workspaces |
| `pnpm format` | Prettier format all files |
| `pnpm gen:types` | Generate Supabase database types |
| `pnpm test:sql` | Run every `supabase/tests-sql/*.sql` against the local stack (uses `DATABASE_URL` env, defaults to local) |

---

## Environment variables

| Variable | Scope | Description |
|---|---|---|
| `VITE_SUPABASE_URL` | Client (Vite apps) | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Client (Vite apps) | Supabase anon/public key |
| `SUPABASE_URL` | Server | Supabase project URL (no Vite prefix) |
| `SUPABASE_ANON_KEY` | Server | Supabase anon key (no Vite prefix) |

> **Fail-fast**: the Zod env loader (`@vitalock/shared`) throws an `EnvValidationError` at boot if any required variable is absent or malformed. The error message names the missing field explicitly.

Set per-app in `.env.local` (Vite convention, gitignored). See `.env.example` for the template.

---

## Supabase

- See `supabase/README.md` and `supabase/FLOWS.md` for schema and local dev workflows.
- **Type generation**: with the local stack running (`cd supabase && supabase start`), run `pnpm gen:types` at root. This overwrites `packages/supabase/src/database.types.ts` and the file is committed.

---

## Design tokens

Colors, radii, and semantic surface families live in `packages/ui/globals.css`
and are exposed through the shared Tailwind preset. See
[`packages/ui/DESIGN_TOKENS.md`](packages/ui/DESIGN_TOKENS.md) for the full
map and the rules for adding or changing a token. **Never inline hex values
in components — always compose the semantic classes.**

---

## PWA (installer only)

`apps/installer` is a PWA built with `vite-plugin-pwa` (auto-update strategy,
service worker, manifest, offline runtime cache for Supabase reads). The
service worker is intentionally disabled in dev (`devOptions.enabled: false`
in `apps/installer/vite.config.ts`) — validate offline behavior against a
production build (`pnpm --filter installer build && pnpm --filter installer preview`).

`apps/admin` is a plain SPA (no service worker) — the desktop workflow does
not need offline support.

---

## Adding shadcn components

```bash
# Inside an app directory
cd apps/admin
pnpm dlx shadcn@latest add <component-name>
```

Components install into `apps/<app>/src/components/ui/`. Once a primitive is used in both apps, consider promoting it to `packages/ui/src/components/`.

---

## Troubleshooting

- **Env validation error on start**: check that `.env.local` exists for the app and contains `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
- **`pnpm gen:types` fails**: ensure the Supabase local stack is running (`cd supabase && supabase start`).
- **PWA not working in dev**: intentional — `devOptions.enabled: false` in `apps/installer/vite.config.ts`. The service worker is only active in production builds.
