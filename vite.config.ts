import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig(({ command }) => ({
  plugins: [vue()],
  // Nginx смотрит в корень проекта; готовые файлы лежат в /dist/
  base: command === 'build' ? '/dist/' : '/',
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api': {
        target: 'https://corewords.local',
        changeOrigin: true,
        secure: false,
      },
    },
  },
}))
