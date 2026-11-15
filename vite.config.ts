import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // Installable PWA: autoUpdate keeps the shell fresh on the next visit.
    // HashRouter means start_url "/" is always the shell — no navigateFallback
    // routing tricks needed. Workbox defaults precache the built assets.
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'HomeTask',
        short_name: 'HomeTask',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        theme_color: '#b45309',
        background_color: '#faf6f0',
        icons: [
          {
            src: 'icons/icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any',
          },
        ],
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
  },
})

