// Claude, through Anthropic's official SDK. transport.ts imports this module
// lazily, so the SDK only downloads once someone actually uses Claude.
// The key is the user's own and the request goes straight from their device to
// api.anthropic.com, which is why the SDK's browser opt-in is safe here.
//
// API notes, per Anthropic's guidance for current models:
// - stream through the beta namespace so `betas` / `fallbacks` are accepted;
// - no temperature / top_p / top_k and no `thinking` (current models think
//   adaptively; disabling it is a 400 on some of them);
// - server-side refusal fallbacks for the families that support them;
// - effort only for models that take it;
// - max_tokens capped by what the model allows (from the Models API).
import Anthropic, {
  APIConnectionError,
  APIError,
  APIUserAbortError,
  AuthenticationError,
  BadRequestError,
  InternalServerError,
  NotFoundError,
  PermissionDeniedError,
  RateLimitError,
} from '@anthropic-ai/sdk'
import type { BetaMessageStreamParams } from '@anthropic-ai/sdk/resources/beta/messages/messages'
import { AiError, isAbort } from './errors'
import type { AiConnection } from './store'
import type { ModelOption, StreamRequest, StreamResult } from './transport'

const STREAM_MAX_TOKENS = 64_000

function client(apiKey: string): Anthropic {
  return new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 1 })
}

/** Families that accept `fallbacks: 'default'` (re-run a declined request on another model, server-side). */
export function supportsFallbacks(model: string): boolean {
  return /^claude-(opus-5|fable-5)/.test(model) || model.startsWith('claude-sonnet-5-5')
}

/** Families that accept `output_config.effort`. */
export function supportsEffort(model: string): boolean {
  return /^claude-(opus-5|sonnet-5|fable-5)/.test(model) || model.startsWith('claude-haiku-5-5')
}

// The output cap per model, from the Models API, fetched once per key and session.
let caps: { key: string; models: Promise<Map<string, number | null>> } | null = null

/** How long the request waits on the models list before going ahead with the default cap. */
export const CAPS_TIMEOUT_MS = 8_000

type ModelsLister = Pick<Anthropic, 'models'>

function modelCaps(sdk: ModelsLister, key: string, signal?: AbortSignal): Promise<Map<string, number | null>> {
  if (caps?.key !== key) {
    const models = (async () => {
      const map = new Map<string, number | null>()
      // The request's signal, so Stop also ends the lookup; a short timeout and
      // no retry, so a stalled network can't hold the answer up for minutes.
      for await (const m of sdk.models.list({}, { signal, timeout: CAPS_TIMEOUT_MS, maxRetries: 0 })) map.set(m.id, m.max_tokens)
      return map
    })()
    caps = { key, models }
    // A failed or stopped lookup shouldn't stick: try again next time.
    models.catch(() => {
      if (caps?.models === models) caps = null
    })
  }
  return caps.models
}

// Settles as soon as `signal` stops, even when the lookup it waits on was
// started by another request (so it isn't tied to this one's signal).
function untilStopped<T>(work: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return work
  return new Promise<T>((resolve, reject) => {
    const stop = () => reject(new DOMException('Stopped', 'AbortError'))
    if (signal.aborted) return stop()
    signal.addEventListener('abort', stop, { once: true })
    work.then(resolve, reject).finally(() => signal.removeEventListener('abort', stop))
  })
}

/** The model's output cap, or the default when the list can't be had. Throws only when `signal` was stopped. */
export async function maxTokensFor(sdk: ModelsLister, key: string, model: string, signal?: AbortSignal): Promise<number> {
  try {
    const cap = (await untilStopped(modelCaps(sdk, key, signal), signal)).get(model)
    return cap ? Math.min(STREAM_MAX_TOKENS, cap) : STREAM_MAX_TOKENS
  } catch (err) {
    if (signal?.aborted) throw err
    return STREAM_MAX_TOKENS
  }
}

/** Forgets the cached caps (tests). */
export function resetModelCaps() {
  caps = null
}

export function buildClaudeParams(model: string, maxTokens: number, req: Pick<StreamRequest, 'system' | 'messages' | 'effort'>): BetaMessageStreamParams {
  return {
    model,
    max_tokens: maxTokens,
    system: req.system,
    messages: req.messages.map((m) => ({ role: m.role, content: m.content })),
    ...(supportsFallbacks(model) ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
    ...(supportsEffort(model) ? { output_config: { effort: req.effort } } : {}),
  }
}

export async function streamClaude(conn: AiConnection, key: string, req: StreamRequest): Promise<StreamResult> {
  const sdk = client(key)
  try {
    const params = buildClaudeParams(conn.model, await maxTokensFor(sdk, key, conn.model, req.signal), req)
    const stream = sdk.beta.messages.stream(params, { signal: req.signal })
    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') req.onText(event.delta.text)
    }
    const final = await stream.finalMessage()
    // Check the stop reason before trusting the text: a refusal can arrive after partial output.
    if (final.stop_reason === 'refusal') throw new AiError('Claude declined this request.', 'refusal')
    return { stop: final.stop_reason === 'max_tokens' ? 'length' : 'end' }
  } catch (err) {
    throw claudeError(err, conn.model)
  }
}

export async function listClaudeModels(key: string): Promise<ModelOption[]> {
  try {
    const out: ModelOption[] = []
    for await (const m of client(key).models.list()) out.push({ id: m.id, label: m.display_name })
    return out
  } catch (err) {
    throw claudeError(err, '')
  }
}

// The SDK's typed errors, most specific first. The abort and connection errors
// are subclasses of APIError, so they're checked before it.
function claudeError(err: unknown, model: string): unknown {
  if (err instanceof AiError) return err
  if (err instanceof APIUserAbortError || isAbort(err)) return new DOMException('Stopped', 'AbortError')
  if (err instanceof AuthenticationError) return new AiError('Claude rejected the key. Check it in Settings → AI.', 'auth')
  if (err instanceof PermissionDeniedError) return new AiError(`This key isn’t allowed to use ${model || 'that model'}. ${detail(err)}`.trim(), 'auth')
  if (err instanceof NotFoundError) return new AiError(`Claude doesn’t know the model “${model}”. Pick another in Settings → AI.`, 'model')
  if (err instanceof RateLimitError) return new AiError('Slow down — Claude’s rate limit was reached. Try again in a moment.', 'rate')
  if (err instanceof APIConnectionError) return new AiError('Can’t reach Claude. Check your connection and try again.', 'network')
  if (err instanceof BadRequestError) return new AiError(`Claude couldn’t take that request: ${detail(err)}`)
  if (err instanceof InternalServerError) return new AiError('Claude is busy or having trouble right now. Try again in a moment.')
  if (err instanceof APIError) return new AiError(`Claude error${err.status ? ` ${err.status}` : ''}: ${detail(err)}`)
  return new AiError(err instanceof Error ? err.message : 'Claude request failed.')
}

/** The API's own explanation, without the status prefix and JSON the SDK adds to `message`. */
function detail(err: APIError): string {
  const body = err.error as { error?: { message?: string } } | undefined
  return (body?.error?.message ?? err.message).slice(0, 300)
}
