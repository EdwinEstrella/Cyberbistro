import { defineConfig } from 'vite'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron/simple'
import { notBundle } from 'vite-plugin-electron/plugin'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ELECTRON_MAIN_EXTERNALS = [
  'electron',
  'electron-updater',
  'electron-log',
  '@insforge/sdk',
  'socket.io-client',
  'engine.io-client',
  'ws',
  'bufferutil',
  'utf-8-validate',
] as const
const pkg = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, 'package.json'), 'utf-8')
) as { version: string }

function shouldExternalizeElectronMainDependency(id: string) {
  return ELECTRON_MAIN_EXTERNALS.some((pkgName) => id === pkgName || id.startsWith(`${pkgName}/`))
}

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
          plugins: [
            notBundle({
              filter(id) {
                return shouldExternalizeElectronMainDependency(id)
              },
            }),
          ],
          build: {
            rollupOptions: {
              external(id) {
                return shouldExternalizeElectronMainDependency(id)
              },
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
