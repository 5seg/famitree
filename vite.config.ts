import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// 画面に出しておくビルド印。端末の devtools が開けない環境でも「いまどのビルドか」を目で確かめられる
const buildId = new Date().toISOString().slice(0, 16).replace('T', ' ')

// https://vite.dev/config/
export default defineConfig({
  define: {
    __BUILD_ID__: JSON.stringify(buildId),
  },
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
      '/uploads': 'http://localhost:3000',
    },
  },
  plugins: [
    vue(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'pwa-icon.svg'],
      manifest: {
        name: 'FamiTree (ファミツリー) - 家族の木',
        short_name: 'FamiTree',
        description: '1日1回の水やりでつながる、アンビエントな家族ウェルネスPWA',
        theme_color: '#10b981',
        background_color: '#ece9df',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: '/pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: '/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          },
          {
            src: '/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      },
      workbox: {
        // index.html を precache すると、新しい版を出しても端末が古い HTML を配り続ける。
        // 画面遷移はネットワーク優先にして、オンラインなら必ず今回のビルドを取らせる
        globPatterns: ['**/*.{js,css,ico,png,svg}'],
        navigateFallback: undefined,
        cleanupOutdatedCaches: true,
        skipWaiting: true,
        clientsClaim: true,
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.mode === 'navigate',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'famitree-pages',
              networkTimeoutSeconds: 4,
              expiration: { maxEntries: 8 },
            },
          },
        ],
        importScripts: ['push-sw.js'],
      },
    }),
  ],
})
