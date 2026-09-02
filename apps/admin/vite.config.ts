import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { createHash } from 'node:crypto';

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
// Currently disabled (see commit a3a3157) — kept for future re-enable.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
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

export default defineConfig({
  base: process.env.VITE_BASE_PATH ?? '/',
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
  },
  // sriPlugin disabled: post-build modifications by Vite/Rollup (source map
  // comment, module preload transforms) cause hash mismatches at runtime,
  // breaking script loading on GitHub Pages. CSP remains the primary defense.
  plugins: [react(), cspPlugin()],
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  server: { port: 5173 },
});
