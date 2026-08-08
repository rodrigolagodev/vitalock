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
});
