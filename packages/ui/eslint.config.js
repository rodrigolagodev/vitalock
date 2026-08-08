import base from '@vitalock/config-eslint/base';

export default [
  ...base,
  {
    // tailwind.preset.js uses require() for tailwindcss-animate — allowed in CJS config files
    ignores: ['tailwind.preset.js'],
  },
];
