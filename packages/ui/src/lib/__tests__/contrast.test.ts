import { describe, expect, it } from 'vitest';
import { composite, contrastRatio, hslToRgb, parseHsl, relativeLuminance } from '../contrast';

describe('contrast helper', () => {
  it('parses an HSL triplet', () => {
    expect(parseHsl('240 79% 65%')).toEqual({ h: 240, s: 79, l: 65 });
    expect(parseHsl('217.2 32.6% 17.5%')).toEqual({ h: 217.2, s: 32.6, l: 17.5 });
  });

  it('rejects malformed triplets', () => {
    expect(() => parseHsl('#fff')).toThrow();
  });

  it('converts HSL to 0-255 RGB', () => {
    expect(hslToRgb(parseHsl('0 0% 100%'))).toEqual([255, 255, 255]);
    expect(hslToRgb(parseHsl('0 0% 0%'))).toEqual([0, 0, 0]);
    const [r, g, b] = hslToRgb(parseHsl('0 100% 50%'));
    expect([Math.round(r), Math.round(g), Math.round(b)]).toEqual([255, 0, 0]);
  });

  it('computes relative luminance', () => {
    expect(relativeLuminance([255, 255, 255])).toBeCloseTo(1, 5);
    expect(relativeLuminance([0, 0, 0])).toBeCloseTo(0, 5);
  });

  it('gives 21:1 for black on white', () => {
    expect(contrastRatio([0, 0, 0], [255, 255, 255])).toBeCloseTo(21, 5);
  });

  it('gives about 4.54:1 for #767676 on white, in either order', () => {
    expect(contrastRatio([0x76, 0x76, 0x76], [255, 255, 255])).toBeCloseTo(4.54, 2);
    expect(contrastRatio([255, 255, 255], [0x76, 0x76, 0x76])).toBeCloseTo(4.54, 2);
  });

  it('composites a foreground over a background at alpha', () => {
    expect(composite([0, 0, 0], [255, 255, 255], 0.5)).toEqual([127.5, 127.5, 127.5]);
    expect(composite([10, 20, 30], [200, 200, 200], 1)).toEqual([10, 20, 30]);
    expect(composite([10, 20, 30], [200, 200, 200], 0)).toEqual([200, 200, 200]);
  });
});
