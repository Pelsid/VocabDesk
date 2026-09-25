import { copyFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

function copyRootFavicon() {
  return {
    name: 'copy-root-favicon',
    apply: 'build' as const,
    closeBundle() {
      copyFileSync('public/favicon.ico', 'favicon.ico')
    },
  }
}

export default defineConfig(({ command }) => ({
  plugins: [vue(), copyRootFavicon()],
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
