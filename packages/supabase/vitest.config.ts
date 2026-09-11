import { defineConfig } from 'vitest/config';
import { coverageFor } from '../../vitest.config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    coverage: coverageFor('@vitalock/supabase'),
  },
});
