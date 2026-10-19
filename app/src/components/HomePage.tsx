import { CalendarDays, Clock, CloudOff, FilePlus, FileText, ListTodo, Network, Search, Smartphone } from 'lucide-react'
import { useMemo } from 'react'
import { relativeTime, useNoteIcons } from '../lib/hooks'
import { HomeAgenda } from './HomeAgenda'
import { NoteIcon } from './NoteIcon'
import { splitFrontmatter } from '../lib/markdown/frontmatter'
import { dirname, titleOf } from '../lib/paths'
import { navigate, openNote } from '../lib/router'
import { useSettings } from '../lib/settings'
import { useVault } from '../lib/vault'
import { newNoteIn } from './FileTree'
import { isStandalone } from './InstallHint'
import { openCalendar, useUI } from './uiState'

function preview(content: string): string {
  return splitFrontmatter(content)
    .body.replace(/!?\[\[([^\]|]+)\|?([^\]]*)\]\]/g, (_, t, a) => a || t)
    .replace(/^[ \t]*(#{1,6}|>|[-*+]( \[[ xX]\])?|\d+\.)[ \t]+/gm, '')
    .replace(/[*_`~=]+|\[!\w+\][+-]?/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 140)
}

export function HomePage() {
  const paths = useVault((s) => s.paths)
  const files = useVault((s) => s.files)
  const syncStatus = useVault((s) => s.sync.status)
  const recentList = useSettings((s) => s.recent)
  const icons = useNoteIcons()

  const hour = new Date().getHours()
  const greeting = hour < 5 ? 'Good night' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
  const today = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })

  const recent = useMemo(() => {
    const visited = recentList.filter((p) => paths.includes(p))
    const byEdit = [...paths].sort((a, b) => (files[b]?.mtime ?? 0) - (files[a]?.mtime ?? 0))
    return [...new Set([...visited, ...byEdit])].slice(0, 8)
  }, [recentList, paths, files])

  const edited = useMemo(() => [...paths].sort((a, b) => (files[b]?.mtime ?? 0) - (files[a]?.mtime ?? 0)).slice(0, 12), [paths, files])

  return (
    <div className="page home">
      <div className="page-inner">
        <p className="home-date">{today}</p>
        <h1 className="home-greeting">{greeting}</h1>

        <div className="quick-actions">
          <button type="button" className="quick" onClick={() => newNoteIn('')}>
            <FilePlus size={20} />
            <span>New page</span>
          </button>
          <button type="button" className="quick" onClick={() => openCalendar()}>
            <CalendarDays size={20} />
            <span>Calendar</span>
          </button>
          <button type="button" className="quick" onClick={() => useUI.setState({ palette: 'search' })}>
            <Search size={20} />
            <span>Search</span>
          </button>
          <button type="button" className="quick" onClick={() => navigate({ name: 'tasks' })}>
            <ListTodo size={20} />
            <span>Tasks</span>
          </button>
          <button type="button" className="quick" onClick={() => navigate({ name: 'graph' })}>
            <Network size={20} />
            <span>Graph</span>
          </button>
        </div>

        <HomeAgenda />

        {syncStatus === 'off' && (
          <button type="button" className="callout-card" onClick={() => useUI.setState({ settings: true })}>
            <CloudOff size={20} />
            <span>
              <strong>Sync is off.</strong> Connect your GitHub repo to get these notes on your phone and computer — free, about 2 minutes.
            </span>
          </button>
        )}
        {!isStandalone() && (
          <button type="button" className="callout-card" onClick={() => useUI.setState({ settings: true })}>
            <Smartphone size={20} />
            <span>
              <strong>Install Slate as an app.</strong> Add it to your Dock or Home Screen so it opens like a real app and works offline.
            </span>
          </button>
        )}

        {recent.length > 0 && (
          <>
            <h2 className="home-section">
              <Clock size={15} /> Jump back in
            </h2>
            <div className="cards">
              {recent.map((p) => (
                <button type="button" key={p} className="card" onClick={() => openNote(p)}>
                  <span className="card-icon">{icons[p] ? <NoteIcon value={icons[p]} size={26} /> : <FileText size={22} strokeWidth={1.5} />}</span>
                  <span className="card-title">{titleOf(p)}</span>
                  <span className="card-preview">{preview(files[p]?.content ?? '') || 'Empty page'}</span>
                  <span className="card-meta">{relativeTime(files[p]?.mtime ?? Date.now())}</span>
                </button>
              ))}
            </div>
          </>
        )}

        {edited.length > 0 && (
          <>
            <h2 className="home-section">Recently edited</h2>
            <div className="list">
              {edited.map((p) => (
                <button type="button" key={p} className="list-row" onClick={() => openNote(p)}>
                  <span className="list-icon">{icons[p] ? <NoteIcon value={icons[p]} size={17} /> : <FileText size={16} strokeWidth={1.75} />}</span>
                  <span className="list-title">{titleOf(p)}</span>
                  {dirname(p) && <span className="list-folder">{dirname(p)}</span>}
                  <span className="list-meta">{relativeTime(files[p]?.mtime ?? Date.now())}</span>
                </button>
              ))}
            </div>
          </>
        )}

        {paths.length === 0 && (
          <div className="empty-inline">
            <p>No pages yet. Create your first one — it’s saved on this device instantly{syncStatus !== 'off' ? ' and synced to GitHub' : ''}.</p>
            <button type="button" className="btn btn-primary" onClick={() => newNoteIn('')}>
              <FilePlus size={16} /> New page
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
