import { beforeEach, describe, expect, it, vi } from 'vitest';

const scope = { setClient: vi.fn(), setTag: vi.fn(), setUser: vi.fn() };
const init = vi.fn();
const BrowserClient = vi.fn(function (this: { init: typeof init }, options: unknown) {
  this.init = init;
  BrowserClient.lastOptions = options as Record<string, unknown>;
}) as unknown as ReturnType<typeof vi.fn> & { lastOptions: Record<string, unknown> };
const captureException = vi.fn();
const captureMessage = vi.fn();
const integration = (name: string) => vi.fn((options?: unknown) => ({ name, options }));

vi.mock('@sentry/react', () => ({
  BrowserClient,
  captureException,
  captureMessage,
  getCurrentScope: () => scope,
  makeFetchTransport: 'transport',
  defaultStackParser: 'parser',
  eventFiltersIntegration: integration('EventFilters'),
  dedupeIntegration: integration('Dedupe'),
  linkedErrorsIntegration: integration('LinkedErrors'),
  httpContextIntegration: integration('HttpContext'),
  breadcrumbsIntegration: integration('Breadcrumbs'),
}));

const { createSentryClient } = await import('../sentryClient');

beforeEach(() => vi.clearAllMocks());

const config = {
  dsn: 'https://k@o1.ingest.us.sentry.io/2',
  environment: 'production',
  release: 'sha',
  app: 'admin',
};

describe('createSentryClient', () => {
  it('builds an errors-only client: no global handlers, no tracing, no replay, no PII', () => {
    createSentryClient(config);
    const options = BrowserClient.lastOptions;
    expect(options).toMatchObject({
      dsn: config.dsn,
      environment: 'production',
      release: 'sha',
      dataCollection: {
        userInfo: false,
        cookies: false,
        httpHeaders: false,
        httpBodies: [],
        urlQueryParams: false,
        stackFrameVariables: false,
      },
    });
    const names = (options.integrations as Array<{ name: string }>).map((i) => i.name);
    expect(names).toEqual(['EventFilters', 'Dedupe', 'LinkedErrors', 'HttpContext', 'Breadcrumbs']);
    expect(options).not.toHaveProperty('tracesSampleRate');
    expect(scope.setClient).toHaveBeenCalled();
    expect(scope.setTag).toHaveBeenCalledWith('app', 'admin');
    expect(init).toHaveBeenCalledTimes(1);
  });

  it('scrubs events in beforeSend', () => {
    createSentryClient(config);
    const beforeSend = BrowserClient.lastOptions.beforeSend as (e: object) => object;
    const event = beforeSend({ message: 'x a@b.co', user: { id: 's', email: 'a@b.co' } });
    expect(event).toEqual({ message: 'x [email]', user: { id: 's' } });
  });

  it('maps capture context to tags/extra and user to id + role tag', () => {
    const client = createSentryClient(config);
    const err = new Error('e');
    client.captureException(err, {
      source: 'admin:query',
      tags: { code: '42501' },
      extra: { a: 1 },
    });
    expect(captureException).toHaveBeenCalledWith(err, {
      tags: { source: 'admin:query', code: '42501' },
      extra: { a: 1 },
    });

    client.setUser({ id: 'staff-1', role: 'admin' });
    expect(scope.setUser).toHaveBeenCalledWith({ id: 'staff-1' });
    expect(scope.setTag).toHaveBeenCalledWith('role', 'admin');

    client.setUser(null);
    expect(scope.setUser).toHaveBeenLastCalledWith(null);
  });
});
