import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      'packages/*/vitest.config.ts',
      'packages/shared',
      'apps/*',
    ],
    globals: false,
    environment: 'node',
    coverage: { provider: 'v8', reporter: ['text', 'html'], reportsDirectory: './coverage' },
  },
});
