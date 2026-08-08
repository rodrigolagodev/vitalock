import { z } from 'zod';

const clientSchema = z.object({
  VITE_SUPABASE_URL: z.string().url(),
  VITE_SUPABASE_ANON_KEY: z.string().min(1),
});

const serverSchema = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
});

export type ClientEnv = z.infer<typeof clientSchema>;
export type ServerEnv = z.infer<typeof serverSchema>;

export class EnvValidationError extends Error {
  constructor(public issues: z.ZodIssue[]) {
    super(
      `Env validation failed:\n${issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n')}`,
    );
    this.name = 'EnvValidationError';
  }
}

export function loadClientEnv(source: Record<string, unknown>): ClientEnv {
  const parsed = clientSchema.safeParse(source);
  if (!parsed.success) throw new EnvValidationError(parsed.error.issues);
  return parsed.data;
}

export function loadServerEnv(source: Record<string, unknown> = process.env): ServerEnv {
  const parsed = serverSchema.safeParse(source);
  if (!parsed.success) throw new EnvValidationError(parsed.error.issues);
  return parsed.data;
}
