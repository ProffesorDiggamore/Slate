import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildClaudeParams, maxTokensFor, resetModelCaps, supportsEffort, supportsFallbacks } from './anthropic'
import { aiTransform, AiError, chatSystemPrompt, fitHistory, HISTORY_LIMIT } from './client'
import { setAiConfig } from './store'

const req = { system: 'sys', messages: [{ role: 'user' as const, content: 'hi' }], effort: 'medium' as const }

describe('Claude request shape', () => {
  it('uses server-side fallbacks and effort on current Opus', () => {
    const p = buildClaudeParams('claude-opus-5-5', 64_000, req)
    expect(p).toMatchObject({
      model: 'claude-opus-5-5',
      max_tokens: 64_000,
      system: 'sys',
      messages: [{ role: 'user', content: 'hi' }],
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium' },
    })
  })

  it('never sends sampling parameters or a thinking setting', () => {
    for (const model of ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5', 'claude-opus-4-8']) {
      const p = buildClaudeParams(model, 1000, req) as unknown as Record<string, unknown>
      for (const key of ['temperature', 'top_p', 'top_k', 'thinking']) expect(p).not.toHaveProperty(key)
    }
  })

  it('only opts into fallbacks for the families that support them', () => {
    expect(['claude-opus-5', 'claude-opus-5-5', 'claude-fable-5', 'claude-fable-5-1', 'claude-sonnet-5-5'].every(supportsFallbacks)).toBe(true)
    expect(['claude-haiku-5-5', 'claude-sonnet-5', 'claude-opus-4-8', 'claude-sonnet-4-6'].some(supportsFallbacks)).toBe(false)
    expect(buildClaudeParams('claude-haiku-5-5', 1000, req)).not.toHaveProperty('fallbacks')
    expect(buildClaudeParams('claude-haiku-5-5', 1000, req)).not.toHaveProperty('betas')
  })

  it('only sends effort to models that take it', () => {
    expect(['claude-opus-5-5', 'claude-sonnet-5', 'claude-sonnet-5-5', 'claude-haiku-5-5', 'claude-fable-5-1'].every(supportsEffort)).toBe(true)
    expect(supportsEffort('claude-haiku-4-5')).toBe(false)
    expect(buildClaudeParams('claude-haiku-4-5', 1000, { ...req, effort: 'low' })).not.toHaveProperty('output_config')
    expect(buildClaudeParams('claude-haiku-5-5', 1000, { ...req, effort: 'low' })).toMatchObject({ output_config: { effort: 'low' } })
  })
})

describe('fitHistory', () => {
  it('merges same-role turns and drops empty ones', () => {
    const { turns, dropped } = fitHistory([
      { role: 'user', content: 'a' },
      { role: 'user', content: 'b' },
      { role: 'assistant', content: '' },
      { role: 'assistant', content: 'c' },
      { role: 'user', content: 'd' },
    ])
    expect(dropped).toBe(false)
    expect(turns).toEqual([
      { role: 'user', content: 'a\n\nb' },
      { role: 'assistant', content: 'c' },
      { role: 'user', content: 'd' },
    ])
  })

  it('drops the oldest turns to fit, always keeping the question and starting with the user', () => {
    const big = 'x'.repeat(HISTORY_LIMIT / 2)
    const { turns, dropped } = fitHistory([
      { role: 'user', content: big },
      { role: 'assistant', content: big },
      { role: 'user', content: big },
      { role: 'assistant', content: 'short' },
      { role: 'user', content: 'latest' },
    ])
    expect(dropped).toBe(true)
    expect(turns[0].role).toBe('user')
    expect(turns[turns.length - 1].content).toBe('latest')
    expect(turns.reduce((n, t) => n + t.content.length, 0)).toBeLessThanOrEqual(HISTORY_LIMIT)
  })
})

describe('chatSystemPrompt', () => {
  it('adds attached context after the instructions', () => {
    expect(chatSystemPrompt('')).toContain('[[Title]]')
    expect(chatSystemPrompt('<selection>\nhi\n</selection>')).toMatch(/Context from the user’s notes[\s\S]*<selection>/)
  })
})

describe('Claude output cap lookup', () => {
  beforeEach(() => resetModelCaps())

  // A models list that never answers until it's stopped, like a stalled network.
  function stalledSdk() {
    const list = vi.fn((_q: unknown, opts?: { signal?: AbortSignal | null }) => ({
      async *[Symbol.asyncIterator]() {
        await new Promise((_, reject) => opts?.signal?.addEventListener('abort', () => reject(new DOMException('Stopped', 'AbortError'))))
      },
    }))
    return { list, sdk: { models: { list } } as unknown as Parameters<typeof maxTokensFor>[0] }
  }

  it('lets Stop end the wait, and doesn’t keep the stopped lookup', async () => {
    const { list, sdk } = stalledSdk()
    const ctrl = new AbortController()
    const waiting = maxTokensFor(sdk, 'k', 'claude-opus-5-5', ctrl.signal)
    expect(list.mock.calls[0][1]).toMatchObject({ signal: ctrl.signal, maxRetries: 0 })
    ctrl.abort()
    await expect(waiting).rejects.toMatchObject({ name: 'AbortError' })
    // The next request asks again instead of reusing the stopped one.
    void maxTokensFor(sdk, 'k', 'claude-opus-5-5', new AbortController().signal)
    expect(list).toHaveBeenCalledTimes(2)
  })

  it('stops a request that is waiting on another request’s lookup', async () => {
    const { list, sdk } = stalledSdk()
    const first = new AbortController()
    void maxTokensFor(sdk, 'k', 'm', first.signal).catch(() => {})
    const second = new AbortController()
    const waiting = maxTokensFor(sdk, 'k', 'm', second.signal)
    second.abort()
    await expect(waiting).rejects.toMatchObject({ name: 'AbortError' })
    expect(list).toHaveBeenCalledTimes(1)
    first.abort()
  })

  it('uses the model’s cap, or the default when the list fails', async () => {
    const ok = { models: { list: () => [{ id: 'small', max_tokens: 8192 }] } } as unknown as Parameters<typeof maxTokensFor>[0]
    expect(await maxTokensFor(ok, 'k1', 'small')).toBe(8192)
    expect(await maxTokensFor(ok, 'k1', 'unknown')).toBe(64_000)
    const failing = {
      models: {
        list: () => ({
          async *[Symbol.asyncIterator]() {
            throw new Error('timed out')
          },
        }),
      },
    } as unknown as Parameters<typeof maxTokensFor>[0]
    expect(await maxTokensFor(failing, 'k2', 'small', new AbortController().signal)).toBe(64_000)
  })
})

describe('aiTransform', () => {
  beforeEach(() => {
    // Ollama: no key to read, and consent already given.
    setAiConfig({ provider: 'other', preset: 'ollama', models: { 'other:ollama': 'llama3.2' }, consent: { 'other:ollama': true } })
  })
  afterEach(() => vi.unstubAllGlobals())

  const stream = (finish: string) => {
    const enc = new TextEncoder()
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(enc.encode(`data: {"choices":[{"delta":{"content":"Half a rewr"},"finish_reason":"${finish}"}]}\n\n`))
        c.close()
      },
    })
    vi.stubGlobal('fetch', vi.fn(async () => new Response(body)))
  }

  it('won’t replace the selection with an answer cut off at the length limit', async () => {
    stream('length')
    const err = await aiTransform('A long section…', 'translate', { language: 'Spanish' }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(AiError)
    expect((err as AiError).message).toMatch(/cut off/)
  })

  it('keeps a cut-off continuation, which only adds text', async () => {
    stream('length')
    expect(await aiTransform('The start', 'continue')).toBe('Half a rewr')
  })

  it('returns a finished rewrite', async () => {
    stream('stop')
    expect(await aiTransform('Some text', 'improve')).toBe('Half a rewr')
  })
})
