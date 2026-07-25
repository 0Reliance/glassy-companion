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
        output: {
          // NOTE: Do NOT pin src/popup/components/* into manual chunks.
          // The previous config (v2.11.0–v2.14.0) listed popup component files
          // here, which caused rollup to hoist React core + shared lib modules
          // (auth/api/cache) INTO the ui-components chunk. The service worker
          // then imported those libs THROUGH that chunk, forcing React/DOM code
          // to evaluate in a WorkerGlobalScope — producing
          // "M.call is not a function" + "Status code: 15" install failure.
          //
          // If chunk-size splitting is needed later, use the function form and
          // ONLY split node_modules — never source files that share deps with
          // the service worker.
          manualChunks(id) {
            if (id.includes('node_modules')) {
              if (id.includes('react') || id.includes('scheduler')) return 'vendor-react'
              if (id.includes('zustand')) return 'vendor-state'
            }
          },
        },
      },
      outDir,
      emptyOutDir: true,
      sourcemap: mode === 'development',
      minify: mode !== 'development',
      // Warn on chunks over 200KB (Chrome Web Store soft requirement).
      // Vite's limit is in BYTES, not KB — the previous value (200) warned on
      // every chunk. Use 200 * 1024 for the intended 200KB threshold.
      chunkSizeWarningLimit: 200 * 1024,
    },
  }
})
