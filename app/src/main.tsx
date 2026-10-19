import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import { App } from './App'
import { flushAll } from './lib/flush'
import { initGoogleAuth } from './lib/google/auth'
import { finishGoogleSignIn } from './lib/google/callback'
import { CALLBACK_PATH } from './lib/google/keys'
import { toast } from './lib/toasts'
import { initVault } from './lib/vault'
import './styles/base.css'
import './styles/app.css'
import './styles/editor.css'
import './styles/extras.css'
import './styles/features.css'

// An older cached copy of the app can answer the Google sign-in page's URL with
// the app itself; finish the sign-in there instead of starting the app.
if (location.pathname === CALLBACK_PATH) finishGoogleSignIn()
else boot()

function boot() {
  initGoogleAuth()
  void initVault()

  // Ask the browser not to evict notes under storage pressure.
  void navigator.storage?.persist?.().catch(() => {})

  // Save pending typing when the app is hidden or closed.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushAll()
  })
  window.addEventListener('pagehide', flushAll)

  const updateSW = registerSW({
    onNeedRefresh() {
      toast('A new version of Slate is ready.', { action: { label: 'Update', run: () => void updateSW(true) }, duration: 120_000 })
    },
    onOfflineReady() {
      toast('Slate is ready to work offline.')
    },
  })

  createRoot(document.getElementById('root')!).render(<App />)
}
