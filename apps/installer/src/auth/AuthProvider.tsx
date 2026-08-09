import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import { useAuth } from '@vitalock/shared';
import type { UseAuthReturn } from '@vitalock/shared';
import type { TypedSupabaseClient } from '@vitalock/supabase';

interface AuthProviderProps {
  supabase: TypedSupabaseClient;
  children: ReactNode;
}

export const AuthContext = createContext<UseAuthReturn | null>(null);

export function AuthProvider({ supabase, children }: AuthProviderProps) {
  const auth = useAuth(supabase, 'installer');
  return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>;
}

export function useAuthContext(): UseAuthReturn {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuthContext must be inside AuthProvider');
  return ctx;
}
