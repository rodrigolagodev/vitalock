import { afterEach, describe, expect, it, vi } from 'vitest';
import { createReportingSink, noopSink, sanitizeArg } from '../reportingSink';

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

const endpoint = 'https://reports.test/ingest';

describe('createReportingSink — configuration', () => {
  it('is a no-op when no endpoint is configured', () => {
    const fetchImpl = vi.fn();
    // No `endpoint` option and no VITE_ERROR_REPORTING_ENDPOINT in the test env.
    const sink = createReportingSink({ fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(sink).toBe(noopSink);

    sink('error', 'tag', ['boom']);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('is a no-op when the endpoint is an empty string', () => {
    expect(createReportingSink({ endpoint: '' })).toBe(noopSink);
  });

  it('ignores non-error levels by default', () => {
    const fetchImpl = vi.fn().mockResolvedValue(undefined);
    const sink = createReportingSink({
      endpoint,
      batchSize: 1,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    sink('debug', 't', ['d']);
    sink('info', 't', ['i']);
    sink('warn', 't', ['w']);
    expect(fetchImpl).not.toHaveBeenCalled();

    sink('error', 't', ['e']);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('honours a custom level list', () => {
    const fetchImpl = vi.fn().mockResolvedValue(undefined);
    const sink = createReportingSink({
      endpoint,
      batchSize: 1,
      levels: ['warn', 'error'],
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    sink('warn', 't', ['w']);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe('createReportingSink — batching', () => {
  it('buffers until batchSize is reached, then POSTs one envelope', () => {
    const fetchImpl = vi.fn().mockResolvedValue(undefined);
    const sink = createReportingSink({
      endpoint,
      app: 'admin',
      release: 'abc123',
      batchSize: 3,
      now: () => '2026-01-01T00:00:00.000Z',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    sink('error', 'a', ['one']);
    sink('error', 'b', ['two']);
    expect(fetchImpl).not.toHaveBeenCalled();

    sink('error', 'c', ['three']);
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(endpoint);
    expect(init.method).toBe('POST');
    const body = JSON.parse(String(init.body)) as {
      app: string;
      release: string;
      entries: Array<{ level: string; tag: string; payload: unknown[] }>;
    };
    expect(body.app).toBe('admin');
    expect(body.release).toBe('abc123');
    expect(body.entries).toHaveLength(3);
    expect(body.entries.map((e) => e.tag)).toEqual(['a', 'b', 'c']);
  });

  it('flushes a partial batch after the idle interval', () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn().mockResolvedValue(undefined);
    const sink = createReportingSink({
      endpoint,
      batchSize: 10,
      flushIntervalMs: 5000,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    sink('error', 't', ['only one']);
    expect(fetchImpl).not.toHaveBeenCalled();

    vi.advanceTimersByTime(5000);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('drops the oldest entries past maxQueueSize instead of growing unbounded', () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn().mockResolvedValue(undefined);
    const sink = createReportingSink({
      endpoint,
      batchSize: 1000,
      maxQueueSize: 2,
      flushIntervalMs: 1000,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    sink('error', 'one', []);
    sink('error', 'two', []);
    sink('error', 'three', []);
    vi.advanceTimersByTime(1000);

    const body = JSON.parse(String((fetchImpl.mock.calls[0] as [string, RequestInit])[1].body)) as {
      entries: Array<{ tag: string }>;
    };
    expect(body.entries.map((e) => e.tag)).toEqual(['two', 'three']);
  });
});

describe('createReportingSink — failure isolation', () => {
  it('never throws when fetch throws synchronously', () => {
    const fetchImpl = vi.fn(() => {
      throw new Error('network down');
    });
    const sink = createReportingSink({
      endpoint,
      batchSize: 1,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(() => sink('error', 't', ['boom'])).not.toThrow();
  });

  it('never throws and produces no unhandled rejection when fetch rejects', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('502'));
    const sink = createReportingSink({
      endpoint,
      batchSize: 1,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(() => sink('error', 't', ['boom'])).not.toThrow();
    await Promise.resolve();
    await Promise.resolve();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('never throws when an argument cannot be serialized', () => {
    const fetchImpl = vi.fn().mockResolvedValue(undefined);
    const sink = createReportingSink({
      endpoint,
      batchSize: 1,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;

    expect(() => sink('error', 't', [cyclic, () => {}, Symbol('x'), 10n])).not.toThrow();
  });
});

describe('sanitizeArg — PII hygiene', () => {
  it('collapses a Supabase error to code + scrubbed message, dropping details/hint', () => {
    const result = sanitizeArg({
      code: '23505',
      message: 'Key (email)=(vecino@example.com) already exists.',
      details: 'Failing row contains (1, vecino@example.com, 099123456).',
      hint: 'try another email',
    }) as Record<string, unknown>;

    expect(result.kind).toBe('postgrest');
    expect(result.code).toBe('23505');
    expect(result.message).toBe('Key (email)=([redacted]) already exists.');
    expect(result).not.toHaveProperty('details');
    expect(result).not.toHaveProperty('hint');
  });

  it('scrubs emails, uuids, tokens and long digit runs out of plain strings', () => {
    expect(sanitizeArg('contacto vecino@example.com')).toBe('contacto [email]');
    expect(sanitizeArg('id 3f0c2b1a-8d4e-4f2b-9c1a-0b7e6d5c4a3b')).toBe('id [uuid]');
    expect(sanitizeArg('doc 45123987')).toBe('doc [num]');
    expect(sanitizeArg('bearer eyJhbGciOi.eyJzdWIi.sIgNaTuRe')).toBe('bearer [token]');
  });

  it('reduces an Error to name + scrubbed message, never a stack', () => {
    const result = sanitizeArg(new TypeError('Failed to fetch')) as Record<string, unknown>;
    expect(result.name).toBe('TypeError');
    expect(result.kind).toBe('network');
    expect(result).not.toHaveProperty('stack');
  });

  it('truncates deep structures instead of walking them forever', () => {
    const deep = { a: { b: { c: { d: { e: 'too deep' } } } } };
    const result = sanitizeArg(deep) as { a: { b: { c: unknown } } };
    expect(result.a.b.c).toBe('[truncated]');
  });
});
