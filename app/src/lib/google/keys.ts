// Shared by the app and the tiny /oauth-google.html page, so it imports nothing.

export const CALLBACK_PATH = '/oauth-google.html'
export const PENDING_KEY = 'cairn.google.pending'
export const RESULT_KEY = 'cairn.google.result'
export const CHANNEL = 'cairn-google'

export type AuthResult = { ok: true; token: string; expiresAt: number } | { ok: false; error: string }

export interface Pending {
  state: string
  mode: 'popup' | 'redirect'
  back: string // the app's #route to return to after a redirect
  at: number
}
