import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react(), VitePWA({
    registerType: 'prompt', // user confirms updates; IndexedDB data is never touched by a service-worker update
    includeAssets: ['icon.svg', 'apple-touch-icon.png'],
    manifest: {
      name: 'MyFinance – Personal Finance', short_name: 'MyFinance', description: 'Personal finance manager for Malaysia (RM).',
      lang: 'en-MY', start_url: '/', scope: '/', display: 'standalone', orientation: 'any', theme_color: '#0f766e', background_color: '#f8fafc', categories: ['finance', 'productivity'],
      icons: [{ src: 'pwa-192.png', sizes: '192x192', type: 'image/png' }, { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' }, { src: 'pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }],
      shortcuts: [{ name: 'Scan receipt', url: '/scan', icons: [{ src: 'pwa-192.png', sizes: '192x192' }] }, { name: 'Transactions', url: '/transactions', icons: [{ src: 'pwa-192.png', sizes: '192x192' }] }],
    },
    workbox: {
      globPatterns: ['**/*.{js,mjs,css,html,svg,png,ico,webmanifest}'], globIgnores: ['ocr/**'],
      maximumFileSizeToCacheInBytes: 3 * 1024 * 1024, navigateFallback: '/index.html', cleanupOutdatedCaches: true,
      // OCR engine & language models (~8 MB) are cached the first time a receipt is scanned, then work offline.
      runtimeCaching: [{ urlPattern: ({ url }) => url.pathname.startsWith('/ocr/'), handler: 'CacheFirst', options: { cacheName: 'ocr-assets', expiration: { maxEntries: 20 } } }],
    },
  })],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  build: { rollupOptions: { output: { manualChunks: { charts: ['recharts'], vendor: ['react', 'react-dom', 'react-router-dom', 'dexie', 'dexie-react-hooks'] } } } },
  test: { environment: 'node', setupFiles: ['fake-indexeddb/auto'] },
} as any);
