// Errors the AI code throws, sorted into kinds the UI can act on: a bad key or
// unknown model points the user at Settings → AI, a refusal is shown as such,
// everything else is a plain message.

export type AiErrorKind = 'auth' | 'model' | 'rate' | 'network' | 'refusal' | 'other'

export class AiError extends Error {
  constructor(
    message: string,
    readonly kind: AiErrorKind = 'other',
  ) {
    super(message)
    this.name = 'AiError'
  }
}

export class AiNotReadyError extends Error {
  constructor() {
    super('Set up an AI provider in Settings → AI first.')
    this.name = 'AiNotReadyError'
  }
}

/**
 * The user chose "Not now" on the consent prompt. Named like an abort on
 * purpose: it's a cancel the user asked for, so callers that already ignore
 * aborts stay quiet instead of showing an error.
 */
export class AiConsentDeclinedError extends Error {
  constructor() {
    super('Not sent.')
    this.name = 'AbortError'
  }
}

export function isAbort(err: unknown): boolean {
  const name = typeof err === 'object' && err !== null ? (err as { name?: unknown }).name : null
  return name === 'AbortError' || name === 'APIUserAbortError'
}

/** Turns an HTTP error from an OpenAI-style or Gemini endpoint into an AiError. */
export async function httpError(res: Response, name: string, model: string): Promise<AiError> {
  let detail = ''
  let reasons: unknown[] = []
  try {
    const body = (await res.json()) as { error?: { message?: string; details?: { reason?: unknown }[] } | string; message?: string }
    detail = typeof body.error === 'string' ? body.error : (body.error?.message ?? body.message ?? '')
    if (body.error && typeof body.error === 'object' && Array.isArray(body.error.details)) reasons = body.error.details.map((d) => d?.reason)
  } catch {
    /* not JSON */
  }
  detail = detail.slice(0, 300)
  // Gemini turns a bad or expired key away with 400 INVALID_ARGUMENT (reason
  // API_KEY_INVALID), not 401, and it still needs the way back to the key field.
  const badKey = res.status === 400 && (reasons.includes('API_KEY_INVALID') || /\bAPI key (not valid|expired|invalid)/i.test(detail))
  if (res.status === 401 || res.status === 403 || badKey)
    return new AiError(`${name} rejected the key${detail ? ` — ${detail}` : '.'} Check it in Settings → AI.`, 'auth')
  if (res.status === 404) return new AiError(`${name} doesn’t know the model “${model}”. Pick another in Settings → AI.`, 'model')
  if (res.status === 429) return new AiError(`Slow down — ${name} says too many requests${detail ? ` (${detail})` : ''}. Try again in a moment.`, 'rate')
  return new AiError(`${name} error ${res.status}${detail ? `: ${detail}` : ''}`)
}

/** fetch() itself failed: offline, blocked by the browser, or the server isn't running. */
export function networkError(name: string, local = false): AiError {
  return new AiError(
    local
      ? `Can’t reach ${name}. Make sure it’s running, that this device can reach its address, and that it allows requests from Slate (Settings → AI shows how).`
      : `Can’t reach ${name}. Check your connection and try again.`,
    'network',
  )
}
