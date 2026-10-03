/**
 * Window-level safety net for errors nothing else catches.
 *
 * `AppErrorBoundary` only sees errors thrown while React renders. Errors in
 * event handlers, timers and un-awaited promises (`void doThing()`) bypass it
 * and, before this, only reached the browser console — never the reporting
 * sink. This forwards both `error` and `unhandledrejection` through
 * `reportError`: logged (PII-scrubbed through `redactError`) to every sink,
 * and captured once — with the raw stack — by the error tracker (Sentry).
 *
 * It only *reports*: default browser behavior (console output) is left
 * untouched and no UI is shown.
 */

import { reportError } from '../reporting/errorReporting';

export interface GlobalErrorHandlerTarget {
  addEventListener: Window['addEventListener'];
  removeEventListener: Window['removeEventListener'];
}

/**
 * Registers the listeners and returns an unregister function. Call once from
 * each app's `main.tsx`, after the log sinks are added.
 */
export function registerGlobalErrorHandlers(
  tag = 'global',
  target: GlobalErrorHandlerTarget = window,
): () => void {
  const onError = (event: ErrorEvent) => {
    // `event.error` is null for cross-origin "Script error." events; fall back
    // to the message so the report is not empty.
    reportError(tag, 'uncaught error', event.error ?? event.message);
  };

  const onUnhandledRejection = (event: PromiseRejectionEvent) => {
    reportError(tag, 'unhandled promise rejection', event.reason);
  };

  target.addEventListener('error', onError);
  target.addEventListener('unhandledrejection', onUnhandledRejection);

  return () => {
    target.removeEventListener('error', onError);
    target.removeEventListener('unhandledrejection', onUnhandledRejection);
  };
}
