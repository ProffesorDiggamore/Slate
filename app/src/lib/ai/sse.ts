// A small Server-Sent Events reader for the streaming AI APIs (OpenAI-style
// chat completions and Gemini's ?alt=sse). Network chunks split anywhere — in
// the middle of a line, between \r and \n, inside a UTF-8 character — so the
// parser buffers until it has whole lines, then whole events.

export interface SseEvent {
  event: string
  data: string
}

export class SseParser {
  private buf = ''
  private data: string[] = []
  private event = ''
  private started = false

  /** Feeds decoded text; returns the events completed by it. */
  feed(chunk: string): SseEvent[] {
    if (!this.started) {
      this.started = true
      if (chunk.charCodeAt(0) === 0xfeff) chunk = chunk.slice(1)
    }
    this.buf += chunk
    const out: SseEvent[] = []
    let start = 0
    for (let i = 0; i < this.buf.length; i++) {
      const c = this.buf[i]
      if (c !== '\n' && c !== '\r') continue
      // A lone \r at the very end might be the first half of \r\n: wait for more.
      if (c === '\r' && i + 1 === this.buf.length) break
      this.line(this.buf.slice(start, i), out)
      if (c === '\r' && this.buf[i + 1] === '\n') i++
      start = i + 1
    }
    this.buf = this.buf.slice(start)
    return out
  }

  /** The stream ended: finish any last line, and hand over an event left without its blank line. */
  end(): SseEvent[] {
    const out: SseEvent[] = []
    if (this.buf) this.line(this.buf.replace(/\r$/, ''), out)
    this.buf = ''
    this.dispatch(out)
    return out
  }

  private line(line: string, out: SseEvent[]) {
    if (line === '') return this.dispatch(out)
    if (line.startsWith(':')) return // comment / keep-alive
    const colon = line.indexOf(':')
    const field = colon < 0 ? line : line.slice(0, colon)
    let value = colon < 0 ? '' : line.slice(colon + 1)
    if (value.startsWith(' ')) value = value.slice(1)
    if (field === 'data') this.data.push(value)
    else if (field === 'event') this.event = value
    // id and retry don't matter for a one-shot response stream.
  }

  private dispatch(out: SseEvent[]) {
    if (this.data.length) out.push({ event: this.event || 'message', data: this.data.join('\n') })
    this.data = []
    this.event = ''
  }
}

/** Yields each event's data from a streamed response body, stopping at OpenAI's `[DONE]`. */
export async function* sseData(body: ReadableStream<Uint8Array>, signal?: AbortSignal): AsyncGenerator<string> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  const parser = new SseParser()
  try {
    for (;;) {
      if (signal?.aborted) throw new DOMException('Stopped', 'AbortError')
      const { value, done } = await reader.read()
      const events = done ? [...parser.feed(decoder.decode()), ...parser.end()] : parser.feed(decoder.decode(value, { stream: true }))
      for (const e of events) {
        if (e.data.trim() === '[DONE]') return
        yield e.data
      }
      if (done) return
    }
  } finally {
    // Stop the download when the caller stops early (Stop button, [DONE], an error).
    reader.cancel().catch(() => {})
  }
}
