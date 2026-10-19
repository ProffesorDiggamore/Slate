// Google Calendar sign-in with no server and no Google script on the page.
//
// Google's browser OAuth flow hands a short-lived access token (about an hour)
// to /oauth-google.html, which passes it back to the app. There's no refresh
// token, no client secret, and no Google code running next to your notes and
// GitHub token. Desktop browsers and Mac Dock apps sign in through a popup
// (window.open stays inside a Safari web app); iPhone home-screen apps can't
// hear back from a popup, so they go to Google and back in the same window.

import { create } from 'zustand'
import { flushAll } from '../flush'
import { CALLBACK_PATH, CHANNEL, PENDING_KEY, RESULT_KEY, type AuthResult, type Pending } from './keys'

export const GOOGLE_CLIENT_ID = String(import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '').trim()
export const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
  'https://www.googleapis.com/auth/calendar.events',
].join(' ')

const TOKEN_KEY = 'cairn.google.token'

interface AuthState {
  token: string | null
  expiresAt: number
  busy: boolean
  error: string | null
}

function loadToken(): { token: string | null; expiresAt: number } {
  try {
    const t = JSON.parse(localStorage.getItem(TOKEN_KEY) || 'null') as { token: string; expiresAt: number } | null
    if (t?.token && t.expiresAt > Date.now()) return t
  } catch {
    /* private mode or corrupt */
  }
  return { token: null, expiresAt: 0 }
}

export const useGoogleAuth = create<AuthState>(() => ({ ...loadToken(), busy: false, error: null }))

export const googleConfigured = () => GOOGLE_CLIENT_ID !== ''

/** The access token, or null once it's within 30 seconds of expiring. */
export function validToken(): string | null {
  const { token, expiresAt } = useGoogleAuth.getState()
  return token && expiresAt > Date.now() + 30_000 ? token : null
}

function saveToken(token: string | null, expiresAt = 0) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, JSON.stringify({ token, expiresAt }))
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    /* storage blocked: the token still lives in memory for this session */
  }
  useGoogleAuth.setState({ token, expiresAt })
}

/** Google said the token is no good (401): forget it so the UI offers to reconnect. */
export function expireToken() {
  saveToken(null)
}

// No `prompt`: when you've said yes before and are signed in to Google, it goes
// straight back without showing anything; otherwise it asks, in the same window.
export function authUrl(state: string, hint?: string | null): string {
  const p = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: location.origin + CALLBACK_PATH,
    response_type: 'token',
    scope: GOOGLE_SCOPES,
    include_granted_scopes: 'true',
    state,
  })
  if (hint) p.set('login_hint', hint)
  return `https://accounts.google.com/o/oauth2/v2/auth?${p.toString()}`
}

function randomState(): string {
  const b = new Uint8Array(16)
  crypto.getRandomValues(b)
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
}

// ------------------------------------------------------------ results

const successHandlers = new Set<() => void>()
let queued: ((token: string) => void)[] = []

/** Runs after every successful sign-in (used to load calendars). */
export function onGoogleConnected(fn: () => void) {
  successHandlers.add(fn)
  return () => successHandlers.delete(fn)
}

function apply(r: AuthResult) {
  if (r.ok) {
    saveToken(r.token, r.expiresAt)
    useGoogleAuth.setState({ busy: false, error: null })
    const waiting = queued
    queued = []
    for (const fn of waiting) fn(r.token)
    for (const fn of successHandlers) fn()
  } else {
    queued = []
    const canceled = r.error === 'access_denied' || r.error === 'popup_closed'
    useGoogleAuth.setState({ busy: false, error: canceled ? null : `Google sign-in didn’t finish (${r.error}).` })
    if (!canceled) console.warn('[cairn] google sign-in:', r.error)
  }
}

function takeStoredResult() {
  try {
    const raw = localStorage.getItem(RESULT_KEY)
    if (!raw) return
    localStorage.removeItem(RESULT_KEY)
    apply(JSON.parse(raw) as AuthResult)
  } catch {
    /* ignore */
  }
}

let listening = false
/** Call once at startup: picks up a sign-in that finished in a popup or after a redirect. */
export function initGoogleAuth() {
  if (listening || typeof window === 'undefined') return
  listening = true
  takeStoredResult()
  try {
    new BroadcastChannel(CHANNEL).onmessage = () => takeStoredResult()
  } catch {
    /* older browser: the storage event below still works */
  }
  window.addEventListener('storage', (e) => {
    if (e.key === RESULT_KEY && e.newValue) takeStoredResult()
  })
}

// ------------------------------------------------------------ sign in / out

const isIosHomeScreenApp = () => (navigator as Navigator & { standalone?: boolean }).standalone === true

/**
 * Signs in to Google. Call it straight from a click, or browsers block the popup.
 * `then` runs with a token once there is one; with a valid token already, it
 * runs right away and no window opens. `fresh` signs in even if a token is valid.
 */
export function connectGoogle({ hint = null, then, fresh = false }: { hint?: string | null; then?: (token: string) => void; fresh?: boolean } = {}) {
  if (!googleConfigured()) return
  const token = validToken()
  if (token && !fresh) {
    then?.(token)
    return
  }
  if (then) queued.push(then)
  if (useGoogleAuth.getState().busy) return
  const state = randomState()
  const url = authUrl(state, hint)
  const pending = (mode: Pending['mode']): Pending => ({ state, mode, back: location.hash, at: Date.now() })

  if (!isIosHomeScreenApp()) {
    localStorage.setItem(PENDING_KEY, JSON.stringify(pending('popup')))
    const w = window.open(url, 'cairn-google', 'popup,width=480,height=640')
    if (w) {
      useGoogleAuth.setState({ busy: true, error: null })
      watchForCancel()
      return
    }
  }
  // iPhone home-screen app, or the popup was blocked: go to Google in this window.
  localStorage.setItem(PENDING_KEY, JSON.stringify(pending('redirect')))
  useGoogleAuth.setState({ busy: true, error: null })
  flushAll()
  location.assign(url)
}

// Google's pages cut the link back to the popup's opener, so `popup.closed`
// can't be trusted. Instead: if the user comes back to Slate and no answer
// arrives shortly after, assume they closed the popup.
function watchForCancel() {
  const onFocus = () => {
    setTimeout(() => {
      if (useGoogleAuth.getState().busy && !localStorage.getItem(RESULT_KEY)) apply({ ok: false, error: 'popup_closed' })
    }, 2500)
  }
  window.addEventListener('focus', onFocus, { once: true })
  setTimeout(() => window.removeEventListener('focus', onFocus), 10 * 60_000)
}

/** Forgets the token on this device and asks Google to cancel Slate's access. */
export async function revokeGoogle() {
  const token = useGoogleAuth.getState().token
  saveToken(null)
  useGoogleAuth.setState({ busy: false, error: null })
  if (!token) return
  try {
    // A simple form POST: Google doesn't answer revoke calls with CORS headers,
    // but it still revokes. We can't read the reply and don't need to.
    // keepalive: Reset reloads the page right after this.
    await fetch('https://oauth2.googleapis.com/revoke', { method: 'POST', mode: 'no-cors', keepalive: true, body: new URLSearchParams({ token }) })
  } catch {
    /* offline: the token dies within the hour anyway */
  }
}
