import { defineConfig, loadEnv } from 'vite'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { builtinModules } from 'node:module'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron/simple'
import { notBundle } from 'vite-plugin-electron/plugin'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ELECTRON_MAIN_EXTERNALS = [
  'electron',
  'electron-updater',
  'electron-log',
  'socket.io-client',
  'engine.io-client',
  'ws',
  'bufferutil',
  'utf-8-validate',
] as const
const pkg = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, 'package.json'), 'utf-8')
) as { version: string }

const NODE_BUILTIN_SET = new Set([
  ...builtinModules,
  ...builtinModules.map((m) => `node:${m}`),
  'node:sqlite',
  'sqlite',
])

function shouldExternalizeElectronMainDependency(id: string) {
  if (id.startsWith('node:') || NODE_BUILTIN_SET.has(id)) return true
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
export default defineConfig(async ({ mode }) => {
  const env = loadEnv(mode, __dirname, 'VITE_')
  const supabaseUrl = env.VITE_SUPABASE_URL?.trim()
  const supabasePublishableKey = env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()

  if (!supabaseUrl || !supabasePublishableKey) {
    throw new Error('VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY are required to build Cloudix.')
  }

  process.env.SUPABASE_URL = supabaseUrl
  process.env.SUPABASE_PUBLISHABLE_KEY = supabasePublishableKey
  process.env.VITE_SUPABASE_URL = supabaseUrl
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY = supabasePublishableKey

  return {
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
          define: {
            'process.env.SUPABASE_URL': JSON.stringify(supabaseUrl),
            'process.env.SUPABASE_PUBLISHABLE_KEY': JSON.stringify(supabasePublishableKey),
            'process.env.VITE_SUPABASE_URL': JSON.stringify(supabaseUrl),
            'process.env.VITE_SUPABASE_PUBLISHABLE_KEY': JSON.stringify(supabasePublishableKey),
          },
          plugins: [
            notBundle({
              filter(id) {
                return shouldExternalizeElectronMainDependency(id)
              },
            }),
          ],
          build: {
            target: 'node22',
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
    'process.env.SUPABASE_URL': JSON.stringify(supabaseUrl),
    'process.env.SUPABASE_PUBLISHABLE_KEY': JSON.stringify(supabasePublishableKey),
  },
  }
})
