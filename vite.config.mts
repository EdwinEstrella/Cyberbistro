import { defineConfig } from 'vite'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron/simple'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const pkg = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, 'package.json'), 'utf-8')
) as { version: string }

function figmaAssetResolver() {
  return {
    name: 'figma-asset-resolver',
    resolveId(id: string) {
      if (id.startsWith('figma:asset/')) {
        const filename = id.replace('figma:asset/', '')
        return path.resolve(__dirname, 'src/shared/assets', filename)
      }
    },
  }
}

function copyPreload() {
  const src = path.resolve(__dirname, 'electron/preload.cjs')
  const dest = path.resolve(__dirname, 'dist-electron/preload.cjs')
  return {
    name: 'copy-preload',
    buildStart() {
      fs.mkdirSync(path.dirname(dest), { recursive: true })
      fs.copyFileSync(src, dest)
    },
  }
}

// package.json sin "type":"module": el main de Electron se emite como CJS (require).
// Este archivo .mts fuerza ESM solo para la config de Vite (plugins como @tailwindcss/vite).
export default defineConfig(async () => ({
  base: './',
  plugins: [
    figmaAssetResolver(),
    copyPreload(),
    react(),
    tailwindcss(),
    ...(await electron({
      main: {
        entry: 'electron/main.ts',
        onstart({ startup }) {
          startup()
        },
        vite: {
          build: {
            rollupOptions: {
              external: ['electron', 'electron-updater', 'electron-log'],
            },
          },
        },
      },
    })),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  assetsInclude: ['**/*.svg', '**/*.csv'],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
}))
