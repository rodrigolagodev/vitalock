import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end journeys against the real apps + the local Supabase stack.
 *
 *   supabase start            # once; seeds admin@vitalock.local / installer@vitalock.local
 *   pnpm e2e                  # starts both dev servers, runs every journey
 *   pnpm e2e --ui             # interactive
 *
 * Why this layer exists: the unit/component suites render one page with a
 * mocked client, and the pgTAP suite proves the database in isolation. Neither
 * would have caught the RPC authorization gap (P0-2) end to end — a logged-in
 * installer hitting an admin route through the real client is only observable
 * here. Journeys are the four documented flows in docs/architecture/flow-*.
 */
// The apps under test must point at the LOCAL stack (seed users, rolled-back
// state), never at the linked project — regardless of what apps/*/.env.local
// says on a developer machine.
const localSupabaseEnv = {
  VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL ?? 'http://127.0.0.1:54321',
  VITE_SUPABASE_ANON_KEY:
    process.env.VITE_SUPABASE_ANON_KEY ??
    // Fixed dev-only anon JWT that every `supabase start` issues.
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0',
};

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  timeout: 30_000,
  expect: { timeout: 10_000 },
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    locale: 'es-AR',
  },
  projects: [
    {
      name: 'admin',
      testDir: './e2e/admin',
      use: { ...devices['Desktop Chrome'], baseURL: 'http://127.0.0.1:5173' },
    },
    {
      name: 'installer',
      testDir: './e2e/installer',
      use: { ...devices['Pixel 7'], baseURL: 'http://127.0.0.1:5174' },
    },
  ],
  webServer: [
    {
      // Production build + preview, not `vite dev`: the dev server transforms
      // hundreds of modules on the first visit of each lazy route and on a slow
      // runner that alone blows the expect timeout (7/10 route journeys failed
      // that way). Preview serves the real bundle - chunks, CSP and all.
      // Bind to 127.0.0.1: `localhost` can resolve to ::1 on CI runners.
      command:
        'pnpm --filter @vitalock/admin exec vite build && pnpm --filter @vitalock/admin exec vite preview --host 127.0.0.1 --port 5173 --strictPort',
      url: 'http://127.0.0.1:5173',
      env: localSupabaseEnv,
      reuseExistingServer: !process.env.CI,
      stdout: 'pipe',
      stderr: 'pipe',
      timeout: 180_000,
    },
    {
      // Production build + preview, not `vite dev`: the dev server transforms
      // hundreds of modules on the first visit of each lazy route and on a slow
      // runner that alone blows the expect timeout (7/10 route journeys failed
      // that way). Preview serves the real bundle - chunks, CSP and all.
      // Bind to 127.0.0.1: `localhost` can resolve to ::1 on CI runners.
      command:
        'pnpm --filter @vitalock/installer exec vite build && pnpm --filter @vitalock/installer exec vite preview --host 127.0.0.1 --port 5174 --strictPort',
      url: 'http://127.0.0.1:5174',
      env: localSupabaseEnv,
      reuseExistingServer: !process.env.CI,
      stdout: 'pipe',
      stderr: 'pipe',
      timeout: 180_000,
    },
  ],
});
