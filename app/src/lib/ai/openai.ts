// ChatGPT, OpenRouter and every OpenAI-compatible service (Groq, Mistral,
// DeepSeek, xAI, Ollama, LM Studio, a custom URL): POST /chat/completions with
// stream: true, read `choices[0].delta.content` from the SSE stream.
// No max_tokens / temperature: newer OpenAI models reject them, and the
// defaults are fine for notes.
import { AiError, httpError, isAbort, networkError } from './errors'
import { sseData } from './sse'
import type { AiConnection } from './store'
import type { ModelOption, StreamRequest, StreamResult } from './transport'

function headers(conn: AiConnection, key: string | null): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' }
  if (key) h.Authorization = `Bearer ${key}`
  // OpenRouter shows this name in the user's activity list.
  if (conn.provider === 'openrouter') h['X-Title'] = 'Slate'
  return h
}

async function send(conn: AiConnection, url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init)
  } catch (err) {
    if (isAbort(err)) throw err
    throw networkError(conn.name, conn.local)
  }
}

interface ChunkJson {
  choices?: { delta?: { content?: string | null }; finish_reason?: string | null }[]
  error?: { message?: string }
}

export async function streamOpenAI(conn: AiConnection, key: string | null, req: StreamRequest): Promise<StreamResult> {
  const res = await send(conn, `${conn.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: headers(conn, key),
    body: JSON.stringify({
      model: conn.model,
      stream: true,
      messages: [{ role: 'system', content: req.system }, ...req.messages],
    }),
    signal: req.signal,
  })
  if (!res.ok) throw await httpError(res, conn.name, conn.model)
  if (!res.body) throw new AiError(`${conn.name} sent an empty response.`)
  let stop: StreamResult['stop'] = 'end'
  try {
    for await (const data of sseData(res.body, req.signal)) {
      let chunk: ChunkJson
      try {
        chunk = JSON.parse(data) as ChunkJson
      } catch {
        continue // a keep-alive or a line some proxies add
      }
      if (chunk.error) throw new AiError(`${conn.name}: ${chunk.error.message ?? 'error'}`)
      const choice = chunk.choices?.[0]
      const text = choice?.delta?.content
      if (text) req.onText(text)
      if (choice?.finish_reason === 'length') stop = 'length'
      if (choice?.finish_reason === 'content_filter') throw new AiError(`${conn.name} declined this request.`, 'refusal')
    }
  } catch (err) {
    if (err instanceof AiError || isAbort(err)) throw err
    throw networkError(conn.name, conn.local)
  }
  return { stop }
}

// OpenAI's list includes speech, image and embedding models; keep the chat ones.
const NOT_CHAT = /(embed|whisper|tts|dall-e|davinci|babbage|moderation|transcribe|realtime|audio|image|search|computer-use|sora)/i

export async function listOpenAIModels(conn: AiConnection, key: string | null): Promise<ModelOption[]> {
  const res = await send(conn, `${conn.baseUrl}/models`, { headers: headers(conn, key) })
  if (!res.ok) throw await httpError(res, conn.name, conn.model)
  const body = (await res.json()) as { data?: { id: string; name?: string }[] }
  const models = (body.data ?? []).filter((m) => typeof m.id === 'string')
  const chat = conn.provider === 'openai' ? models.filter((m) => !NOT_CHAT.test(m.id)) : models
  return chat.map((m) => ({ id: m.id, label: m.name })).sort((a, b) => a.id.localeCompare(b.id))
}
