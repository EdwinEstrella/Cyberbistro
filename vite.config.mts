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
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (id.includes('react') || id.includes('react-dom') || id.includes('react-router')) {
            return 'vendor-react'
          }
          if (id.includes('@radix-ui') || id.includes('lucide-react') || id.includes('sonner') || id.includes('vaul')) {
            return 'vendor-ui'
          }
          if (id.includes('@mui') || id.includes('@emotion')) {
            return 'vendor-mui'
          }
          if (id.includes('recharts') || id.includes('date-fns')) {
            return 'vendor-analytics'
          }
          if (id.includes('@insforge')) {
            return 'vendor-insforge'
          }
          return 'vendor'
        },
      },
    },
  },
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
}))
