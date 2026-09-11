import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';
import { coverageFor } from '../../vitest.config';

// Test setup (jsdom, globals, setupFiles) stays in vite.config.ts; this file
// only layers the shared coverage floors from the root config on top.
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      coverage: coverageFor('@vitalock/admin'),
    },
  }),
);
