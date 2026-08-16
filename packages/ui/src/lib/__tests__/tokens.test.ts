import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Vitalock design tokens — shadcn-style HSL system, light-first.
// Brand primary #5e5eee (240 79% 65%); dark surfaces are an opt-out adaptation
// of the same families, never a different hue system.
// Canonical invocation is `pnpm --filter @vitalock/ui test` (cwd = packages/ui).
const globalsPath = resolve(process.cwd(), 'globals.css');

function extractBlock(css: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, 's'));
  return match?.[1] ?? '';
}

function getVar(block: string, name: string): string | undefined {
  return block.match(new RegExp(`--${name}\\s*:\\s*([^;]+);`))?.[1]?.trim();
}

describe('shared design tokens (globals.css)', () => {
  const css = readFileSync(globalsPath, 'utf8');
  const root = extractBlock(css, ':root');
  const dark = extractBlock(css, '.dark');

  it('stores every color token as an HSL triplet, never hex', () => {
    const allTokens = [...css.matchAll(/--[a-z0-9-]+\s*:\s*([^;]+);/g)]
      .map((m) => m[1]?.trim() ?? '')
      .filter(Boolean);
    const hexTokens = allTokens.filter((v) => /^#/.test(v));
    expect(hexTokens).toEqual([]);
  });

  it('uses the brand primary 240 79% 65% in light and dark', () => {
    expect(getVar(root, 'primary')).toBe('240 79% 65%');
    expect(getVar(dark, 'primary')).toBe('240 79% 65%');
    expect(getVar(root, 'brand-500')).toBe('240 79% 65%');
    expect(getVar(dark, 'brand-500')).toBe('240 79% 65%');
  });

  it('drives --ring from the brand family', () => {
    expect(getVar(root, 'ring')).toBe('240 79% 65%');
    expect(getVar(dark, 'ring')).toBe('240 79% 65%');
    expect(getVar(root, 'accent')).toBe('245.8 100% 69.6%');
    expect(getVar(dark, 'accent')).toBe('245.8 100% 69.6%');
  });

  it('uses light content surface and a filled .dark block', () => {
    expect(getVar(root, 'background')).toBe('240 33.3% 97.1%');
    expect(getVar(root, 'content')).toBe('240 33.3% 97.1%');
    expect(/--[a-z-]+\s*:/.test(dark)).toBe(true);
    expect(getVar(dark, 'background')).toBe('232 17.5% 17.5%');
    expect(getVar(dark, 'content')).toBe('233 30% 11.2%');
  });

  it('defines surface pairs for popover and card', () => {
    expect(getVar(root, 'popover')).toBe('0 0% 100%');
    expect(getVar(root, 'popover-foreground')).toBe('224 50% 8%');
    expect(getVar(root, 'card')).toBe('0 0% 100%');
    expect(getVar(root, 'card-foreground')).toBe('217.2 32.6% 17.5%');
    expect(getVar(dark, 'popover')).toBe('224 35% 10%');
    expect(getVar(dark, 'card')).toBe('224 40% 6%');
  });

  it('defines semantic tone pairs with foregrounds in both modes', () => {
    for (const tone of ['destructive', 'info', 'success', 'warning'] as const) {
      expect(getVar(root, tone)).toBeTruthy();
      expect(getVar(root, `${tone}-foreground`)).toBeTruthy();
      expect(getVar(dark, tone)).toBeTruthy();
      expect(getVar(dark, `${tone}-foreground`)).toBeTruthy();
    }
  });

  it('exposes the full brand scale in both modes', () => {
    for (const step of ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950']) {
      expect(getVar(root, `brand-${step}`)).toBeTruthy();
      expect(getVar(dark, `brand-${step}`)).toBeTruthy();
    }
  });
});
