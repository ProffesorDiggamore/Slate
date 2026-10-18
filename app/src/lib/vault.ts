import { create } from 'zustand'
import { loadAll, persistFiles, persistFolders, persistMeta, persistTrash } from './db'
import { LinkResolver, rewriteLinks } from './links'
import { ancestors, basename, dirname, isInFolder, joinPath, NOTE_EXT, sanitizeFolder, sanitizeTitle, titleOf, uniqueNotePath } from './paths'
import { renamePathInSettings, setSettings, useSettings } from './settings'
import { baseVars, renderTemplate, STARTER_TEMPLATES, templatePaths } from './templates'
import { EMPTY_META, type NoteFile, type SyncMeta, type TrashItem } from './types'

export type SyncStatus = 'off' | 'idle' | 'syncing' | 'error' | 'offline'

interface VaultState {
  ready: boolean
  files: Record<string, NoteFile>
  paths: string[] // live notes, sorted
  folders: string[] // folders created explicitly (may be empty)
  trash: TrashItem[]
  meta: SyncMeta
  sync: { status: SyncStatus; lastSync: number | null; error: string | null }
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

export const useVault = create<VaultState>(() => ({
  ready: false,
  files: {},
  paths: [],
  folders: [],
  trash: [],
  meta: EMPTY_META,
  sync: { status: 'off', lastSync: null, error: null },
}))

let onChange: () => void = () => {}
const movedListeners = new Set<(from: string, to: string) => void>()
export function onNoteMoved(fn: (from: string, to: string) => void) {
  movedListeners.add(fn)
  return () => {
    movedListeners.delete(fn)
  }
}
export function setChangeListener(fn: () => void) {
  onChange = fn
}

function livePaths(files: Record<string, NoteFile>): string[] {
  return Object.values(files)
    .filter((f) => !f.deleted)
    .map((f) => f.path)
    .sort((a, b) => collator.compare(a.replace(/\.md$/i, ''), b.replace(/\.md$/i, '')))
}

function samePaths(a: string[], b: string[]) {
  return a.length === b.length && a.every((p, i) => p === b[i])
}

// Single entry point for file changes: memory first, then IndexedDB.
export function applyFiles(put: NoteFile[], remove: string[] = [], { local = true } = {}) {
  if (!put.length && !remove.length) return
  const s = useVault.getState()
  const files = { ...s.files }
  for (const f of put) files[f.path] = f
  for (const p of remove) delete files[p]
  const paths = livePaths(files)
  useVault.setState({ files, paths: samePaths(paths, s.paths) ? s.paths : paths })
  persistFiles(put, remove)
  if (local) onChange()
}

export function setMeta(meta: SyncMeta) {
  useVault.setState({ meta })
  persistMeta(meta)
}

export async function initVault() {
  const { files, trash, meta, folders } = await loadAll()
  const map = Object.fromEntries(files.map((f) => [f.path, f]))
  useVault.setState({
    ready: true,
    files: map,
    paths: livePaths(map),
    trash: trash.sort((a, b) => b.deletedAt - a.deletedAt),
    meta,
    folders,
  })
}

const exists = (path: string) => {
  const f = useVault.getState().files[path]
  return !!f && !f.deleted
}

export function getNote(path: string): NoteFile | undefined {
  const f = useVault.getState().files[path]
  return f && !f.deleted ? f : undefined
}

export function liveNotes(): NoteFile[] {
  const { files, paths } = useVault.getState()
  return paths.map((p) => files[p])
}

export function createNote(opts: { folder?: string; title?: string; content?: string } = {}): string {
  const path = uniqueNotePath(opts.folder ?? '', opts.title ?? 'Untitled', exists)
  const now = Date.now()
  const old = useVault.getState().files[path] // a tombstone we can reuse
  applyFiles([
    {
      path,
      content: opts.content ?? '',
      baseSha: old?.baseSha ?? null,
      baseContent: old?.baseContent ?? null,
      dirty: true,
      deleted: false,
      mtime: now,
      ctime: now,
    },
  ])
  return path
}

export function updateContent(path: string, content: string) {
  const f = useVault.getState().files[path]
  if (!f || f.deleted || f.content === content) return
  applyFiles([{ ...f, content, dirty: content !== f.baseContent || f.baseSha === null, mtime: Date.now() }])
}

function removeRecord(f: NoteFile): { put: NoteFile[]; remove: string[] } {
  if (f.baseSha) return { put: [{ ...f, content: '', deleted: true, dirty: true, mtime: Date.now() }], remove: [] }
  return { put: [], remove: [f.path] }
}

// Move/rename a note; optionally rewrite [[links]] that pointed at it.
export function moveNote(path: string, newPath: string, { updateLinks = true } = {}): string {
  const s = useVault.getState()
  const f = s.files[path]
  if (!f || f.deleted || path === newPath) return path
  if (exists(newPath) && newPath.toLowerCase() !== path.toLowerCase()) {
    newPath = uniqueNotePath(dirname(newPath), titleOf(newPath), exists)
  }
  const target = s.files[newPath]
  const moved: NoteFile = {
    ...f,
    path: newPath,
    baseSha: target?.deleted ? target.baseSha : null,
    baseContent: target?.deleted ? target.baseContent : null,
    dirty: true,
    mtime: Date.now(),
  }
  const { put, remove } = removeRecord(f)
  put.push(moved)

  if (updateLinks && titleOf(path) !== titleOf(newPath)) {
    const before = new LinkResolver(s.paths)
    const after = new LinkResolver(s.paths.map((p) => (p === path ? newPath : p)))
    for (const p of s.paths) {
      if (p === path) continue
      const note = s.files[p]
      const next = rewriteLinks(note.content, p, path, newPath, before, after)
      if (next !== note.content) put.push({ ...note, content: next, dirty: true, mtime: Date.now() })
    }
    // Self-links inside the moved note.
    const selfNext = rewriteLinks(moved.content, newPath, path, newPath, before, after)
    if (selfNext !== moved.content) moved.content = selfNext
  }
  applyFiles(put, remove)
  renamePathInSettings(path, newPath)
  movedListeners.forEach((fn) => fn(path, newPath))
  return newPath
}

export function renameNote(path: string, title: string): string {
  const clean = sanitizeTitle(title)
  if (!clean || clean === titleOf(path)) return path
  return moveNote(path, joinPath(dirname(path), clean + NOTE_EXT))
}

export function deleteNote(path: string) {
  const f = getNote(path)
  if (!f) return
  const item: TrashItem = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, path, content: f.content, deletedAt: Date.now() }
  useVault.setState((s) => ({ trash: [item, ...s.trash] }))
  persistTrash([item])
  const r = removeRecord(f)
  applyFiles(r.put, r.remove)
  renamePathInSettings(path, null)
}

export function restoreFromTrash(id: string): string | null {
  const item = useVault.getState().trash.find((t) => t.id === id)
  if (!item) return null
  const path = createNote({ folder: dirname(item.path), title: titleOf(item.path), content: item.content })
  useVault.setState((s) => ({ trash: s.trash.filter((t) => t.id !== id) }))
  persistTrash([], [id])
  return path
}

export function purgeTrash(id?: string) {
  const ids = id ? [id] : useVault.getState().trash.map((t) => t.id)
  useVault.setState((s) => ({ trash: s.trash.filter((t) => !ids.includes(t.id)) }))
  persistTrash([], ids)
}

// ------------------------------------------------------------------ folders

export function allFolders(paths: string[], explicit: string[]): string[] {
  const set = new Set(explicit)
  for (const p of paths) for (const a of ancestors(p)) set.add(a)
  return [...set].sort(collator.compare)
}

export function createFolder(parent: string, name: string): string {
  const clean = sanitizeFolder(name) || 'New folder'
  let path = joinPath(parent, clean)
  const taken = new Set(allFolders(useVault.getState().paths, useVault.getState().folders))
  let n = 2
  while (taken.has(path)) path = joinPath(parent, `${clean} ${n++}`)
  const folders = [...useVault.getState().folders, path]
  useVault.setState({ folders })
  persistFolders(folders)
  setSettings((s) => ({ expanded: [...new Set([...s.expanded, ...ancestors(path + '/x'), path])] }))
  return path
}

export function renameFolder(folder: string, name: string): string {
  const clean = sanitizeTitle(name)
  if (!clean) return folder
  const next = joinPath(dirname(folder), clean)
  if (next === folder) return folder
  return moveFolder(folder, next)
}

export function moveFolder(folder: string, next: string): string {
  if (next === folder || isInFolder(next, folder)) return folder
  const { paths, folders } = useVault.getState()
  for (const p of paths) if (isInFolder(p, folder)) moveNote(p, next + p.slice(folder.length), { updateLinks: false })
  const nf = folders.map((f) => (f === folder || isInFolder(f, folder) ? next + f.slice(folder.length) : f))
  if (!nf.includes(next)) nf.push(next)
  useVault.setState({ folders: nf })
  persistFolders(nf)
  const moved = (e: string) => (e === folder || isInFolder(e, folder) ? next + e.slice(folder.length) : e)
  setSettings((s) => ({
    expanded: s.expanded.map(moved),
    folderIcons: Object.fromEntries(Object.entries(s.folderIcons).map(([k, v]) => [moved(k), v])),
  }))
  return next
}

export function deleteFolder(folder: string) {
  const { paths, folders } = useVault.getState()
  for (const p of paths) if (isInFolder(p, folder)) deleteNote(p)
  const nf = folders.filter((f) => f !== folder && !isInFolder(f, folder))
  useVault.setState({ folders: nf })
  persistFolders(nf)
  setSettings((s) => ({ folderIcons: Object.fromEntries(Object.entries(s.folderIcons).filter(([k]) => k !== folder && !isInFolder(k, folder))) }))
}

export function moveNoteToFolder(path: string, folder: string): string {
  return moveNote(path, joinPath(folder, basename(path)), { updateLinks: false })
}

// --------------------------------------------------------------- daily note

export function todayTitle(d = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function dailyNotePath(d = new Date()): string {
  return joinPath(sanitizeFolder(useSettings.getState().dailyFolder), todayTitle(d) + NOTE_EXT)
}

export function openDailyNote(d = new Date()): string {
  const path = dailyNotePath(d)
  if (exists(path)) return path
  const { dailyFolder, dailyTemplate } = useSettings.getState()
  const title = todayTitle(d)
  const template = templateText(dailyTemplate, { starter: false })
  const content = template === null ? '' : renderTemplate(template, baseVars(d, title), d)
  return createNote({ folder: sanitizeFolder(dailyFolder), title, content })
}

// ---------------------------------------------------------------- templates

/** The path of the template called `name` in the templates folder, if there is one. */
export function findTemplate(name: string): string | null {
  const n = name.trim().toLowerCase()
  if (!n) return null
  return templatePaths(useVault.getState().paths, useSettings.getState().templatesFolder).find((p) => titleOf(p).toLowerCase() === n) ?? null
}

/** A template's text by name: the note in the templates folder, else (if allowed) the built-in starter. */
export function templateText(name: string, { starter: useStarter = true } = {}): string | null {
  const path = findTemplate(name)
  if (path) return useVault.getState().files[path]?.content ?? null
  if (!useStarter) return null
  const starter = Object.entries(STARTER_TEMPLATES).find(([k]) => k.toLowerCase() === name.trim().toLowerCase())
  return starter ? starter[1] : null
}

/** Puts the starter templates in the templates folder (skipping ones that exist). Returns how many were added. */
export function addStarterTemplates(): number {
  const folder = sanitizeFolder(useSettings.getState().templatesFolder) || 'Templates'
  let added = 0
  for (const [name, text] of Object.entries(STARTER_TEMPLATES)) {
    if (exists(joinPath(folder, name + NOTE_EXT))) continue
    createNote({ folder, title: name, content: text })
    added++
  }
  return added
}
