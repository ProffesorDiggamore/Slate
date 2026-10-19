import { create } from 'zustand'

// Encrypted pages. The note's whole text (frontmatter included) is sealed with
// AES-256-GCM under a key stretched from your passphrase (PBKDF2-SHA256,
// 600,000 rounds), so GitHub, the website host and anyone with the repo see only
// ciphertext. The passphrase lives in memory while Cairn is open and unlocked —
// never in storage — and there is no way to recover it.
//
// On disk an encrypted page is still a Markdown file Obsidian can open:
// a short notice, then the sealed text in a ```cairn-encrypted block.

const ITERATIONS = 600_000
const BLOCK_RE = /```cairn-encrypted\n([A-Za-z0-9+/=\n]+?)\n```/

interface Payload {
  v: 1
  kdf: 'PBKDF2-SHA256'
  iter: number
  salt: string
  iv: string
  ct: string
}

export class WrongPassphrase extends Error {
  constructor() {
    super('That passphrase doesn’t open this page.')
  }
}

export function isEncrypted(content: string): boolean {
  return BLOCK_RE.test(content)
}

// ------------------------------------------------------------ base64 helpers

const toB64 = (bytes: Uint8Array) => {
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin)
}
const fromB64 = (b64: string) => Uint8Array.from(atob(b64.replace(/\s/g, '')), (c) => c.charCodeAt(0))
const random = (n: number) => crypto.getRandomValues(new Uint8Array(n))

// ------------------------------------------------------------ keys

async function deriveKey(passphrase: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, base, { name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt',
  ])
}

/** A passphrase plus the keys already stretched from it (stretching is slow on purpose). */
export class Keyring {
  private keys = new Map<string, Promise<CryptoKey>>()
  private salt: Uint8Array<ArrayBuffer> = random(16)

  constructor(private passphrase: string) {}

  /** For handing to Face ID unlock, which seals it under a device key. */
  get secret(): string {
    return this.passphrase
  }

  private key(saltB64: string, iterations: number): Promise<CryptoKey> {
    const id = `${saltB64}:${iterations}`
    let k = this.keys.get(id)
    if (!k) {
      k = deriveKey(this.passphrase, fromB64(saltB64), iterations)
      this.keys.set(id, k)
    }
    return k
  }

  /** Seal new text with the same salt as an existing page, so one stretch covers both. */
  adoptSalt(content: string) {
    const m = BLOCK_RE.exec(content)
    if (!m) return
    try {
      const p = JSON.parse(new TextDecoder().decode(fromB64(m[1]))) as Payload
      if (p.iter === ITERATIONS) this.salt = fromB64(p.salt)
    } catch {
      /* keep the fresh salt */
    }
  }

  async seal(plain: string): Promise<string> {
    const salt = toB64(this.salt)
    const iv = random(12)
    const key = await this.key(salt, ITERATIONS)
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plain)))
    const payload: Payload = { v: 1, kdf: 'PBKDF2-SHA256', iter: ITERATIONS, salt, iv: toB64(iv), ct: toB64(ct) }
    return wrap(toB64(new TextEncoder().encode(JSON.stringify(payload))))
  }

  async open(content: string): Promise<string> {
    const m = BLOCK_RE.exec(content)
    if (!m) return content
    let p: Payload
    try {
      p = JSON.parse(new TextDecoder().decode(fromB64(m[1]))) as Payload
    } catch {
      throw new Error('This encrypted page is damaged and can’t be read.')
    }
    if (p.v !== 1) throw new Error('This page was encrypted by a newer version of Cairn.')
    const key = await this.key(p.salt, p.iter)
    try {
      const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(p.iv) }, key, fromB64(p.ct))
      return new TextDecoder().decode(plain)
    } catch {
      throw new WrongPassphrase()
    }
  }
}

function wrap(b64: string): string {
  const lines = b64.match(/.{1,76}/g) ?? ['']
  return [
    '---',
    'cairn-encrypted: 1',
    '---',
    '',
    '> [!lock] Encrypted page',
    '> This page is encrypted with Cairn. Open it in Cairn and enter your passphrase to read it.',
    '',
    '```cairn-encrypted',
    ...lines,
    '```',
    '',
  ].join('\n')
}

// ------------------------------------------------------------ session

interface LockState {
  keyring: Keyring | null
}

/** The unlocked keyring for this session, if any. */
export const useLock = create<LockState>(() => ({ keyring: null }))

/**
 * Unlocks with a passphrase. `sample` is any encrypted page: when given, the
 * passphrase must open it (so a typo can't start a second, different key).
 */
export async function unlock(passphrase: string, sample?: string): Promise<void> {
  const ring = new Keyring(passphrase)
  if (sample) {
    await ring.open(sample)
    ring.adoptSalt(sample)
  }
  useLock.setState({ keyring: ring })
  armAutoLock()
}

export function lockNow() {
  useLock.setState({ keyring: null })
}

// Lock again after Cairn has been in the background for a while.
const AUTO_LOCK_MS = 10 * 60_000
let armed = false
function armAutoLock() {
  if (armed || typeof document === 'undefined') return
  armed = true
  let hiddenAt = 0
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') hiddenAt = Date.now()
    else if (hiddenAt && Date.now() - hiddenAt > AUTO_LOCK_MS) lockNow()
  })
}
