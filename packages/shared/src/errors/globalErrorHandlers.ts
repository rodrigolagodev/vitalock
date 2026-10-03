/**
 * Window-level safety net for errors nothing else catches.
 *
 * `AppErrorBoundary` only sees errors thrown while React renders. Errors in
 * event handlers, timers and un-awaited promises (`void doThing()`) bypass it
 * and, before this, only reached the browser console — never the reporting
 * sink. This forwards both `error` and `unhandledrejection` to the shared
 * logger, PII-scrubbed through `redactError`, so they follow the same sink
 * pipeline as everything else.
 *
 * It only *reports*: default browser behavior (console output) is left
 * untouched and no UI is shown.
 */

import { logger } from '../logger/logger';
import { redactError } from './redactError';

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
  const log = logger(tag);

  const onError = (event: ErrorEvent) => {
    // `event.error` is null for cross-origin "Script error." events; fall back
    // to the message so the report is not empty.
    log.error('uncaught error', { error: redactError(event.error ?? event.message) });
  };

  const onUnhandledRejection = (event: PromiseRejectionEvent) => {
    log.error('unhandled promise rejection', { error: redactError(event.reason) });
  };

  target.addEventListener('error', onError);
  target.addEventListener('unhandledrejection', onUnhandledRejection);

  return () => {
    target.removeEventListener('error', onError);
    target.removeEventListener('unhandledrejection', onUnhandledRejection);
  };
}
