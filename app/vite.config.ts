/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png', 'slate-icon.png'],
      manifest: {
        name: 'Slate',
        short_name: 'Slate',
        description: 'Notion-style notes on plain Markdown files, synced through your own GitHub.',
        id: '/',
        start_url: '/',
        scope: '/',
        // No window-controls-overlay: the layout has no drag region, so hiding the title bar
        // left Windows' close buttons over the top bar and the window impossible to move.
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#ffffff',
        categories: ['productivity', 'education'],
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          // The see-through slabs, big enough for the macOS Dock.
          { src: 'slate-icon.png', sizes: '1024x1024', type: 'image/png', purpose: 'any' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,json}'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        navigateFallback: '/index.html',
        // Never cache GitHub API traffic, and let the standalone pages load as themselves.
        navigateFallbackDenylist: [/^\/api/, /^\/oauth-google\.html/, /^\/privacy\.html/],
      },
    }),
  ],
  resolve: {
    alias: {
      '@tiptap/extension-collaboration': fileURLToPath(new URL('./src/stubs/collaboration.ts', import.meta.url)),
      '@tiptap/y-tiptap': fileURLToPath(new URL('./src/stubs/y-tiptap.ts', import.meta.url)),
    },
  },
  build: {
    target: 'es2022',
    rollupOptions: {
      // The app, plus the tiny page Google sends you back to after sign-in.
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        oauth: fileURLToPath(new URL('./oauth-google.html', import.meta.url)),
      },
    },
    chunkSizeWarningLimit: 1500,
  },
  test: {
    environment: 'node',
  },
})
