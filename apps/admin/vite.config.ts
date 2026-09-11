import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { visualizer } from 'rollup-plugin-visualizer';
import path from 'node:path';
import { createHash } from 'node:crypto';

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

const PROD_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self' ${connectSrc}`,
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
        // basename so tags with any base prefix (`/vitalock/admin/assets/...`)
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
  return 'vendor';
}

export default defineConfig({
  base: process.env.VITE_BASE_PATH ?? '/',
  build: {
    // Hidden: emitted as build artifacts for an error reporter, never
    // referenced from the bundle. pages.yml strips *.map before publishing.
    sourcemap: 'hidden',
    rollupOptions: { output: { manualChunks: vendorChunk } },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
  },
  // sriPlugin disabled: post-build modifications by Vite/Rollup (source map
  // comment, module preload transforms) cause hash mismatches at runtime,
  // breaking script loading on GitHub Pages. CSP remains the primary defense.
  plugins: [
    react(),
    cspPlugin(),
    // ANALYZE=1 pnpm --filter @vitalock/admin build → dist/stats.html
    ...(process.env.ANALYZE ? [visualizer({ filename: 'dist/stats.html', gzipSize: true })] : []),
  ],
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  server: { port: 5173 },
});
