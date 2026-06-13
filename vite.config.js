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
          // Manual chunk splitting to keep all chunks under 200KB
          // (Chrome Web Store requirement for extension submissions)
          manualChunks: {
            'vendor-react': ['react', 'react-dom'],
            'vendor-state': ['zustand'],
            'ui-components': [
              resolve(__dirname, 'src/popup/components/AppShell.jsx'),
              resolve(__dirname, 'src/popup/components/SmartSavePanel.jsx'),
              resolve(__dirname, 'src/popup/components/BookmarkCard.jsx'),
              resolve(__dirname, 'src/popup/components/ContentPreview.jsx'),
              resolve(__dirname, 'src/popup/components/SummaryCard.jsx'),
              resolve(__dirname, 'src/popup/components/UpsellCard.jsx'),
              resolve(__dirname, 'src/popup/components/LoginCard.jsx'),
              resolve(__dirname, 'src/popup/components/TagEditor.jsx'),
              resolve(__dirname, 'src/popup/components/CollectionPicker.jsx'),
              resolve(__dirname, 'src/popup/components/AccountPicker.jsx'),
              resolve(__dirname, 'src/popup/components/QuickActions.jsx'),
              resolve(__dirname, 'src/popup/components/SaveToast.jsx'),
              resolve(__dirname, 'src/popup/components/Skeleton.jsx'),
            ],
            'kb-view': [
              resolve(__dirname, 'src/popup/views/KbSearchView.jsx'),
            ],
          },
        },
      },
      outDir,
      emptyOutDir: true,
      sourcemap: mode === 'development',
      minify: mode !== 'development',
      // Warn on chunks over 200KB (store requirement)
      chunkSizeWarningLimit: 200,
    },
  }
})
