export type StaffRole = 'admin' | 'installer';

export interface StaffProfile {
  id: string;
  auth_user_id: string;
  full_name: string;
  role: StaffRole;
  status: 'active' | 'inactive';
}

export enum AuthErrorCode {
  INVALID_CREDENTIALS = 'invalid_credentials',
  NETWORK_ERROR       = 'network_error',
  NO_STAFF_ROW        = 'no_staff_row',
  INACTIVE_STAFF      = 'inactive_staff',
  WRONG_ROLE          = 'wrong_role',
  SESSION_EXPIRED     = 'session_expired',
  VALIDATION_ERROR    = 'validation_error',
}

export type AuthPhase =
  | 'initializing'
  | 'anonymous'
  | 'authenticating'
  | 'fetching_profile'
  | 'authenticated'
  | 'error';

export interface AuthState {
  phase: AuthPhase;
  session: import('@supabase/supabase-js').Session | null;
  staff: StaffProfile | null;
  error: { code: AuthErrorCode; message: string } | null;
}

export interface UseAuthReturn extends AuthState {
  /** true when phase is initializing, authenticating, or fetching_profile */
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  /** Re-fetch staff profile; called internally on TOKEN_REFRESHED */
  refresh: () => Promise<void>;
}
