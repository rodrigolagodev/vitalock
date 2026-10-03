/**
 * Sentry adapter. ONLY imported dynamically from `errorReporting.ts`, so the
 * SDK ships in its own lazy chunk and only when a DSN is configured.
 *
 * Errors only: no tracing, no Session Replay, no Sentry global handlers
 * (`registerGlobalErrorHandlers` already reports window errors through the
 * facade — adding `globalHandlersIntegration` would double-report).
 * A manual `BrowserClient` with an explicit integration list is used instead
 * of `Sentry.init()` so the unused default integrations tree-shake away.
 */

import {
  BrowserClient,
  breadcrumbsIntegration,
  captureException,
  captureMessage,
  dedupeIntegration,
  defaultStackParser,
  eventFiltersIntegration,
  getCurrentScope,
  httpContextIntegration,
  linkedErrorsIntegration,
  makeFetchTransport,
} from '@sentry/react';
import type { CaptureContext, ReportingClient, ReportingClientConfig } from './errorReporting';
import { scrubBreadcrumb, scrubEvent } from './scrubEvent';
import type { ScrubbableBreadcrumb, ScrubbableEvent } from './scrubEvent';

export function createSentryClient(config: ReportingClientConfig): ReportingClient {
  const client = new BrowserClient({
    dsn: config.dsn,
    environment: config.environment,
    release: config.release,
    transport: makeFetchTransport,
    stackParser: defaultStackParser,
    integrations: [
      eventFiltersIntegration(),
      dedupeIntegration(),
      linkedErrorsIntegration(),
      httpContextIntegration(),
      // Navigation + fetch crumbs only (console crumbs are not collected by this
      // integration in SDK v11; DOM crumbs are not needed for triage).
      breadcrumbsIntegration({ dom: false, xhr: false, sentry: false }),
    ],
    // `sendDefaultPii: false` equivalent in SDK v11: collect nothing personal.
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      stackFrameVariables: false,
    },
    // `scrubEvent` mutates in place; it is typed structurally so it can stay
    // out of this lazy chunk's SDK types.
    beforeSend: (event) => {
      scrubEvent(event as unknown as ScrubbableEvent);
      return event;
    },
    beforeBreadcrumb: (crumb) =>
      scrubBreadcrumb(crumb as unknown as ScrubbableBreadcrumb) as unknown as typeof crumb | null,
  });

  const scope = getCurrentScope();
  scope.setClient(client);
  scope.setTag('app', config.app);
  client.init();

  const toHint = (context: CaptureContext) => ({
    tags: { source: context.source, ...context.tags },
    extra: context.extra,
  });

  return {
    captureException: (error, context) => {
      captureException(error, toHint(context));
    },
    captureMessage: (message, context) => {
      captureMessage(message, { level: 'error', ...toHint(context) });
    },
    setUser: (user) => {
      scope.setUser(user ? { id: user.id } : null);
      scope.setTag('role', user?.role);
    },
  };
}
