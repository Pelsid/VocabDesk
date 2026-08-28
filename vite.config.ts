import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'

const rootDir = dirname(fileURLToPath(import.meta.url))
const SQL_WASM_VIRTUAL = 'virtual:sql-wasm'

/** Встраивает sql-wasm.wasm как data URL — без отдельного fetch (нужно для file://). */
function inlineSqlWasm(): Plugin {
  return {
    name: 'inline-sql-wasm',
    resolveId(id) {
      if (id === SQL_WASM_VIRTUAL) return '\0' + SQL_WASM_VIRTUAL
    },
    load(id) {
      if (id !== '\0' + SQL_WASM_VIRTUAL) return
      const wasmPath = join(rootDir, 'node_modules/sql.js/dist/sql-wasm.wasm')
      const b64 = readFileSync(wasmPath).toString('base64')
      return `export default "data:application/wasm;base64,${b64}"`
    },
  }
}

/** IIFE без type="module"/crossorigin — иначе Chrome режет загрузку с file:// CORS. */
function fileProtocolHtml(): Plugin {
  return {
    name: 'file-protocol-html',
    apply: 'build',
    transformIndexHtml(html) {
      return html
        .replace(/\s+type="module"/g, '')
        .replace(/\s+crossorigin(="[^"]*")?/g, '')
        .replace(/<script src=/g, '<script defer src=')
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue(), inlineSqlWasm(), fileProtocolHtml()],
  // Относительные пути: dist можно открыть как file://…/index.html без сервера
  base: './',
  server: {
    host: true,
    port: 5173,
  },
  build: {
    // Классический <script>, не type="module": ES-модули с file:// блокирует CORS
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        format: 'iife',
        name: 'VocabDesk',
      },
    },
  },
})
