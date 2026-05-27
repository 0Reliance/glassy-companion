import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { crx } from '@crxjs/vite-plugin'
import chromeManifest from './manifest.json'
import firefoxManifest from './manifest.firefox.json'
import { resolve } from 'path'

export default defineConfig(({ mode }) => {
  const isFirefox = mode === 'firefox'
  const manifest = isFirefox ? firefoxManifest : chromeManifest
  const outDir = isFirefox ? 'dist-firefox' : 'dist'

  return {
    plugins: [
      react(),
      crx({ manifest, browser: isFirefox ? 'firefox' : 'chrome' }),
    ],
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src'),
      },
    },
    build: {
      rollupOptions: {
        input: {
          popup: resolve(__dirname, 'src/popup/index.html'),
          sidepanel: resolve(__dirname, 'src/sidepanel/index.html'),
          offscreen: resolve(__dirname, 'src/offscreen/index.html'),
        },
      },
      outDir,
      emptyOutDir: true,
      sourcemap: mode === 'development',
      minify: mode !== 'development',
    },
  }
})
