import { tabBar } from '@vitalock/ui/tailwind.tokens.js';

/**
 * Sonner offset that floats toasts above the bottom tab bar, the home
 * indicator inset and a small margin. Shares the tab bar height token so the
 * two cannot drift apart.
 */
export const toastOffset = {
  bottom: `calc(${tabBar.height} + env(safe-area-inset-bottom, 0px) + 0.75rem)`,
};
