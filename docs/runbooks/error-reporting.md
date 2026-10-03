# Error reporting (Sentry)

Both apps report client-side errors to Sentry (org `rodrigo-lago`, US region). Only errors are sent: no tracing, no Session Replay.

| App       | Sentry project       | DSN secret (GitHub)         |
| --------- | -------------------- | --------------------------- |
| admin     | `vitalock-admin`     | `VITE_SENTRY_DSN_ADMIN`     |
| installer | `vitalock-installer` | `VITE_SENTRY_DSN_INSTALLER` |

## Where errors come from

All capture paths go through `packages/shared/src/reporting/` (`reportError` / `captureError`). This is the only code that loads the SDK.

- **Render errors:** `AppErrorBoundary`, at the root and per route.
- **Uncaught errors / unhandled rejections:** `registerGlobalErrorHandlers`. Sentry's own global handlers are off, so these errors are not reported twice.
- **Query / mutation failures:** the `createQueryClient` cache handlers. Only the first two query-key segments are sent.
- **Any other `logger(tag).error(...)`:** `errorReportingSink`.

Each error is captured only once. Payloads that `reportError` already captured are marked, so the sink skips them. Every error object is also tracked in a `WeakSet`. Expected conditions are logged but not sent: offline/network failures and expired sessions (401, `JWT expired`).

## PII

- The user context is the staff `id` plus a `role` tag. Name, username and email are never sent.
- SDK v11 removed `sendDefaultPii`, so the client uses `dataCollection` instead. Cookies, headers, bodies, query params, frame variables and automatic user info are all disabled.
- `beforeSend` runs the logger's redaction (`redactText`, `sanitizeArg`). Emails, JWTs, UUIDs, long digit runs and Postgres `Key (col)=(value)` details are scrubbed. URLs lose their query string and fragment. Console breadcrumbs are dropped.
- PostgREST error objects are rebuilt from `redactError`, so `details` and `hint` never leave the browser.
- Recommended in Sentry project settings: **Security & Privacy → Prevent Storing of IP Addresses**.

## Environment variables

| Variable            | Where               | Purpose                                                                                          |
| ------------------- | ------------------- | ------------------------------------------------------------------------------------------------ |
| `VITE_SENTRY_DSN`   | build env (per app) | Optional. If unset, reporting is a no-op and the SDK chunk is never fetched (local, tests, e2e). |
| `VITE_RELEASE`      | build env           | Release id. CI sets it to `github.sha`; `vite.config.ts` falls back to `GITHUB_SHA`.             |
| `SENTRY_AUTH_TOKEN` | build env (secret)  | Enables `@sentry/vite-plugin` sourcemap upload. If unset, nothing is uploaded.                   |

Every variable is validated in `loadClientEnv` (`packages/shared/src/env.ts`). An empty string counts as unset.

## Releases and sourcemaps

1. `pages.yml` builds with `VITE_RELEASE=${{ github.sha }}` and the per-app DSN.
2. Vite emits `sourcemap: 'hidden'` maps, so the bundle never references them.
3. When `SENTRY_AUTH_TOKEN` is set, `@sentry/vite-plugin` injects debug IDs and uploads the maps to the app's project under the same release. It then deletes `dist/**/*.map`.
4. As a backstop, `pages.yml` still deletes any `*.map` before publishing. Maps are never served.

The SDK reports `release` = the same SHA, so stack traces resolve against the uploaded maps.

## Bundle and CSP

- The SDK is lazy-loaded. `vendor-sentry` (about 26 kB gzip) is fetched only when a DSN is set, and the initial bundle grows by about 1 kB. Errors raised while the chunk loads are queued.
- The total gzip budgets were raised to cover that lazy chunk (admin 330 → 370, installer 200 → 240). The initial budgets are unchanged.
- The production CSP `connect-src` adds the DSN's ingest origin, and only when `VITE_SENTRY_DSN` is set at build time.

## Verifying in production

Run this in DevTools on the deployed app:

```js
setTimeout(() => {
  throw new Error('sentry smoke test');
});
```

The event should show up in the app's Sentry project, tagged with `app`, `source=<app>:global` and the release SHA. Its stack trace should be de-minified.
