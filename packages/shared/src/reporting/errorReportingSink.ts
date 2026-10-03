/**
 * Log sink that forwards `error`-level log lines to the error tracker.
 *
 * Covers `logger(tag).error(...)` call sites that do not go through
 * `reportError` themselves. Payloads already captured by `reportError` carry
 * the `REPORTED` marker and are skipped, so nothing is sent twice.
 */

import type { LogSink } from '../logger/logger';
import { sanitizeArgs } from '../logger/sinks/reportingSink';
import {
  captureError,
  captureErrorMessage,
  isErrorReportingEnabled,
  isMarkedReported,
  shouldReportError,
} from './errorReporting';

function findError(args: unknown[]): unknown {
  for (const arg of args) {
    if (arg instanceof Error) return arg;
    if (
      typeof arg === 'object' &&
      arg !== null &&
      (arg as { error?: unknown }).error instanceof Error
    ) {
      return (arg as { error: Error }).error;
    }
  }
  return undefined;
}

export const errorReportingSink: LogSink = (level, tag, args) => {
  try {
    if (level !== 'error' || !isErrorReportingEnabled()) return;
    if (args.some(isMarkedReported)) return;

    const message = typeof args[0] === 'string' ? args[0] : 'error log';
    const error = findError(args);
    if (error !== undefined) {
      if (shouldReportError(error)) {
        captureError(error, { source: tag, extra: { message, payload: sanitizeArgs(args) } });
      }
      return;
    }
    captureErrorMessage(`[${tag}] ${message}`, {
      source: tag,
      extra: { payload: sanitizeArgs(args.slice(1)) },
    });
  } catch {
    // A sink that throws would break `logger()` for every other sink.
  }
};
