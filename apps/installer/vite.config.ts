import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { visualizer } from 'rollup-plugin-visualizer';
import { sentryVitePlugin } from '@sentry/vite-plugin';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'node:path';
import { createHash } from 'node:crypto';

const basePath = process.env.VITE_BASE_PATH ?? '/';

// CSP is only injected in production builds. In dev, Vite's HMR needs
// eval + ws://localhost which would be blocked by a strict policy.
/**
 * connect-src is derived from the Supabase URL this bundle is built for, so the
 * policy allows exactly that backend and its realtime websocket instead of a
 * wildcard. A plain-http origin (the local stack under Playwright) also drops
 * `upgrade-insecure-requests`, which would otherwise rewrite it to https.
 */
function supabaseCsp(): { connectSrc: string; upgradeInsecure: boolean } {
  const raw = process.env.VITE_SUPABASE_URL;
  if (!raw)
    return { connectSrc: 'https://*.supabase.co wss://*.supabase.co', upgradeInsecure: true };
  const url = new URL(raw);
  const ws = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return {
    connectSrc: `${url.origin} ${ws}//${url.host}`,
    upgradeInsecure: url.protocol === 'https:',
  };
}

const { connectSrc, upgradeInsecure } = supabaseCsp();

/**
 * Error reporting (see docs/runbooks/error-reporting.md).
 *
 * - `VITE_RELEASE` ties events to the sourcemaps uploaded for this build; CI
 *   sets it to the commit SHA, falling back to `GITHUB_SHA`. Mutating
 *   `process.env` here works because Vite reads `VITE_*` env after the config.
 * - connect-src gains exactly the DSN's ingest origin, and only when a DSN is
 *   configured — builds without one keep the policy unchanged.
 */
const release = process.env.VITE_RELEASE || process.env.GITHUB_SHA || undefined;
if (release) process.env.VITE_RELEASE = release;

function sentryConnectSrc(): string {
  const dsn = process.env.VITE_SENTRY_DSN;
  if (!dsn) return '';
  try {
    return ` ${new URL(dsn).origin}`;
  } catch {
    return '';
  }
}

const PROD_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self' ${connectSrc}${sentryConnectSrc()}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  ...(upgradeInsecure ? ['upgrade-insecure-requests'] : []),
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
// Currently disabled (see commit a3a3157) — kept for future re-enable.
// Exported (not wired) so it stays type-checked and ready to re-enable.
export function sriPlugin(): Plugin {
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

/**
 * Vendor chunking. Route pages are already split by React.lazy (see
 * src/routes/lazy.ts); this splits the shared vendor bundle by update cadence
 * so a bump in one library does not invalidate the browser cache for all of
 * them. pnpm stores packages under node_modules/.pnpm/<name>@<ver>/node_modules/<name>/,
 * so we match on the inner `/node_modules/<name>/` segment.
 */
function vendorChunk(id: string): string | undefined {
  if (!id.includes('node_modules')) return undefined;
  const inner = id.split('node_modules/').pop() ?? '';
  if (/^(react|react-dom|scheduler|react-router|react-router-dom|@remix-run)\//.test(inner))
    return 'vendor-react';
  if (inner.startsWith('@radix-ui/')) return 'vendor-radix';
  if (inner.startsWith('@tanstack/')) return 'vendor-query';
  if (inner.startsWith('@supabase/')) return 'vendor-supabase';
  if (/^(react-hook-form|@hookform|zod)\//.test(inner)) return 'vendor-forms';
  if (inner.startsWith('lucide-react/')) return 'vendor-icons';
  // Only reachable through the lazy `import('./sentryClient')`: must stay out
  // of the eager `vendor` chunk.
  if (inner.startsWith('@sentry/') || inner.startsWith('@sentry-internal/')) return 'vendor-sentry';
  return 'vendor';
}

export default defineConfig({
  base: basePath,
  build: {
    // Hidden: emitted as build artifacts for an error reporter, never
    // referenced from the bundle. pages.yml strips *.map before publishing.
    sourcemap: 'hidden',
    rollupOptions: { output: { manualChunks: vendorChunk } },
  },
  define: {
    // Strip the SDK's debug logging and tracing code paths from the bundle.
    __SENTRY_DEBUG__: 'false',
    __SENTRY_TRACING__: 'false',
  },
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
        globIgnores: ['**/*.map', 'stats.html'],
        // Anything above this is a bug, not something to precache on a phone.
        maximumFileSizeToCacheInBytes: 2 * 1024 * 1024,
        cleanupOutdatedCaches: true,
        clientsClaim: true,
      },
    }),
    cspPlugin(),
    // sriPlugin disabled: post-build modifications by Vite/Rollup (source map
    // comment, module preload transforms) cause hash mismatches at runtime,
    // breaking script loading on GitHub Pages. CSP remains the primary defense.
    // ANALYZE=1 pnpm --filter @vitalock/installer build → dist/stats.html
    ...(process.env.ANALYZE ? [visualizer({ filename: 'dist/stats.html', gzipSize: true })] : []),
    // Sourcemap upload — only when SENTRY_AUTH_TOKEN is set (CI deploy build),
    // so local and e2e builds are unaffected. Keep it last.
    ...(process.env.SENTRY_AUTH_TOKEN
      ? [
          sentryVitePlugin({
            org: 'rodrigo-lago',
            project: 'vitalock-installer',
            authToken: process.env.SENTRY_AUTH_TOKEN,
            telemetry: false,
            // The app passes `release` to the SDK itself; no injected snippet.
            release: { name: release, inject: false },
            // Maps must never be published (pages.yml also strips them).
            sourcemaps: { filesToDeleteAfterUpload: ['./dist/**/*.map'] },
          }),
        ]
      : []),
  ],
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  server: { port: 5174 },
});
