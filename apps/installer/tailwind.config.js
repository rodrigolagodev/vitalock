import preset from '@vitalock/ui/tailwind.preset.js';
import { touchTypeScale } from '@vitalock/ui/tailwind.tokens.js';

/** @type {import('tailwindcss').Config} */
export default {
  presets: [preset],
  content: ['./index.html', './src/**/*.{ts,tsx}', '../../packages/ui/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // Same ladder names as admin, compiled with the touch values.
      fontSize: touchTypeScale,
    },
  },
};
