import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  controlHeight,
  elevation,
  fontFamily,
  motion,
  radius,
  touchTypeScale,
  typeScale,
  type TypeName,
} from '../../tailwind.tokens.js';

const px = (rem: string) => parseFloat(rem) * 16;

describe('tailwind.tokens.js', () => {
  it('declares the system font stack', () => {
    const sans = fontFamily.sans;
    expect(sans.slice(0, 4)).toEqual([
      '-apple-system',
      'BlinkMacSystemFont',
      '"SF Pro Text"',
      'Inter',
    ]);
    expect(sans).toEqual(expect.arrayContaining(['"Segoe UI"', 'Roboto']));
    expect(sans.indexOf('"Segoe UI"')).toBeGreaterThan(sans.indexOf('Inter'));
    expect(sans.indexOf('Roboto')).toBeGreaterThan(sans.indexOf('"Segoe UI"'));
    expect(sans[sans.length - 1]).toBe('sans-serif');
  });

  it('exposes the nine ladder names with desktop values', () => {
    const expected: Record<TypeName, [string, string, string]> = {
      'large-title': ['2.125rem', '2.5625rem', '700'],
      'title-1': ['1.75rem', '2.125rem', '600'],
      'title-2': ['1.375rem', '1.75rem', '600'],
      'title-3': ['1.125rem', '1.5rem', '600'],
      headline: ['0.9375rem', '1.25rem', '600'],
      body: ['0.875rem', '1.25rem', '400'],
      callout: ['0.8125rem', '1.125rem', '400'],
      footnote: ['0.75rem', '1rem', '400'],
      caption: ['0.6875rem', '0.8125rem', '500'],
    };
    expect(Object.keys(typeScale).sort()).toEqual(Object.keys(expected).sort());
    for (const [name, [size, lh, weight]] of Object.entries(expected) as [
      TypeName,
      [string, string, string],
    ][]) {
      expect(typeScale[name]).toEqual([size, { lineHeight: lh, fontWeight: weight }]);
    }
  });

  it('converts to the spec px values (rem x 16)', () => {
    expect(px(typeScale['title-1'][0])).toBe(28);
    expect(px(typeScale['title-1'][1].lineHeight)).toBe(34);
    expect(px(typeScale.caption[0])).toBe(11);
    expect(px(typeScale.caption[1].lineHeight)).toBe(13);
  });

  it('exposes the touch scale under the same names', () => {
    const expected: Partial<Record<TypeName, [string, string]>> = {
      'title-3': ['1.25rem', '1.5625rem'],
      headline: ['1.0625rem', '1.375rem'],
      body: ['1.0625rem', '1.375rem'],
      callout: ['1rem', '1.3125rem'],
      footnote: ['0.8125rem', '1.125rem'],
      caption: ['0.75rem', '1rem'],
    };
    for (const [name, [size, lh]] of Object.entries(expected) as [TypeName, [string, string]][]) {
      expect(touchTypeScale[name][0]).toBe(size);
      expect(touchTypeScale[name][1].lineHeight).toBe(lh);
    }
    for (const name of Object.keys(typeScale))
      expect(touchTypeScale[name as TypeName]).toBeDefined();
  });

  it('exposes radius tiers, control heights, elevation and motion', () => {
    expect(radius).toEqual({ control: '0.5rem', container: '0.75rem', sheet: '1rem' });
    expect(controlHeight).toEqual({
      'control-sm': '2.25rem',
      'control-md': '2.75rem',
      'control-lg': '3.25rem',
    });
    expect(px(controlHeight['control-sm'])).toBe(36);
    expect(px(controlHeight['control-md'])).toBe(44);
    expect(px(controlHeight['control-lg'])).toBe(52);

    expect(elevation['elevation-0']).toBe('none');
    expect(elevation['elevation-1']).toBe('none');
    expect(elevation['elevation-2']).toBe(
      '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
    );
    expect(elevation['elevation-3']).toBe(
      '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)',
    );
    expect(elevation['elevation-3']).not.toBe(elevation['elevation-2']);

    expect(motion.duration).toEqual({ state: '150ms', overlay: '250ms' });
    expect(motion.timing.standard).toBe('cubic-bezier(0, 0, 0.2, 1)');
    const ys = [...motion.timing.standard.matchAll(/-?\d*\.?\d+/g)].map((m) => Number(m[0]));
    expect(ys[1]).toBeGreaterThanOrEqual(0);
    expect(ys[3]).toBeLessThanOrEqual(1);
  });
});

describe('tailwind preset wiring', () => {
  it('spreads the tokens into theme.extend without touching existing keys', async () => {
    const { default: preset } = await import('../../tailwind.preset.js');
    const extend = preset.theme?.extend as unknown as {
      fontSize: unknown;
      fontFamily: { sans: string[] };
      borderRadius: Record<string, string>;
      spacing: unknown;
      boxShadow: unknown;
      transitionDuration: unknown;
      transitionTimingFunction: unknown;
      colors: { destructive: Record<string, string> };
    };
    expect(extend.fontSize).toEqual(typeScale);
    expect(extend.fontFamily.sans).toEqual(fontFamily.sans);
    expect(extend.borderRadius).toMatchObject({
      control: '0.5rem',
      container: '0.75rem',
      sheet: '1rem',
      lg: 'var(--radius)',
      md: 'calc(var(--radius) - 2px)',
      sm: 'calc(var(--radius) - 4px)',
    });
    expect(extend.spacing).toEqual(controlHeight);
    expect(extend.boxShadow).toEqual(elevation);
    expect(extend.transitionDuration).toEqual(motion.duration);
    expect(extend.transitionTimingFunction).toEqual({ standard: 'cubic-bezier(0, 0, 0.2, 1)' });
    expect(extend.colors.destructive.solid).toBe('hsl(var(--destructive-solid))');
    expect(extend.colors.destructive.DEFAULT).toBe('hsl(var(--destructive))');
    expect(extend.colors.destructive.foreground).toBe('hsl(var(--destructive-foreground))');
  });
});

describe('per-app touch scale', () => {
  const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');

  it('installer overrides fontSize with the touch scale', () => {
    const cfg = read('../../apps/installer/tailwind.config.js');
    expect(cfg).toContain("import { touchTypeScale } from '@vitalock/ui/tailwind.tokens.js'");
    expect(cfg).toMatch(/extend:\s*\{[^}]*fontSize:\s*touchTypeScale/);
  });

  it('admin does not override fontSize', () => {
    expect(read('../../apps/admin/tailwind.config.js')).not.toMatch(/fontSize/);
  });
});
