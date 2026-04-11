import { defineConfig } from 'vite'
import path from 'path'
import fs from 'node:fs'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron'


function figmaAssetResolver() {
  return {
    name: 'figma-asset-resolver',
    resolveId(id) {
      if (id.startsWith('figma:asset/')) {
        const filename = id.replace('figma:asset/', '')
        return path.resolve(__dirname, 'src/shared/assets', filename)
      }
    },
  }
}

// Copies the preload CJS file without any bundler transformation.
// vite-plugin-electron (Rolldown) generates invalid hybrid ESM/CJS output
// when trying to compile preload scripts, so we bypass it entirely.
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

export default defineConfig({
  plugins: [
    figmaAssetResolver(),
    copyPreload(),
    // The React and Tailwind plugins are both required for Make, even if
    // Tailwind is not being actively used – do not remove them
    react(),
    tailwindcss(),
    // Vite Electron Plugin - only handles the main process
    electron([
      {
        entry: 'electron/main.ts',
        onstart({ startup }) {
          startup()
        },
        vite: {
          build: {
            outDir: 'dist-electron',
            rollupOptions: {
              external: ['electron', 'electron-updater', 'electron-log'],
            },
          }
        }
      }
    ])
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },

  // File types to support raw imports. Never add .css, .tsx, or .ts files to this.
  assetsInclude: ['**/*.svg', '**/*.csv'],

  // Build configuration for renderer process
  build: {
    outDir: 'dist',
    emptyOutDir: true
  }
})