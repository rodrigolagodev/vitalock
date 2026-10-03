/**
 * Vendor-neutral error-reporting facade (phase 2b — Sentry).
 *
 * Every error that should reach the error tracker goes through this module:
 * the error boundaries, the window-level handlers, the QueryClient caches and
 * the `errorReportingSink` log sink. Nothing else imports the vendor SDK.
 *
 * ## Why the SDK is lazy-loaded
 *
 * `@sentry/react` costs ~20–30 kB gzip. The installer PWA has ~15 kB of
 * initial-bundle headroom, so the SDK lives in its own chunk that is only
 * fetched when a DSN is configured. Captures that happen before the chunk
 * arrives are queued (bounded) and flushed once it loads. Builds without a
 * DSN (local dev, tests, e2e) never fetch the chunk and every call is a no-op.
 *
 * ## Double-reporting
 *
 * Call sites that capture directly (`reportError`) also log through the
 * shared logger so the console / endpoint sinks keep working. Those log
 * payloads are tagged with a non-enumerable `REPORTED` marker so the
 * `errorReportingSink` skips them. On top of that, every captured error
 * object is remembered in a `WeakSet` and never sent twice.
 */

import { logger } from '../logger/logger';
import { isNetworkError, isPostgrestError } from '../errors/parseSupabaseError';
import { redactError, redactText } from '../errors/redactError';
import { isAuthSessionError } from '../auth/sessionExpiry';

/** Non-PII identity attached to reports: staff id + role, never name/email. */
export interface ReportingUser {
  id: string;
  role: string;
}

export interface CaptureContext {
  /** Where the error was caught, e.g. `admin:query`. Sent as a tag. */
  source: string;
  /** Extra structured context. Scrubbed again in `beforeSend`. */
  extra?: Record<string, unknown>;
  /** Extra tags (bounded vocabulary only — no ids, no free text). */
  tags?: Record<string, string>;
}

/** What the lazily-loaded vendor adapter must implement. */
export interface ReportingClient {
  captureException: (error: Error, context: CaptureContext) => void;
  captureMessage: (message: string, context: CaptureContext) => void;
  setUser: (user: ReportingUser | null) => void;
}

export interface ReportingClientConfig {
  dsn: string;
  environment: string;
  release?: string;
  app: string;
}

export interface ErrorReportingOptions {
  /** Unset / empty → reporting stays disabled and every call is a no-op. */
  dsn?: string;
  /** Vite `import.meta.env.MODE`. */
  environment: string;
  /** Build identifier (git SHA). Must match the sourcemap upload release. */
  release?: string;
  /** `admin` | `installer`. Sent as a tag on every event. */
  app: string;
  /** Injectable for tests. Defaults to the lazily-imported Sentry adapter. */
  loadClient?: (config: ReportingClientConfig) => Promise<ReportingClient>;
}

/** Marks a log payload as already captured — the reporting sink skips it. */
export const REPORTED: unique symbol = Symbol.for('vitalock.error-reporting.reported');

/** Captures queued while the SDK chunk loads. Older entries are dropped. */
const MAX_PENDING = 20;

type Pending = (client: ReportingClient) => void;

let enabled = false;
let client: ReportingClient | null = null;
let pending: Pending[] = [];
let currentUser: ReportingUser | null = null;
let reported = new WeakSet();

async function defaultLoadClient(config: ReportingClientConfig): Promise<ReportingClient> {
  const { createSentryClient } = await import('./sentryClient');
  return createSentryClient(config);
}

function run(action: Pending): void {
  if (!enabled) return;
  try {
    if (client) action(client);
    else {
      pending.push(action);
      if (pending.length > MAX_PENDING) pending.splice(0, pending.length - MAX_PENDING);
    }
  } catch {
    // Reporting must never break the app.
  }
}

/**
 * Initialise error reporting once per page load. Resolves `true` when a client
 * is active, `false` when disabled (no DSN) or the SDK failed to load.
 */
export async function initErrorReporting(options: ErrorReportingOptions): Promise<boolean> {
  if (enabled) return client !== null;
  const dsn = options.dsn?.trim();
  if (!dsn) return false;

  enabled = true;
  const load = options.loadClient ?? defaultLoadClient;
  try {
    const loaded = await load({
      dsn,
      environment: options.environment,
      release: options.release || undefined,
      app: options.app,
    });
    client = loaded;
    loaded.setUser(currentUser);
    const queued = pending;
    pending = [];
    for (const action of queued) {
      try {
        action(loaded);
      } catch {
        // Ignore: one bad capture must not drop the rest.
      }
    }
    return true;
  } catch {
    // Chunk failed to load (offline, CSP): degrade to the other sinks.
    enabled = false;
    pending = [];
    return false;
  }
}

export function isErrorReportingEnabled(): boolean {
  return enabled;
}

/**
 * Errors that are expected operating conditions, not bugs: offline / flaky
 * connectivity (field technicians) and an expired session (handled by the
 * session-expiry flow). They are still logged, just not sent to the tracker.
 */
export function shouldReportError(error: unknown): boolean {
  if (error === null || error === undefined) return false;
  if (isNetworkError(error)) return false;
  if (isAuthSessionError(error)) return false;
  return true;
}

/**
 * Turns any thrown value into an `Error` the tracker can group. Supabase /
 * PostgREST error *objects* are rebuilt from the redacted descriptor so
 * `details` / `hint` (which carry row values) never reach the SDK's
 * "non-error exception" serializer.
 */
export function toReportableError(error: unknown): Error {
  if (error instanceof Error && !isPostgrestError(error)) return error;
  const redacted = redactError(error);
  const out = new Error(redacted.message ?? 'Non-error value thrown');
  out.name = redacted.code
    ? `PostgrestError ${redacted.code}`
    : (redacted.name ?? 'NonErrorThrown');
  if (error instanceof Error && error.stack) out.stack = error.stack;
  return out;
}

/** Send one error to the tracker. No-op when disabled or already sent. */
export function captureError(error: unknown, context: CaptureContext): void {
  if (!enabled) return;
  if (typeof error === 'object' && error !== null) {
    if (reported.has(error)) return;
    reported.add(error);
  }
  const reportable = toReportableError(error);
  const code = redactError(error).code;
  const ctx: CaptureContext = code ? { ...context, tags: { ...context.tags, code } } : context;
  run((c) => c.captureException(reportable, ctx));
}

/** Send a non-exception error log line (no `Error` object available). */
export function captureErrorMessage(message: string, context: CaptureContext): void {
  run((c) => c.captureMessage(redactText(message), context));
}

/** Staff id + role only. `null` on sign-out. */
export function setErrorReportingUser(user: ReportingUser | null): void {
  const next = user ? { id: user.id, role: user.role } : null;
  if (currentUser?.id === next?.id && currentUser?.role === next?.role) return;
  currentUser = next;
  run((c) => c.setUser(next));
}

/** Returns `payload` tagged so `errorReportingSink` will not re-capture it. */
export function markReported<T extends object>(payload: T): T {
  Object.defineProperty(payload, REPORTED, { value: true, enumerable: false });
  return payload;
}

export function isMarkedReported(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as Record<symbol, unknown>)[REPORTED] === true
  );
}

/**
 * The one-liner call sites use: log (redacted, through every sink) and
 * capture (raw error, so the tracker gets the real stack) exactly once.
 */
export function reportError(
  tag: string,
  message: string,
  error: unknown,
  extra: Record<string, unknown> = {},
): void {
  logger(tag).error(message, markReported({ ...extra, error: redactError(error) }));
  if (shouldReportError(error)) captureError(error, { source: tag, extra: { message, ...extra } });
}

/** Test-only: restore the pristine module state. */
export function resetErrorReportingForTests(): void {
  enabled = false;
  client = null;
  pending = [];
  currentUser = null;
  reported = new WeakSet();
}
