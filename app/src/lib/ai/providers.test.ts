import { afterEach, describe, expect, it, vi } from 'vitest'
import { AiError } from './errors'
import { streamGemini } from './gemini'
import { streamOpenAI } from './openai'
import type { AiConnection } from './store'

const openai: AiConnection = {
  slot: 'openai',
  provider: 'openai',
  kind: 'openai',
  name: 'ChatGPT',
  company: 'OpenAI',
  baseUrl: 'https://api.openai.com/v1',
  model: 'gpt-5',
  needsKey: true,
  local: false,
  privacyUrl: null,
}
const gemini: AiConnection = { ...openai, slot: 'gemini', provider: 'gemini', kind: 'gemini', name: 'Gemini', baseUrl: 'https://g.example/v1beta', model: 'gemini-flash-latest' }

function sse(chunks: string[], status = 200) {
  const enc = new TextEncoder()
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      for (const s of chunks) c.enqueue(enc.encode(s))
      c.close()
    },
  })
  return new Response(body, { status })
}

function mockFetch(res: Response) {
  const fn = vi.fn(async (_url: string, _init?: RequestInit) => res)
  vi.stubGlobal('fetch', fn)
  return fn
}

afterEach(() => vi.unstubAllGlobals())

const run = (fn: typeof streamGemini, conn: AiConnection) => {
  let text = ''
  return fn(conn, 'test-key', { system: 'sys', messages: [{ role: 'user', content: 'hi' }], effort: 'medium', onText: (d) => (text += d) }).then((r) => ({ ...r, text }))
}

describe('OpenAI-compatible streaming', () => {
  it('reads deltas across chunk boundaries and stops at [DONE]', async () => {
    const f = mockFetch(sse(['data: {"choices":[{"delta":{"content":"Hel"}}]}\n\nda', 'ta: {"choices":[{"delta":{"content":"lo"}}]}\n\n', 'data: [DONE]\n\n']))
    expect(await run(streamOpenAI, openai)).toEqual({ stop: 'end', text: 'Hello' })
    const [url, init] = f.mock.calls[0]
    expect(url).toBe('https://api.openai.com/v1/chat/completions')
    const body = JSON.parse(String(init!.body))
    expect(body).toEqual({ model: 'gpt-5', stream: true, messages: [{ role: 'system', content: 'sys' }, { role: 'user', content: 'hi' }] })
    expect((init!.headers as Record<string, string>).Authorization).toBe('Bearer test-key')
  })

  it('reports a cut-off answer', async () => {
    mockFetch(sse(['data: {"choices":[{"delta":{"content":"x"},"finish_reason":"length"}]}\n\n']))
    expect((await run(streamOpenAI, openai)).stop).toBe('length')
  })

  it('turns a 401 into an auth error', async () => {
    mockFetch(new Response(JSON.stringify({ error: { message: 'Incorrect API key' } }), { status: 401 }))
    await expect(run(streamOpenAI, openai)).rejects.toMatchObject({ kind: 'auth' })
  })

  it('treats a content filter stop as a refusal', async () => {
    mockFetch(sse(['data: {"choices":[{"delta":{},"finish_reason":"content_filter"}]}\n\n']))
    await expect(run(streamOpenAI, openai)).rejects.toBeInstanceOf(AiError)
  })

  it('names OpenRouter requests', async () => {
    const f = mockFetch(sse(['data: [DONE]\n\n']))
    await run(streamOpenAI, { ...openai, provider: 'openrouter', baseUrl: 'https://openrouter.ai/api/v1' })
    expect((f.mock.calls[0][1]!.headers as Record<string, string>)['X-Title']).toBe('Slate')
  })
})

describe('Gemini streaming', () => {
  it('sends the key in a header and reads text parts', async () => {
    const f = mockFetch(
      sse([
        'data: {"candidates":[{"content":{"parts":[{"text":"Hi "}]}}]}\n\n',
        'data: {"candidates":[{"content":{"parts":[{"text":"thinking","thought":true},{"text":"there"}]},"finishReason":"STOP"}]}\n\n',
      ]),
    )
    expect(await run(streamGemini, gemini)).toEqual({ stop: 'end', text: 'Hi there' })
    const [url, init] = f.mock.calls[0]
    expect(url).toBe('https://g.example/v1beta/models/gemini-flash-latest:streamGenerateContent?alt=sse')
    expect(url).not.toContain('test-key')
    expect((init!.headers as Record<string, string>)['x-goog-api-key']).toBe('test-key')
    expect(JSON.parse(String(init!.body))).toEqual({
      systemInstruction: { parts: [{ text: 'sys' }] },
      contents: [{ role: 'user', parts: [{ text: 'hi' }] }],
    })
  })

  it('treats a safety block as a refusal', async () => {
    mockFetch(sse(['data: {"promptFeedback":{"blockReason":"SAFETY"}}\n\n']))
    await expect(run(streamGemini, gemini)).rejects.toMatchObject({ kind: 'refusal' })
  })

  it('treats Gemini’s 400 for a bad key as a key problem', async () => {
    const body = {
      error: {
        code: 400,
        message: 'API key not valid. Please pass a valid API key.',
        status: 'INVALID_ARGUMENT',
        details: [{ '@type': 'type.googleapis.com/google.rpc.ErrorInfo', reason: 'API_KEY_INVALID', domain: 'googleapis.com' }],
      },
    }
    mockFetch(new Response(JSON.stringify(body), { status: 400 }))
    await expect(run(streamGemini, gemini)).rejects.toMatchObject({ kind: 'auth' })
  })

  it('leaves other 400s as plain errors', async () => {
    mockFetch(new Response(JSON.stringify({ error: { code: 400, message: 'Request contains an invalid argument.', status: 'INVALID_ARGUMENT' } }), { status: 400 }))
    await expect(run(streamGemini, gemini)).rejects.toMatchObject({ kind: 'other' })
  })
})
