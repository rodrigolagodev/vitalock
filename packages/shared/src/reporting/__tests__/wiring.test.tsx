/**
 * The four capture paths (boundary, window handlers, query/mutation caches,
 * auth user context) reach the error tracker exactly once per error.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';
import type { JSX } from 'react';
import { addLogSink, resetLogSinks } from '../../logger/logger';
import { AppErrorBoundary } from '../../errors/AppErrorBoundary';
import { registerGlobalErrorHandlers } from '../../errors/globalErrorHandlers';
import { createQueryClient } from '../../query/createQueryClient';
import {
  initErrorReporting,
  resetErrorReportingForTests,
  type ReportingClient,
} from '../errorReporting';
import { errorReportingSink } from '../errorReportingSink';
import type { UseAuthReturn } from '../../auth/types';

const authState: { current: Partial<UseAuthReturn> } = { current: {} };
vi.mock('../../auth/useAuth', () => ({ useAuth: () => authState.current }));

const { AuthProvider } = await import('../../auth/AuthProvider');

function fakeClient() {
  return {
    captureException: vi.fn<ReportingClient['captureException']>(),
    captureMessage: vi.fn<ReportingClient['captureMessage']>(),
    setUser: vi.fn<ReportingClient['setUser']>(),
  };
}

async function enable() {
  const client = fakeClient();
  await initErrorReporting({
    dsn: 'https://k@o1.ingest.us.sentry.io/2',
    environment: 'test',
    app: 'admin',
    loadClient: async () => client,
  });
  // Same pipeline as main.tsx: the sink must not double-capture.
  addLogSink(errorReportingSink);
  return client;
}

let unregister: (() => void) | undefined;

afterEach(() => {
  unregister?.();
  unregister = undefined;
  cleanup();
  resetLogSinks();
  resetErrorReportingForTests();
  vi.restoreAllMocks();
});

describe('error tracker wiring', () => {
  it('AppErrorBoundary captures the raw render error once, with the component stack', async () => {
    const client = await enable();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const err = new Error('render boom');
    function Bomb(): JSX.Element {
      throw err;
    }
    render(
      <AppErrorBoundary tag="admin:root">
        <Bomb />
      </AppErrorBoundary>,
    );
    expect(client.captureException).toHaveBeenCalledTimes(1);
    const [captured, ctx] = client.captureException.mock.calls[0]!;
    expect(captured).toBe(err);
    expect(ctx.source).toBe('admin:root');
    expect(typeof ctx.extra?.componentStack).toBe('string');
  });

  it('window error and unhandled rejection are captured once each', async () => {
    const client = await enable();
    unregister = registerGlobalErrorHandlers('installer:global');
    const err = new Error('handler boom');
    window.dispatchEvent(new ErrorEvent('error', { error: err, message: 'handler boom' }));
    window.dispatchEvent(
      Object.assign(new Event('unhandledrejection'), {
        reason: { code: 'P0001', message: 'raise' },
      }),
    );
    expect(client.captureException).toHaveBeenCalledTimes(2);
    expect(client.captureException.mock.calls[0]?.[0]).toBe(err);
    expect(client.captureException.mock.calls[1]?.[0].name).toBe('PostgrestError P0001');
    expect(client.captureException.mock.calls[1]?.[1]).toMatchObject({
      source: 'installer:global',
      tags: { code: 'P0001' },
    });
  });

  it('query and mutation cache errors are captured with a bounded scope only', async () => {
    const client = await enable();
    const queryClient = createQueryClient({ app: 'admin' });
    const failure = new Error('query boom');
    await queryClient
      .fetchQuery({
        queryKey: ['admin', 'equipos', 'id-1', 'search'],
        queryFn: () => Promise.reject(failure),
        retry: false,
      })
      .catch(() => {});
    expect(client.captureException).toHaveBeenCalledTimes(1);
    expect(client.captureException.mock.calls[0]?.[1]).toEqual({
      source: 'admin:query',
      extra: { message: 'query failed', scope: ['admin', 'equipos'] },
    });

    const mutation = queryClient.getMutationCache().build(queryClient, {
      mutationFn: () => Promise.reject(new Error('mutation boom')),
    });
    await mutation.execute(undefined).catch(() => {});
    expect(client.captureException).toHaveBeenCalledTimes(2);
    expect(client.captureException.mock.calls[1]?.[1].source).toBe('admin:mutation');
  });

  it('AuthProvider tags the authenticated staff id + role and clears it on sign-out', async () => {
    const client = await enable();
    client.setUser.mockClear();
    authState.current = {
      phase: 'authenticated',
      staff: {
        id: 'staff-9',
        auth_user_id: 'auth-9',
        full_name: 'Juan Pérez',
        username: 'jperez',
        role: 'installer',
        status: 'active',
      },
      signOut: vi.fn(),
    };
    const supabase = {} as never;
    const view = render(
      <AuthProvider supabase={supabase} expectedRole="installer">
        <span />
      </AuthProvider>,
    );
    await waitFor(() =>
      expect(client.setUser).toHaveBeenLastCalledWith({ id: 'staff-9', role: 'installer' }),
    );

    authState.current = { phase: 'anonymous', staff: null, signOut: vi.fn() };
    view.rerender(
      <AuthProvider supabase={supabase} expectedRole="installer">
        <span />
      </AuthProvider>,
    );
    await waitFor(() => expect(client.setUser).toHaveBeenLastCalledWith(null));
  });
});
