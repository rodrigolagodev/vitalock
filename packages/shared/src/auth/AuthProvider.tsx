import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import type { TypedSupabaseClient } from '@vitalock/supabase';
import { useAuth } from './useAuth';
import type { StaffRole, UseAuthReturn } from './types';

interface AuthProviderProps {
  supabase: TypedSupabaseClient;
  expectedRole: StaffRole;
  children: ReactNode;
}

export const AuthContext = createContext<UseAuthReturn | null>(null);

export function AuthProvider({ supabase, expectedRole, children }: AuthProviderProps) {
  const auth = useAuth(supabase, expectedRole);
  return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>;
}

export function useAuthContext(): UseAuthReturn {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuthContext must be inside AuthProvider');
  return ctx;
}
