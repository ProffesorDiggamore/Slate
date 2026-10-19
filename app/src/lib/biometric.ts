import { unlock } from './crypto'

// Face ID / Touch ID / device-passcode unlock for encrypted pages.
//
// A passkey on this device (WebAuthn, with the PRF extension) gives a secret
// that only comes out after the OS checks your face, finger or passcode. That
// secret seals your passphrase, and only the sealed copy is kept here — so
// the passphrase is never stored readable, and nothing leaves the device.
// Needs iOS / macOS 18+ (Safari) or a browser with passkey PRF support.

const KEY = 'cairn.faceid.v1'

interface Saved {
  cred: string // credential id
  salt: string // PRF input
  iv: string
  sealed: string // the passphrase, AES-GCM under the PRF output
}

const toB64 = (b: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(b)))
const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))
const random = (n: number) => crypto.getRandomValues(new Uint8Array(n))

type PrfResults = { prf?: { enabled?: boolean; results?: { first?: ArrayBuffer } } }

function saved(): Saved | null {
  try {
    return JSON.parse(localStorage.getItem(KEY) || 'null') as Saved | null
  } catch {
    return null
  }
}

export const faceIdEnrolled = () => !!saved()

/** True when this device has a built-in authenticator (Face ID, Touch ID, Windows Hello, passcode). */
export async function faceIdAvailable(): Promise<boolean> {
  try {
    return !!window.PublicKeyCredential && (await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable())
  } catch {
    return false
  }
}

async function prfSecret(credId: Uint8Array<ArrayBuffer>, salt: Uint8Array<ArrayBuffer>): Promise<ArrayBuffer> {
  const got = (await navigator.credentials.get({
    publicKey: {
      challenge: random(32),
      rpId: location.hostname,
      allowCredentials: [{ type: 'public-key', id: credId }],
      userVerification: 'required',
      extensions: { prf: { eval: { first: salt } } } as AuthenticationExtensionsClientInputs,
    },
  })) as PublicKeyCredential | null
  const out = (got?.getClientExtensionResults() as PrfResults | undefined)?.prf?.results?.first
  if (!out) throw new Error('This device can’t unlock web pages with Face ID yet — update to iOS / macOS 18 or later.')
  return out
}

async function aesKey(secret: ArrayBuffer): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', secret, 'HKDF', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: new TextEncoder().encode('cairn face id v1') },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

/** Turns on Face ID unlock for this device. Call straight from a tap — the OS prompt needs one. */
export async function enrollFaceId(passphrase: string): Promise<void> {
  const salt = random(32)
  const created = (await navigator.credentials.create({
    publicKey: {
      challenge: random(32),
      rp: { name: 'Cairn', id: location.hostname },
      user: { id: random(16), name: 'Cairn encrypted pages', displayName: 'Cairn encrypted pages' },
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 },
        { type: 'public-key', alg: -257 },
      ],
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'preferred' },
      extensions: { prf: { eval: { first: salt } } } as AuthenticationExtensionsClientInputs,
    },
  })) as PublicKeyCredential | null
  if (!created) throw new Error('Face ID setup was cancelled.')
  const ext = (created.getClientExtensionResults() as PrfResults).prf
  if (ext && ext.enabled === false) throw new Error('This device can’t unlock web pages with Face ID yet — update to iOS / macOS 18 or later.')
  // Some devices hand back the secret at setup; others only when it's first used.
  const secret = ext?.results?.first ?? (await prfSecret(new Uint8Array(created.rawId), salt))
  const iv = random(12)
  const sealed = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aesKey(secret), new TextEncoder().encode(passphrase))
  const record: Saved = { cred: toB64(created.rawId), salt: toB64(salt), iv: toB64(iv), sealed: toB64(sealed) }
  localStorage.setItem(KEY, JSON.stringify(record))
}

/** Unlocks encrypted pages with Face ID / Touch ID / passcode. Call straight from a tap. */
export async function unlockWithFaceId(sample?: string): Promise<void> {
  const s = saved()
  if (!s) throw new Error('Face ID unlock isn’t set up on this device.')
  const secret = await prfSecret(fromB64(s.cred), fromB64(s.salt))
  let passphrase: string
  try {
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(s.iv) }, await aesKey(secret), fromB64(s.sealed))
    passphrase = new TextDecoder().decode(plain)
  } catch {
    throw new Error('Face ID unlock needs setting up again — use your passphrase this time.')
  }
  await unlock(passphrase, sample)
}

export function forgetFaceId() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
}

/** A friendly reason for a failed prompt, or null when the person just cancelled. */
export function faceIdError(e: unknown): string | null {
  if (e instanceof DOMException && (e.name === 'NotAllowedError' || e.name === 'AbortError')) return null
  return e instanceof Error ? e.message : String(e)
}

/** What to call it on this device. */
export function faceIdName(): string {
  const ua = navigator.userAgent
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'Face ID'
  if (/Macintosh/.test(ua)) return 'Touch ID'
  return 'your device lock'
}
