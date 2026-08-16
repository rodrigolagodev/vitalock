import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'node:path';

const basePath = process.env.VITE_BASE_PATH ?? '/';

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
  ],
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  server: { port: 5174 },
});
