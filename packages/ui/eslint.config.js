import base from '@vitalock/config-eslint/base';
import { boundaries } from '@vitalock/config-eslint/boundaries';

export default [
  ...base,
  {
    // tailwind.preset.js uses require() for tailwindcss-animate — allowed in CJS config files
    ignores: ['tailwind.preset.js'],
  },
  boundaries('ui'),
];
