import { afterEach, describe, expect, it, vi } from 'vitest';
import { addLogSink, resetLogSinks } from '../../logger/logger';
import {
  createQueryClient,
  isRetryableError,
  retryDelayMs,
  DEFAULT_GC_TIME_MS,
  DEFAULT_STALE_TIME_MS,
  MAX_QUERY_RETRIES,
} from '../createQueryClient';

afterEach(() => {
  resetLogSinks();
  vi.restoreAllMocks();
});

const postgrest = (code: string, message = 'boom') => ({ code, message });

describe('isRetryableError', () => {
  it('never retries an HTTP 4xx', () => {
    expect(isRetryableError({ status: 400, message: 'bad request' })).toBe(false);
    expect(isRetryableError({ status: 401, message: 'unauthorized' })).toBe(false);
    expect(isRetryableError({ status: 403, message: 'forbidden' })).toBe(false);
    expect(isRetryableError({ status: 404, message: 'not found' })).toBe(false);
    expect(isRetryableError({ status: 409, message: 'conflict' })).toBe(false);
    expect(isRetryableError({ status: 429, message: 'too many' })).toBe(false);
  });

  it('retries an HTTP 5xx', () => {
    expect(isRetryableError({ status: 500, message: 'server error' })).toBe(true);
    expect(isRetryableError({ status: 503, message: 'unavailable' })).toBe(true);
  });

  it('retries connectivity failures', () => {
    expect(isRetryableError(new TypeError('Failed to fetch'))).toBe(true);
    expect(isRetryableError({ message: 'NetworkError when attempting to fetch' })).toBe(true);
    expect(isRetryableError({ message: 'request timeout' })).toBe(true);
  });

  it('does not retry deterministic Postgres answers', () => {
    expect(isRetryableError(postgrest('23505'))).toBe(false);
    expect(isRetryableError(postgrest('23503'))).toBe(false);
    expect(isRetryableError(postgrest('42501'))).toBe(false);
    expect(isRetryableError(postgrest('P0001'))).toBe(false);
    expect(isRetryableError(postgrest('PGRST116'))).toBe(false);
  });

  it('retries transient SQLSTATE classes', () => {
    expect(isRetryableError(postgrest('08006'))).toBe(true);
    expect(isRetryableError(postgrest('53300'))).toBe(true);
    expect(isRetryableError(postgrest('57014'))).toBe(true);
    expect(isRetryableError(postgrest('40001'))).toBe(true);
    expect(isRetryableError(postgrest('40P01'))).toBe(true);
  });

  it('does not retry unknown shapes', () => {
    expect(isRetryableError(new Error('render blew up'))).toBe(false);
    expect(isRetryableError('nope')).toBe(false);
    expect(isRetryableError(null)).toBe(false);
  });

  it('lets an explicit 4xx status win over a code that looks transient', () => {
    expect(isRetryableError({ status: 400, code: '08006', message: 'x' })).toBe(false);
  });
});

describe('retryDelayMs', () => {
  it('is exponential and capped at 8s', () => {
    expect(retryDelayMs(0)).toBe(1000);
    expect(retryDelayMs(1)).toBe(2000);
    expect(retryDelayMs(2)).toBe(4000);
    expect(retryDelayMs(10)).toBe(8000);
  });
});

describe('createQueryClient defaults', () => {
  it('applies the shared staleTime / gcTime', () => {
    const defaults = createQueryClient().getDefaultOptions().queries;
    expect(defaults?.staleTime).toBe(DEFAULT_STALE_TIME_MS);
    expect(defaults?.gcTime).toBe(DEFAULT_GC_TIME_MS);
  });

  it('never retries mutations (they are not idempotent)', () => {
    expect(createQueryClient().getDefaultOptions().mutations?.retry).toBe(false);
  });

  it('stops retrying queries after MAX_QUERY_RETRIES', () => {
    const retry = createQueryClient().getDefaultOptions().queries?.retry;
    expect(typeof retry).toBe('function');
    const fn = retry as (failureCount: number, error: unknown) => boolean;
    const transient = { status: 500, message: 'server error' };

    // `failureCount` is 0 on the first retry decision (query-core retryer).
    expect(fn(0, transient)).toBe(true);
    expect(fn(MAX_QUERY_RETRIES - 1, transient)).toBe(true);
    expect(fn(MAX_QUERY_RETRIES, transient)).toBe(false);
  });

  it('refuses to retry a 4xx even on the first failure', () => {
    const retry = createQueryClient().getDefaultOptions().queries?.retry as (
      failureCount: number,
      error: unknown,
    ) => boolean;
    expect(retry(0, { status: 403, message: 'forbidden' })).toBe(false);
  });

  it('accepts per-app overrides', () => {
    const client = createQueryClient({
      defaultOptions: { queries: { staleTime: 1234, retry: false } },
    });
    const queries = client.getDefaultOptions().queries;
    expect(queries?.staleTime).toBe(1234);
    expect(queries?.retry).toBe(false);
    // Untouched defaults survive the merge.
    expect(queries?.gcTime).toBe(DEFAULT_GC_TIME_MS);
  });
});

describe('cache error handlers', () => {
  it('logs query failures through the logger with the app-prefixed tag', async () => {
    const sink = vi.fn();
    addLogSink(sink);

    const client = createQueryClient({
      app: 'admin',
      defaultOptions: { queries: { retry: false } },
    });

    await client
      .fetchQuery({
        queryKey: ['admin', 'equipos', 'secret-id', 'búsqueda libre'],
        queryFn: () => Promise.reject({ code: '42501', message: 'permission denied' }),
      })
      .catch(() => {});

    const call = sink.mock.calls.find((c) => c[0] === 'error');
    expect(call).toBeDefined();
    const [, tag, args] = call as [string, string, unknown[]];
    expect(tag).toBe('admin:query');
    expect(args[0]).toBe('query failed');
    const payload = args[1] as { scope: unknown[]; error: { code?: string } };
    // Only the key head is reported: ids and search terms stay local.
    expect(payload.scope).toEqual(['admin', 'equipos']);
    expect(payload.error.code).toBe('42501');
  });

  it('logs mutation failures without toasting (toastMutationError stays per-hook)', async () => {
    const sink = vi.fn();
    addLogSink(sink);
    const onMutationError = vi.fn();

    const client = createQueryClient({ app: 'installer', onMutationError });

    const mutation = client.getMutationCache().build(client, {
      mutationKey: ['installer', 'tareas'],
      mutationFn: () => Promise.reject({ code: '23505', message: 'duplicate' }),
      retry: false,
    });

    await mutation.execute(undefined).catch(() => {});

    const call = sink.mock.calls.find((c) => c[0] === 'error');
    expect(call).toBeDefined();
    const [, tag, args] = call as [string, string, unknown[]];
    expect(tag).toBe('installer:mutation');
    expect(args[0]).toBe('mutation failed');
    expect((args[1] as { scope: unknown[] }).scope).toEqual(['installer', 'tareas']);
    expect(onMutationError).toHaveBeenCalledTimes(1);
  });

  it('forwards query errors to the optional onQueryError hook', async () => {
    const onQueryError = vi.fn();
    const client = createQueryClient({
      onQueryError,
      defaultOptions: { queries: { retry: false } },
    });

    await client
      .fetchQuery({
        queryKey: ['x', 'y'],
        queryFn: () => Promise.reject(new Error('nope')),
      })
      .catch(() => {});

    expect(onQueryError).toHaveBeenCalledTimes(1);
    expect(onQueryError.mock.calls[0]?.[1]).toEqual({ queryKey: ['x', 'y'] });
  });

  it('redacts PII out of the reported message', async () => {
    const sink = vi.fn();
    addLogSink(sink);
    const client = createQueryClient({ defaultOptions: { queries: { retry: false } } });

    await client
      .fetchQuery({
        queryKey: ['p'],
        queryFn: () =>
          Promise.reject({
            code: '23505',
            message: 'Key (email)=(vecino@example.com) already exists.',
            details: 'row payload with everything',
          }),
      })
      .catch(() => {});

    const call = sink.mock.calls.find((c) => c[0] === 'error');
    const args = (call as [string, string, unknown[]])[2];
    const reported = args[1] as { error: Record<string, unknown> };
    expect(reported.error.message).toBe('Key (email)=([redacted]) already exists.');
    expect(reported.error).not.toHaveProperty('details');
  });
});
