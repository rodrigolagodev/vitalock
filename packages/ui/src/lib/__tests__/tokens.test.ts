import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { composite, contrastRatio, hslToRgb, parseHsl, type Rgb } from '../contrast';

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
    expect(getVar(root, 'accent')).toBe('220 16% 93%');
    expect(getVar(dark, 'accent')).toBe('224 20% 20%');
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
    for (const step of [
      '50',
      '100',
      '200',
      '300',
      '400',
      '500',
      '600',
      '700',
      '800',
      '900',
      '950',
    ]) {
      expect(getVar(root, `brand-${step}`)).toBeTruthy();
      expect(getVar(dark, `brand-${step}`)).toBeTruthy();
    }
  });
});

describe('recalibrated token values (ui-foundations-hig)', () => {
  const css = readFileSync(globalsPath, 'utf8');
  const root = extractBlock(css, ':root');
  const dark = extractBlock(css, '.dark');

  it.each([
    ['muted-foreground', '215 18% 43%'],
    ['input', '215 14% 57%'],
    ['destructive', '0 84.2% 44%'],
    ['info', '217 91% 46%'],
    ['warning', '38 92% 29%'],
    ['success', '160 84% 25%'],
    ['info-foreground', '0 0% 100%'],
    ['destructive-foreground', '0 0% 100%'],
    ['destructive-solid', '0 84.2% 44%'],
    ['accent', '220 16% 93%'],
    ['accent-foreground', '217.2 32.6% 17.5%'],
  ])('light --%s is %s', (name, value) => {
    expect(getVar(root, name)).toBe(value);
  });

  it.each([
    ['destructive', '0 72% 68%'],
    ['destructive-solid', '0 72% 50%'],
    ['destructive-foreground', '0 0% 100%'],
    ['success-foreground', '158 80% 10%'],
    ['warning-foreground', '38 92% 12%'],
    ['input', '224 12% 50%'],
    ['border', '224 20% 24%'],
    ['accent', '224 20% 20%'],
    ['accent-foreground', '224 20% 95%'],
  ])('dark --%s is %s', (name, value) => {
    expect(getVar(dark, name)).toBe(value);
  });

  it('defines the destructive text/solid/foreground split in both themes', () => {
    for (const block of [root, dark]) {
      for (const name of ['destructive', 'destructive-solid', 'destructive-foreground']) {
        expect(getVar(block, name)).toBeTruthy();
      }
    }
  });

  it('never uses the failing 0 72% 62% for a destructive token', () => {
    for (const block of [root, dark]) {
      for (const name of ['destructive', 'destructive-solid', 'destructive-foreground']) {
        expect(getVar(block, name)).not.toBe('0 72% 62%');
      }
    }
  });

  it('keeps --accent neutral (saturation <= 20%) in both themes', () => {
    for (const block of [root, dark]) {
      expect(parseHsl(getVar(block, 'accent') ?? '').s).toBeLessThanOrEqual(20);
    }
  });

  it('does not use #a9b0ba (215.3 11% 69.6%) as muted text', () => {
    expect(getVar(root, 'muted-foreground')).not.toBe('215.3 11% 69.6%');
  });

  it('declares a single final dark --border (no experiment comment)', () => {
    expect(dark.match(/--border\s*:/g)).toHaveLength(1);
    expect(dark).not.toMatch(/probando/i);
  });
});

describe('contrast floors (computed from globals.css)', () => {
  const css = readFileSync(globalsPath, 'utf8');
  const themes = { light: extractBlock(css, ':root'), dark: extractBlock(css, '.dark') };
  type Theme = keyof typeof themes;

  const FLOORS = {
    TEXT: 4.5,
    BOUNDARY: 3,
    // --border is a decorative hairline: EXEMPT from the 3:1 boundary floor.
    // Control outlines use --input, which is never exempt.
    HAIRLINE: 1.2,
    // Perceptibility of a hover surface, not a WCAG requirement.
    HOVER: 1.05,
  } as const;

  function color(theme: Theme, name: string): Rgb {
    const value = getVar(themes[theme], name);
    if (!value) throw new Error(`--${name} missing in ${theme}`);
    return hslToRgb(parseHsl(value));
  }

  type Pair = {
    kind: keyof typeof FLOORS;
    theme: Theme;
    fg: string;
    bg: string;
    ratio: () => number;
  };
  const pairs: Pair[] = [];
  function add(kind: Pair['kind'], themeList: Theme[], fg: string, bgs: string[]) {
    for (const theme of themeList) {
      for (const bg of bgs) {
        pairs.push({
          kind,
          theme,
          fg,
          bg,
          ratio: () => contrastRatio(color(theme, fg), color(theme, bg)),
        });
      }
    }
  }

  const both: Theme[] = ['light', 'dark'];
  const tones = ['destructive', 'info', 'success', 'warning'];

  add('TEXT', both, 'foreground', ['background', 'card']);
  add('TEXT', both, 'popover-foreground', ['popover']);
  add('TEXT', both, 'muted-foreground', ['card', 'background', 'muted', 'popover', 'accent']);
  add('TEXT', both, 'accent-foreground', ['accent']);
  add('TEXT', both, 'primary-foreground', ['primary']);
  add('TEXT', both, 'destructive-foreground', ['destructive-solid']);
  for (const tone of ['info', 'success', 'warning'])
    add('TEXT', both, `${tone}-foreground`, [tone]);
  for (const tone of tones) add('TEXT', both, tone, ['card', 'popover', 'content']);
  add('TEXT', ['dark'], 'destructive', ['background']);
  // Soft badges: tone text on its 10% tint composited over the card (light).
  for (const tone of tones) {
    pairs.push({
      kind: 'TEXT',
      theme: 'light',
      fg: tone,
      bg: `${tone}/10 over card`,
      ratio: () =>
        contrastRatio(
          color('light', tone),
          composite(color('light', tone), color('light', 'card'), 0.1),
        ),
    });
  }
  add('BOUNDARY', both, 'input', ['card', 'background', 'popover']);
  add('BOUNDARY', both, 'ring', ['card', 'background']);
  add('HAIRLINE', both, 'border', ['card']);
  add('HOVER', both, 'accent', ['card', 'popover']);

  it.each(pairs.map((p) => [`${p.theme}: ${p.fg} on ${p.bg} >= ${FLOORS[p.kind]}`, p] as const))(
    '%s',
    (_name, p) => {
      expect(p.ratio()).toBeGreaterThanOrEqual(FLOORS[p.kind]);
    },
  );
});

describe('reduced motion (globals.css)', () => {
  const css = readFileSync(globalsPath, 'utf8');
  const start = css.indexOf('@media (prefers-reduced-motion: reduce)');
  // The rule must live at top level, after the closing of @layer base.
  const layerEnd = css.lastIndexOf('@layer base');
  const body = start === -1 ? '' : (css.slice(start).match(/\{([\s\S]*?\})\s*\}/)?.[1] ?? '');

  it('declares the media block outside any @layer', () => {
    expect(start).toBeGreaterThan(-1);
    expect(start).toBeGreaterThan(layerEnd);
    // @layer base closes before the media query: brace depth is 0 at `start`.
    const before = css.slice(0, start);
    const depth = (before.match(/\{/g)?.length ?? 0) - (before.match(/\}/g)?.length ?? 0);
    expect(depth).toBe(0);
  });

  it('targets all elements including pseudo-elements', () => {
    expect(body).toMatch(/\*,\s*\*::before,\s*\*::after/);
  });

  it('neutralises animation and transition without animation: none', () => {
    expect(body).toContain('animation-duration: 0.01ms !important;');
    expect(body).toContain('animation-iteration-count: 1 !important;');
    expect(body).toContain('transition-duration: 0.01ms !important;');
    expect(body).toContain('scroll-behavior: auto !important;');
    expect(body).not.toMatch(/animation\s*:\s*none/);
  });
});
