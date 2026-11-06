// Ask before anything is sent to an AI provider for the first time (App Store
// guideline 5.1.2(i)): the user sees who receives their message and the pages
// that go with it, and says yes once per provider. Revocable in Settings → AI.
import { create } from 'zustand'
import { AiConsentDeclinedError } from './errors'
import { setAiConfig, useAiConfig, type AiConnection } from './store'

interface ConsentRequest {
  conn: AiConnection
  resolvers: ((ok: boolean) => void)[]
}

export const useConsent = create<{ request: ConsentRequest | null }>(() => ({ request: null }))

export function hasConsent(slot: string): boolean {
  return !!useAiConfig.getState().consent[slot]
}

/** Resolves once the user allows sending to this connection; throws AiConsentDeclinedError on "Not now". */
export async function ensureConsent(conn: AiConnection): Promise<void> {
  if (hasConsent(conn.slot)) return
  const ok = await new Promise<boolean>((resolve) => {
    const pending = useConsent.getState().request
    // A second request for the same provider waits for the same answer;
    // a request for a different one replaces the stale prompt.
    if (pending && pending.conn.slot === conn.slot) {
      useConsent.setState({ request: { ...pending, resolvers: [...pending.resolvers, resolve] } })
      return
    }
    pending?.resolvers.forEach((r) => r(false))
    useConsent.setState({ request: { conn, resolvers: [resolve] } })
  })
  if (!ok) throw new AiConsentDeclinedError()
}

export function answerConsent(ok: boolean) {
  const req = useConsent.getState().request
  if (!req) return
  if (ok) setAiConfig((s) => ({ consent: { ...s.consent, [req.conn.slot]: true } }))
  useConsent.setState({ request: null })
  req.resolvers.forEach((r) => r(ok))
}

export function revokeConsent(slot: string) {
  setAiConfig((s) => {
    const consent = { ...s.consent }
    delete consent[slot]
    return { consent }
  })
}
