import { fileURLToPath, URL } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { defineConfig, loadEnv } from 'vite'

const projectRoot = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, projectRoot, '')
  const apiProxy = env.VITE_API_PROXY || 'http://localhost:64226'

  return {
    plugins: [vue()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
        '@shared': fileURLToPath(new URL('../shared', import.meta.url)),
      },
    },
    server: {
      proxy: {
        '/api': {
          target: apiProxy,
          changeOrigin: true,
        },
      },
    },
  }
})
