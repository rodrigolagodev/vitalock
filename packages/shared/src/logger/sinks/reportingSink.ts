/**
 * Vendor-neutral error-reporting sink (P1-5).
 *
 * Batches `error`-level log events and POSTs them to a configurable endpoint.
 * Deliberately dependency-free — no Sentry, no Bugsnag — so it can ship without
 * touching any `package.json`.
 *
 * ## Swapping in Sentry later
 *
 * Nothing in the app talks to this module directly: `main.tsx` only calls
 * `addLogSink(...)`. To move to Sentry, add `@sentry/react`, then replace the
 * registration with a sink of the same `LogSink` shape:
 *
 * ```ts
 * Sentry.init({ dsn, release, tracesSampleRate: 0 });
 * addLogSink((level, tag, args) => {
 *   if (level !== 'error') return;
 *   Sentry.captureMessage(String(args[0]), {
 *     level: 'error',
 *     tags: { source: tag },
 *     extra: { payload: sanitizeArgs(args) }, // keep the scrubbing below
 *   });
 * });
 * ```
 *
 * Keep `sanitizeArgs` in the path: `redactError` is what stops a `23505`
 * `details` string (which contains row values) from leaving the browser.
 */

import type { LogLevel, LogSink } from '../logger';
import { redactError, redactText } from '../../errors/redactError';
import { isPostgrestError } from '../../errors/parseSupabaseError';

/** Env var read when no explicit `endpoint` is passed. Unset → no-op sink. */
export const REPORTING_ENDPOINT_ENV_KEY = 'VITE_ERROR_REPORTING_ENDPOINT';

const DEFAULT_LEVELS: readonly LogLevel[] = ['error'];
const DEFAULT_BATCH_SIZE = 10;
const DEFAULT_FLUSH_INTERVAL_MS = 5000;
const DEFAULT_MAX_QUEUE_SIZE = 50;

/** Depth cap for the recursive sanitizer — bounds payload size and cycles. */
const MAX_DEPTH = 3;
const MAX_ARRAY_ITEMS = 20;

export interface ReportingSinkOptions {
  /** Falls back to `import.meta.env.VITE_ERROR_REPORTING_ENDPOINT`. */
  endpoint?: string;
  /** Included in every batch envelope, e.g. `admin`. */
  app?: string;
  /** Build identifier, so a report can be tied back to a bundle. */
  release?: string;
  /** Levels forwarded. Default `['error']`. */
  levels?: readonly LogLevel[];
  /** Flush as soon as this many entries are queued. Default 10. */
  batchSize?: number;
  /** Flush a partial batch after this idle window. Default 5000ms. */
  flushIntervalMs?: number;
  /** Hard cap; oldest entries are dropped past it. Default 50. */
  maxQueueSize?: number;
  /** Injectable for tests. Defaults to `globalThis.fetch`. */
  fetchImpl?: typeof fetch;
  /** Injectable for tests. Defaults to `() => new Date().toISOString()`. */
  now?: () => string;
}

export interface ReportEntry {
  level: LogLevel;
  tag: string;
  at: string;
  payload: unknown[];
}

/** A sink that does nothing. Returned when reporting is not configured. */
export const noopSink: LogSink = () => {};

function readEnvEndpoint(): string | undefined {
  // Same access shape as `logger.ts`'s `isDev()`: `import.meta.env` does not
  // exist under plain node, so it is probed defensively.
  const env = (import.meta as unknown as { env?: Record<string, unknown> }).env;
  const value = env?.[REPORTING_ENDPOINT_ENV_KEY];
  return typeof value === 'string' && value !== '' ? value : undefined;
}

/**
 * Reduce an arbitrary log argument to something safe to serialize.
 * Errors (including Supabase/PostgREST shapes) go through `redactError`, which
 * drops `details`/`hint` and scrubs the message; free strings are scrubbed.
 */
export function sanitizeArg(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value ?? null;
  if (value instanceof Error) return redactError(value);
  if (typeof value === 'string') return redactText(value);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'function' || typeof value === 'symbol' || typeof value === 'bigint') {
    return '[unserializable]';
  }

  if (depth >= MAX_DEPTH) return '[truncated]';

  if (Array.isArray(value)) {
    return value.slice(0, MAX_ARRAY_ITEMS).map((item) => sanitizeArg(item, depth + 1));
  }

  if (typeof value === 'object') {
    // A raw Supabase error object never gets forwarded field-by-field.
    if (isPostgrestError(value)) return redactError(value);
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      out[key] = sanitizeArg(item, depth + 1);
    }
    return out;
  }

  return '[unserializable]';
}

export function sanitizeArgs(args: unknown[]): unknown[] {
  return args.map((arg) => sanitizeArg(arg));
}

/**
 * Build a batching reporting sink.
 *
 * Failure isolation: every path is wrapped so a misbehaving endpoint, a
 * serialization error or a rejected `fetch` can never propagate into the app
 * that called `logger(...).error(...)`. A failed batch is dropped, not retried
 * — an outage must not turn into an unbounded in-memory queue.
 */
export function createReportingSink(options: ReportingSinkOptions = {}): LogSink {
  const resolvedEndpoint = options.endpoint ?? readEnvEndpoint();
  if (!resolvedEndpoint) return noopSink;

  const resolvedFetch = options.fetchImpl ?? (typeof fetch === 'function' ? fetch : undefined);
  if (!resolvedFetch) return noopSink;
  // Re-bind under a narrowed type: `flush` below is a hoisted declaration, so
  // TS cannot carry the guard above into it.
  const fetchImpl: typeof fetch = resolvedFetch;
  const endpoint: string = resolvedEndpoint;

  const levels = options.levels ?? DEFAULT_LEVELS;
  const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
  const flushIntervalMs = options.flushIntervalMs ?? DEFAULT_FLUSH_INTERVAL_MS;
  const maxQueueSize = options.maxQueueSize ?? DEFAULT_MAX_QUEUE_SIZE;
  const now = options.now ?? (() => new Date().toISOString());

  const queue: ReportEntry[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;

  function clearTimer(): void {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  }

  function flush(): void {
    clearTimer();
    if (queue.length === 0) return;
    const entries = queue.splice(0, queue.length);

    try {
      const result = fetchImpl(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          app: options.app,
          release: options.release,
          sentAt: now(),
          entries,
        }),
        // Survives an unload-triggered flush.
        keepalive: true,
      });
      // Never let a rejected request surface as an unhandled rejection.
      void Promise.resolve(result).catch(() => {});
    } catch {
      // Dropped on purpose: reporting must never break the app.
    }
  }

  function schedule(): void {
    if (timer !== null) return;
    timer = setTimeout(flush, flushIntervalMs);
    // Node/vitest: do not hold the process open on a pending report.
    (timer as unknown as { unref?: () => void }).unref?.();
  }

  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('pagehide', flush);
  }

  return (level, tag, args) => {
    try {
      if (!levels.includes(level)) return;

      queue.push({ level, tag, at: now(), payload: sanitizeArgs(args) });
      if (queue.length > maxQueueSize) queue.splice(0, queue.length - maxQueueSize);

      if (queue.length >= batchSize) flush();
      else schedule();
    } catch {
      // A sink that throws would break `logger()` for every other sink.
    }
  };
}
