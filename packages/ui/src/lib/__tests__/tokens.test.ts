import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Light-first palette measured from Figma (dWGVfiKpzUoD7l2K4yqG7D): primary #5d5fef,
// nav active #7364ff, content background #f5f5fa. Dark is an opt-out adaptation of
// the same accent family (D12) — NOT the previous violet #4B2AD1 system.
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

  it('uses the light-first primary #5d5fef in light and dark', () => {
    expect(getVar(root, 'primary')).toBe('239.2 82% 65.1%');
    expect(getVar(dark, 'primary')).toBe('239.2 82% 65.1%');
  });

  it('drives --ring and --accent from the light-first accent family', () => {
    expect(getVar(root, 'ring')).toBe('239.2 82% 65.1%');
    expect(getVar(root, 'accent')).toBe('245.8 100% 69.6%');
    expect(getVar(dark, 'ring')).toBe('239.2 82% 65.1%');
    expect(getVar(dark, 'accent')).toBe('245.8 100% 69.6%');
  });

  it('uses the content background #f5f5fa in light and fills the .dark block', () => {
    expect(getVar(root, 'background')).toBe('240 33.3% 97.1%');
    expect(/--[a-z-]+\s*:/.test(dark)).toBe(true);
    expect(getVar(dark, 'background')).toBe('224 40% 6%');
  });

  it('defines --popover/--popover-foreground and --card/--card-foreground', () => {
    expect(getVar(root, 'popover')).toBe('0 0% 100%');
    expect(getVar(root, 'popover-foreground')).toBe('224 50% 8%');
    expect(getVar(root, 'card')).toBe('0 0% 100%');
    expect(getVar(root, 'card-foreground')).toBe('217.2 32.6% 17.5%');
    expect(getVar(dark, 'popover')).toBe('224 35% 10%');
    expect(getVar(dark, 'card')).toBe('224 40% 6%');
  });
});
