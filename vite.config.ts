import preact from '@preact/preset-vite'
import { VitePWA } from 'vite-plugin-pwa'
import { configDefaults, defineConfig } from 'vitest/config'

export default defineConfig({
  base: '/dansk-daily/',
  plugins: [preact(), VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Dansk Daily',
        short_name: 'Dansk Daily',
        description: 'Daily Danish practice',
        display: 'standalone',
        start_url: '/dansk-daily/',
        scope: '/dansk-daily/',
        theme_color: '#c8102e',
        background_color: '#ffffff',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // app shell only: never the ~2300 mp3s (one failed file would block install)
        globPatterns: ['**/*.{js,css,html,png,svg,webmanifest}'],
        globIgnores: ['audio/**'],
        runtimeCaching: [
          {
            // same cache and URLs as downloadAllAudio in src/lib/audio.ts
            urlPattern: /\/audio\/[^/?]+\.mp3$/,
            handler: 'CacheFirst',
            options: { cacheName: 'audio', rangeRequests: true },
          },
        ],
      },
    })],
  test: {
    environment: 'jsdom',
    // tests/pwa.test.ts reads dist/ and only runs after a build (Task 24)
    // tests/e2e runs in Playwright (npm run test:e2e), never in Vitest
    // (npm run test:pwa names the file explicitly, which lifts the exclusion)
    exclude: [
      ...configDefaults.exclude,
      ...(process.argv.some((a) => a.endsWith('pwa.test.ts')) ? [] : ['tests/pwa.test.ts']),
      'tests/e2e/**',
    ],
  },
})
