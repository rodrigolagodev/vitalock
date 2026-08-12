import { useCallback, useEffect, useRef, useState } from 'react';
import type { TypedSupabaseClient } from '@vitalock/supabase';
import { AuthErrorCode } from './types';
import type { AuthState, StaffProfile, StaffRole, UseAuthReturn } from './types';

const LOADING_PHASES = new Set(['initializing', 'authenticating', 'fetching_profile'] as const);

/** Max time to wait for the staff profile query before giving up (ms). */
const PROFILE_FETCH_TIMEOUT_MS = 15_000;

const initialState: AuthState = {
  phase: 'initializing',
  session: null,
  staff: null,
  error: null,
};

export function useAuth(
  supabase: TypedSupabaseClient,
  expectedRole: StaffRole,
): UseAuthReturn {
  const [state, setState] = useState<AuthState>(initialState);
  // Latest committed state, so async handlers can branch on it without
  // stale-closure reads (e.g. the auth event listener below).
  const stateRef = useRef(state);
  stateRef.current = state;
  const expectedRoleRef = useRef(expectedRole);
  expectedRoleRef.current = expectedRole;

  const fetchProfile = useCallback(
    async (userId: string): Promise<void> => {
      setState((prev) => ({ ...prev, phase: 'fetching_profile', error: null }));

      // Abort the request after PROFILE_FETCH_TIMEOUT_MS. A request that hangs
      // (dead connection after sleep / wifi drop) must never leave the app
      // stuck on the full-screen spinner forever.
      const { data, error, status } = await supabase
        .schema('identity')
        .from('staff')
        .select('id, auth_user_id, full_name, role, status')
        .eq('auth_user_id', userId)
        .abortSignal(AbortSignal.timeout(PROFILE_FETCH_TIMEOUT_MS))
        .single();

      if (error || !data) {
        // postgrest-js reports fetch rejections (network failure, timeout,
        // abort) with status 0 — the server never answered. Do NOT signOut:
        // the session may be perfectly valid, and destroying it for a
        // transient connectivity blip forces a fresh login. Surface a
        // recoverable error instead.
        if (status === 0) {
          setState({
            phase: 'error',
            session: null,
            staff: null,
            error: {
              code: AuthErrorCode.NETWORK_ERROR,
              message: 'Error de conexión. Intentá de nuevo.',
            },
          });
          return;
        }

        await supabase.auth.signOut();
        setState({
          phase: 'error',
          session: null,
          staff: null,
          error: {
            code: AuthErrorCode.NO_STAFF_ROW,
            message: 'Cuenta no provisionada. Contactar a soporte.',
          },
        });
        return;
      }

      const profile = data as unknown as StaffProfile;

      if (profile.status !== 'active') {
        await supabase.auth.signOut();
        setState({
          phase: 'error',
          session: null,
          staff: null,
          error: {
            code: AuthErrorCode.INACTIVE_STAFF,
            message: 'Cuenta desactivada.',
          },
        });
        return;
      }

      if (profile.role !== expectedRoleRef.current) {
        await supabase.auth.signOut();
        setState({
          phase: 'error',
          session: null,
          staff: null,
          error: {
            code: AuthErrorCode.WRONG_ROLE,
            message: 'Esta cuenta no tiene acceso a esta aplicación.',
          },
        });
        return;
      }

      setState((prev) => ({
        phase: 'authenticated',
        session: prev.session,
        staff: profile,
        error: null,
      }));
    },
    [supabase],
  );

  useEffect(() => {
    let mounted = true;

    // Subscribe to auth state changes. supabase-js fires INITIAL_SESSION on subscribe
    // with the persisted session (if any); SIGNED_IN fires on fresh login AND is
    // re-emitted by _recoverAndRefresh when the tab becomes visible again while
    // the stored session is still valid.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return;

      if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && session) {
        if (stateRef.current.phase === 'authenticated') {
          // supabase-js re-emits SIGNED_IN whenever the tab returns to the
          // foreground (visibilitychange → _recoverAndRefresh) while the
          // stored session is still valid. We already have the profile: update
          // the session silently. Re-entering fetching_profile here would
          // flash the full-screen spinner and re-fetch the profile on every
          // tab switch, and a hung refetch would leave the app stuck.
          setState((prev) => ({ ...prev, session }));
          return;
        }
        setState((prev) => ({ ...prev, session, phase: 'fetching_profile' }));
        await fetchProfile(session.user.id);
      } else if (event === 'INITIAL_SESSION' && !session) {
        setState({ phase: 'anonymous', session: null, staff: null, error: null });
      } else if (event === 'SIGNED_OUT') {
        setState({
          phase: 'anonymous',
          session: null,
          staff: null,
          error: null,
        });
      } else if (event === 'TOKEN_REFRESHED' && session) {
        setState((prev) =>
          prev.phase === 'authenticated' ? { ...prev, session } : prev,
        );
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [supabase, fetchProfile]);

  const signIn = useCallback(
    async (email: string, password: string): Promise<void> => {
      setState((prev) => ({ ...prev, phase: 'authenticating', error: null }));
      try {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          setState((prev) => ({
            ...prev,
            phase: 'error',
            error: {
              code: AuthErrorCode.INVALID_CREDENTIALS,
              message: 'Email o contraseña incorrectos.',
            },
          }));
        }
        // On success, onAuthStateChange fires SIGNED_IN — handled by listener
      } catch {
        setState((prev) => ({
          ...prev,
          phase: 'error',
          error: {
            code: AuthErrorCode.NETWORK_ERROR,
            message: 'Error de conexión. Intentá de nuevo.',
          },
        }));
      }
    },
    [supabase],
  );

  const signOut = useCallback(async (): Promise<void> => {
    await supabase.auth.signOut();
    // onAuthStateChange SIGNED_OUT fires and sets anonymous state
  }, [supabase]);

  const refresh = useCallback(async (): Promise<void> => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      await fetchProfile(session.user.id);
    }
  }, [supabase, fetchProfile]);

  return {
    ...state,
    isLoading: LOADING_PHASES.has(state.phase as 'initializing' | 'authenticating' | 'fetching_profile'),
    signIn,
    signOut,
    refresh,
  };
}
