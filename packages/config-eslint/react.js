import base from './base.js';
import reactHooks from 'eslint-plugin-react-hooks';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';

export default [
  ...base,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      globals: { ...globals.browser },
    },
    plugins: {
      'react-hooks': reactHooks,
      'jsx-a11y': jsxA11y,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...jsxA11y.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
  {
    // Query keys have one home: src/lib/queryKeys.ts. An inline
    // `queryKey: ['admin', 'tarea', id]` drifts silently from the factory and
    // then stops matching on invalidation — the exact bug this repo shipped
    // (the same literal duplicated across 4 mutation hooks). Composition via
    // spread is banned too: extend the factory instead.
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/lib/queryKeys.ts', '**/__tests__/**', '**/*.test.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "Property[key.name='queryKey'] > ArrayExpression",
          message:
            'Inline query keys are not allowed. Add or extend a factory in src/lib/queryKeys.ts.',
        },
      ],
    },
  },
  {
    files: ['public/**/*.js'],
    languageOptions: {
      globals: { ...globals.browser },
    },
  },
];
