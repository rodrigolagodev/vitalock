import { createContext, useContext, useEffect } from 'react';
import type { ReactNode } from 'react';
import type { TypedSupabaseClient } from '@vitalock/supabase';
import { useAuth } from './useAuth';
import { useIdleTimeout } from './useIdleTimeout';
import { setErrorReportingUser } from '../reporting/errorReporting';
import type { StaffRole, UseAuthReturn } from './types';

interface AuthProviderProps {
  supabase: TypedSupabaseClient;
  expectedRole: StaffRole;
  children: ReactNode;
}

export const AuthContext = createContext<UseAuthReturn | null>(null);

export function AuthProvider({ supabase, expectedRole, children }: AuthProviderProps) {
  const auth = useAuth(supabase, expectedRole);
  useIdleTimeout({
    enabled: auth.phase === 'authenticated',
    onIdle: () => {
      void auth.signOut();
    },
  });
  // Error reports carry the staff id + role only — never name, username or email.
  const staffId = auth.phase === 'authenticated' ? auth.staff?.id : undefined;
  const staffRole = auth.phase === 'authenticated' ? auth.staff?.role : undefined;
  useEffect(() => {
    setErrorReportingUser(staffId && staffRole ? { id: staffId, role: staffRole } : null);
  }, [staffId, staffRole]);

  return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>;
}

export function useAuthContext(): UseAuthReturn {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuthContext must be inside AuthProvider');
  return ctx;
}
