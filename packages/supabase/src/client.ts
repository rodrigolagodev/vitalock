import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

export interface SupabaseEnv {
  url: string;
  anonKey: string;
}

export type TypedSupabaseClient = SupabaseClient<Database>;

export function createSupabaseClient(env: SupabaseEnv): TypedSupabaseClient {
  return createClient<Database>(env.url, env.anonKey, {
    auth: { persistSession: true, autoRefreshToken: true },
  });
}
