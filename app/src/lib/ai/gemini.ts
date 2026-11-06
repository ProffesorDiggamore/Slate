// Gemini: streamGenerateContent with ?alt=sse, key in the x-goog-api-key
// header (never in the URL, where it could end up in logs).
import { AiError, httpError, isAbort, networkError } from './errors'
import { sseData } from './sse'
import type { AiConnection } from './store'
import type { ModelOption, StreamRequest, StreamResult } from './transport'

async function send(conn: AiConnection, url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init)
  } catch (err) {
    if (isAbort(err)) throw err
    throw networkError(conn.name)
  }
}

interface GeminiChunk {
  candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[]
  promptFeedback?: { blockReason?: string }
  error?: { message?: string }
}

const BLOCKED = new Set(['SAFETY', 'PROHIBITED_CONTENT', 'BLOCKLIST', 'SPII', 'RECITATION'])

export async function streamGemini(conn: AiConnection, key: string, req: StreamRequest): Promise<StreamResult> {
  const model = conn.model.replace(/^models\//, '')
  const res = await send(conn, `${conn.baseUrl}/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: req.system }] },
      contents: req.messages.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
    }),
    signal: req.signal,
  })
  if (!res.ok) throw await httpError(res, conn.name, conn.model)
  if (!res.body) throw new AiError('Gemini sent an empty response.')
  let stop: StreamResult['stop'] = 'end'
  try {
    for await (const data of sseData(res.body, req.signal)) {
      let chunk: GeminiChunk
      try {
        chunk = JSON.parse(data) as GeminiChunk
      } catch {
        continue
      }
      if (chunk.error) throw new AiError(`Gemini: ${chunk.error.message ?? 'error'}`)
      if (chunk.promptFeedback?.blockReason) throw new AiError('Gemini declined this request.', 'refusal')
      const cand = chunk.candidates?.[0]
      for (const part of cand?.content?.parts ?? []) if (part.text && !part.thought) req.onText(part.text)
      if (cand?.finishReason === 'MAX_TOKENS') stop = 'length'
      if (cand?.finishReason && BLOCKED.has(cand.finishReason)) throw new AiError('Gemini declined this request.', 'refusal')
    }
  } catch (err) {
    if (err instanceof AiError || isAbort(err)) throw err
    throw networkError(conn.name)
  }
  return { stop }
}

export async function listGeminiModels(conn: AiConnection, key: string): Promise<ModelOption[]> {
  const res = await send(conn, `${conn.baseUrl}/models?pageSize=1000`, { headers: { 'x-goog-api-key': key } })
  if (!res.ok) throw await httpError(res, conn.name, conn.model)
  const body = (await res.json()) as { models?: { name: string; displayName?: string; supportedGenerationMethods?: string[] }[] }
  return (body.models ?? [])
    .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
    .map((m) => ({ id: m.name.replace(/^models\//, ''), label: m.displayName }))
}
