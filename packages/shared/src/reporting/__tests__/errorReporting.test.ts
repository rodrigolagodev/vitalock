import { afterEach, describe, expect, it, vi } from 'vitest';
import { addLogSink, logger, resetLogSinks } from '../../logger/logger';
import {
  captureError,
  initErrorReporting,
  isErrorReportingEnabled,
  reportError,
  resetErrorReportingForTests,
  setErrorReportingUser,
  toReportableError,
  type ReportingClient,
  type ReportingClientConfig,
} from '../errorReporting';
import { errorReportingSink } from '../errorReportingSink';

const DSN = 'https://public@o1.ingest.us.sentry.io/2';

function fakeClient() {
  return {
    captureException: vi.fn<ReportingClient['captureException']>(),
    captureMessage: vi.fn<ReportingClient['captureMessage']>(),
    setUser: vi.fn<ReportingClient['setUser']>(),
  };
}

async function enable(client = fakeClient()) {
  await initErrorReporting({
    dsn: DSN,
    environment: 'test',
    app: 'admin',
    loadClient: async () => client,
  });
  return client;
}

afterEach(() => {
  resetErrorReportingForTests();
  resetLogSinks();
});

describe('initErrorReporting', () => {
  it('stays a no-op without a DSN and never loads the SDK', async () => {
    const loadClient = vi.fn();
    expect(await initErrorReporting({ environment: 'test', app: 'admin', loadClient })).toBe(false);
    expect(
      await initErrorReporting({ dsn: '  ', environment: 'test', app: 'admin', loadClient }),
    ).toBe(false);
    expect(loadClient).not.toHaveBeenCalled();
    expect(isErrorReportingEnabled()).toBe(false);
    // Captures while disabled must not throw or queue.
    captureError(new Error('ignored'), { source: 'x' });
    setErrorReportingUser({ id: 's1', role: 'admin' });
  });

  it('passes dsn, environment, release and app to the client loader', async () => {
    const loadClient = vi.fn(async (_config: ReportingClientConfig) => fakeClient());
    const ok = await initErrorReporting({
      dsn: DSN,
      environment: 'production',
      release: 'abc123',
      app: 'installer',
      loadClient,
    });
    expect(ok).toBe(true);
    expect(loadClient).toHaveBeenCalledWith({
      dsn: DSN,
      environment: 'production',
      release: 'abc123',
      app: 'installer',
    });
  });

  it('queues captures made while the SDK chunk loads and flushes them', async () => {
    const client = fakeClient();
    let resolve!: (c: ReportingClient) => void;
    const pending = initErrorReporting({
      dsn: DSN,
      environment: 'test',
      app: 'admin',
      loadClient: () => new Promise<ReportingClient>((r) => (resolve = r)),
    });
    captureError(new Error('early'), { source: 'admin:global' });
    expect(client.captureException).not.toHaveBeenCalled();

    resolve(client);
    await pending;
    expect(client.captureException).toHaveBeenCalledTimes(1);
    expect(client.captureException.mock.calls[0]?.[0].message).toBe('early');
  });

  it('degrades to disabled when the SDK chunk fails to load', async () => {
    const ok = await initErrorReporting({
      dsn: DSN,
      environment: 'test',
      app: 'admin',
      loadClient: () => Promise.reject(new Error('chunk load failed')),
    });
    expect(ok).toBe(false);
    expect(isErrorReportingEnabled()).toBe(false);
  });
});

describe('user context', () => {
  it('sends only staff id and role, applied once the client loads', async () => {
    const client = fakeClient();
    setErrorReportingUser({ id: 'staff-1', role: 'installer', email: 'x@y.z' } as never);
    await enable(client);
    expect(client.setUser).toHaveBeenLastCalledWith({ id: 'staff-1', role: 'installer' });

    setErrorReportingUser(null);
    expect(client.setUser).toHaveBeenLastCalledWith(null);
  });

  it('skips redundant updates for the same user', async () => {
    const client = await enable();
    client.setUser.mockClear();
    setErrorReportingUser({ id: 'a', role: 'admin' });
    setErrorReportingUser({ id: 'a', role: 'admin' });
    expect(client.setUser).toHaveBeenCalledTimes(1);
  });
});

describe('captureError', () => {
  it('never captures the same error object twice', async () => {
    const client = await enable();
    const err = new Error('once');
    captureError(err, { source: 'a' });
    captureError(err, { source: 'b' });
    expect(client.captureException).toHaveBeenCalledTimes(1);
  });

  it('rebuilds PostgREST error objects without details/hint and tags the code', async () => {
    const client = await enable();
    captureError(
      {
        code: '23505',
        message: 'duplicate key for vecino@example.com',
        details: 'Key (email)=(vecino@example.com) already exists.',
        hint: 'secret hint',
      },
      { source: 'admin:mutation' },
    );
    const [error, ctx] = client.captureException.mock.calls[0]!;
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('PostgrestError 23505');
    expect(error.message).toBe('duplicate key for [email]');
    expect(error).not.toHaveProperty('details');
    expect(error).not.toHaveProperty('hint');
    expect(ctx.tags).toEqual({ code: '23505' });
  });
});

describe('toReportableError', () => {
  it('keeps real Error instances (and their stack) untouched', () => {
    const err = new TypeError('x');
    expect(toReportableError(err)).toBe(err);
  });

  it('wraps strings and unknown values', () => {
    expect(toReportableError('boom eyJa.b.c').message).toBe('boom [token]');
    expect(toReportableError(42).name).toBe('NonErrorThrown');
  });
});

describe('reportError', () => {
  it('logs a redacted, marked payload and captures the raw error once', async () => {
    const client = await enable();
    const sink = vi.fn();
    addLogSink(sink);
    addLogSink(errorReportingSink);

    const err = new Error('render failed for vecino@example.com');
    reportError('admin:root', 'render error', err, { componentStack: '\n at Page' });

    expect(sink).toHaveBeenCalledTimes(1);
    const payload = (sink.mock.calls[0] as [string, string, unknown[]])[2][1] as {
      error: { message: string };
    };
    expect(payload.error.message).toBe('render failed for [email]');
    // errorReportingSink saw the marked payload and did not capture again.
    expect(client.captureException).toHaveBeenCalledTimes(1);
    expect(client.captureException).toHaveBeenCalledWith(err, {
      source: 'admin:root',
      extra: { message: 'render error', componentStack: '\n at Page' },
    });
  });

  it('logs but does not capture expected conditions (offline, expired session)', async () => {
    const client = await enable();
    reportError('installer:query', 'query failed', new TypeError('Failed to fetch'));
    reportError('installer:query', 'query failed', { status: 401, message: 'JWT expired' });
    expect(client.captureException).not.toHaveBeenCalled();
  });
});

describe('errorReportingSink', () => {
  it('captures an unmarked error log carrying an Error', async () => {
    const client = await enable();
    addLogSink(errorReportingSink);
    const err = new Error('from a plain logger call');
    logger('installer:sync').error('sync failed', { error: err });
    expect(client.captureException).toHaveBeenCalledWith(
      err,
      expect.objectContaining({ source: 'installer:sync' }),
    );
  });

  it('captures a scrubbed message when no Error is attached, and ignores non-error levels', async () => {
    const client = await enable();
    addLogSink(errorReportingSink);
    logger('admin:x').warn('just a warning');
    logger('admin:x').error('state mismatch for vecino@example.com', { count: 3 });
    expect(client.captureMessage).toHaveBeenCalledTimes(1);
    const [message, ctx] = client.captureMessage.mock.calls[0]!;
    expect(message).toBe('[admin:x] state mismatch for [email]');
    expect(ctx).toEqual({ source: 'admin:x', extra: { payload: [{ count: 3 }] } });
  });

  it('is inert while reporting is disabled', () => {
    expect(() => errorReportingSink('error', 'x', [new Error('y')])).not.toThrow();
  });
});
