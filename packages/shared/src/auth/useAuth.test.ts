import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useAuth } from './useAuth';
import { AuthErrorCode } from './types';
import type { TypedSupabaseClient } from '@vitalock/supabase';

// ---------------------------------------------------------------------------
// Mock factory
// ---------------------------------------------------------------------------

type AuthStateChangeCallback = (event: string, session: unknown) => void;

/**
 * A thenable that also exposes `.abortSignal()`, mirroring the postgrest-js
 * builder shape: `single()` returns a builder you can call `.abortSignal()` on
 * before awaiting. The real hook attaches `AbortSignal.timeout(...)`; the mock
 * ignores it and resolves with the given result.
 */
function makeQueryResult(result: unknown) {
  const thenable = Promise.resolve(result);
  return Object.assign(thenable, { abortSignal: () => thenable });
}

interface MockSupabase {
  client: TypedSupabaseClient;
  triggerAuthEvent: (event: string, session: unknown) => void;
  signInMock: Mock;
  signOutMock: Mock;
  profileQueryMock: Mock;
}

function createMockSupabase(
  profileData: unknown = null,
  initialSession: unknown = null,
): MockSupabase {
  let authCallback: AuthStateChangeCallback | null = null;

  const signInMock = vi.fn();
  const signOutMock = vi.fn().mockResolvedValue({ error: null });
  const profileQueryMock = vi.fn().mockReturnValue(
    makeQueryResult({ data: profileData, error: null, status: 200 }),
  );

  const mockSelectChain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    abortSignal: vi.fn().mockReturnThis(),
    single: profileQueryMock,
  };

  const mockFromChain = {
    from: vi.fn().mockReturnValue(mockSelectChain),
  };

  const client = {
    auth: {
      // Mirror real supabase-js: fire INITIAL_SESSION on subscribe.
      onAuthStateChange: vi.fn((cb: AuthStateChangeCallback) => {
        authCallback = cb;
        setTimeout(() => cb('INITIAL_SESSION', initialSession), 0);
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      }),
      signInWithPassword: signInMock,
      signOut: signOutMock,
    },
    schema: vi.fn().mockReturnValue(mockFromChain),
  } as unknown as TypedSupabaseClient;

  const triggerAuthEvent = (event: string, session: unknown) => {
    if (authCallback) authCallback(event, session);
  };

  return { client, triggerAuthEvent, signInMock, signOutMock, profileQueryMock };
}

function makeSession(userId = 'user-1') {
  return { user: { id: userId }, access_token: 'token', refresh_token: 'refresh' };
}

function makeProfile(overrides: Record<string, unknown> = {}) {
  return {
    id: 'staff-1',
    auth_user_id: 'user-1',
    full_name: 'Ana Alvarez',
    role: 'admin',
    status: 'active',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Avoid creating a real 15s timer from AbortSignal.timeout inside
    // fetchProfile during tests; the mock builder ignores the signal.
    vi.spyOn(AbortSignal, 'timeout').mockReturnValue({} as AbortSignal);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('1. happy path — admin login sets phase=authenticated with staff profile', async () => {
    const { client, triggerAuthEvent, signInMock } = createMockSupabase(makeProfile());
    const session = makeSession();

    signInMock.mockImplementation(async () => {
      // Simulate supabase firing SIGNED_IN after successful login
      setTimeout(() => triggerAuthEvent('SIGNED_IN', session), 0);
      return { data: { session }, error: null };
    });

    const { result } = renderHook(() => useAuth(client, 'admin'));

    // Initial state is initializing; getSession returns null → anonymous
    await waitFor(() => expect(result.current.phase).toBe('anonymous'));

    await act(async () => {
      await result.current.signIn('ana@vitalock.example', 'test-password');
    });

    await waitFor(() => expect(result.current.phase).toBe('authenticated'));

    expect(result.current.staff?.full_name).toBe('Ana Alvarez');
    expect(result.current.error).toBeNull();
  });

  it('2. wrong password sets phase=error with INVALID_CREDENTIALS', async () => {
    const { client, signInMock } = createMockSupabase();
    const { AuthApiError } = await import('@supabase/supabase-js');
    signInMock.mockResolvedValue({
      data: { session: null },
      error: new AuthApiError('Invalid login credentials', 400, 'invalid_credentials'),
    });

    const { result } = renderHook(() => useAuth(client, 'admin'));
    await waitFor(() => expect(result.current.phase).toBe('anonymous'));

    await act(async () => {
      await result.current.signIn('ana@vitalock.example', 'wrong');
    });

    await waitFor(() => expect(result.current.phase).toBe('error'));
    expect(result.current.error?.code).toBe(AuthErrorCode.INVALID_CREDENTIALS);
  });

  it('3. no staff row sets phase=error with NO_STAFF_ROW and calls signOut', async () => {
    const { client, triggerAuthEvent, signInMock, signOutMock } =
      createMockSupabase(null);
    const session = makeSession();

    // profile query returns null (no row)
    signInMock.mockImplementation(async () => {
      setTimeout(() => triggerAuthEvent('SIGNED_IN', session), 0);
      return { data: { session }, error: null };
    });

    const { result } = renderHook(() => useAuth(client, 'admin'));
    await waitFor(() => expect(result.current.phase).toBe('anonymous'));

    await act(async () => {
      await result.current.signIn('unknown@example.com', 'pass');
    });

    await waitFor(() => expect(result.current.phase).toBe('error'));
    expect(result.current.error?.code).toBe(AuthErrorCode.NO_STAFF_ROW);
    expect(signOutMock).toHaveBeenCalled();
  });

  it('4. inactive staff sets phase=error with INACTIVE_STAFF and calls signOut', async () => {
    const { client, triggerAuthEvent, signInMock, signOutMock } = createMockSupabase(
      makeProfile({ status: 'inactive' }),
    );
    const session = makeSession();

    signInMock.mockImplementation(async () => {
      setTimeout(() => triggerAuthEvent('SIGNED_IN', session), 0);
      return { data: { session }, error: null };
    });

    const { result } = renderHook(() => useAuth(client, 'admin'));
    await waitFor(() => expect(result.current.phase).toBe('anonymous'));

    await act(async () => {
      await result.current.signIn('elena@example.com', 'pass');
    });

    await waitFor(() => expect(result.current.phase).toBe('error'));
    expect(result.current.error?.code).toBe(AuthErrorCode.INACTIVE_STAFF);
    expect(signOutMock).toHaveBeenCalled();
  });

  it('5. session restore on mount sets phase=authenticated without calling signIn', async () => {
    const session = makeSession();
    const { client } = createMockSupabase(makeProfile(), session);

    const { result } = renderHook(() => useAuth(client, 'admin'));

    await waitFor(() => expect(result.current.phase).toBe('authenticated'));
    expect(result.current.staff?.full_name).toBe('Ana Alvarez');
  });

  it('6. signOut sets phase=anonymous with null staff and session', async () => {
    const session = makeSession();
    const { client, triggerAuthEvent } = createMockSupabase(makeProfile(), session);

    const { result } = renderHook(() => useAuth(client, 'admin'));
    await waitFor(() => expect(result.current.phase).toBe('authenticated'));

    await act(async () => {
      // signOut triggers SIGNED_OUT event
      (client.auth.signOut as Mock).mockImplementation(async () => {
        triggerAuthEvent('SIGNED_OUT', null);
        return { error: null };
      });
      await result.current.signOut();
    });

    await waitFor(() => expect(result.current.phase).toBe('anonymous'));
    expect(result.current.staff).toBeNull();
    expect(result.current.session).toBeNull();
  });

  it('7. SIGNED_IN while authenticated updates the session without refetching the profile', async () => {
    const session = makeSession();
    const { client, triggerAuthEvent, profileQueryMock } = createMockSupabase(
      makeProfile(),
      session,
    );

    const { result } = renderHook(() => useAuth(client, 'admin'));
    await waitFor(() => expect(result.current.phase).toBe('authenticated'));
    expect(profileQueryMock).toHaveBeenCalledTimes(1);

    // supabase-js re-emits SIGNED_IN on visibility-return; it must NOT
    // re-enter fetching_profile nor re-fetch the profile.
    const refreshedSession = { ...session, access_token: 'token-2' };
    act(() => triggerAuthEvent('SIGNED_IN', refreshedSession));

    await waitFor(() =>
      expect(result.current.session?.access_token).toBe('token-2'),
    );
    expect(result.current.phase).toBe('authenticated');
    expect(profileQueryMock).toHaveBeenCalledTimes(1);
  });

  it('8. profile fetch network failure sets NETWORK_ERROR without signOut', async () => {
    const session = makeSession();
    const { client, signOutMock, profileQueryMock } = createMockSupabase(
      makeProfile(),
      session,
    );
    // postgrest-js surfaces fetch rejections (timeout/abort/network) as status 0.
    profileQueryMock.mockReturnValue(
      makeQueryResult({
        data: null,
        error: { message: 'AbortError: The operation was aborted' },
        status: 0,
      }),
    );

    const { result } = renderHook(() => useAuth(client, 'admin'));

    await waitFor(() => expect(result.current.phase).toBe('error'));
    expect(result.current.error?.code).toBe(AuthErrorCode.NETWORK_ERROR);
    expect(signOutMock).not.toHaveBeenCalled();
  });
});
