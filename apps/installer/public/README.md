# Installer public assets

The PNG icons (`pwa-192x192.png`, `pwa-512x512.png`, `maskable-icon-512x512.png`,
`apple-touch-icon-180x180.png`) are generated once from `icon-512.svg` and
committed. No dependency is added to the repo. To regenerate:

```bash
cd apps/installer
pnpm dlx @vite-pwa/assets-generator --preset minimal-2023 public/icon-512.svg
rm public/favicon.ico public/pwa-64x64.png   # not used; favicon.svg is the favicon
```

The manifest that references them lives in `pwa-manifest.ts`.
