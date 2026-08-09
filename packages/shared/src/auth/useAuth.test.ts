import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useAuth } from './useAuth';
import { AuthErrorCode } from './types';
import type { TypedSupabaseClient } from '@vitalock/supabase';

// ---------------------------------------------------------------------------
// Mock factory
// ---------------------------------------------------------------------------

type AuthStateChangeCallback = (event: string, session: unknown) => void;

interface MockSupabase {
  client: TypedSupabaseClient;
  triggerAuthEvent: (event: string, session: unknown) => void;
  signInMock: Mock;
  signOutMock: Mock;
  profileQueryMock: Mock;
}

function createMockSupabase(profileData: unknown = null): MockSupabase {
  let authCallback: AuthStateChangeCallback | null = null;

  const signInMock = vi.fn();
  const signOutMock = vi.fn().mockResolvedValue({ error: null });
  const profileQueryMock = vi.fn().mockResolvedValue({ data: profileData, error: null });

  const mockSelectChain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: profileQueryMock,
  };

  const mockFromChain = {
    from: vi.fn().mockReturnValue(mockSelectChain),
  };

  const client = {
    auth: {
      onAuthStateChange: vi.fn((cb: AuthStateChangeCallback) => {
        authCallback = cb;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      }),
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
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
    const { client, triggerAuthEvent } = createMockSupabase(makeProfile());

    // Simulate existing session: getSession returns it, then SIGNED_IN fires
    (client.auth.getSession as Mock).mockImplementation(async () => {
      setTimeout(() => triggerAuthEvent('SIGNED_IN', session), 0);
      return { data: { session } };
    });

    const { result } = renderHook(() => useAuth(client, 'admin'));

    await waitFor(() => expect(result.current.phase).toBe('authenticated'));
    expect(result.current.staff?.full_name).toBe('Ana Alvarez');
  });

  it('6. signOut sets phase=anonymous with null staff and session', async () => {
    const session = makeSession();
    const { client, triggerAuthEvent } = createMockSupabase(makeProfile());

    (client.auth.getSession as Mock).mockImplementation(async () => {
      setTimeout(() => triggerAuthEvent('SIGNED_IN', session), 0);
      return { data: { session } };
    });

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
});
