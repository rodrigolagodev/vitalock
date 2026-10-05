/**
 * WCAG 2.x contrast helpers for the design-token tests. Pure and intentionally
 * NOT exported from the package index: it is test/tooling support.
 */

export interface Hsl {
  h: number;
  s: number;
  l: number;
}

export type Rgb = readonly [number, number, number];

/** Parses a `h s% l%` triplet as stored in globals.css. */
export function parseHsl(triplet: string): Hsl {
  const match = triplet.trim().match(/^(-?\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)%\s+(\d+(?:\.\d+)?)%$/);
  if (!match) throw new Error(`Not an HSL triplet: "${triplet}"`);
  return { h: Number(match[1]), s: Number(match[2]), l: Number(match[3]) };
}

/** Converts HSL to sRGB channels in the 0-255 range (not rounded). */
export function hslToRgb({ h, s, l }: Hsl): [number, number, number] {
  const sat = s / 100;
  const light = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = sat * Math.min(light, 1 - light);
  const f = (n: number) => light - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}

function linearise(channel: number): number {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance([r, g, b]: Rgb): number {
  return 0.2126 * linearise(r) + 0.7152 * linearise(g) + 0.0722 * linearise(b);
}

export function contrastRatio(a: Rgb, b: Rgb): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Alpha-composites `fg` over an opaque `bg`. */
export function composite(fg: Rgb, bg: Rgb, alpha: number): [number, number, number] {
  return [
    fg[0] * alpha + bg[0] * (1 - alpha),
    fg[1] * alpha + bg[1] * (1 - alpha),
    fg[2] * alpha + bg[2] * (1 - alpha),
  ];
}
