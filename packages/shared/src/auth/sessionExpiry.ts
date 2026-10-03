/**
 * Global "your session expired" handling.
 *
 * A Supabase access token can stop being valid while a tab is open: the
 * refresh failed (laptop asleep past the refresh window, refresh token
 * revoked, user deleted). Every query/mutation then fails with an auth error
 * and, before this module, each screen showed its own generic error while
 * the app kept pretending the user was signed in.
 *
 * `createSessionExpiredHandler` is wired into `createQueryClient`'s
 * `onAuthError` in both apps. On the first auth error it signs out locally
 * and does a full-page replace to `/error?reason=session_expired`, which
 * `AuthErrorPage` already renders ("Tu sesión expiró…").
 *
 * ## Loop safety
 *   - fires at most once per page load (`handling` latch);
 *   - never fires while already on `/login` or `/error`;
 *   - the local sign-out clears the stored session before the reload, so the
 *     reloaded page boots anonymous and issues no authenticated request that
 *     could 401 again.
 */

import { isPostgrestError } from '../errors/parseSupabaseError';
import { httpStatusOf } from '../errors/redactError';
import { logger } from '../logger/logger';
import { AuthErrorCode } from './types';

/**
 * PostgREST JWT errors:
 *   PGRST301 — JWT could not be decoded / invalid signature
 *   PGRST302 — anonymous access disabled (request arrived without a JWT)
 *   PGRST303 — JWT claims validation failed (typically `exp`: "JWT expired")
 * GoTrue (`AuthApiError.code`) equivalents for a dead session.
 */
const AUTH_ERROR_CODES = new Set([
  'PGRST301',
  'PGRST302',
  'PGRST303',
  'bad_jwt',
  'session_expired',
  'session_not_found',
  'refresh_token_not_found',
  'refresh_token_already_used',
]);

const JWT_MESSAGE = /\bjwt expired\b|\binvalid jwt\b|\bjwt (is )?(malformed|invalid)\b/i;

/**
 * True when `error` means "the session is no longer valid" — as opposed to an
 * authorization denial for a valid session (`42501` RLS / `403`), which must
 * stay a per-screen error and never sign the user out.
 */
export function isAuthSessionError(error: unknown): boolean {
  if (httpStatusOf(error) === 401) return true;
  if (isPostgrestError(error) && AUTH_ERROR_CODES.has(error.code)) return true;
  if (typeof error === 'object' && error !== null) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && JWT_MESSAGE.test(message)) return true;
  }
  return false;
}

export interface SessionExpiredHandlerOptions {
  /** Clears the stored session. Use `supabase.auth.signOut({ scope: 'local' })`. */
  signOut: () => Promise<unknown>;
  /** Router basename / Vite `BASE_URL` (e.g. `/Vitalock/admin/`). Default `/`. */
  basePath?: string;
  /** Navigation side effect. Defaults to `window.location.replace`. */
  redirect?: (url: string) => void;
  /** Current pathname. Defaults to `window.location.pathname`. */
  currentPath?: () => string;
}

const AUTH_ROUTES = new Set(['/login', '/error']);

function stripTrailingSlash(path: string): string {
  return path.endsWith('/') ? path.slice(0, -1) : path;
}

export function createSessionExpiredHandler({
  signOut,
  basePath = '/',
  redirect = (url) => window.location.replace(url),
  currentPath = () => window.location.pathname,
}: SessionExpiredHandlerOptions): (error: unknown) => void {
  const base = stripTrailingSlash(basePath);
  const log = logger('auth:session');
  let handling = false;

  return (error) => {
    if (handling || !isAuthSessionError(error)) return;

    const path = currentPath();
    const appPath = base && path.startsWith(base) ? path.slice(base.length) || '/' : path;
    if (AUTH_ROUTES.has(stripTrailingSlash(appPath))) return;

    handling = true;
    log.warn('session expired, signing out');
    const target = `${base}/error?reason=${AuthErrorCode.SESSION_EXPIRED}`;
    void signOut()
      .catch(() => undefined)
      .finally(() => redirect(target));
  };
}
