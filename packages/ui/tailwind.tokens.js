/**
 * Target-system design tokens for the Tailwind preset. Pure ESM with no
 * plugin imports so tests (and the installer config) can import it on its own.
 * Sizes are in rem so they respect the user's browser font size (1rem = 16px).
 */

export const fontFamily = {
  sans: [
    '-apple-system',
    'BlinkMacSystemFont',
    '"SF Pro Text"',
    'Inter',
    '"Segoe UI"',
    'Roboto',
    'sans-serif',
  ],
};

/** Desktop (admin) ladder. Entry shape: [fontSize, { lineHeight, fontWeight }]. */
export const typeScale = {
  'large-title': ['2.125rem', { lineHeight: '2.5625rem', fontWeight: '700' }],
  'title-1': ['1.75rem', { lineHeight: '2.125rem', fontWeight: '600' }],
  'title-2': ['1.375rem', { lineHeight: '1.75rem', fontWeight: '600' }],
  'title-3': ['1.125rem', { lineHeight: '1.5rem', fontWeight: '600' }],
  headline: ['0.9375rem', { lineHeight: '1.25rem', fontWeight: '600' }],
  body: ['0.875rem', { lineHeight: '1.25rem', fontWeight: '400' }],
  callout: ['0.8125rem', { lineHeight: '1.125rem', fontWeight: '400' }],
  footnote: ['0.75rem', { lineHeight: '1rem', fontWeight: '400' }],
  caption: ['0.6875rem', { lineHeight: '0.8125rem', fontWeight: '500' }],
};

/** Touch (installer) ladder: same names, larger values where they differ. */
export const touchTypeScale = {
  ...typeScale,
  'title-3': ['1.25rem', { lineHeight: '1.5625rem', fontWeight: '600' }],
  headline: ['1.0625rem', { lineHeight: '1.375rem', fontWeight: '600' }],
  body: ['1.0625rem', { lineHeight: '1.375rem', fontWeight: '400' }],
  callout: ['1rem', { lineHeight: '1.3125rem', fontWeight: '400' }],
  footnote: ['0.8125rem', { lineHeight: '1.125rem', fontWeight: '400' }],
  caption: ['0.75rem', { lineHeight: '1rem', fontWeight: '500' }],
};

export const radius = {
  control: '0.5rem',
  container: '0.75rem',
  sheet: '1rem',
};

/** Registered under `spacing` so h-, min-h-, w- and size- utilities exist. */
export const controlHeight = {
  'control-sm': '2.25rem',
  'control-md': '2.75rem',
  'control-lg': '3.25rem',
};

/** Layout sizes with no exact Tailwind scale step (60px sits between 56 and 64). */
export const layoutSpacing = {
  topbar: '3.75rem',
};

export const elevation = {
  'elevation-0': 'none',
  'elevation-1': 'none',
  'elevation-2': '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
  'elevation-3': '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)',
};

export const motion = {
  duration: { state: '150ms', overlay: '250ms' },
  // Ease-out, no overshoot.
  timing: { standard: 'cubic-bezier(0, 0, 0.2, 1)' },
};
