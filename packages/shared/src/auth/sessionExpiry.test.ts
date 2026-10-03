import { afterEach, describe, expect, it, vi } from 'vitest';
import { resetLogSinks } from '../logger/logger';
import { createSessionExpiredHandler, isAuthSessionError } from './sessionExpiry';

afterEach(() => {
  resetLogSinks();
});

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('isAuthSessionError', () => {
  it('detects HTTP 401', () => {
    expect(isAuthSessionError({ status: 401, message: 'Unauthorized' })).toBe(true);
  });

  it('detects PostgREST JWT error codes', () => {
    expect(isAuthSessionError({ code: 'PGRST301', message: 'JWSError' })).toBe(true);
    expect(isAuthSessionError({ code: 'PGRST302', message: 'Anonymous access is disabled' })).toBe(
      true,
    );
    expect(isAuthSessionError({ code: 'PGRST303', message: 'JWT expired' })).toBe(true);
  });

  it('detects GoTrue dead-session codes', () => {
    expect(isAuthSessionError({ code: 'session_not_found', message: 'x' })).toBe(true);
    expect(isAuthSessionError({ code: 'refresh_token_not_found', message: 'x' })).toBe(true);
  });

  it('detects "JWT expired" by message when no code is present', () => {
    expect(isAuthSessionError(new Error('JWT expired'))).toBe(true);
  });

  it('does not treat authorization denials or other errors as session expiry', () => {
    expect(isAuthSessionError({ code: '42501', message: 'permission denied' })).toBe(false);
    expect(isAuthSessionError({ status: 403, message: 'Forbidden' })).toBe(false);
    expect(isAuthSessionError({ code: 'PGRST116', message: 'no rows' })).toBe(false);
    expect(isAuthSessionError(new TypeError('Failed to fetch'))).toBe(false);
    expect(isAuthSessionError(null)).toBe(false);
    expect(isAuthSessionError('JWT expired')).toBe(false);
  });
});

describe('createSessionExpiredHandler', () => {
  function setup(path: string, basePath = '/') {
    const signOut = vi.fn().mockResolvedValue(undefined);
    const redirect = vi.fn();
    const handle = createSessionExpiredHandler({
      signOut,
      redirect,
      basePath,
      currentPath: () => path,
    });
    return { signOut, redirect, handle };
  }

  it('signs out and redirects to /error?reason=session_expired', async () => {
    const { signOut, redirect, handle } = setup('/tareas');
    handle({ code: 'PGRST303', message: 'JWT expired' });
    await flush();
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(redirect).toHaveBeenCalledWith('/error?reason=session_expired');
  });

  it('prefixes the redirect with the app base path', async () => {
    const { redirect, handle } = setup('/Vitalock/admin/equipos', '/Vitalock/admin/');
    handle({ status: 401, message: 'Unauthorized' });
    await flush();
    expect(redirect).toHaveBeenCalledWith('/Vitalock/admin/error?reason=session_expired');
  });

  it('fires only once per page load even if many queries fail', async () => {
    const { signOut, redirect, handle } = setup('/tareas');
    handle({ status: 401, message: 'Unauthorized' });
    handle({ status: 401, message: 'Unauthorized' });
    handle({ code: 'PGRST301', message: 'JWSError' });
    await flush();
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(redirect).toHaveBeenCalledTimes(1);
  });

  it('never fires on /login or /error (no redirect loop)', async () => {
    for (const path of ['/login', '/error', '/Vitalock/admin/error', '/Vitalock/admin/login/']) {
      const { signOut, redirect, handle } = setup(path, '/Vitalock/admin/');
      handle({ status: 401, message: 'Unauthorized' });
      await flush();
      expect(signOut).not.toHaveBeenCalled();
      expect(redirect).not.toHaveBeenCalled();
    }
  });

  it('ignores errors that are not session errors', async () => {
    const { signOut, redirect, handle } = setup('/tareas');
    handle({ code: '42501', message: 'permission denied' });
    await flush();
    expect(signOut).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it('still redirects when signOut rejects', async () => {
    const redirect = vi.fn();
    const handle = createSessionExpiredHandler({
      signOut: () => Promise.reject(new Error('network down')),
      redirect,
      currentPath: () => '/',
    });
    handle({ status: 401, message: 'Unauthorized' });
    await flush();
    expect(redirect).toHaveBeenCalledWith('/error?reason=session_expired');
  });
});
