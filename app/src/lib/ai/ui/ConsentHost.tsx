import { ExternalLink, ShieldCheck } from 'lucide-react'
import { useEffect, useRef, type KeyboardEvent } from 'react'
import { Modal } from '../../../components/ui'
import { answerConsent, useConsent } from '../consent'

// "Send to Claude?" — shown before the first request to each provider. Mounted
// once for the whole app (by SettingsModal, which App always renders), so the
// editor's AI menu gets the same prompt as the assistant page.
//
// The prompt usually opens in the middle of an Enter press (the composer sends
// on keydown), so neither button takes focus: a focused button clicks on Enter,
// key repeats included, and a held Enter would answer for the user. Focus goes
// to the prompt itself, and repeats never press a button.
const ignoreRepeat = (e: KeyboardEvent) => {
  if (e.repeat) e.preventDefault()
}

export function ConsentHost() {
  const req = useConsent((s) => s.request)
  const body = useRef<HTMLDivElement>(null)
  const slot = req?.conn.slot
  useEffect(() => {
    if (slot) body.current?.focus({ preventScroll: true })
  }, [slot])
  if (!req) return null
  const { conn } = req
  const who = conn.local ? `${conn.name} on your computer` : conn.company
  return (
    <Modal title={`Send to ${conn.name}?`} onClose={() => answerConsent(false)} className="ai-consent">
      <div className="ai-consent-body" ref={body} tabIndex={-1}>
        <div className="ai-consent-icon" aria-hidden="true">
          <ShieldCheck size={22} />
        </div>
        <p>
          Your message — and any page or note excerpts you attach — will be sent to <strong>{who}</strong>
          {conn.needsKey ? ' using your own API key' : ''}, so it can write the answer.
        </p>
        <ul className="ai-consent-points">
          <li>It goes straight from this device to {conn.local ? 'that app' : conn.company}. Slate has no server and never sees it.</li>
          <li>Nothing is sent until you ask, and encrypted pages are never sent.</li>
          {!conn.local && (
            <li>
              {conn.company}’s privacy policy applies to what you send
              {conn.privacyUrl && (
                <>
                  {' '}
                  —{' '}
                  <a href={conn.privacyUrl} target="_blank" rel="noopener noreferrer">
                    read it <ExternalLink size={12} />
                  </a>
                </>
              )}
              .
            </li>
          )}
        </ul>
        <p className="muted small">You can change this any time in Settings → AI.</p>
        <div className="ai-consent-actions">
          <button type="button" className="btn" onClick={() => answerConsent(false)} onKeyDown={ignoreRepeat}>
            Not now
          </button>
          <button type="button" className="btn btn-primary" onClick={() => answerConsent(true)} onKeyDown={ignoreRepeat}>
            Allow
          </button>
        </div>
      </div>
    </Modal>
  )
}
