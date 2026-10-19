import { Marked, type Token, type Tokens, type TokenizerAndRendererExtension } from 'marked'
import type { JSONContent } from '@tiptap/core'

// Markdown -> TipTap JSON. We walk marked's token stream ourselves instead of
// going through HTML so the result is deterministic and mirrors serialize.ts.

type Mark = { type: string; attrs?: Record<string, unknown> }

export const CALLOUT_RE = /^\[!([\w-]+)\]([+-]?)[ \t]*(.*)$/

function splitAlias(inner: string): { target: string; alias: string | null } {
  const m = /^(.*?)(?:\\?\|(.*))?$/.exec(inner)!
  const target = m[1].replace(/\\$/, '').trim()
  const alias = m[2] !== undefined ? m[2].trim() : null
  return { target, alias: alias || null }
}

const wikiLink: TokenizerAndRendererExtension = {
  name: 'wikilink',
  level: 'inline',
  start(src) {
    const i = src.indexOf('[[')
    if (i < 0) return
    return i > 0 && src[i - 1] === '!' ? i - 1 : i
  },
  tokenizer(src) {
    const m = /^(!?)\[\[([^[\]\n]+?)\]\]/.exec(src)
    if (!m) return
    const { target, alias } = splitAlias(m[2])
    if (!target) return
    return { type: 'wikilink', raw: m[0], embed: m[1] === '!', target, alias }
  },
  renderer: () => '',
}

const highlight: TokenizerAndRendererExtension = {
  name: 'highlight',
  level: 'inline',
  start(src) {
    const i = src.indexOf('==')
    return i < 0 ? undefined : i
  },
  tokenizer(src) {
    const m = /^==(?=[^\s=])([\s\S]*?[^\s\\])==(?!=)/.exec(src)
    if (!m) return
    return { type: 'highlight', raw: m[0], text: m[1], tokens: this.lexer.inlineTokens(m[1]) }
  },
  renderer: () => '',
}

const mathInline: TokenizerAndRendererExtension = {
  name: 'mathInline',
  level: 'inline',
  start(src) {
    const i = src.indexOf('$')
    return i < 0 ? undefined : i
  },
  tokenizer(src) {
    const m = /^\$(?![\s$])([^$\n]*?[^\s\\])\$(?!\d)/.exec(src)
    if (!m) return
    return { type: 'mathInline', raw: m[0] }
  },
  renderer: () => '',
}

const mathBlock: TokenizerAndRendererExtension = {
  name: 'mathBlock',
  level: 'block',
  start(src) {
    const m = /(^|\n)\$\$/.exec(src)
    return m ? m.index + m[1].length : undefined
  },
  tokenizer(src) {
    const m = /^\$\$[\s\S]*?\$\$[ \t]*(?:\n|$)/.exec(src)
    if (!m || m[0].trim() === '$$') return
    return { type: 'mathBlock', raw: m[0], text: m[0].replace(/\n$/, '') }
  },
  renderer: () => '',
}

const marked = new Marked({ gfm: true, breaks: true })
marked.use({ extensions: [mathBlock, wikiLink, highlight, mathInline] })

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" }

function decodeEntities(s: string): string {
  if (!s.includes('&')) return s
  return s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (all, e: string) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)
      return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : all
    }
    return ENTITIES[e.toLowerCase()] ?? all
  })
}

export function markdownToDoc(md: string): JSONContent {
  const tokens = marked.lexer(md.replace(/\r\n?/g, '\n'))
  const content = blocks(tokens, true)
  // Trailing blank paragraphs aren't meaningful in a file.
  while (content.length > 1 && isEmptyParagraph(content[content.length - 1])) content.pop()
  return { type: 'doc', content: content.length ? content : [{ type: 'paragraph' }] }
}

function isEmptyParagraph(n: JSONContent) {
  return n.type === 'paragraph' && (!n.content || n.content.length === 0)
}

function blocks(tokens: Token[], topLevel = false): JSONContent[] {
  const out: JSONContent[] = []
  tokens.forEach((t, i) => {
    switch (t.type) {
      case 'space': {
        if (!topLevel) break
        const n = (t.raw.match(/\n/g) ?? []).length
        // Blocks are joined with one blank line; each extra blank line pair
        // is an empty paragraph the user made on purpose.
        const atStart = i === 0
        const empties = atStart ? Math.floor(n / 2) : Math.max(0, Math.floor((n - 2) / 2))
        for (let k = 0; k < empties; k++) out.push({ type: 'paragraph' })
        break
      }
      case 'paragraph':
        out.push(...paragraph((t as Tokens.Paragraph).tokens))
        break
      case 'text': {
        const tt = t as Tokens.Text
        out.push(...paragraph(tt.tokens ?? [{ type: 'text', raw: tt.raw, text: tt.text }]))
        break
      }
      case 'heading': {
        const h = t as Tokens.Heading
        out.push(withContent({ type: 'heading', attrs: { level: Math.min(6, h.depth) } }, inline(h.tokens)))
        break
      }
      case 'code': {
        const c = t as Tokens.Code
        const lang = (c.lang ?? '').trim().split(/\s+/)[0] || null
        out.push(withContent({ type: 'codeBlock', attrs: { language: lang } }, c.text ? [{ type: 'text', text: c.text }] : []))
        break
      }
      case 'hr':
        out.push({ type: 'horizontalRule' })
        break
      case 'blockquote':
        out.push(blockquote(t as Tokens.Blockquote))
        break
      case 'list':
        for (const l of list(t as Tokens.List)) {
          // Lists only split on marker changes (`*` vs `-`); one list in Cairn.
          const prev = out[out.length - 1]
          if (prev && prev.type === l.type) prev.content!.push(...l.content!)
          else out.push(l)
        }
        break
      case 'table':
        out.push(table(t as Tokens.Table))
        break
      case 'mathBlock':
        out.push(rawBlock((t as Tokens.Generic).text as string))
        break
      case 'html':
      case 'def':
      default:
        if (t.raw && t.raw.trim()) out.push(rawBlock(t.raw.replace(/\n+$/, '')))
    }
  })
  return out
}

function withContent(node: JSONContent, content: JSONContent[]): JSONContent {
  if (content.length) node.content = content
  return node
}

function rawBlock(text: string): JSONContent {
  return withContent({ type: 'rawBlock' }, text ? [{ type: 'text', text }] : [])
}

// Paragraphs may contain images; Cairn's images are blocks, so split around them.
function paragraph(tokens: Token[]): JSONContent[] {
  const out: JSONContent[] = []
  let run: Token[] = []
  const hasImage = tokens.some((t) => t.type === 'image')
  const flush = () => {
    const content = trimHardBreaks(inline(run))
    run = []
    const blank = content.every((n) => n.type === 'text' && !n.text?.trim())
    if (content.length && !(hasImage && blank)) out.push({ type: 'paragraph', content })
  }
  for (const t of tokens) {
    if (t.type === 'image') {
      flush()
      const img = t as Tokens.Image
      out.push({ type: 'image', attrs: { src: img.href, alt: img.text || null, title: img.title || null } })
    } else run.push(t)
  }
  flush()
  if (out.length === 0) out.push({ type: 'paragraph' })
  return out
}

function trimHardBreaks(nodes: JSONContent[]): JSONContent[] {
  let s = 0
  let e = nodes.length
  while (s < e && nodes[s].type === 'hardBreak') s++
  while (e > s && nodes[e - 1].type === 'hardBreak') e--
  return nodes.slice(s, e)
}

function inline(tokens: Token[] | undefined, marks: Mark[] = []): JSONContent[] {
  if (!tokens) return []
  const out: JSONContent[] = []
  let extra: Mark[] = [] // marks toggled by inline HTML like <u>...</u>
  const all = () => [...marks, ...extra]
  const text = (s: string) => {
    if (!s) return
    const node: JSONContent = { type: 'text', text: s }
    const m = all()
    if (m.length) node.marks = m
    const prev = out[out.length - 1]
    if (prev && prev.type === 'text' && sameMarks(prev.marks, node.marks)) prev.text += s
    else out.push(node)
  }
  for (const t of tokens) {
    switch (t.type) {
      case 'text': {
        const tt = t as Tokens.Text
        if (tt.tokens?.length) out.push(...mergeInto(out, inline(tt.tokens, all())))
        else text(decodeEntities(tt.text))
        break
      }
      case 'escape':
        text((t as Tokens.Escape).text)
        break
      case 'strong':
        out.push(...mergeInto(out, inline((t as Tokens.Strong).tokens, [...all(), { type: 'bold' }])))
        break
      case 'em':
        out.push(...mergeInto(out, inline((t as Tokens.Em).tokens, [...all(), { type: 'italic' }])))
        break
      case 'del':
        out.push(...mergeInto(out, inline((t as Tokens.Del).tokens, [...all(), { type: 'strike' }])))
        break
      case 'highlight':
        out.push(...mergeInto(out, inline((t as Tokens.Generic).tokens, [...all(), { type: 'highlight' }])))
        break
      case 'codespan': {
        const node: JSONContent = { type: 'text', text: decodeEntities((t as Tokens.Codespan).text), marks: [...all(), { type: 'code' }] }
        if (node.text) out.push(node)
        break
      }
      case 'link': {
        const l = t as Tokens.Link
        const linkMark: Mark = { type: 'link', attrs: { href: l.href, title: l.title || null } }
        const inner = inline(l.tokens, [...all(), linkMark])
        out.push(...mergeInto(out, inner.length ? inner : [{ type: 'text', text: l.href, marks: [...all(), linkMark] }]))
        break
      }
      case 'image': {
        // Inline images inside headings/table cells: keep the markdown visible.
        out.push({ type: 'rawInline', attrs: { text: t.raw } })
        break
      }
      case 'br':
        out.push({ type: 'hardBreak' })
        break
      case 'checkbox':
        break
      case 'wikilink': {
        const w = t as Tokens.Generic
        const node: JSONContent = { type: 'wikiLink', attrs: { target: w.target, alias: w.alias, embed: w.embed } }
        const m = all()
        if (m.length) node.marks = m
        out.push(node)
        break
      }
      case 'mathInline':
        out.push({ type: 'rawInline', attrs: { text: t.raw } })
        break
      case 'html': {
        const tag = t.raw.trim().toLowerCase()
        const toggle = (type: string, open: boolean) => {
          if (open) extra = [...extra, { type }]
          else extra = extra.filter((m) => m.type !== type)
        }
        if (tag === '<u>' || tag === '</u>') toggle('underline', tag === '<u>')
        else if (tag === '<mark>' || tag === '</mark>') toggle('highlight', tag === '<mark>')
        else if (/^<br\s*\/?>$/.test(tag)) out.push({ type: 'hardBreak' })
        else out.push({ type: 'rawInline', attrs: { text: t.raw } })
        break
      }
      default:
        if (t.raw) text(t.raw)
    }
  }
  return out
}

// Join adjacent text nodes with identical marks across nested calls.
function mergeInto(out: JSONContent[], nodes: JSONContent[]): JSONContent[] {
  if (!nodes.length) return nodes
  const prev = out[out.length - 1]
  const first = nodes[0]
  if (prev && prev.type === 'text' && first.type === 'text' && sameMarks(prev.marks, first.marks)) {
    prev.text += first.text ?? ''
    return nodes.slice(1)
  }
  return nodes
}

function sameMarks(a?: Mark[] | JSONContent['marks'], b?: Mark[] | JSONContent['marks']): boolean {
  const x = a ?? []
  const y = b ?? []
  if (x.length !== y.length) return false
  return x.every((m) => y.some((n) => n.type === m.type && JSON.stringify(n.attrs ?? null) === JSON.stringify(m.attrs ?? null)))
}

function blockquote(t: Tokens.Blockquote): JSONContent {
  const m = CALLOUT_RE.exec(t.text.split('\n')[0])
  if (m) {
    const rest = t.text.split('\n').slice(1).join('\n')
    const inner = blocks(marked.lexer(rest))
    return {
      type: 'callout',
      attrs: { kind: m[1].toLowerCase(), fold: m[2] || '', title: m[3].trim() },
      content: inner.length ? inner : [{ type: 'paragraph' }],
    }
  }
  const inner = blocks(t.tokens)
  return { type: 'blockquote', content: inner.length ? inner : [{ type: 'paragraph' }] }
}

function list(t: Tokens.List): JSONContent[] {
  // Cairn keeps task items and plain items in separate lists, like Notion.
  const out: JSONContent[] = []
  let cur: JSONContent | null = null
  let n = typeof t.start === 'number' ? t.start : 1
  for (const item of t.items) {
    // marked only sees a task when text follows the box; an empty `- [ ]` is still one.
    const empty = !item.task && /^\[([ xX])\][ \t]*$/.exec(item.text)
    const isTask = item.task || !!empty
    const listType = isTask ? 'taskList' : t.ordered ? 'orderedList' : 'bulletList'
    if (!cur || cur.type !== listType) {
      cur = { type: listType, content: [] }
      if (listType === 'orderedList' && n !== 1) cur.attrs = { start: n }
      out.push(cur)
    }
    const body = empty ? [] : blocks(item.tokens.filter((x) => x.type !== 'checkbox'))
    const content = body.length && body[0].type === 'paragraph' ? body : [{ type: 'paragraph' }, ...body]
    const checked = empty ? empty[1] !== ' ' : !!item.checked
    if (isTask) cur.content!.push({ type: 'taskItem', attrs: { checked }, content })
    else cur.content!.push({ type: 'listItem', content })
    n++
  }
  return out
}

function table(t: Tokens.Table): JSONContent {
  const cell = (c: Tokens.TableCell, type: string): JSONContent => {
    const content = inline(c.tokens)
    return {
      type,
      attrs: c.align ? { align: c.align } : {},
      content: [withContent({ type: 'paragraph' }, content)],
    }
  }
  return {
    type: 'table',
    content: [
      { type: 'tableRow', content: t.header.map((c) => cell(c, 'tableHeader')) },
      ...t.rows.map((r) => ({ type: 'tableRow', content: r.map((c) => cell(c, 'tableCell')) })),
    ],
  }
}
