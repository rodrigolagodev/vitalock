// Shared ESLint flat-config base for every workspace. Extended by
// `./react.js` (which layers React/JSX plugins and browser globals for
// `**/*.{ts,tsx}` and `public/**/*.js`). Non-React packages import this
// module directly.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['dist', 'coverage', '.turbo', 'node_modules'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.node },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'error',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      // no-floating-promises requires the type-aware parser; enabled per-project
      // where a tsconfig with `project` is configured, not here globally, to
      // keep this base config usable in non-TS-aware contexts.
    },
  },
);
