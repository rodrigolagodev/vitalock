import { describe, it, expect } from 'vitest';
import { loadClientEnv, EnvValidationError } from './env';

describe('loadClientEnv', () => {
  it('parses valid env', () => {
    const env = loadClientEnv({
      VITE_SUPABASE_URL: 'https://example.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'anon-key',
    });
    expect(env.VITE_SUPABASE_URL).toBe('https://example.supabase.co');
  });

  it('throws EnvValidationError on missing keys', () => {
    expect(() => loadClientEnv({})).toThrow(EnvValidationError);
  });

  it('throws on invalid url', () => {
    expect(() =>
      loadClientEnv({ VITE_SUPABASE_URL: 'not-a-url', VITE_SUPABASE_ANON_KEY: 'x' }),
    ).toThrow(EnvValidationError);
  });

  it('treats the Sentry DSN and release as optional, and empty strings as unset', () => {
    const env = loadClientEnv({
      VITE_SUPABASE_URL: 'https://example.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'anon-key',
      VITE_SENTRY_DSN: '',
      VITE_RELEASE: '',
    });
    expect(env.VITE_SENTRY_DSN).toBeUndefined();
    expect(env.VITE_RELEASE).toBeUndefined();
  });

  it('accepts a Sentry DSN url and rejects a malformed one', () => {
    const base = { VITE_SUPABASE_URL: 'https://example.supabase.co', VITE_SUPABASE_ANON_KEY: 'k' };
    const dsn = 'https://public@o1.ingest.us.sentry.io/2';
    expect(loadClientEnv({ ...base, VITE_SENTRY_DSN: dsn, VITE_RELEASE: 'abc123' })).toMatchObject({
      VITE_SENTRY_DSN: dsn,
      VITE_RELEASE: 'abc123',
    });
    expect(() => loadClientEnv({ ...base, VITE_SENTRY_DSN: 'nope' })).toThrow(EnvValidationError);
  });
});
