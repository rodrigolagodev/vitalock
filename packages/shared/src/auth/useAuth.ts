import { useCallback, useEffect, useRef, useState } from 'react';
import type { TypedSupabaseClient } from '@vitalock/supabase';
import { AuthErrorCode } from './types';
import type { AuthState, StaffProfile, StaffRole, UseAuthReturn } from './types';

const LOADING_PHASES = new Set(['initializing', 'authenticating', 'fetching_profile'] as const);

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
  const expectedRoleRef = useRef(expectedRole);
  expectedRoleRef.current = expectedRole;

  const fetchProfile = useCallback(
    async (userId: string): Promise<void> => {
      setState((prev) => ({ ...prev, phase: 'fetching_profile', error: null }));

      const { data, error } = await supabase
        .schema('identity')
        .from('staff')
        .select('id, auth_user_id, full_name, role, status')
        .eq('auth_user_id', userId)
        .single();

      if (error || !data) {
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

    // Subscribe to auth state changes first
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return;

      if (event === 'SIGNED_IN' && session) {
        setState((prev) => ({ ...prev, session, phase: 'fetching_profile' }));
        await fetchProfile(session.user.id);
      } else if (event === 'SIGNED_OUT') {
        setState({
          phase: 'anonymous',
          session: null,
          staff: null,
          error: null,
        });
      } else if (event === 'TOKEN_REFRESHED' && session) {
        // Stay authenticated; update session token but do not re-fetch profile
        setState((prev) =>
          prev.phase === 'authenticated' ? { ...prev, session } : prev,
        );
      }
    });

    // Check for existing session on mount
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return;
      if (!session) {
        setState({ phase: 'anonymous', session: null, staff: null, error: null });
      }
      // If session exists, onAuthStateChange SIGNED_IN fires and handles it
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
