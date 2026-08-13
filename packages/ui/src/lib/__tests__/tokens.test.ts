import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Design D2: #4B2AD1 = hsl(251.9 66.5% 49.2%) drives primary/ring/accent.
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

  it('uses the violet accent #4B2AD1 as --primary in light and dark', () => {
    expect(getVar(root, 'primary')).toBe('251.9 66.5% 49.2%');
    expect(getVar(dark, 'primary')).toBe('251.9 66.5% 49.2%');
  });

  it('drives --ring and --accent from the violet accent in both palettes', () => {
    expect(getVar(root, 'ring')).toBe('251.9 66.5% 49.2%');
    expect(getVar(root, 'accent')).toBe('252 60% 95%');
    // Dark focus ring lifted to 65% lightness for visibility (D2).
    expect(getVar(dark, 'ring')).toBe('251.9 70% 65%');
    expect(getVar(dark, 'accent')).toBe('252 35% 22%');
  });

  it('fills the .dark block with the adapted violet palette', () => {
    expect(/--[a-z-]+\s*:/.test(dark)).toBe(true);
    expect(getVar(dark, 'background')).toBe('224 40% 6%');
    expect(getVar(dark, 'foreground')).toBe('224 20% 95%');
  });

  it('defines --popover/--popover-foreground and --card/--card-foreground', () => {
    expect(getVar(root, 'popover')).toBe('0 0% 100%');
    expect(getVar(root, 'popover-foreground')).toBe('224 50% 8%');
    expect(getVar(root, 'card')).toBe('0 0% 100%');
    expect(getVar(root, 'card-foreground')).toBe('224 50% 8%');
    expect(getVar(dark, 'popover')).toBe('224 35% 10%');
    expect(getVar(dark, 'card')).toBe('224 40% 6%');
  });
});
