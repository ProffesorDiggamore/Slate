import type { Editor, JSONContent } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'

// "Turn these lines into…": a run of lines (pasted, or selected) becomes a
// bulleted / numbered / to-do list, a toggle, or a heading with bullets.
// Lines that read like titles — a heading, a line that's all bold, or a
// short line ending in ":" — start a new group, so pasted notes like
//
//   **Setup**            ▸ Setup
//   Get 2 buckets   →      • Get 2 buckets
//   Get hoses              • Get hoses
//
// keep their sections. The pure part works on JSON and is unit-tested.

export type Shape = 'toggle' | 'heading' | 'bullet' | 'ordered' | 'task' | 'lines'

export interface Line {
  inline: JSONContent[]
  title: boolean
}

export interface Group {
  title: Line | null
  items: Line[]
}

const textOf = (inline: JSONContent[]) => inline.map((n) => n.text ?? (n.type === 'hardBreak' ? ' ' : '')).join('')

/** Bullets, numbers and checkboxes typed as text ("- ", "• ", "1. ", "[ ] ") come off the front. */
function stripMarker(inline: JSONContent[]): JSONContent[] {
  if (!inline.length || !inline[0].text) return inline
  const m = /^\s*(?:[-*+•▪◦‣]|\d{1,3}[.)]|\[[ xX]?\])\s+/.exec(inline[0].text)
  if (!m) return inline
  const rest = inline[0].text.slice(m[0].length)
  return rest ? [{ ...inline[0], text: rest }, ...inline.slice(1)] : inline.slice(1)
}

export function isTitleLike(inline: JSONContent[], heading = false): boolean {
  const text = textOf(inline).trim()
  if (!text) return false
  if (heading) return true
  const textNodes = inline.filter((n) => n.type === 'text' && n.text?.trim())
  const allBold = textNodes.length > 0 && textNodes.every((n) => n.marks?.some((m) => m.type === 'bold'))
  if (allBold && text.length <= 80) return true
  return text.length <= 60 && /[:：]$/.test(text) && !/^https?:/.test(text)
}

/** Lines → sections. Lines before the first title form an untitled group. */
export function groupLines(lines: Line[]): Group[] {
  const groups: Group[] = []
  let cur: Group = { title: null, items: [] }
  lines.forEach((l, i) => {
    // A title only counts when something follows it that isn't another title.
    const next = lines[i + 1]
    if (l.title && next && !next.title) {
      if (cur.title || cur.items.length) groups.push(cur)
      cur = { title: l, items: [] }
    } else cur.items.push({ ...l, title: false })
  })
  if (cur.title || cur.items.length) groups.push(cur)
  return groups
}

/** A title's words without bold or a trailing colon. */
export function titleText(line: Line): string {
  return textOf(line.inline).trim().replace(/[:：]\s*$/, '')
}

const plainInline = (line: Line): JSONContent[] =>
  line.inline.map((n) => (n.marks ? { ...n, marks: n.marks.filter((m) => m.type !== 'bold') } : n)).filter((n) => n.type !== 'text' || n.text)

/** A title stays readable as one above a list: bold, without a trailing colon's double emphasis. */
const boldInline = (line: Line): JSONContent[] =>
  plainInline(line).map((n) => (n.type === 'text' ? { ...n, marks: [...(n.marks ?? []), { type: 'bold' }] } : n))

const para = (inline: JSONContent[]): JSONContent => (inline.length ? { type: 'paragraph', content: inline } : { type: 'paragraph' })

function list(items: Line[], shape: 'bullet' | 'ordered' | 'task'): JSONContent {
  if (shape === 'task') return { type: 'taskList', content: items.map((l) => ({ type: 'taskItem', attrs: { checked: false }, content: [para(l.inline)] })) }
  return { type: shape === 'ordered' ? 'orderedList' : 'bulletList', content: items.map((l) => ({ type: 'listItem', content: [para(l.inline)] })) }
}

/** The blocks for one shape. Untitled toggles use their first line as the title. */
export function build(groups: Group[], shape: Shape): JSONContent[] {
  const out: JSONContent[] = []
  for (const g0 of groups) {
    let g = g0
    if (shape === 'toggle' && !g.title && g.items.length > 1) g = { title: g.items[0], items: g.items.slice(1) }
    switch (shape) {
      case 'toggle':
        if (!g.title) {
          out.push(...g.items.map((l) => para(l.inline)))
          break
        }
        out.push({
          type: 'callout',
          attrs: { kind: 'toggle', fold: '+', title: titleText(g.title) },
          content: g.items.length ? [list(g.items, 'bullet')] : [{ type: 'paragraph' }],
        })
        break
      case 'heading':
        if (g.title) out.push({ type: 'heading', attrs: { level: 3 }, content: plainInline(g.title) })
        if (g.items.length) out.push(list(g.items, 'bullet'))
        break
      case 'lines':
        if (g.title) out.push(para(g.title.inline))
        out.push(...g.items.map((l) => para(l.inline)))
        break
      default:
        if (g.title) out.push(para(boldInline(g.title)))
        if (g.items.length) out.push(list(g.items, shape))
    }
  }
  return out
}

// ------------------------------------------------------------ editor side

/** The top-level blocks that from..to touches. */
export function blockRange(doc: PMNode, from: number, to: number): { start: number; end: number } {
  const $from = doc.resolve(from)
  const $to = doc.resolve(Math.max(from, to))
  return { start: $from.depth ? $from.before(1) : from, end: $to.depth ? $to.after(1) : to }
}

/** Every line (textblock) in a range, plus toggle titles. */
export function linesIn(doc: PMNode, start: number, end: number): Line[] {
  const out: Line[] = []
  doc.nodesBetween(start, end, (node) => {
    if (node.type.name === 'callout' && node.attrs.title) {
      out.push({ inline: [{ type: 'text', text: String(node.attrs.title) }], title: true })
      return true
    }
    if (node.type.name === 'codeBlock') {
      for (const t of node.textContent.split('\n')) if (t.trim()) out.push({ inline: [{ type: 'text', text: t }], title: false })
      return false
    }
    if (!node.isTextblock) return true
    const inline = stripMarker(((node.toJSON() as JSONContent).content ?? []) as JSONContent[])
    if (textOf(inline).trim()) out.push({ inline, title: isTitleLike(inline, node.type.name === 'heading') })
    return false
  })
  return out
}

/** How many lines are in a range — the pickers only show for two or more. */
export function lineCount(doc: PMNode, from: number, to: number): number {
  const { start, end } = blockRange(doc, from, to)
  return linesIn(doc, start, end).length
}

/** What to suggest first: sections → toggles; plain lines → bullets. */
export function suggestShape(groups: Group[]): Shape {
  return groups.some((g) => g.title && g.items.length) ? 'toggle' : 'bullet'
}

/** Marks the edits made here, so the paste chip knows they're its own. */
export const RESTRUCTURE_META = 'cairnRestructure'

/** Replaces start..end with `shape` built from `groups`; returns the new end. */
export function applyShape(editor: Editor, start: number, end: number, groups: Group[], shape: Shape): number {
  const blocks = build(groups, shape)
  const before = editor.state.doc.content.size
  editor
    .chain()
    .focus()
    .command(({ tr }) => (tr.setMeta(RESTRUCTURE_META, true), true))
    .insertContentAt({ from: start, to: end }, blocks)
    .run()
  return end + (editor.state.doc.content.size - before)
}
