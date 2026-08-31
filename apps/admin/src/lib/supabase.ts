import { loadClientEnv } from '@vitalock/shared';
import { createSupabaseClient } from '@vitalock/supabase';

const env = loadClientEnv(import.meta.env);

export const supabase = createSupabaseClient({
  url: env.VITE_SUPABASE_URL,
  anonKey: env.VITE_SUPABASE_ANON_KEY,
});
