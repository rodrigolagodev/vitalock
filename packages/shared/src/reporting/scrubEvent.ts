/**
 * `beforeSend` / `beforeBreadcrumb` scrubbing for the error tracker.
 *
 * Reuses the logger's redaction (`redactText`, `sanitizeArg`) so the tracker
 * and the endpoint sink apply the same PII policy: no emails, JWTs, UUIDs,
 * long digit runs or Postgres `Key (col)=(value)` details leave the browser.
 *
 * Typed structurally (not against `@sentry/*` types) so this module stays in
 * the main bundle without pulling the SDK in, and is unit-testable alone.
 */

import { redactText } from '../errors/redactError';
import { sanitizeArg } from '../logger/sinks/reportingSink';

/** Exception messages get more room than log lines; stacks are separate. */
const EXCEPTION_VALUE_MAX = 500;

interface ScrubbableUser {
  id?: string | number;
  [key: string]: unknown;
}

export interface ScrubbableBreadcrumb {
  message?: string;
  data?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface ScrubbableEvent {
  message?: string;
  exception?: { values?: Array<{ value?: string; [key: string]: unknown }> };
  breadcrumbs?: ScrubbableBreadcrumb[];
  request?: { url?: string; headers?: Record<string, string>; [key: string]: unknown };
  user?: ScrubbableUser;
  extra?: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * Drop query string and fragment (Supabase REST filters such as
 * `?email=eq.x` live there), then scrub the path (ids in route segments).
 */
export function scrubUrl(raw: string): string {
  const cut = raw.split(/[?#]/, 1)[0] ?? '';
  return redactText(cut, 300);
}

export function scrubBreadcrumb<T extends ScrubbableBreadcrumb>(crumb: T): T | null {
  // Console breadcrumbs echo arbitrary log arguments; never forward them.
  if (crumb.category === 'console') return null;
  const out: T = { ...crumb };
  if (typeof out.message === 'string') out.message = redactText(out.message);
  if (out.data) {
    const data: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(out.data)) {
      if (key === 'url' || key === 'from' || key === 'to') {
        data[key] = typeof value === 'string' ? scrubUrl(value) : value;
      } else if (key === 'method' || key === 'status_code') {
        data[key] = value;
      }
      // Anything else (request bodies, arguments) is dropped.
    }
    out.data = data;
  }
  return out;
}

export function scrubEvent<T extends ScrubbableEvent>(event: T): T {
  if (typeof event.message === 'string') event.message = redactText(event.message);

  for (const value of event.exception?.values ?? []) {
    if (typeof value.value === 'string') value.value = redactText(value.value, EXCEPTION_VALUE_MAX);
  }

  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs
      .map((crumb) => scrubBreadcrumb(crumb))
      .filter((crumb): crumb is ScrubbableBreadcrumb => crumb !== null);
  }

  if (event.request) {
    const userAgent = event.request.headers?.['User-Agent'];
    event.request = {
      ...(event.request.url ? { url: scrubUrl(event.request.url) } : {}),
      ...(userAgent ? { headers: { 'User-Agent': userAgent } } : {}),
    };
  }

  // Only the opaque staff id survives — never email, username, name or IP.
  if (event.user) {
    const id = event.user.id;
    if (id === undefined) delete event.user;
    else event.user = { id };
  }

  if (event.extra) {
    const extra: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(event.extra)) extra[key] = sanitizeArg(value);
    event.extra = extra;
  }

  return event;
}
