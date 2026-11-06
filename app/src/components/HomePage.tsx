import { ArrowUpRight, CalendarDays, ChevronLeft, ChevronRight, Cloud, CloudAlert, CloudOff, FileText, Folder, Lock, Plus, RefreshCw, Search } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { openAi, openAiSettings, useAiReady } from '../lib/ai/store'
import { isoDay } from '../lib/calendar'
import { isEncrypted } from '../lib/crypto'
import { relativeTime, useNoteIcons } from '../lib/hooks'
import { splitFrontmatter } from '../lib/markdown/frontmatter'
import { dirname, titleOf } from '../lib/paths'
import { navigate, openNote } from '../lib/router'
import { useSettings } from '../lib/settings'
import { runSync } from '../lib/sync/manager'
import { useTasks } from '../lib/taskIndex'
import { bucketOf } from '../lib/tasks'
import { dailyNotePath, openDailyNote, useVault } from '../lib/vault'
import { newNoteIn } from './FileTree'
import { HomeAgenda, HomeTodo } from './HomeAgenda'
import { NoteIcon } from './NoteIcon'
import { Orb } from './Orb'
import { Logo } from './ui'
import { useUI } from './uiState'
import '../styles/home.css'

// Home: a calm bento of today. Greeting, the AI card, today's note and sync on
// the left, to-dos on the right, then recent pages and folders.

/** Staggers the entrance: each card starts a beat after the one before. */
const at = (i: number) => ({ '--i': i }) as CSSProperties

/** A markdown line as plain words: no heading/list/quote markers, links or emphasis. */
function plain(line: string): string {
  return line
    .replace(/!?\[\[([^\]|]+)\|?([^\]]*)\]\]/g, (_, t, a) => a || t)
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^[ \t]*(#{1,6}|>|[-*+]( \[[ xX]\])?|\d+\.)[ \t]+/, '')
    .replace(/[*_`~=]+|\[!\w+\][+-]?|<!--.*?-->/g, '')
    .trim()
}

/** The first few lines of a note's body as plain text, skipping a heading that just repeats its title. */
function bodyLines(content: string, max: number, title = ''): string[] {
  const out: string[] = []
  const skip = title.trim().toLowerCase()
  for (const raw of splitFrontmatter(content).body.split('\n')) {
    const l = plain(raw)
    if (!l || /^(-{3,}|\|[-:| ]+\|?)$/.test(l) || (!out.length && skip && l.toLowerCase() === skip)) continue
    out.push(l)
    if (out.length === max) break
  }
  return out
}

const preview = (content: string, title: string) => bodyLines(content, 8, title).join(' ').slice(0, 160)

/** Re-renders now and then so "2 min ago" and the greeting stay true. */
function useTick(ms: number) {
  const [, tick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), ms)
    return () => clearInterval(t)
  }, [ms])
}

const plural = (n: number, one: string, many = one + 's') => `${n} ${n === 1 ? one : many}`

export function HomePage() {
  useTick(30_000)
  const paths = useVault((s) => s.paths)
  const files = useVault((s) => s.files)
  const explicitFolders = useVault((s) => s.folders)
  const recentList = useSettings((s) => s.recent)
  const folderIcons = useSettings((s) => s.folderIcons)
  useSettings((s) => s.dailyFolder) // the daily note's path depends on it
  const icons = useNoteIcons()
  const tasks = useTasks()
  const aiReady = useAiReady()
  const recentRef = useRef<HTMLDivElement>(null)
  const [allFolders, setAllFolders] = useState(false)

  const now = new Date()
  const today = isoDay(now)
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const hour = now.getHours()
  const greeting = hour < 5 ? 'Good night' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
  const dateLine = now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })

  const dailyPath = dailyNotePath(now)
  const daily = files[dailyPath] && !files[dailyPath].deleted ? files[dailyPath] : null
  const dailyLocked = !!daily && isEncrypted(daily.content)
  const dailyLines = daily && !dailyLocked ? bodyLines(daily.content, 6, titleOf(dailyPath)) : []

  // The softer second line of the title: what today holds, most pressing first.
  const summary = useMemo(() => {
    const open = tasks.filter((t) => !t.done)
    const dueNow = open.filter((t) => ['overdue', 'today'].includes(bucketOf(t, today))).length
    const edited = paths.reduce((n, p) => n + ((files[p]?.mtime ?? 0) >= dayStart ? 1 : 0), 0)
    const parts: string[] = []
    if (dueNow) parts.push(`${dueNow} to do today`)
    else if (open.length) parts.push(plural(open.length, 'task') + ' open')
    if (edited) parts.push(plural(edited, 'page') + ' edited today')
    if (!parts.length) parts.push(paths.length ? 'All caught up' : 'Ready when you are')
    return parts
  }, [tasks, paths, files, today, dayStart])

  // Pages you opened lately first, then the most recently edited. Today's note
  // has its own card, so it isn't repeated here.
  const recent = useMemo(() => {
    const visited = recentList.filter((p) => files[p] && !files[p].deleted)
    const byEdit = [...paths].sort((a, b) => (files[b]?.mtime ?? 0) - (files[a]?.mtime ?? 0)).slice(0, 20)
    return [...new Set([...visited, ...byEdit])].filter((p) => p !== dailyPath).slice(0, 10)
  }, [recentList, paths, files, dailyPath])

  // Top-level folders with how many notes they hold, busiest-lately first. One
  // pass over the paths, so a huge vault stays cheap.
  const folders = useMemo(() => {
    const stats = new Map<string, { count: number; latest: number }>()
    for (const f of explicitFolders) stats.set(f.split('/')[0], stats.get(f.split('/')[0]) ?? { count: 0, latest: 0 })
    for (const p of paths) {
      const slash = p.indexOf('/')
      if (slash < 0) continue
      const top = p.slice(0, slash)
      const s = stats.get(top) ?? { count: 0, latest: 0 }
      s.count++
      s.latest = Math.max(s.latest, files[p]?.mtime ?? 0)
      stats.set(top, s)
    }
    return [...stats].map(([path, s]) => ({ path, ...s })).sort((a, b) => b.latest - a.latest || a.path.localeCompare(b.path))
  }, [explicitFolders, paths, files])
  const FOLDER_CAP = 6
  const shownFolders = allFolders ? folders : folders.slice(0, FOLDER_CAP)

  const pageRecent = (dir: 1 | -1) => {
    const el = recentRef.current
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: 'smooth' })
  }

  return (
    <div className="page home">
      <div className="ambient-glow" aria-hidden="true" />
      <div className="page-inner">
        <header className="home-top home-in" style={at(0)}>
          <div className="home-brand">
            <span className="home-wordmark">
              <Logo size={20} /> Slate
            </span>
            <span className="home-dateline">{dateLine}</span>
          </div>
          <div className="home-actions">
            <button type="button" className="circle-btn is-glass" aria-label="Search" title="Search" onClick={() => useUI.setState({ palette: 'search' })}>
              <Search size={18} />
            </button>
            <button type="button" className="circle-btn is-glass" aria-label="New page" title="New page" onClick={() => newNoteIn('')}>
              <Plus size={19} />
            </button>
          </div>
        </header>

        <h1 className="home-title home-in" style={at(1)}>
          <span>{greeting}</span>
          <span className="home-title-sub">
            {summary.map((p, i) => (
              <span key={p} className={i ? 'is-extra' : undefined}>
                {i ? ' · ' : ''}
                {p}
              </span>
            ))}
          </span>
        </h1>

        <button type="button" className="home-card home-ask home-press home-pop" style={at(2)} onClick={() => (aiReady ? openAi() : openAiSettings())}>
          <Orb size={44} />
          <span className="home-ask-text">
            <span className="home-ask-title">Ask Slate</span>
            <span className="home-ask-sub">{aiReady ? 'Search, summarise or write with AI' : 'Connect ChatGPT, Claude or another AI'}</span>
          </span>
          <span className="home-ask-go" aria-hidden="true">
            <ArrowUpRight size={17} />
          </span>
        </button>

        <div className="home-bento">
          <div className="home-col">
            <button type="button" className="home-card home-today home-press home-pop" style={at(3)} onClick={() => openNote(openDailyNote())}>
              <span className="home-label">
                <CalendarDays size={14} /> Today
              </span>
              {dailyLines.length > 0 ? (
                <span className="home-lines">
                  {dailyLines.map((l, i) => (
                    <span key={i}>{l}</span>
                  ))}
                </span>
              ) : (
                <span className="home-today-empty">
                  {(dailyLocked || !daily) && <span className="home-today-plus">{dailyLocked ? <Lock size={17} /> : <Plus size={18} />}</span>}
                  {dailyLocked ? 'Locked page' : daily ? 'Empty so far' : 'Start today’s note'}
                </span>
              )}
              <span className="home-meta">{daily ? `Edited ${relativeTime(daily.mtime)}` : 'Your daily page'}</span>
            </button>
            <SyncCard style={at(4)} />
          </div>
          <HomeTodo style={at(4)} />
          <HomeAgenda style={at(5)} />
        </div>

        {recent.length > 0 && (
          <section className="home-block home-in" style={at(6)}>
            <div className="home-block-head">
              <h2 className="home-block-title">Recent</h2>
              <div className="home-pager">
                <button type="button" className="circle-btn" aria-label="Scroll recent pages back" onClick={() => pageRecent(-1)}>
                  <ChevronLeft size={17} />
                </button>
                <button type="button" className="circle-btn" aria-label="Scroll recent pages forward" onClick={() => pageRecent(1)}>
                  <ChevronRight size={17} />
                </button>
              </div>
            </div>
            <div className="home-recent" ref={recentRef}>
              {recent.map((p, i) => {
                const f = files[p]
                const locked = isEncrypted(f?.content ?? '')
                const folder = dirname(p)
                return (
                  <button type="button" key={p} className="home-card home-recent-card home-press home-pop" style={at(7 + Math.min(i, 5))} onClick={() => openNote(p)}>
                    <span className="home-recent-icon">{icons[p] ? <NoteIcon value={icons[p]} size={20} /> : <FileText size={16} strokeWidth={1.9} />}</span>
                    <span className="home-recent-title">{titleOf(p)}</span>
                    <span className="home-recent-preview">
                      {locked ? (
                        <>
                          <Lock size={12} /> Locked
                        </>
                      ) : (
                        preview(f?.content ?? '', titleOf(p)) || 'Empty page'
                      )}
                    </span>
                    <span className="home-meta">
                      {folder ? folder.split('/').pop() + ' · ' : ''}
                      {relativeTime(f?.mtime ?? Date.now())}
                    </span>
                  </button>
                )
              })}
            </div>
          </section>
        )}

        {paths.length === 0 && (
          <div className="home-card home-empty home-pop" style={at(6)}>
            <strong>No pages yet</strong>
            <span>Make your first one. It’s saved on this device the moment you type.</span>
            <button type="button" className="btn btn-primary" onClick={() => newNoteIn('')}>
              <Plus size={15} /> New page
            </button>
          </div>
        )}

        {folders.length > 0 && (
          <section className="home-block home-in" style={at(8)}>
            <div className="home-block-head">
              <h2 className="home-block-title">Folders</h2>
              {folders.length > FOLDER_CAP && (
                <button type="button" className="home-link" onClick={() => setAllFolders((v) => !v)}>
                  {allFolders ? 'Show fewer' : `Show all ${folders.length}`}
                </button>
              )}
            </div>
            <div className="home-folders">
              {shownFolders.map((f, i) => (
                <button
                  type="button"
                  key={f.path}
                  className="home-card home-folder home-press home-pop"
                  style={at(9 + Math.min(i, 7))}
                  onClick={() => navigate({ name: 'table', folder: f.path })}
                >
                  <span className="home-folder-icon">{folderIcons[f.path] ? <NoteIcon value={folderIcons[f.path]} size={22} /> : <Folder size={19} />}</span>
                  <span className="home-folder-text">
                    <span className="home-folder-name">{f.path}</span>
                    <span className="home-meta">{f.count ? plural(f.count, 'note') : 'Empty'}</span>
                  </span>
                </button>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}

/** The small sync card: what sync is doing, and the one thing to tap. */
function SyncCard({ style }: { style?: CSSProperties }) {
  const sync = useVault((s) => s.sync)
  const pending = useVault((s) => s.sync.status === 'idle' && Object.values(s.files).some((f) => f.dirty))

  let icon = <Cloud size={16} />
  let title = 'Synced'
  let sub = sync.lastSync ? relativeTime(sync.lastSync) : 'With GitHub'
  let tone = 'is-ok'
  switch (sync.status) {
    case 'off':
      icon = <CloudOff size={16} />
      title = 'Sync is off'
      sub = 'Turn on'
      tone = 'is-off'
      break
    case 'syncing':
      icon = <RefreshCw size={16} className="spin" />
      title = 'Syncing…'
      sub = 'With GitHub'
      tone = 'is-busy'
      break
    case 'offline':
      icon = <CloudOff size={16} />
      title = 'Offline'
      sub = 'Saved on this device'
      tone = 'is-off'
      break
    case 'error':
      icon = <CloudAlert size={16} />
      title = 'Sync problem'
      sub = 'Tap to see why'
      tone = 'is-error'
      break
    default:
      if (pending) {
        title = 'Saving…'
        sub = 'Changes on the way'
        tone = 'is-busy'
      }
  }
  const settings = sync.status === 'off' || sync.status === 'error'
  return (
    <button
      type="button"
      className={'home-card home-sync home-press home-pop ' + tone}
      style={style}
      title={sync.error ?? undefined}
      onClick={() => (settings ? useUI.setState({ settings: true, settingsTab: 'sync' }) : void runSync())}
    >
      <span className="home-sync-icon">{icon}</span>
      <span className="home-sync-text">
        <span className="home-sync-title">{title}</span>
        <span className={'home-sync-sub' + (sync.status === 'off' ? ' is-action' : '')}>{sub}</span>
      </span>
    </button>
  )
}
