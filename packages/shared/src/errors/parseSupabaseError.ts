/**
 * Shape of a PostgREST/Supabase error object (both auth and data plane).
 * `code` is the SQLSTATE for db errors, or a PostgREST-specific string
 * (e.g. `PGRST116`) for API-level errors.
 */
export interface PostgrestErrorLike {
  code: string;
  message: string;
  details?: string | null;
  hint?: string | null;
}

export function isPostgrestError(err: unknown): err is PostgrestErrorLike {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    typeof (err as Record<string, unknown>).code === 'string'
  );
}

/**
 * Broad heuristic for connectivity failures: fetch-level exceptions
 * (TypeError from undici/native fetch), aborts (timeouts, offline),
 * and anything whose message hints at network/timeout/fetch.
 *
 * Keeps `Failed to fetch` (chromium), `NetworkError when attempting to fetch`
 * (firefox), and `The operation was aborted` (abort/timeouts) all in one bucket.
 */
export function isNetworkError(err: unknown): boolean {
  if (err instanceof TypeError) return true;
  if (err instanceof DOMException && err.name === 'AbortError') return true;
  if (
    typeof err === 'object' &&
    err !== null &&
    'message' in err &&
    typeof (err as Record<string, unknown>).message === 'string'
  ) {
    const msg = (err as { message: string }).message.toLowerCase();
    return (
      msg.includes('network') ||
      msg.includes('timeout') ||
      msg.includes('fetch') ||
      msg.includes('failed to fetch')
    );
  }
  return false;
}

/**
 * Categorize an unknown error into a coarse kind. Callers decide the
 * localized string per surface (admin vs installer, page vs toast).
 */
export type ParsedErrorKind =
  | { kind: 'network' }
  | { kind: 'postgrest'; error: PostgrestErrorLike }
  | { kind: 'unknown'; error: unknown };

export function parseSupabaseError(err: unknown): ParsedErrorKind {
  if (isNetworkError(err)) return { kind: 'network' };
  if (isPostgrestError(err)) return { kind: 'postgrest', error: err };
  return { kind: 'unknown', error: err };
}
