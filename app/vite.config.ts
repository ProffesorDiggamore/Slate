/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// The App Store app has no web server to send the website's privacy lock
// (the Content-Security-Policy header in netlify.toml), so the app's copy of
// index.html carries it as a <meta> tag instead. Same rules as the website —
// only the app's own scripts, no inline scripts, no plugins — except
// connect-src: in the app the AI can be any address you set (a custom server,
// or Ollama / LM Studio on your Mac), and GitHub sync needs api.github.com.
const NATIVE_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' *",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ')

function nativeCsp(): Plugin {
  return {
    name: 'slate-native-csp',
    // Build only: the dev server's hot-reload needs an inline script.
    apply: 'build',
    // Straight after <meta charset>, before any script, so it covers everything the page loads.
    transformIndexHtml(html) {
      const out = html
        .replace(/<meta charset[^>]*>/i, (m) => `${m}\n    <meta http-equiv="Content-Security-Policy" content="${NATIVE_CSP}" />`)
        // An app doesn't zoom: without this iOS zooms the whole web view in when the
        // cursor lands in text and leaves it zoomed. (The website keeps pinch-zoom.)
        .replace('initial-scale=1,', 'initial-scale=1, maximum-scale=1, user-scalable=no,')
      // Never ship the app without its lock.
      if (out === html) throw new Error('index.html needs a <meta charset> for the app CSP to follow.')
      return out
    },
  }
}

// `vite build --mode native` makes the copy bundled into the App Store app
// (npm run build:ios): no service worker, no Google sign-in page.
export default defineConfig(({ mode }) => {
  const native = mode === 'native'
  return {
    plugins: [
      react(),
      native && nativeCsp(),
      !native &&
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
        ...(native ? { 'virtual:pwa-register': fileURLToPath(new URL('./src/stubs/pwa-register.ts', import.meta.url)) } : {}),
      },
    },
    // Google Calendar sign-in returns to a web address, which an app doesn't have,
    // so the App Store build leaves it out even if a client ID is set locally.
    define: native ? { 'import.meta.env.VITE_GOOGLE_CLIENT_ID': '""' } : {},
    build: {
      target: 'es2022',
      rollupOptions: {
        // The app, plus the tiny page Google sends you back to after sign-in.
        input: {
          main: fileURLToPath(new URL('./index.html', import.meta.url)),
          ...(native ? {} : { oauth: fileURLToPath(new URL('./oauth-google.html', import.meta.url)) }),
        },
      },
      chunkSizeWarningLimit: 1500,
    },
    test: {
      environment: 'node',
    },
  }
})
