// What goes along with a question: the attached page, a selection, and — in
// "Search my notes" mode — excerpts of the best-matching notes found by the
// app's own local search. Encrypted pages are never included (their stored
// text is ciphertext, and the plaintext must not leave the device), and when
// something has to be cut to fit, the caller gets a note to show the user.
import { isEncrypted } from '../crypto'
import { splitFrontmatter } from '../markdown/frontmatter'
import { titleOf } from '../paths'
import { searchNotes } from '../search'

/** Rough ceiling for everything attached to one request, in characters. */
export const CONTEXT_LIMIT = 150_000
const SELECTION_LIMIT = 20_000
const EXCERPT_LIMIT = 4_000
const MAX_EXCERPTS = 5

export interface NoteText {
  path: string
  content: string
}

export interface ContextRequest {
  attachPath?: string | null
  selection?: string | null
  /** When set, search the notes for this question and include excerpts. */
  search?: string | null
}

export interface ContextSource {
  path: string
  title: string
}

export interface BuiltContext {
  /** Ready to append to the system prompt ('' when nothing is attached). */
  text: string
  sources: ContextSource[]
  /** Things the user should know: "Page trimmed to fit", "… is encrypted". */
  notes: string[]
}

// Words that say nothing about which note is meant.
const STOP = new Set(
  (
    'a an and any are as at be been but by can could did do does for from had has have how i if in into is it its just me my of on or ' +
    'our out please should so some tell than that the their them then there these they this those to up us was we were what when where ' +
    'which who why will with would you your about again find show give list make write note notes page pages all also get got know'
  ).split(' '),
)

export function keywords(question: string): string[] {
  const words = question.toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? []
  return [...new Set(words)].filter((w) => w.length >= 3 && !STOP.has(w)).slice(0, 8)
}

/** Ranks notes for a free-form question: notes matching more of its keywords first. */
export function findRelevantNotes(notes: NoteText[], question: string, limit = MAX_EXCERPTS): ContextSource[] {
  const pool = notes.filter((n) => !isEncrypted(n.content))
  const score = new Map<string, number>()
  const matched = new Map<string, number>()
  // A title that only fuzzy-matches the letters (no real hit) is noise here.
  const real = (h: { score: number; snippet: unknown }) => h.score > 25 || !!h.snippet
  for (const h of searchNotes(pool, question, 20)) if (real(h)) score.set(h.path, (score.get(h.path) ?? 0) + h.score * 2)
  for (const w of keywords(question)) {
    for (const h of searchNotes(pool, w, 30)) {
      if (!real(h)) continue
      score.set(h.path, (score.get(h.path) ?? 0) + h.score)
      matched.set(h.path, (matched.get(h.path) ?? 0) + 1)
    }
  }
  return [...score.keys()]
    .sort((a, b) => (matched.get(b) ?? 0) - (matched.get(a) ?? 0) || score.get(b)! - score.get(a)!)
    .slice(0, limit)
    .map((path) => ({ path, title: titleOf(path) }))
}

function excerpt(content: string, question: string): string {
  const body = splitFrontmatter(content).body.trim()
  if (body.length <= EXCERPT_LIMIT) return body
  const lower = body.toLowerCase()
  const at = keywords(question)
    .map((w) => lower.indexOf(w))
    .filter((i) => i >= 0)
  const start = at.length ? Math.max(0, Math.min(...at) - EXCERPT_LIMIT / 4) : 0
  return (start > 0 ? '…' : '') + body.slice(start, start + EXCERPT_LIMIT) + '…'
}

const attr = (s: string) => s.replace(/["<>\n]/g, ' ')

export function buildContext(req: ContextRequest, notes: NoteText[]): BuiltContext {
  const sources: ContextSource[] = []
  const out: string[] = []
  const said: string[] = []
  let used = 0

  const selection = req.selection?.trim()
  if (selection) {
    let sel = selection
    if (sel.length > SELECTION_LIMIT) {
      sel = sel.slice(0, SELECTION_LIMIT) + '\n…'
      said.push('Selection trimmed to fit')
    }
    out.push(`<selection>\n${sel}\n</selection>`)
    used += sel.length
  }

  if (req.search?.trim()) {
    const found = findRelevantNotes(notes, req.search).filter((s) => s.path !== req.attachPath)
    if (!found.length) said.push('No matching notes found')
    else {
      const parts = found.map((s) => {
        const text = excerpt(notes.find((n) => n.path === s.path)!.content, req.search!)
        used += text.length
        sources.push(s)
        return `<note title="${attr(s.title)}">\n${text}\n</note>`
      })
      out.push(`<note_excerpts>\n${parts.join('\n')}\n</note_excerpts>`)
    }
  }

  if (req.attachPath) {
    const note = notes.find((n) => n.path === req.attachPath)
    const title = titleOf(req.attachPath)
    if (!note) said.push(`“${title}” no longer exists`)
    else if (isEncrypted(note.content)) said.push(`“${title}” is encrypted, so it wasn’t sent`)
    else {
      let body = note.content
      const room = Math.max(0, CONTEXT_LIMIT - used)
      if (body.length > room) {
        body = body.slice(0, room) + '\n…'
        said.push('Page trimmed to fit')
      }
      out.unshift(`<attached_page title="${attr(title)}">\n${body}\n</attached_page>`)
      sources.unshift({ path: note.path, title })
    }
  }

  return { text: out.join('\n\n'), sources, notes: said }
}
