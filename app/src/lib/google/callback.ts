import { CHANNEL, PENDING_KEY, RESULT_KEY, type AuthResult, type Pending } from './keys'

// Runs on /oauth-google.html when Google sends the user back. The token is in
// the URL fragment, which never reaches a server; this checks it answers the
// request Slate made (the `state`), leaves it where the app will find it, and
// gets out of the way: closes the popup, or returns to the note you were on.

export function finishGoogleSignIn() {
  const params = new URLSearchParams(location.hash.slice(1) || location.search.slice(1))
  // Drop the token from the address bar and history right away.
  history.replaceState(null, '', location.pathname)

  let pending: Pending | null = null
  try {
    pending = JSON.parse(localStorage.getItem(PENDING_KEY) || 'null') as Pending | null
    localStorage.removeItem(PENDING_KEY)
  } catch {
    /* ignore */
  }

  let result: AuthResult
  if (!pending || params.get('state') !== pending.state || Date.now() - pending.at > 30 * 60_000) {
    result = { ok: false, error: 'state_mismatch' }
  } else if (params.get('access_token')) {
    const seconds = Number(params.get('expires_in')) || 3600
    result = { ok: true, token: params.get('access_token')!, expiresAt: Date.now() + (seconds - 60) * 1000 }
  } else {
    result = { ok: false, error: params.get('error') || 'no_token' }
  }

  try {
    localStorage.setItem(RESULT_KEY, JSON.stringify(result))
  } catch {
    /* storage blocked — nothing more we can do */
  }
  try {
    const ch = new BroadcastChannel(CHANNEL)
    ch.postMessage('done')
    ch.close()
  } catch {
    /* the app also listens for the storage event */
  }

  if (pending?.mode === 'popup') {
    window.close()
    // Some browsers refuse to close a window the page didn't open itself.
    document.body.textContent = 'Signed in — you can close this window and go back to Slate.'
  } else {
    location.replace('/' + (pending?.back || '#/'))
  }
}
