import { describe, expect, it } from 'vitest';
import { tabBar } from '@vitalock/ui/tailwind.tokens.js';
import { toastOffset } from '../toastOffset';

describe('toastOffset', () => {
  it('lifts toasts above the tab bar, the bottom safe area and a margin', () => {
    expect(toastOffset).toEqual({
      bottom: 'calc(3.0625rem + env(safe-area-inset-bottom, 0px) + 0.75rem)',
    });
  });

  it('derives the tab bar height from the shared token', () => {
    expect(toastOffset.bottom).toContain(tabBar.height);
  });
});
