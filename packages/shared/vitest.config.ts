import { defineConfig } from 'vitest/config';
import { coverageFor } from '../../vitest.config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: false,
    coverage: coverageFor('@vitalock/shared'),
  },
});
