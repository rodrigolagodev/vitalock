/**
 * Small pluggable logger. Modules call `logger('tag').warn(...)`; the
 * emitted event fans out to every registered sink.
 *
 * Two sinks ship out of the box: `consoleSink` (DEV-only, plus `error` in
 * all envs) and none otherwise. Apps compose the exact pipeline in their
 * entry point — see `main.tsx`. A future Sentry adapter is just another
 * `LogSink` registered with `addLogSink`.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type LogSink = (level: LogLevel, tag: string, args: unknown[]) => void;

export interface Logger {
  debug: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}

const sinks: LogSink[] = [];

function isDev(): boolean {
  const env = (import.meta as unknown as { env?: { DEV?: boolean } }).env;
  return env?.DEV === true;
}

/**
 * Default console sink. Silent in production for everything except `error`,
 * so ordinary warn/info do not leak error objects or PII to end-user
 * DevTools once the app is live.
 */
export const consoleSink: LogSink = (level, tag, args) => {
  if (!isDev() && level !== 'error') return;
  const method: 'log' | 'info' | 'warn' | 'error' =
    level === 'debug' ? 'log' : level;
  // eslint-disable-next-line no-console
  console[method](`[${tag}]`, ...args);
};

export function addLogSink(sink: LogSink): () => void {
  sinks.push(sink);
  return () => {
    const idx = sinks.indexOf(sink);
    if (idx >= 0) sinks.splice(idx, 1);
  };
}

export function resetLogSinks(): void {
  sinks.length = 0;
}

export function logger(tag: string): Logger {
  const emit = (level: LogLevel, args: unknown[]) => {
    for (const sink of sinks) sink(level, tag, args);
  };
  return {
    debug: (...args) => emit('debug', args),
    info: (...args) => emit('info', args),
    warn: (...args) => emit('warn', args),
    error: (...args) => emit('error', args),
  };
}
