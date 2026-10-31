import { fileURLToPath, URL } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'
import { libraryApiPlugin } from './server/libraryApi'

const projectRoot = fileURLToPath(new URL('.', import.meta.url))

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue(), libraryApiPlugin(projectRoot)],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    /**
     * 浏览器直连站点会被 CORS 拦下，开发期通过同源代理转发。
     * 配合 FetchHttpClient 的 rewriteUrl：
     *   new FetchHttpClient({ rewriteUrl: toProxy })
     */
    proxy: {
      '/api/syosetu': {
        target: 'https://ncode.syosetu.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/syosetu/, ''),
      },
      '/api/narou': {
        target: 'https://api.syosetu.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/narou/, ''),
      },
    },
  },
})
