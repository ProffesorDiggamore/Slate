import { useMemo } from 'react'
import { dateFromTitle, findTimes, isoDay, titleAround, type ClockTime } from './calendar'
import { isEncrypted } from './crypto'
import { splitFrontmatter } from './markdown/frontmatter'
import { titleOf } from './paths'
import { useSettings } from './settings'
import { parseTasks, setTaskDone, type Task } from './tasks'
import { inTemplates } from './templates'
import { toast } from './toasts'
import type { NoteFile } from './types'
import { updateContent, useVault } from './vault'

// Every task in the vault, and the times written in a day's note. Parsed per
// file and cached by the file record (which is replaced on every edit), so a
// keystroke only re-reads the note it changed.

const cache = new WeakMap<NoteFile, Task[]>()

function tasksOf(f: NoteFile): Task[] {
  let t = cache.get(f)
  if (!t) {
    const day = dateFromTitle(titleOf(f.path))
    t = isEncrypted(f.content) ? [] : parseTasks(f.path, f.content, day ? isoDay(day) : null)
    cache.set(f, t)
  }
  return t
}

export function allTasks(files: Record<string, NoteFile>, paths: string[], templatesFolder: string): Task[] {
  return paths.filter((p) => !inTemplates(p, templatesFolder) && files[p]).flatMap((p) => tasksOf(files[p]))
}

export function useTasks(): Task[] {
  const files = useVault((s) => s.files)
  const paths = useVault((s) => s.paths)
  const folder = useSettings((s) => s.templatesFolder)
  return useMemo(() => allTasks(files, paths, folder), [files, paths, folder])
}

/** Checks or unchecks a task in its note. */
export function toggleTask(task: Task, done: boolean) {
  const f = useVault.getState().files[task.path]
  const next = f && !f.deleted ? setTaskDone(f.content, task, done) : null
  if (next === null) {
    toast('That task was just edited somewhere else — try again.', { tone: 'error' })
    return
  }
  updateContent(task.path, next)
}

export interface DayItem {
  title: string
  start: ClockTime
  end: ClockTime | null
}

/** Times written in a note ("Math 1-3", "2:30pm"), earliest first. */
export function timesIn(content: string, bareRanges: boolean): DayItem[] {
  if (isEncrypted(content)) return []
  const out: DayItem[] = []
  for (const raw of splitFrontmatter(content).body.split('\n')) {
    const line = raw.replace(/^\s*(?:[-*+]\s+(?:\[[ xX]\]\s+)?|\d+[.)]\s+|#{1,6}\s+|>\s*)/, '')
    for (const m of findTimes(line, { bareRanges })) out.push({ title: titleAround(line, m) || 'Event', start: m.start, end: m.end })
  }
  return out.sort((a, b) => a.start.h * 60 + a.start.m - (b.start.h * 60 + b.start.m))
}
