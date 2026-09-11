// Workspace import boundaries, enforced with core `no-restricted-imports`
// (no plugin needed). Until now the rule "apps do not reimplement packages/ui
// primitives" and "packages never import apps" lived only in AGENTS.md — and a
// convention without a gate gets violated (apps/installer shipped its own
// popover/skeleton on top of @radix-ui until 2026-09-10).
//
// Usage in a workspace eslint.config.js:
//   import { boundaries } from '@vitalock/config-eslint/boundaries';
//   export default [...react, boundaries('app')];
//
// kind:
//   'app'     apps/*        — may import packages; not other apps; not Radix directly
//   'ui'      packages/ui   — the ONLY workspace allowed to import @radix-ui/*
//   'package' packages/*    — may import sibling packages; never apps

const RELATIVE_CROSS_WORKSPACE = [
  {
    group: ['**/apps/*', '**/apps/*/**', '**/packages/*', '**/packages/*/**'],
    message:
      'Do not reach into another workspace by relative path. Import the package by name (@vitalock/…).',
  },
];

const NO_APP_IMPORTS = [
  {
    group: [
      '@vitalock/admin',
      '@vitalock/admin/**',
      '@vitalock/installer',
      '@vitalock/installer/**',
    ],
    message: 'Apps are leaves of the dependency graph: nothing may import them.',
  },
];

const NO_DIRECT_RADIX = [
  {
    group: ['@radix-ui/*'],
    message:
      'Radix primitives are wrapped once in @vitalock/ui. Import the component from there; if it is missing, add it to packages/ui instead of duplicating it here.',
  },
];

const NO_DEEP_PACKAGE_IMPORTS = [
  {
    group: ['@vitalock/*/src/**'],
    message:
      'Import from the package entry point (its index.ts is the public API). Deep imports into src/ couple you to internal layout.',
  },
];

export function boundaries(kind) {
  const patterns = [...RELATIVE_CROSS_WORKSPACE, ...NO_APP_IMPORTS, ...NO_DEEP_PACKAGE_IMPORTS];
  if (kind === 'app' || kind === 'package') patterns.push(...NO_DIRECT_RADIX);
  return {
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', { patterns }],
    },
  };
}
