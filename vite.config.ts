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
        registerType: 'autoUpdate',
        includeAssets: [
          'pwa-icon.png',
          'favicon.png',
          'strikelogo.png',
          'inzan-pwa-icon.png',
          'inzan-favicon.png',
          'inzanlogo.png',
          'inzanlogo_white.png',
        ],
        manifest: {
          name: 'Strike Boxing Club',
          short_name: 'STRIKE',
          description: 'Strike Boxing Club — Member & Staff Portal',
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
          skipWaiting: true,
          clientsClaim: true,
          // Raise precache limit so core shell chunks are accepted
          maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
          globPatterns: [
            'index.html',
            'assets/index-*.{js,css}',
            'assets/vendor-react-*.js',
            'assets/firebase-core-*.js',
            'assets/firebase-auth-*.js',
            'assets/firebase-firestore-*.js',
            'favicon.png',
            'inzan-favicon.png',
            'inzanlogo.png',
            'inzanlogo_white.png',
            'strikelogo_white.png',
          ],
          ignoreURLParametersMatching: [/^cb$/, /^sw_reloaded$/],
          cleanupOutdatedCaches: true,
          navigateFallbackDenylist: [
            /^\/quote-generator\.html/,
            /^\/help-guide\.html/,
            /^\/privacy\.html/,
            /^\/manifest\.webmanifest/,
            /^\/manifest\.json/,
            /^\/api/,
            /^\/contracts\//,
            /^\/assets\//,
            /\.(?:js|mjs|css|map|wasm|json|png|jpg|jpeg|svg|ico|woff2?)(?:\?.*)?$/i
          ],
          runtimeCaching: [
            {
              urlPattern: /^https?:\/\/[^/]+\/assets\/.*\.(?:js|css|woff2)$/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'gym-hashed-assets',
                expiration: {
                  maxEntries: 160,
                  maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year (content-hashed files)
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            {
              urlPattern: /^https?:\/\/[^/]+\/.*\.(?:png|jpg|jpeg|webp|svg|ico)$/i,
              handler: 'StaleWhileRevalidate',
              options: {
                cacheName: 'gym-local-images',
                expiration: {
                  maxEntries: 100,
                  maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            {
              urlPattern: /^https:\/\/(firebasestorage\.googleapis\.com|lh3\.googleusercontent\.com|images\.unsplash\.com)\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'gym-media-cache',
                expiration: {
                  maxEntries: 500,
                  maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
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
            const normalizedId = id.replace(/\\/g, '/');
            // Firebase SDK → separate cacheable chunk
            if (normalizedId.includes('node_modules/firebase')) {
              if (normalizedId.includes('firestore')) return 'firebase-firestore';
              if (normalizedId.includes('auth'))      return 'firebase-auth';
              if (normalizedId.includes('storage'))   return 'firebase-storage';
              return 'firebase-core';
            }
            // React + UI libs → vendor chunk
            if (normalizedId.includes('node_modules/react') ||
                normalizedId.includes('node_modules/react-dom') ||
                normalizedId.includes('node_modules/@radix-ui') ||
                normalizedId.includes('node_modules/lucide-react')) {
              return 'vendor-react';
            }
            // Date utilities
            if (normalizedId.includes('node_modules/date-fns')) return 'vendor-dates';
            // Chart / heavy libs
            if (normalizedId.includes('node_modules/recharts') ||
                normalizedId.includes('node_modules/d3')) {
              return 'vendor-charts';
            }
            // Export tools
            if (normalizedId.includes('node_modules/xlsx')) return 'vendor-xlsx';
            if (normalizedId.includes('node_modules/jspdf') ||
                normalizedId.includes('node_modules/html2canvas') ||
                normalizedId.includes('node_modules/pdf-lib') ||
                normalizedId.includes('node_modules/jspdf-autotable')) {
              return 'vendor-export';
            }
            return;
          },
        },
      },
    },
    server: {
      allowedHosts: true,
      proxy: {
        '/api': {
          target: `http://localhost:${env['PORT'] || 8080}`,
          changeOrigin: true,
        }
      },
      watch: {
        ignored: ['**/scratch/**', '**/handover_docs/**', '**/.git/**']
      },
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env['DISABLE_HMR'] !== 'true',
    },
  };
});
