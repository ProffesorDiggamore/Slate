import { Download, Share, X } from 'lucide-react'
import { useEffect, useState } from 'react'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let deferred: BeforeInstallPromptEvent | null = null
const listeners = new Set<() => void>()
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferred = e as BeforeInstallPromptEvent
    listeners.forEach((fn) => fn())
  })
}

export function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: window-controls-overlay)').matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  )
}

type Platform = 'ios' | 'android' | 'mac-safari' | 'chromium' | 'other'

export function detectPlatform(): Platform {
  const ua = navigator.userAgent
  const iPadOS = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1
  if (/iPhone|iPad|iPod/.test(ua) || iPadOS) return 'ios'
  if (/Android/.test(ua)) return 'android'
  if (/Macintosh/.test(ua) && /Safari/.test(ua) && !/Chrome|Chromium|Edg|Firefox/.test(ua)) return 'mac-safari'
  if (/Chrome|Chromium|Edg/.test(ua)) return 'chromium'
  return 'other'
}

function useDeferredPrompt() {
  const [, force] = useState(0)
  useEffect(() => {
    const fn = () => force((n) => n + 1)
    listeners.add(fn)
    return () => {
      listeners.delete(fn)
    }
  }, [])
  return deferred
}

export function InstallSteps() {
  const platform = detectPlatform()
  const prompt = useDeferredPrompt()
  if (isStandalone()) return <p className="muted">✅ You’re using the installed app.</p>
  return (
    <div className="install-steps">
      {prompt && (
        <button
          type="button"
          className="btn btn-primary"
          onClick={async () => {
            await prompt.prompt()
            deferred = null
          }}
        >
          <Download size={16} /> Install Slate
        </button>
      )}
      {platform === 'ios' && (
        <ol>
          <li>
            Open this page in <strong>Safari</strong>.
          </li>
          <li>
            Tap the <strong>Share</strong> button <Share size={14} className="inline-icon" /> (on newer iPhones it’s inside the <strong>•••</strong> menu).
          </li>
          <li>
            Choose <strong>Add to Home Screen</strong>, make sure <em>Open as Web App</em> is on, then tap <strong>Add</strong>.
          </li>
        </ol>
      )}
      {platform === 'mac-safari' && (
        <ol>
          <li>
            In the menu bar choose <strong>File → Add to Dock…</strong>
          </li>
          <li>
            Click <strong>Add</strong>. Slate now lives in your Dock, Launchpad and Spotlight like any Mac app.
          </li>
        </ol>
      )}
      {platform === 'chromium' && !prompt && (
        <ol>
          <li>
            Click the <strong>install icon</strong> at the right end of the address bar (a screen with a down arrow),
            or open the <strong>⋮</strong> menu → <strong>Cast, save and share → Install page as app…</strong>
          </li>
        </ol>
      )}
      {platform === 'android' && !prompt && (
        <ol>
          <li>
            Open the <strong>⋮</strong> menu in Chrome and tap <strong>Add to Home screen → Install</strong>.
          </li>
        </ol>
      )}
      {platform === 'other' && <p>Open this page in Safari (Mac/iPhone) or Chrome/Edge to install it as an app.</p>}
    </div>
  )
}

const DISMISS_KEY = 'cairn.installHint.dismissed'

// One-time nudge on phones that haven't installed yet.
export function InstallBanner() {
  const [show, setShow] = useState(false)
  useEffect(() => {
    let dismissed = false
    try {
      dismissed = !!localStorage.getItem(DISMISS_KEY)
    } catch {
      /* ignore */
    }
    const p = detectPlatform()
    setShow(!dismissed && !isStandalone() && (p === 'ios' || p === 'android'))
  }, [])
  if (!show) return null
  const close = () => {
    setShow(false)
    try {
      localStorage.setItem(DISMISS_KEY, '1')
    } catch {
      /* ignore */
    }
  }
  return (
    <div className="install-banner">
      <div>
        <strong>Get the Slate app</strong>
        <InstallSteps />
      </div>
      <button type="button" className="icon-btn" onClick={close} aria-label="Dismiss">
        <X size={18} />
      </button>
    </div>
  )
}
