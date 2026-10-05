import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildManifest } from '../../pwa-manifest';

const root = resolve(__dirname, '../..');
const html = readFileSync(resolve(root, 'index.html'), 'utf8');

describe('buildManifest', () => {
  const manifest = buildManifest('/');

  it('declares separate any and maskable icon entries, never combined', () => {
    const purposes = manifest.icons.map((i) => i.purpose);
    expect(purposes).toContain('any');
    expect(purposes).toContain('maskable');
    for (const purpose of purposes) expect(purpose).not.toMatch(/any\s+maskable|maskable\s+any/);
  });

  it('points every icon at an existing PNG under public/', () => {
    expect(manifest.icons.length).toBeGreaterThanOrEqual(3);
    for (const icon of manifest.icons) {
      expect(icon.type).toBe('image/png');
      expect(existsSync(resolve(root, 'public', icon.src.replace(/^\//, '')))).toBe(true);
    }
  });

  it('prefixes icon sources, start_url and scope with the base path', () => {
    const nested = buildManifest('/vitalock/installer/');
    expect(nested.start_url).toBe('/vitalock/installer/');
    expect(nested.scope).toBe('/vitalock/installer/');
    for (const icon of nested.icons) expect(icon.src.startsWith('/vitalock/installer/')).toBe(true);
  });
});

describe('index.html PWA chrome', () => {
  it('covers the screen so safe-area insets apply', () => {
    expect(html).toMatch(/<meta[^>]+name="viewport"[^>]+viewport-fit=cover/);
  });

  it('declares the apple touch icon pointing at an existing PNG', () => {
    const href = html.match(/<link[^>]+rel="apple-touch-icon"[^>]+href="([^"]+)"/)?.[1];
    expect(href).toBeDefined();
    const file = (href ?? '').replace('%BASE_URL%', '');
    expect(file.endsWith('.png')).toBe(true);
    expect(existsSync(resolve(root, 'public', file))).toBe(true);
  });

  it('declares the three apple-mobile-web-app meta tags', () => {
    expect(html).toMatch(/name="mobile-web-app-capable"/);
    expect(html).toMatch(/name="apple-mobile-web-app-capable"/);
    expect(html).toMatch(/name="apple-mobile-web-app-title"/);
    expect(html).toMatch(
      /name="apple-mobile-web-app-status-bar-style"\s+content="black-translucent"/,
    );
  });
});
