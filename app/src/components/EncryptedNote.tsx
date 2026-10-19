import { Lock, LoaderCircle, LockOpen, ScanFace, ShieldAlert } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { create } from 'zustand'
import { enrollFaceId, faceIdAvailable, faceIdEnrolled, faceIdError, faceIdName, unlockWithFaceId } from '../lib/biometric'
import { isEncrypted, lockNow, unlock, useLock, WrongPassphrase, type Keyring } from '../lib/crypto'
import { isInFolder, titleOf } from '../lib/paths'
import { toast } from '../lib/toasts'
import { liveNotes, updateContent, useVault } from '../lib/vault'
import { NoteView, type NoteSource } from './NotePage'
import { Modal } from './ui'

// Encrypted pages: unlock once per session, then they open and edit like any
// other page. Text is decrypted into memory only; every save is sealed again
// before it touches this device's storage or GitHub.

/** Any encrypted page, to check a passphrase against. */
const sample = () => liveNotes().find((f) => isEncrypted(f.content))?.content

// ------------------------------------------------------------ passphrase prompt

interface Ask {
  mode: 'unlock' | 'create'
  reason: string
  resolve: (ok: boolean) => void
}
const useAsk = create<{ ask: Ask | null }>(() => ({ ask: null }))

/** Makes sure there's an unlocked keyring, asking for the passphrase if needed. */
export function ensureUnlocked(reason: string): Promise<boolean> {
  if (useLock.getState().keyring) return Promise.resolve(true)
  return new Promise((resolve) => useAsk.setState({ ask: { mode: sample() ? 'unlock' : 'create', reason, resolve } }))
}

export function PassphraseHost() {
  const ask = useAsk((s) => s.ask)
  if (!ask) return null
  const done = (ok: boolean) => {
    useAsk.setState({ ask: null })
    ask.resolve(ok)
  }
  return (
    <Modal title={ask.mode === 'create' ? 'Choose a passphrase' : 'Unlock encrypted pages'} onClose={() => done(false)} className="passphrase-modal">
      <PassphraseForm mode={ask.mode} reason={ask.reason} onDone={() => done(true)} />
    </Modal>
  )
}

function PassphraseForm({ mode, reason, onDone, check }: { mode: 'unlock' | 'create'; reason?: string; onDone: () => void; check?: string }) {
  const [pass, setPass] = useState('')
  const [again, setAgain] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const enrolled = mode === 'unlock' && faceIdEnrolled()

  const byFaceId = async () => {
    setError(null)
    setBusy(true)
    try {
      await unlockWithFaceId(check ?? sample())
      onDone()
    } catch (err) {
      setError(faceIdError(err))
    } finally {
      setBusy(false)
    }
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (mode === 'create') {
      if (pass.length < 8) return setError('Use at least 8 characters — a few random words works well.')
      if (pass !== again) return setError('The two passphrases don’t match.')
    }
    setBusy(true)
    try {
      await unlock(pass, mode === 'unlock' ? (check ?? sample()) : undefined)
      onDone()
      void offerFaceId()
    } catch (err) {
      setError(err instanceof WrongPassphrase ? 'That passphrase doesn’t open your encrypted pages.' : String((err as Error).message ?? err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="passphrase-form" onSubmit={submit}>
      {reason && <p className="muted">{reason}</p>}
      {mode === 'create' && (
        <div className="settings-warn is-danger">
          <ShieldAlert size={16} />
          <div>
            <strong>There’s no way to recover a forgotten passphrase</strong> — not by GitHub, not by Cairn. Write it down somewhere safe. You’ll
            use the same one on every device.
          </div>
        </div>
      )}
      {enrolled && (
        <button type="button" className="btn btn-primary" onClick={() => void byFaceId()} disabled={busy}>
          <ScanFace size={16} /> Unlock with {faceIdName()}
        </button>
      )}
      <input
        className="input"
        type="password"
        autoFocus={!enrolled}
        autoComplete={mode === 'create' ? 'new-password' : 'current-password'}
        placeholder="Passphrase"
        value={pass}
        onChange={(e) => setPass(e.target.value)}
      />
      {mode === 'create' && (
        <input className="input" type="password" autoComplete="new-password" placeholder="Type it again" value={again} onChange={(e) => setAgain(e.target.value)} />
      )}
      {error && <div className="form-error">{error}</div>}
      <button type="submit" className={'btn' + (enrolled ? '' : ' btn-primary')} disabled={busy || !pass}>
        {busy ? <LoaderCircle size={16} className="spin" /> : <LockOpen size={16} />} {mode === 'create' ? 'Set passphrase' : 'Unlock'}
      </button>
      <p className="muted small">Kept in memory only while Cairn is open. It locks again after 10 minutes in the background.</p>
    </form>
  )
}

// ------------------------------------------------------------ Face ID

const ASKED_KEY = 'cairn.faceid.asked'

/** Turns on Face ID unlock for this device (from a tap). */
export async function turnOnFaceId(): Promise<boolean> {
  const ring = useLock.getState().keyring
  if (!ring) return false
  try {
    await enrollFaceId(ring.secret)
    toast(`${faceIdName()} unlock is on for this device.`)
    return true
  } catch (e) {
    const msg = faceIdError(e)
    if (msg) toast(msg, { tone: 'error', duration: 8000 })
    return false
  }
}

/** After a passphrase unlock, offer Face ID once per device. */
async function offerFaceId() {
  try {
    if (faceIdEnrolled() || localStorage.getItem(ASKED_KEY) || !(await faceIdAvailable())) return
    localStorage.setItem(ASKED_KEY, '1')
  } catch {
    return
  }
  toast(`Unlock with ${faceIdName()} next time on this device?`, { action: { label: 'Turn on', run: () => void turnOnFaceId() }, duration: 15_000 })
}

// ------------------------------------------------------------ actions

export async function encryptPages(paths: string[]): Promise<number> {
  if (!paths.length) return 0
  if (!(await ensureUnlocked('Encrypted pages are sealed with your passphrase before they leave this device.'))) return 0
  const ring = useLock.getState().keyring!
  let n = 0
  for (const path of paths) {
    const f = useVault.getState().files[path]
    if (!f || f.deleted || isEncrypted(f.content)) continue
    updateContent(path, await ring.seal(f.content))
    n++
  }
  if (n) toast(`Encrypted ${n} page${n === 1 ? '' : 's'}. Versions from before stay readable in your GitHub history.`, { duration: 8000 })
  return n
}

export function encryptFolder(folder: string) {
  const paths = liveNotes()
    .filter((f) => isInFolder(f.path, folder) && !isEncrypted(f.content))
    .map((f) => f.path)
  if (!paths.length) return toast('Nothing to encrypt here.')
  if (!confirm(`Encrypt ${paths.length} page${paths.length === 1 ? '' : 's'} in “${titleOf(folder + '.md')}”? Their titles stay visible.`)) return
  void encryptPages(paths)
}

export async function decryptPage(path: string) {
  if (!(await ensureUnlocked('Unlock to remove encryption from this page.'))) return
  const f = useVault.getState().files[path]
  if (!f || !isEncrypted(f.content)) return
  try {
    updateContent(path, await useLock.getState().keyring!.open(f.content))
    toast('Encryption removed — this page syncs as plain text again.')
  } catch (e) {
    toast(e instanceof Error ? e.message : String(e), { tone: 'error' })
  }
}

export { lockNow }

// ------------------------------------------------------------ the page

export function EncryptedNote({ path }: { path: string }) {
  const content = useVault((s) => s.files[path]?.content ?? '')
  const ring = useLock((s) => s.keyring)
  const [plain, setPlain] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const plainRef = useRef('')
  const sealedByUs = useRef<string | null>(null)
  const queue = useRef<Promise<void>>(Promise.resolve())

  const openedWith = useRef<Keyring | null>(null)

  useEffect(() => {
    if (!ring) {
      setPlain(null)
      openedWith.current = null
      return
    }
    // Our own save coming back — unless we've been locked (or re-keyed) since.
    if (content === sealedByUs.current && openedWith.current === ring) return
    let alive = true
    setError(null)
    ring.open(content).then(
      (text) => {
        if (!alive) return
        openedWith.current = ring
        plainRef.current = text
        setPlain(text)
      },
      (e: Error) => alive && setError(e.message),
    )
    return () => {
      alive = false
    }
  }, [ring, content])

  if (!ring || error) {
    return (
      <div className="page locked-page">
        <div className="page-inner">
          <div className="locked-card">
            <Lock size={30} strokeWidth={1.5} />
            <h2>{titleOf(path)}</h2>
            <p className="muted">{error ? `${error} Try another passphrase.` : 'This page is encrypted. Enter your passphrase to read and edit it.'}</p>
            <PassphraseForm mode="unlock" check={content} onDone={() => setError(null)} />
          </div>
        </div>
      </div>
    )
  }

  if (plain === null) {
    return (
      <div className="page locked-page">
        <div className="page-inner muted">
          <LoaderCircle size={18} className="spin" /> Decrypting…
        </div>
      </div>
    )
  }

  const source: NoteSource = {
    content: plain,
    read: () => plainRef.current,
    write: (text) => {
      if (text === plainRef.current) return
      plainRef.current = text
      setPlain(text)
      // Seal in order; skip a save if a newer one is already waiting.
      queue.current = queue.current
        .then(async () => {
          if (plainRef.current !== text) return
          const r = useLock.getState().keyring
          if (!r) {
            toast('Locked before the last edit was saved — unlock and type it again.', { tone: 'error' })
            return
          }
          const sealed = await r.seal(text)
          sealedByUs.current = sealed
          updateContent(path, sealed)
        })
        .catch((e: unknown) => {
          toast(`Couldn’t encrypt your edit: ${e instanceof Error ? e.message : String(e)}`, { tone: 'error' })
        })
    },
  }
  return <NoteView key={path} path={path} source={source} />
}
