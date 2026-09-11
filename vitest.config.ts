import { defineConfig } from 'vitest/config';

/**
 * Root Vitest config — single source of truth for coverage policy.
 *
 * Tests do not actually run from here: `pnpm test` fans out through
 * `turbo run test`, and every workspace runs its own Vitest instance. Each
 * workspace `vitest.config.ts` imports `coverageFor()` below so the floors
 * live in one file instead of five.
 *
 * COVERAGE FLOORS — measured 2026-09-09 with `vitest run --coverage`
 * (v8 provider, default include set), then rounded DOWN by ~2-3 points so CI
 * is green on today's tree while still failing on a real regression:
 *
 *   workspace              statements  branches  functions  lines
 *   @vitalock/admin          61.19      77.61     73.52     61.19
 *   @vitalock/installer      79.13      64.92     70.64     79.13
 *   @vitalock/ui             66.29      88.88     66.66     66.29
 *   @vitalock/shared         67.51      83.07     68.42     67.51
 *   @vitalock/supabase       43.72      92.10     84.00     43.72
 *
 * RATCHET POLICY: when a workspace's measured coverage rises, raise its floor
 * here in the same PR. Never lower a floor to turn a red build green — fix the
 * test gap or delete the untested code instead.
 */
export const coverageThresholds = {
  '@vitalock/admin': { statements: 58, branches: 74, functions: 70, lines: 58 },
  '@vitalock/installer': { statements: 76, branches: 62, functions: 67, lines: 76 },
  '@vitalock/ui': { statements: 63, branches: 85, functions: 63, lines: 63 },
  '@vitalock/shared': { statements: 64, branches: 80, functions: 65, lines: 64 },
  '@vitalock/supabase': { statements: 40, branches: 88, functions: 80, lines: 40 },
};

export type CoverageWorkspace = keyof typeof coverageThresholds;

/** Coverage block for a workspace `vitest.config.ts`. */
export function coverageFor(workspace: CoverageWorkspace) {
  return {
    provider: 'v8' as const,
    reporter: ['text-summary', 'html'],
    reportsDirectory: './coverage',
    thresholds: coverageThresholds[workspace],
  };
}

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      reportsDirectory: './coverage',
    },
  },
});
