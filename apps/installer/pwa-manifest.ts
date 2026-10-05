/**
 * Installer web app manifest, kept out of `vite.config.ts` so a unit test can
 * assert it. `any` and `maskable` are separate entries on purpose: a combined
 * `any maskable` icon gets cropped on Android and looks wrong on iOS.
 */
export function buildManifest(basePath: string) {
  return {
    name: 'Vitalock Installer',
    short_name: 'Installer',
    description: 'Vitalock field installer app',
    theme_color: '#0f172a',
    background_color: '#ffffff',
    display: 'standalone' as const,
    orientation: 'portrait' as const,
    start_url: basePath,
    scope: basePath,
    icons: [
      {
        src: `${basePath}pwa-192x192.png`,
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: `${basePath}pwa-512x512.png`,
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: `${basePath}maskable-icon-512x512.png`,
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
