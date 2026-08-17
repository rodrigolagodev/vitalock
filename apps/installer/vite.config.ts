import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'node:path';
import { createHash } from 'node:crypto';

const basePath = process.env.VITE_BASE_PATH ?? '/';

// CSP is only injected in production builds. In dev, Vite's HMR needs
// eval + ws://localhost which would be blocked by a strict policy.
const PROD_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  'upgrade-insecure-requests',
].join('; ');

function cspPlugin(): Plugin {
  return {
    name: 'inject-csp',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace(
        '<meta charset="UTF-8" />',
        `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${PROD_CSP}" />`,
      );
    },
  };
}

// Inject Subresource Integrity hashes on the built script/link tags so a
// tampered CDN/Pages layer cannot silently swap the bundle.
function sriPlugin(): Plugin {
  return {
    name: 'inject-sri',
    apply: 'build',
    enforce: 'post',
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        if (!ctx.bundle) return html;
        // Bundle keys are full paths like `assets/index-abc.js`; also index by
        // basename so tags with any base prefix (`/vitalock/installer/...`)
        // still resolve.
        const hashes = new Map<string, string>();
        for (const [name, chunk] of Object.entries(ctx.bundle)) {
          const source =
            'code' in chunk
              ? chunk.code
              : 'source' in chunk
                ? typeof chunk.source === 'string'
                  ? chunk.source
                  : Buffer.from(chunk.source)
                : null;
          if (source == null) continue;
          const digest = createHash('sha384').update(source).digest('base64');
          const hash = `sha384-${digest}`;
          hashes.set(name, hash);
          const basename = name.split('/').pop();
          if (basename) hashes.set(basename, hash);
        }
        return html.replace(
          /<(script|link)\b([^>]*?)(src|href)="([^"]+)"([^>]*)>/g,
          (match, tag, pre, attr, url, post) => {
            if (match.includes('integrity=')) return match;
            const basename = url.split('/').pop();
            const hash = basename ? hashes.get(basename) : undefined;
            if (!hash) return match;
            return `<${tag}${pre}${attr}="${url}"${post} integrity="${hash}">`;
          },
        );
      },
    },
  };
}

export default defineConfig({
  base: basePath,
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      strategies: 'generateSW',
      injectRegister: 'auto',
      devOptions: { enabled: false }, // PWA off in dev per spec
      manifest: {
        name: 'Vitalock Installer',
        short_name: 'Installer',
        description: 'Vitalock field installer app',
        theme_color: '#0f172a',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait',
        start_url: basePath,
        scope: basePath,
        icons: [
          {
            src: `${basePath}icon-192.svg`,
            sizes: '192x192',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
          {
            src: `${basePath}icon-512.svg`,
            sizes: '512x512',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
      },
    }),
    cspPlugin(),
    sriPlugin(),
  ],
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  server: { port: 5174 },
});
