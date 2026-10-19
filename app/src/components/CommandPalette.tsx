import { Command } from 'cmdk'
import { CalendarDays, FilePlus, FileText, House, LayoutTemplate, ListTodo, Lock, Moon, Network, PanelLeft, RefreshCw, Search, Settings, Sun, Table2, Trash } from 'lucide-react'
import { useMemo, useState } from 'react'
import { lockNow, useLock } from '../lib/crypto'
import { useNoteIcons } from '../lib/hooks'
import { NoteIcon } from './NoteIcon'
import { dirname, titleOf } from '../lib/paths'
import { navigate, openNote } from '../lib/router'
import { searchNotes } from '../lib/search'
import { setSettings, useSettings } from '../lib/settings'
import { runSync } from '../lib/sync/manager'
import { createNote, openDailyNote, useVault } from '../lib/vault'
import { newNoteIn } from './FileTree'
import { chooseNewFromTemplate } from './templateActions'
import { mod } from './ui'
import { openCalendar, useUI } from './uiState'

interface Cmd {
  id: string
  label: string
  icon: React.ReactNode
  hint?: string
  run: () => void
  keywords?: string
}

export function CommandPalette() {
  const mode = useUI((s) => s.palette)
  const [q, setQ] = useState('')
  const paths = useVault((s) => s.paths)
  const files = useVault((s) => s.files)
  const recent = useSettings((s) => s.recent)
  const theme = useSettings((s) => s.theme)
  const icons = useNoteIcons()
  const locked = useLock((s) => !!s.keyring)

  const close = () => {
    useUI.setState({ palette: null })
    setQ('')
  }

  const commands: Cmd[] = useMemo(
    () => [
      { id: 'new', label: 'New page', icon: <FilePlus size={16} />, hint: `${mod}N`, run: () => newNoteIn(''), keywords: 'create add note' },
      { id: 'calendar', label: 'Open calendar', icon: <CalendarDays size={16} />, run: () => openCalendar(), keywords: 'calendar event google schedule month' },
      { id: 'today', label: 'Open today’s note', icon: <CalendarDays size={16} />, run: () => openNote(openDailyNote()), keywords: 'daily journal date' },
      { id: 'tasks', label: 'Open tasks', icon: <ListTodo size={16} />, run: () => navigate({ name: 'tasks' }), keywords: 'todo to-do checklist due overdue' },
      {
        id: 'template',
        label: 'New page from template…',
        icon: <LayoutTemplate size={16} />,
        run: () => chooseNewFromTemplate({ x: Math.max(12, window.innerWidth / 2 - 130), y: 120 }),
        keywords: 'template daily meeting create',
      },
      { id: 'table', label: 'All pages as a table', icon: <Table2 size={16} />, run: () => navigate({ name: 'table', folder: '' }), keywords: 'database properties columns' },
      ...(locked ? [{ id: 'lock', label: 'Lock encrypted pages', icon: <Lock size={16} />, run: lockNow, keywords: 'encrypt passphrase secure' }] : []),
      { id: 'home', label: 'Go home', icon: <House size={16} />, run: () => navigate({ name: 'home' }) },
      { id: 'graph', label: 'Open graph view', icon: <Network size={16} />, run: () => navigate({ name: 'graph' }), keywords: 'links map' },
      { id: 'sync', label: 'Sync now', icon: <RefreshCw size={16} />, run: () => void runSync(), keywords: 'github upload refresh' },
      {
        id: 'theme',
        label: theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode',
        icon: theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />,
        run: () => setSettings({ theme: theme === 'dark' ? 'light' : 'dark' }),
        keywords: 'theme appearance dark light',
      },
      {
        id: 'sidebar',
        label: 'Toggle sidebar',
        icon: <PanelLeft size={16} />,
        hint: `${mod}\\`,
        run: () => setSettings((s) => ({ sidebarOpen: !s.sidebarOpen })),
      },
      { id: 'trash', label: 'Open trash', icon: <Trash size={16} />, run: () => navigate({ name: 'trash' }), keywords: 'deleted restore' },
      { id: 'settings', label: 'Settings', icon: <Settings size={16} />, hint: `${mod},`, run: () => useUI.setState({ settings: true }), keywords: 'preferences sync github install' },
    ],
    [theme, locked],
  )

  const notes = useMemo(() => paths.map((p) => ({ path: p, content: files[p]?.content ?? '' })), [paths, files])
  const hits = useMemo(() => (q.trim() ? searchNotes(notes, q, 30) : []), [notes, q])
  const recentPaths = recent.filter((p) => paths.includes(p)).slice(0, 6)
  const ql = q.trim().toLowerCase()
  const cmdHits = ql ? commands.filter((c) => (c.label + ' ' + (c.keywords ?? '')).toLowerCase().includes(ql)) : mode === 'commands' ? commands : commands.slice(0, 4)
  const exact = paths.some((p) => titleOf(p).toLowerCase() === ql)

  if (!mode) return null
  const run = (fn: () => void) => {
    close()
    fn()
  }

  return (
    <div className="modal-backdrop palette-backdrop" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <Command className="palette" shouldFilter={false} loop label="Search">
        <div className="palette-input">
          <Search size={18} />
          <Command.Input
            autoFocus
            value={q}
            onValueChange={setQ}
            placeholder={mode === 'commands' ? 'Type a command…' : 'Search pages or type a command…'}
            onKeyDown={(e) => e.key === 'Escape' && close()}
          />
        </div>
        <Command.List className="palette-list">
          <Command.Empty className="menu-empty">No results</Command.Empty>

          {!ql && mode === 'search' && recentPaths.length > 0 && (
            <Command.Group heading="Recent">
              {recentPaths.map((p) => (
                <Command.Item key={p} value={'r:' + p} onSelect={() => run(() => openNote(p))} className="palette-item">
                  <span className="palette-icon">{icons[p] ? <NoteIcon value={icons[p]} size={17} /> : <FileText size={16} strokeWidth={1.75} />}</span>
                  <span className="palette-title">{titleOf(p)}</span>
                  {dirname(p) && <span className="palette-sub">{dirname(p)}</span>}
                </Command.Item>
              ))}
            </Command.Group>
          )}

          {hits.length > 0 && (
            <Command.Group heading="Pages">
              {hits.map((h) => (
                <Command.Item key={h.path} value={'n:' + h.path} onSelect={() => run(() => openNote(h.path))} className="palette-item palette-hit">
                  <span className="palette-icon">{icons[h.path] ? <NoteIcon value={icons[h.path]} size={17} /> : <FileText size={16} strokeWidth={1.75} />}</span>
                  <span className="palette-main">
                    <span className="palette-title">
                      {h.title}
                      {dirname(h.path) && <span className="palette-sub"> — {dirname(h.path)}</span>}
                    </span>
                    {h.snippet && (
                      <span className="palette-snippet">
                        {h.snippet.before}
                        <mark>{h.snippet.match}</mark>
                        {h.snippet.after}
                      </span>
                    )}
                  </span>
                </Command.Item>
              ))}
            </Command.Group>
          )}

          {cmdHits.length > 0 && (
            <Command.Group heading="Commands">
              {cmdHits.map((c) => (
                <Command.Item key={c.id} value={'c:' + c.id} onSelect={() => run(c.run)} className="palette-item">
                  <span className="palette-icon">{c.icon}</span>
                  <span className="palette-title">{c.label}</span>
                  {c.hint && <kbd className="kbd">{c.hint}</kbd>}
                </Command.Item>
              ))}
            </Command.Group>
          )}
          {ql && !exact && (
            <Command.Group heading="Create">
              <Command.Item value="create" onSelect={() => run(() => openNote(createNote({ title: q.trim() })))} className="palette-item">
                <span className="palette-icon">
                  <FilePlus size={16} />
                </span>
                <span className="palette-title">New page “{q.trim()}”</span>
              </Command.Item>
            </Command.Group>
          )}

        </Command.List>
        <div className="palette-foot">
          <span>
            <kbd className="kbd">↑↓</kbd> navigate
          </span>
          <span>
            <kbd className="kbd">↵</kbd> open
          </span>
          <span>
            <kbd className="kbd">esc</kbd> close
          </span>
        </div>
      </Command>
    </div>
  )
}
