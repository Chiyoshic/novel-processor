import { fileURLToPath, URL } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'
import { defineConfig, loadEnv } from 'vite'
import { normalizeApiBase } from './src/lib/api-base.ts'

const projectRoot = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, projectRoot, '')
  normalizeApiBase(env.VITE_API_BASE)

  return {
    plugins: [vue(), VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['favicon.svg', 'favicon-32.png', 'apple-touch-icon.png', 'icons/*.svg', 'icons/*.png'],
      manifest: {
        id: '/', name: 'novel-processor · 个人书架', short_name: 'novel-processor',
        description: '个人小说书架与阅读器', lang: 'zh-CN', start_url: '/', scope: '/',
        display: 'standalone', background_color: '#f7f3eb', theme_color: '#f5f8f9',
        icons: [
          { src: '/icons/pwa-192.png?v=adaptive-v2', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/pwa-512.png?v=adaptive-v2', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icons/pwa-maskable-512.png?v=adaptive-v2', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          // Optional monochrome representation; not a claim that Safari supports custom dark/clear manifests.
          { src: '/icons/pwa-monochrome-192.png?v=adaptive-v2', sizes: '192x192', type: 'image/png', purpose: 'monochrome' },
          { src: '/icons/pwa-monochrome-512.png?v=adaptive-v2', sizes: '512x512', type: 'image/png', purpose: 'monochrome' },
        ],
        shortcuts: [
          { name: '书架', url: '/', icons: [{ src: '/icons/pwa-192.png?v=adaptive-v2', sizes: '192x192' }] },
          { name: '设置', url: '/settings', icons: [{ src: '/icons/pwa-192.png?v=adaptive-v2', sizes: '192x192' }] },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
        // Only the app shell is cached. Auth, private book content and AI streams stay network-only.
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api(?:\/|$)/, /\.[^/]+$/],
        cleanupOutdatedCaches: true,
        skipWaiting: false,
        clientsClaim: true,
      },
      devOptions: { enabled: false },
    })],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
        '@shared': fileURLToPath(new URL('../shared', import.meta.url)),
      },
    },
  }
})
