/**
 * Shared `QueryClient` factory (P1-8).
 *
 * Both apps previously did `new QueryClient()` with zero configuration: no
 * `retry` policy (so a `42501` RLS denial was retried three times before the
 * user saw anything), no `staleTime`, no `gcTime`, and no global cache error
 * handler — every hook hand-repeated its own `onError`.
 *
 * ## Relationship with `toastMutationError` — no double-toasting
 *
 * `errors/toastMutationError.ts` is the *user-facing* channel: 30+ mutation
 * hooks call it from their own `onError` to show one localized Spanish toast
 * with hook-specific `extraHandlers`. That stays exactly as it is.
 *
 * The cache handlers below are the *operator-facing* channel: they only
 * `logger(...).error(...)`. They never toast. Splitting it this way means:
 *   - the user still gets the precise, per-hook message (the cache handler has
 *     no idea which `extraHandlers` applied), and
 *   - `apps/admin`, which had zero `logger` call sites, gets error reporting
 *     across all of its hooks without touching a single one of them.
 */

import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import type { DefaultOptions } from '@tanstack/react-query';
import { isNetworkError, isPostgrestError } from '../errors/parseSupabaseError';
import { httpStatusOf, redactError } from '../errors/redactError';
import { logger } from '../logger/logger';

/** Retries after the initial attempt. 2 → at most 3 requests total. */
export const MAX_QUERY_RETRIES = 2;

/**
 * Queries are considered fresh for 30s.
 *
 * Rationale: a Vitalock admin page mounts many hooks over the same entities
 * (a detail page + its StatCards + its tables), so `staleTime: 0` produced a
 * burst of duplicate requests on every mount and on every window focus.
 * 30s collapses that burst while staying short enough that an operational
 * board (orders, tickets, stock) is never meaningfully behind — these rows
 * change on human timescales, and every mutation invalidates explicitly.
 */
export const DEFAULT_STALE_TIME_MS = 30_000;

/**
 * Inactive cache entries are dropped after 5 minutes (TanStack's own default,
 * kept deliberately rather than by accident).
 *
 * Rationale: long back-and-forth navigation (list → detail → back) stays
 * instant, but a long-lived admin session — these tabs stay open all day —
 * does not accumulate every list it ever visited.
 */
export const DEFAULT_GC_TIME_MS = 5 * 60_000;

/**
 * SQLSTATE classes that describe a transient server/connection condition and
 * are therefore worth retrying:
 *   08 — connection exception
 *   53 — insufficient resources
 *   57 — operator intervention (admin shutdown, query cancelled)
 *   58 — system error
 * Everything else (23xxx constraints, 42501 RLS denial, P0001 RAISE, PGRST116
 * no-rows) is a deterministic answer: retrying it just delays the error.
 */
const RETRYABLE_SQLSTATE_PREFIXES = ['08', '53', '57', '58'];

/** Serialization / deadlock failures: retrying is the documented remedy. */
const RETRYABLE_SQLSTATES = new Set(['40001', '40P01']);

/**
 * Retry predicate shared by every query in both apps.
 *
 * - Any HTTP 4xx → never retried. A 401/403/404/409 is the server's final
 *   answer; retrying it burns time and hides the real message.
 * - HTTP 5xx and connectivity failures → retryable.
 * - PostgREST/Postgres errors → retryable only for the transient SQLSTATE
 *   classes above.
 */
export function isRetryableError(error: unknown): boolean {
  const status = httpStatusOf(error);
  if (status !== undefined) {
    if (status >= 400 && status < 500) return false;
    if (status >= 500) return true;
  }

  if (isNetworkError(error)) return true;

  if (isPostgrestError(error)) {
    if (RETRYABLE_SQLSTATES.has(error.code)) return true;
    return RETRYABLE_SQLSTATE_PREFIXES.some((prefix) => error.code.startsWith(prefix));
  }

  // Unknown shape (often a programming error). Do not retry.
  return false;
}

/** Exponential backoff: 1s, 2s, capped at 8s. `attempt` is 0-based. */
export function retryDelayMs(attempt: number): number {
  return Math.min(1000 * 2 ** attempt, 8000);
}

export interface QueryErrorContext {
  queryKey: readonly unknown[];
}

export interface MutationErrorContext {
  mutationKey?: readonly unknown[];
}

export interface CreateQueryClientOptions {
  /** Logger tag prefix, e.g. `admin` → `admin:query` / `admin:mutation`. */
  app?: string;
  /** Merged over the shared defaults, per option group. */
  defaultOptions?: DefaultOptions;
  /** Extra hook run after the shared logging handler. Must not throw. */
  onQueryError?: (error: unknown, context: QueryErrorContext) => void;
  /** Extra hook run after the shared logging handler. Must not throw. */
  onMutationError?: (error: unknown, context: MutationErrorContext) => void;
}

/**
 * Only the first two query-key segments are reported. By convention the key
 * is `['admin', 'equipos', id, search, …]`: the head identifies *what* failed,
 * while deeper segments carry ids and free-text search terms that we do not
 * want to ship to a reporting endpoint.
 */
function queryScope(queryKey: readonly unknown[]): readonly unknown[] {
  return queryKey.slice(0, 2);
}

export function createQueryClient(options: CreateQueryClientOptions = {}): QueryClient {
  const { app, defaultOptions, onQueryError, onMutationError } = options;
  const prefix = app ? `${app}:` : '';
  const queryLog = logger(`${prefix}query`);
  const mutationLog = logger(`${prefix}mutation`);

  const queryCache = new QueryCache({
    onError: (error, query) => {
      queryLog.error('query failed', {
        scope: queryScope(query.queryKey),
        error: redactError(error),
      });
      onQueryError?.(error, { queryKey: query.queryKey });
    },
  });

  const mutationCache = new MutationCache({
    // Log only. The per-hook `onError: toastMutationError` owns the toast —
    // toasting here too would show every mutation failure twice.
    onError: (error, _variables, _context, mutation) => {
      mutationLog.error('mutation failed', {
        scope: mutation.options.mutationKey ? queryScope(mutation.options.mutationKey) : undefined,
        error: redactError(error),
      });
      onMutationError?.(error, { mutationKey: mutation.options.mutationKey });
    },
  });

  return new QueryClient({
    queryCache,
    mutationCache,
    defaultOptions: {
      ...defaultOptions,
      queries: {
        staleTime: DEFAULT_STALE_TIME_MS,
        gcTime: DEFAULT_GC_TIME_MS,
        retry: (failureCount, error) => failureCount < MAX_QUERY_RETRIES && isRetryableError(error),
        retryDelay: retryDelayMs,
        refetchOnWindowFocus: true,
        refetchOnReconnect: true,
        ...defaultOptions?.queries,
      },
      mutations: {
        // Mutations are not idempotent (create_order, record_pickup, …).
        // A blind retry could double-post; the user retries explicitly.
        retry: false,
        ...defaultOptions?.mutations,
      },
    },
  });
}
