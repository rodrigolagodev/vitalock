/**
 * PII hygiene for anything that leaves the browser (reporting sink, remote
 * logs). Supabase/PostgREST errors are NOT safe to forward verbatim:
 *
 *   - `details` on a `23505` carries the offending row values, e.g.
 *     `Key (email)=(vecino@example.com) already exists.`
 *   - `hint` frequently echoes column values too.
 *   - `message` on a `P0001` is a `RAISE EXCEPTION` string that may embed ids.
 *
 * `parseSupabaseError.ts` exposes `code`, `message`, `details` and `hint`
 * (`PostgrestErrorLike`). This module keeps only the two fields that are
 * bounded server-side vocabulary — `code` (SQLSTATE / PostgREST code) and a
 * scrubbed, truncated `message` — and drops `details` / `hint` entirely.
 */

import { isNetworkError, isPostgrestError } from './parseSupabaseError';

/** Messages longer than this are truncated; stack traces are never included. */
const MESSAGE_MAX_LENGTH = 200;

/** Ordered scrubbers. Applied to every string that may reach the network. */
const SCRUBBERS: Array<[pattern: RegExp, replacement: string]> = [
  // JWT / bearer tokens (supabase access tokens start with `eyJ`).
  [/\beyJ[\w-]+\.[\w-]+\.[\w-]*/g, '[token]'],
  [/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[email]'],
  [/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '[uuid]'],
  // Postgres constraint detail shape: `Key (col)=(value) already exists.`
  [/\)=\([^)]*\)/g, ')=([redacted])'],
  // Long digit runs: phone numbers, document numbers, serials.
  [/\b\d{6,}\b/g, '[num]'],
];

/**
 * Scrub and truncate a free-form string. Idempotent — running it twice on
 * the same value yields the same result.
 */
export function redactText(value: string, maxLength = MESSAGE_MAX_LENGTH): string {
  let out = value;
  for (const [pattern, replacement] of SCRUBBERS) {
    out = out.replace(pattern, replacement);
  }
  return out.length > maxLength ? `${out.slice(0, maxLength)}…` : out;
}

export interface RedactedError {
  /** Coarse bucket, mirroring `parseSupabaseError`'s `ParsedErrorKind`. */
  kind: 'network' | 'postgrest' | 'error' | 'unknown';
  /** SQLSTATE (`23505`) or PostgREST code (`PGRST116`). Bounded vocabulary. */
  code?: string;
  /** Constructor name (`TypeError`, `AuthApiError`). */
  name?: string;
  /** HTTP status when the error carries one (supabase `AuthError`). */
  status?: number;
  /** Scrubbed + truncated message. Never `details` / `hint`. */
  message?: string;
}

/** Reads a numeric `status` off an error-like value, if present. */
export function httpStatusOf(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const status = (error as Record<string, unknown>).status;
  return typeof status === 'number' ? status : undefined;
}

/**
 * Reduce any thrown value to a small, PII-scrubbed descriptor safe to POST to
 * an error-reporting endpoint.
 */
export function redactError(error: unknown): RedactedError {
  const status = httpStatusOf(error);

  if (error instanceof Error) {
    const base: RedactedError = {
      kind: isNetworkError(error) ? 'network' : isPostgrestError(error) ? 'postgrest' : 'error',
      name: error.name,
      message: redactText(error.message),
    };
    if (isPostgrestError(error)) base.code = error.code;
    if (status !== undefined) base.status = status;
    return base;
  }

  if (isNetworkError(error)) {
    const message =
      typeof error === 'object' &&
      error !== null &&
      typeof (error as { message?: unknown }).message === 'string'
        ? redactText((error as { message: string }).message)
        : undefined;
    const out: RedactedError = { kind: 'network' };
    if (message !== undefined) out.message = message;
    if (status !== undefined) out.status = status;
    return out;
  }

  if (isPostgrestError(error)) {
    const out: RedactedError = {
      kind: 'postgrest',
      code: error.code,
      message: typeof error.message === 'string' ? redactText(error.message) : undefined,
    };
    if (status !== undefined) out.status = status;
    return out;
  }

  if (typeof error === 'string') {
    return { kind: 'unknown', message: redactText(error) };
  }

  return { kind: 'unknown' };
}
