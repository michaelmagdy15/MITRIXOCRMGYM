import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig, loadEnv } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        selfDestroying: true,   // kills the SW on all users' browsers
        registerType: 'autoUpdate',
        includeAssets: ['pwa-icon.png', 'favicon.png', 'mitrixogymcrmlogo.png'],
        manifest: {
          name: 'mitrixogymcrm CRM',
          short_name: 'mitrixogymcrm',
          description: 'mitrixogymcrm — Member & Staff Portal',
          theme_color: '#000000',
          background_color: '#000000',
          display: 'standalone',
          orientation: 'portrait',
          start_url: '/',
          scope: '/',
          icons: [
            {
              src: '/pwa-icon.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-icon.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-icon.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          // Raise precache limit to 5 MB so all split chunks are accepted
          maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/firebasestorage\.googleapis\.com\/.*/i,
              handler: 'CacheFirst',
              options: { cacheName: 'firebase-storage', expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 * 7 } },
            },
          ],
        },
      }),
    ],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env['GEMINI_API_KEY']),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      // Silence the large-chunk warning (we've already raised the workbox limit)
      chunkSizeWarningLimit: 3000,
      rollupOptions: {
        output: {
          manualChunks: (id) => {
            // Firebase SDK → separate cacheable chunk
            if (id.includes('node_modules/firebase')) {
              if (id.includes('firestore')) return 'firebase-firestore';
              if (id.includes('auth'))      return 'firebase-auth';
              if (id.includes('storage'))   return 'firebase-storage';
              return 'firebase-core';
            }
            // React + UI libs → vendor chunk
            if (id.includes('node_modules/react') ||
                id.includes('node_modules/react-dom') ||
                id.includes('node_modules/@radix-ui') ||
                id.includes('node_modules/lucide-react')) {
              return 'vendor-react';
            }
            // Date utilities
            if (id.includes('node_modules/date-fns')) return 'vendor-dates';
            // Chart / heavy libs
            if (id.includes('node_modules/recharts') ||
                id.includes('node_modules/d3')) {
              return 'vendor-charts';
            }
            return;
          },
        },
      },
    },
    server: {
      watch: {
        ignored: ['**/scratch/**', '**/handover_docs/**', '**/.git/**']
      },
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env['DISABLE_HMR'] !== 'true',
    },
  };
});
