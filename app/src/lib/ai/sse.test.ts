import { describe, expect, it } from 'vitest'
import { SseParser, sseData } from './sse'

function parseAll(chunks: string[]) {
  const p = new SseParser()
  return [...chunks.flatMap((c) => p.feed(c)), ...p.end()]
}

function bodyOf(chunks: (string | Uint8Array)[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder()
  return new ReadableStream({
    start(controller) {
      for (const c of chunks) controller.enqueue(typeof c === 'string' ? enc.encode(c) : c)
      controller.close()
    },
  })
}

async function collect(gen: AsyncGenerator<string>) {
  const out: string[] = []
  for await (const d of gen) out.push(d)
  return out
}

describe('SseParser', () => {
  it('reads simple events', () => {
    expect(parseAll(['data: one\n\ndata: two\n\n'])).toEqual([
      { event: 'message', data: 'one' },
      { event: 'message', data: 'two' },
    ])
  })

  it('survives a chunk boundary anywhere', () => {
    const text = 'event: delta\ndata: {"a":1}\n\ndata: second\r\n\r\n: keep-alive\n\ndata: third\r\rdata: fourth\n\n'
    const whole = parseAll([text])
    for (let size = 1; size <= 7; size++) {
      const chunks: string[] = []
      for (let i = 0; i < text.length; i += size) chunks.push(text.slice(i, i + size))
      expect(parseAll(chunks)).toEqual(whole)
    }
    expect(whole).toEqual([
      { event: 'delta', data: '{"a":1}' },
      { event: 'message', data: 'second' },
      { event: 'message', data: 'third' },
      { event: 'message', data: 'fourth' },
    ])
  })

  it('splits \\r\\n across chunks without inventing a blank line', () => {
    expect(parseAll(['data: a\r', '\ndata: b\r', '\n\r', '\n'])).toEqual([{ event: 'message', data: 'a\nb' }])
  })

  it('joins multi-line data with newlines', () => {
    expect(parseAll(['data: line 1\ndata: line 2\ndata:\ndata:  indented\n\n'])).toEqual([{ event: 'message', data: 'line 1\nline 2\n\n indented' }])
  })

  it('ignores comments, unknown fields and empty events', () => {
    expect(parseAll([': hello\nid: 7\nretry: 100\n\nfoo\n\ndata: x\n\n'])).toEqual([{ event: 'message', data: 'x' }])
  })

  it('hands over a last event that has no trailing blank line', () => {
    expect(parseAll(['data: tail'])).toEqual([{ event: 'message', data: 'tail' }])
  })

  it('drops a leading byte-order mark', () => {
    expect(parseAll(['﻿data: x\n\n'])).toEqual([{ event: 'message', data: 'x' }])
  })
})

describe('sseData', () => {
  it('stops at [DONE]', async () => {
    const body = bodyOf(['data: {"t":"a"}\n\n', 'data: {"t":"b"}\n\ndata: [DONE]\n\ndata: {"t":"after"}\n\n'])
    expect(await collect(sseData(body))).toEqual(['{"t":"a"}', '{"t":"b"}'])
  })

  it('decodes UTF-8 split inside a character', async () => {
    const bytes = new TextEncoder().encode('data: héllo ✓\n\n')
    const cut = bytes.indexOf(0xc3) + 1 // in the middle of "é"
    expect(await collect(sseData(bodyOf([bytes.slice(0, cut), bytes.slice(cut)])))).toEqual(['héllo ✓'])
  })

  it('stops when aborted', async () => {
    const ctrl = new AbortController()
    ctrl.abort()
    await expect(collect(sseData(bodyOf(['data: x\n\n']), ctrl.signal))).rejects.toThrow('Stopped')
  })
})
