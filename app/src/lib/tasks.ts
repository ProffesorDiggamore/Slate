// Every `- [ ]` checkbox across the vault, with due dates.
//
// A due date is written on the task itself, Obsidian Tasks style (`📅 2026-10-20`)
// or as `due 2026-10-20`. A task in a daily note with no date of its own is due
// that day. Tasks are edited in place by line number, after checking the line
// still says what we read, so a stale list can never change the wrong line.

export interface Task {
  path: string
  line: number // index into content.split('\n')
  text: string // without the checkbox and due marker
  done: boolean
  due: string | null // YYYY-MM-DD
  fromNote: boolean // due date came from a daily note's title
}

export type TaskBucket = 'overdue' | 'today' | 'upcoming' | 'someday' | 'done'

const TASK_RE = /^(\s*)(?:[-*+]|\d+[.)])\s+\[([ xX])\](?:\s+(.*))?$/
const DUE_RE = /(?:📅️?|🗓️?|\bdue:?)\s*(\d{4}-\d{2}-\d{2})/iu
const FENCE_RE = /^\s*(```|~~~)/

/** The index of the first line after a frontmatter block (0 when there's none). */
function bodyStart(lines: string[]): number {
  if (lines[0]?.trim() !== '---') return 0
  for (let i = 1; i < lines.length; i++) if (lines[i].trim() === '---') return i + 1
  return 0
}

export function dueOf(text: string): string | null {
  return DUE_RE.exec(text)?.[1] ?? null
}

export function stripDue(text: string): string {
  return text.replace(DUE_RE, '').replace(/\s{2,}/g, ' ').trim()
}

export function parseTasks(path: string, content: string, noteDate: string | null = null): Task[] {
  const lines = content.split('\n')
  const out: Task[] = []
  let fence = false
  for (let i = bodyStart(lines); i < lines.length; i++) {
    if (FENCE_RE.test(lines[i])) {
      fence = !fence
      continue
    }
    if (fence) continue
    const m = TASK_RE.exec(lines[i])
    if (!m) continue
    const raw = m[3] ?? ''
    const own = dueOf(raw)
    const text = stripDue(raw)
    if (!text) continue // an empty checkbox waiting to be filled in
    out.push({ path, line: i, text, done: m[2] !== ' ', due: own ?? noteDate, fromNote: !own && !!noteDate })
  }
  return out
}

/** Checks or unchecks one task. null if that line isn't the task we expect any more. */
export function setTaskDone(content: string, task: Pick<Task, 'line' | 'text'>, done: boolean): string | null {
  const lines = content.split('\n')
  const m = TASK_RE.exec(lines[task.line] ?? '')
  if (!m || stripDue(m[3] ?? '') !== task.text) return null
  lines[task.line] = lines[task.line].replace(/\[([ xX])\]/, done ? '[x]' : '[ ]')
  return lines.join('\n')
}

/** Sets or clears a task's own due date. null if that line isn't the task we expect. */
export function setTaskDue(content: string, task: Pick<Task, 'line' | 'text'>, due: string | null): string | null {
  const lines = content.split('\n')
  const m = TASK_RE.exec(lines[task.line] ?? '')
  if (!m || stripDue(m[3] ?? '') !== task.text) return null
  const head = lines[task.line].slice(0, lines[task.line].length - (m[3] ?? '').length).replace(/\s*$/, ' ')
  lines[task.line] = head + task.text + (due ? ` 📅 ${due}` : '')
  return lines.join('\n')
}

export function bucketOf(t: Task, today: string): TaskBucket {
  if (t.done) return 'done'
  if (!t.due) return 'someday'
  if (t.due < today) return 'overdue'
  if (t.due === today) return 'today'
  return 'upcoming'
}

export function sortTasks(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => (a.due ?? '9999').localeCompare(b.due ?? '9999') || a.path.localeCompare(b.path) || a.line - b.line)
}

/** A task's text as plain words: links, bold, highlights and code marks removed (for lists). */
export function plainText(text: string): string {
  return text
    .replace(/!?\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]*))?\]\]/g, (_, t: string, a?: string) => a || t)
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/(\*\*|__|==|~~|`)(.+?)\1/g, '$2')
}
