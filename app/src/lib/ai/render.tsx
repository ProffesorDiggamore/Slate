// Assistant answers are Markdown from a third party, shown inside an app that
// (in the iPhone/iPad build) has a native bridge. So they are never turned into
// an HTML string: marked only tokenises, and the tokens become React elements
// here. Raw HTML in the answer stays visible text, links only work for
// http(s) and mailto, images are shown as links (nothing loads by itself), and
// React escapes everything else. That makes script injection impossible by
// construction rather than by a sanitiser that has to be right.
import { Marked, type Token, type Tokens, type TokenizerAndRendererExtension } from 'marked'
import { Fragment, type ReactNode } from 'react'

const wikiLink: TokenizerAndRendererExtension = {
  name: 'wikilink',
  level: 'inline',
  start: (src) => {
    const i = src.indexOf('[[')
    return i < 0 ? undefined : i
  },
  tokenizer(src) {
    const m = /^\[\[([^[\]\n|]+)(?:\|([^[\]\n]*))?\]\]/.exec(src)
    if (!m || !m[1].trim()) return
    return { type: 'wikilink', raw: m[0], target: m[1].trim(), alias: m[2]?.trim() || null }
  },
  renderer: () => '',
}

const marked = new Marked({ gfm: true, breaks: true, extensions: [wikiLink] })

/** The link target if it is safe to open, else null. */
export function safeHref(href: string | undefined | null): string | null {
  if (!href) return null
  try {
    const url = new URL(href.trim())
    return url.protocol === 'https:' || url.protocol === 'http:' || url.protocol === 'mailto:' ? url.href : null
  } catch {
    return null // relative or malformed
  }
}

// marked leaves entities like &amp; in text; React would show them literally.
const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", apos: "'", nbsp: ' ' }
const decode = (s: string) => s.replace(/&(amp|lt|gt|quot|#39|apos|nbsp);/g, (_, e: string) => ENTITIES[e])

export interface RenderOptions {
  /** Opens a [[Note title]] the answer cites. Without it, wikilinks show as plain text. */
  onWikilink?: (target: string) => void
}

function inline(tokens: Token[] | undefined, o: RenderOptions): ReactNode[] {
  return (tokens ?? []).map((t, i) => <Fragment key={i}>{inlineToken(t, o)}</Fragment>)
}

function inlineToken(t: Token, o: RenderOptions): ReactNode {
  switch (t.type) {
    case 'text':
      return 'tokens' in t && t.tokens?.length ? inline(t.tokens, o) : decode(t.text)
    case 'escape':
      return t.text
    case 'strong':
      return <strong>{inline(t.tokens, o)}</strong>
    case 'em':
      return <em>{inline(t.tokens, o)}</em>
    case 'del':
      return <del>{inline(t.tokens, o)}</del>
    case 'codespan':
      return <code>{decode(t.text)}</code>
    case 'br':
      return <br />
    case 'link': {
      const href = safeHref((t as Tokens.Link).href)
      const label = inline(t.tokens, o)
      return href ? (
        <a href={href} target="_blank" rel="noopener noreferrer">
          {label}
        </a>
      ) : (
        label
      )
    }
    case 'image': {
      // Never load a picture from wherever the model points; offer it as a link.
      const img = t as Tokens.Image
      const href = safeHref(img.href)
      const label = img.text || 'image'
      return href ? (
        <a href={href} target="_blank" rel="noopener noreferrer">
          🖼 {label}
        </a>
      ) : (
        label
      )
    }
    case 'wikilink': {
      const { target, alias } = t as unknown as { target: string; alias: string | null }
      if (!o.onWikilink) return alias || target
      return (
        <button type="button" className="ai-wikilink" onClick={() => o.onWikilink!(target)}>
          {alias || target}
        </button>
      )
    }
    case 'html':
      return t.raw // shown as text, never parsed
    case 'checkbox':
      return null // drawn by the list item
    default:
      return 'raw' in t ? t.raw : null
  }
}

function blocks(tokens: Token[], o: RenderOptions): ReactNode[] {
  return tokens.map((t, i) => <Fragment key={i}>{block(t, o)}</Fragment>)
}

function block(t: Token, o: RenderOptions): ReactNode {
  switch (t.type) {
    case 'space':
    case 'def':
    case 'checkbox': // marked's [ ] marker in a task item, drawn by the list item instead
      return null
    case 'paragraph':
      return <p>{inline(t.tokens, o)}</p>
    case 'text':
      return 'tokens' in t && t.tokens?.length ? inline(t.tokens, o) : decode(t.text)
    case 'heading': {
      // Chat headings stay modest: # → h3 … ### and below → h5.
      const depth = Math.min(5, (t as Tokens.Heading).depth + 2)
      const H = `h${depth}` as 'h3' | 'h4' | 'h5'
      return <H>{inline(t.tokens, o)}</H>
    }
    case 'code': {
      const c = t as Tokens.Code
      return (
        <pre>
          <code>{c.text}</code>
        </pre>
      )
    }
    case 'blockquote':
      return <blockquote>{blocks((t as Tokens.Blockquote).tokens, o)}</blockquote>
    case 'hr':
      return <hr />
    case 'list': {
      const l = t as Tokens.List
      const items = l.items.map((item, i) => (
        <li key={i} className={item.task ? 'is-task' + (item.checked ? ' is-checked' : '') : undefined}>
          {item.task && <span className="ai-task-box" aria-label={item.checked ? 'Done' : 'To do'} />}
          {blocks(item.tokens, o)}
        </li>
      ))
      return l.ordered ? <ol start={typeof l.start === 'number' && l.start !== 1 ? l.start : undefined}>{items}</ol> : <ul>{items}</ul>
    }
    case 'table': {
      const tb = t as Tokens.Table
      const align = (a: Tokens.TableCell['align']) => (a ? { textAlign: a } : undefined)
      return (
        <div className="ai-table">
          <table>
            <thead>
              <tr>
                {tb.header.map((h, i) => (
                  <th key={i} style={align(h.align)}>
                    {inline(h.tokens, o)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tb.rows.map((row, r) => (
                <tr key={r}>
                  {row.map((cell, i) => (
                    <td key={i} style={align(cell.align)}>
                      {inline(cell.tokens, o)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
    }
    case 'html':
      return <p>{t.raw}</p>
    default:
      return 'raw' in t ? <p>{t.raw}</p> : null
  }
}

export function AiMarkdown({ text, className, ...o }: { text: string; className?: string } & RenderOptions) {
  let tokens: Token[]
  try {
    tokens = marked.lexer(text)
  } catch {
    return <div className={className}>{text}</div>
  }
  return <div className={className}>{blocks(tokens, o)}</div>
}
