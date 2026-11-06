import { Fragment, Slice, type Node as PMNode, type Schema } from '@tiptap/pm/model'
import type { Transaction } from '@tiptap/pm/state'
import { neutralizeRemoteImages } from '../lib/ai/safeMarkdown'
import { markdownToDoc } from '../lib/markdown/parse'

// Where the AI's answer goes in the page. Kept apart from ai.ts (no editor, no
// network) so it can be checked against the real schema in tests.
//
// Two rules keep the page's shape. What we send is whole blocks: three selected
// bullets go as a list ("- one\n- two"), not as three bare lines, or the answer
// comes back as paragraphs. And the answer goes back in at the depth it came
// from, so a list comes back as list items rather than as extra paragraphs
// inside the first one.

export interface Placed {
  from: number
  to: number
}

const page = (doc: PMNode) => doc.type.contentMatch

/** The AI's Markdown as page content (plain paragraphs if it doesn't fit the schema). */
export function parseAnswer(schema: Schema, md: string): PMNode {
  try {
    // Remote images become plain links: a note shows its images straight away, so
    // an answer steered by a pasted page could otherwise send note text to any server.
    const node = stripRemoteImages(schema, schema.nodeFromJSON(markdownToDoc(neutralizeRemoteImages(md))))
    node.check()
    return node
  } catch {
    const paras = md
      .split(/\n{2,}/)
      .filter((p) => p.trim())
      .map((p) => schema.nodes.paragraph.create(null, schema.text(p.trim())))
    return schema.nodes.doc.create(null, paras)
  }
}

/** Belt and braces after neutralizeRemoteImages: whatever the Markdown parser
 *  made, no image that loads from another server survives into the page. */
function stripRemoteImages(schema: Schema, doc: PMNode): PMNode {
  const local = (src: unknown) => typeof src === 'string' && (/^(data|blob):/i.test(src) || !/^[a-z][a-z\d+.-]*:|^\/\//i.test(src.trim()))
  const swap = (node: PMNode): PMNode => {
    if (node.type.name === 'image' && !local(node.attrs.src)) {
      const src = String(node.attrs.src ?? '')
      const link = schema.marks.link?.create({ href: src })
      return schema.nodes.paragraph.create(null, src ? schema.text(String(node.attrs.alt || src), link ? [link] : []) : null)
    }
    if (node.isLeaf || node.isText) return node
    const kids: PMNode[] = []
    node.forEach((c) => kids.push(swap(c)))
    return node.copy(Fragment.from(kids))
  }
  return swap(doc)
}

/** The selected content, lifted until it could stand on its own in a page, and the
 *  depth of the node it sits in. A selection inside one line is just its text. */
export function selectedBlocks(doc: PMNode, from: number, to: number): { content: Fragment; depth: number } {
  const $from = doc.resolve(from)
  let depth = $from.sharedDepth(to)
  let content = doc.slice(from, to).content
  // Inside one line: the text goes on its own (sent as a paragraph, whatever the line is).
  if ($from.node(depth).isTextblock) return { content, depth: depth - 1 }
  // List items, to-dos or table rows on their own aren't a page: wrap them in the list (or table) they came from.
  while (depth > 0 && !page(doc).matchFragment(content)?.validEnd) {
    content = Fragment.from($from.node(depth).copy(content))
    depth--
  }
  return { content, depth }
}

/** `content` opened up to `start` / `end` levels on each side (never into text, an
 *  image or a table cell), so its edges join the blocks the cursor is in. */
export function openedSlice(content: Fragment, start: number, end: number): Slice {
  const opens = (n: PMNode | null) => !!n && !n.isLeaf && !n.type.spec.isolating
  let openStart = 0
  for (let n = content.firstChild; openStart < start && opens(n); n = n!.firstChild) openStart++
  let openEnd = 0
  for (let n = content.lastChild; openEnd < end && opens(n); n = n!.lastChild) openEnd++
  return new Slice(content, openStart, openEnd)
}

const LISTS = new Set(['bulletList', 'orderedList', 'taskList'])

/**
 * Writes `answer` (a parsed doc) into `tr`: in place of from–to when `replace`,
 * otherwise carrying on from `to`. Returns where it landed in the new doc.
 */
export function placeAnswer(tr: Transaction, answer: PMNode, from: number, to: number, replace: boolean): Placed {
  const { doc } = tr
  const { schema } = doc.type
  const blocks = answer.content
  const first = blocks.firstChild
  if (!first) return { from, to }
  const $from = doc.resolve(from)
  const $to = doc.resolve(to)
  const inText = $from.parent.isTextblock && $to.parent.isTextblock
  const steps = tr.steps.length

  if (inText && blocks.childCount === 1 && first.type === schema.nodes.paragraph) {
    // One paragraph: just the words, into the line.
    let content = first.content
    // Continuing mid-sentence: keep a space between the old words and the new.
    if (!replace) content = spaced(doc, from, content)
    tr.replaceWith(from, to, content)
  } else if (!inText) {
    tr.replaceRange(from, to, new Slice(blocks, 0, 0))
  } else if (replace) {
    // Back in at the same depth the selection was sent from: a list replaces the
    // items it came from, paragraphs replace paragraphs.
    const { depth } = selectedBlocks(doc, from, to)
    tr.replaceRange(from, to, openedSlice(blocks, $from.depth - depth, $to.depth - depth))
  } else if (first.type === schema.nodes.paragraph && $to.parent.type === schema.nodes.paragraph) {
    // Continuing a paragraph: the first new paragraph carries on this line, the rest follow it.
    const lead = first.copy(spaced(doc, to, first.content))
    tr.replaceRange(to, to, openedSlice(blocks.replaceChild(0, lead), 1, 1))
  } else if (LISTS.has(first.type.name) && $to.depth >= 2 && $to.node($to.depth - 2).type === first.type) {
    // Continuing a list with more of the same: new items go after this one, as its
    // siblings (anything after the list in the answer splits the list there).
    const pos = $to.after($to.depth - 1)
    tr.replace(pos, pos, openedSlice(blocks, 1, blocks.childCount === 1 ? 1 : 0))
  } else {
    // A heading, a list after plain text, a code block…: new blocks after this line.
    const pos = $to.after()
    tr.replace(pos, pos, new Slice(blocks, 0, 0))
  }

  return written(tr, steps, to)
}

/** The stretch of `tr.doc` that steps from `since` on wrote, first change to last
 *  (mapping `to` alone can't tell: a replace that starts at `to` maps it to the start). */
function written(tr: Transaction, since: number, fallback: number): Placed {
  let from = Infinity
  let to = -Infinity
  for (let i = since; i < tr.mapping.maps.length; i++) {
    const later = tr.mapping.slice(i + 1)
    tr.mapping.maps[i].forEach((_oldStart, _oldEnd, newStart, newEnd) => {
      from = Math.min(from, later.map(newStart, -1))
      to = Math.max(to, later.map(newEnd, 1))
    })
  }
  if (from > to) {
    const at = tr.mapping.map(fallback)
    return { from: at, to: at }
  }
  return { from, to }
}

/** `content` with a space in front when the text before `pos` doesn't end in one. */
function spaced(doc: PMNode, pos: number, content: Fragment): Fragment {
  const $pos = doc.resolve(pos)
  const before = pos > $pos.start() ? doc.textBetween(pos - 1, pos) : ''
  if (!before || /\s/.test(before)) return content
  return Fragment.from(doc.type.schema.text(' ')).append(content)
}
