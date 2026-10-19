import {
  CalendarDays,
  ChevronsLeft,
  FilePlus,
  FileText,
  FolderPlus,
  House,
  ListTodo,
  Network,
  Plus,
  Search,
  Settings as SettingsIcon,
  Trash,
} from 'lucide-react'
import { useMemo, useRef } from 'react'
import { isoDay } from '../lib/calendar'
import { useIsMobile, useNoteIcons } from '../lib/hooks'
import { NoteIcon } from './NoteIcon'
import { titleOf } from '../lib/paths'
import { navigate, openNote, useRoute } from '../lib/router'
import { setSettings, useSettings } from '../lib/settings'
import { useTasks } from '../lib/taskIndex'
import { bucketOf } from '../lib/tasks'
import { createFolder, useVault } from '../lib/vault'
import { FileTree, newNoteIn, noteMenu } from './FileTree'
import { SyncIndicator } from './SyncIndicator'
import { Kbd, Logo, mod, openMenu } from './ui'
import { openCalendar, useUI } from './uiState'

function NavItem({
  icon,
  label,
  onClick,
  active,
  hint,
  badge,
}: {
  icon: React.ReactNode
  label: string
  onClick: () => void
  active?: boolean
  hint?: string
  badge?: { count: number; alert: boolean }
}) {
  return (
    <button type="button" className={'nav-item' + (active ? ' is-active' : '')} onClick={onClick}>
      <span className="nav-icon">{icon}</span>
      <span className="nav-label">{label}</span>
      {hint && <Kbd>{hint}</Kbd>}
      {badge && badge.count > 0 && <span className={'nav-badge' + (badge.alert ? ' is-alert' : '')}>{badge.count}</span>}
    </button>
  )
}

/** To-dos due today or overdue, for the sidebar badge. */
function useDueCount() {
  const tasks = useTasks()
  const today = isoDay(new Date())
  return useMemo(() => {
    let due = 0
    let late = false
    for (const t of tasks) {
      const b = bucketOf(t, today)
      if (b === 'today' || b === 'overdue') due++
      if (b === 'overdue') late = true
    }
    return { count: due, alert: late }
  }, [tasks, today])
}

export function Sidebar() {
  const route = useRoute()
  const favorites = useSettings((s) => s.favorites)
  const dueCount = useDueCount()
  const width = useSettings((s) => s.sidebarWidth)
  const paths = useVault((s) => s.paths)
  const trashCount = useVault((s) => s.trash.length)
  const icons = useNoteIcons()
  const mobile = useIsMobile()
  const drag = useRef<{ x: number; w: number } | null>(null)
  const closeDrawer = () => mobile && useUI.setState({ drawer: false })
  const go = (fn: () => void) => () => {
    fn()
    closeDrawer()
  }
  const favs = favorites.filter((f) => paths.includes(f))

  return (
    <aside className="sidebar" style={mobile ? undefined : { width }}>
      <div className="sidebar-head">
        <button type="button" className="workspace" onClick={go(() => navigate({ name: 'home' }))}>
          <Logo size={22} />
          <span className="workspace-name">Cairn</span>
        </button>
        <SyncIndicator compact />
        <button
          type="button"
          className="icon-btn sidebar-collapse"
          aria-label="Close sidebar"
          title={`Close sidebar (${mod}\\)`}
          onClick={() => (mobile ? useUI.setState({ drawer: false }) : setSettings({ sidebarOpen: false }))}
        >
          <ChevronsLeft size={18} />
        </button>
      </div>

      <nav className="sidebar-nav">
        <NavItem icon={<Search size={17} />} label="Search" hint={mobile ? undefined : `${mod}K`} onClick={go(() => useUI.setState({ palette: 'search' }))} />
        <NavItem icon={<House size={17} />} label="Home" active={route.name === 'home'} onClick={go(() => navigate({ name: 'home' }))} />
        <NavItem icon={<CalendarDays size={17} />} label="Calendar" onClick={go(() => openCalendar())} />
        <NavItem icon={<ListTodo size={17} />} label="Tasks" active={route.name === 'tasks'} badge={dueCount} onClick={go(() => navigate({ name: 'tasks' }))} />
        <NavItem icon={<Network size={17} />} label="Graph" active={route.name === 'graph'} onClick={go(() => navigate({ name: 'graph' }))} />
        <NavItem icon={<SettingsIcon size={17} />} label="Settings" onClick={go(() => useUI.setState({ settings: true }))} />
      </nav>

      <div className="sidebar-scroll">
        {favs.length > 0 && (
          <section className="sidebar-section">
            <div className="section-head">
              <span>Favorites</span>
            </div>
            {favs.map((p) => (
              <div
                key={p}
                className={'tree-row' + (route.name === 'note' && route.path === p ? ' is-active' : '')}
                style={{ paddingLeft: 8 }}
                onClick={go(() => openNote(p))}
                onContextMenu={(e) => {
                  e.preventDefault()
                  openMenu({ x: e.clientX, y: e.clientY }, noteMenu(p))
                }}
              >
                <span className="tree-icon">{icons[p] ? <NoteIcon className="tree-emoji" value={icons[p]} size={17} /> : <FileText size={16} strokeWidth={1.75} />}</span>
                <span className="tree-name">{titleOf(p)}</span>
              </div>
            ))}
          </section>
        )}

        <section className="sidebar-section">
          <div className="section-head">
            <span>Pages</span>
            <span className="section-actions">
              <button type="button" className="icon-btn icon-btn-sm" title="New folder" aria-label="New folder" onClick={() => createFolder('', 'New folder')}>
                <FolderPlus size={15} />
              </button>
              <button type="button" className="icon-btn icon-btn-sm" title="New page" aria-label="New page" onClick={go(() => newNoteIn(''))}>
                <Plus size={15} />
              </button>
            </span>
          </div>
          <FileTree />
        </section>
      </div>

      <div className="sidebar-foot">
        <NavItem
          icon={<Trash size={17} />}
          label={trashCount ? `Trash (${trashCount})` : 'Trash'}
          active={route.name === 'trash'}
          onClick={go(() => navigate({ name: 'trash' }))}
        />
        <button type="button" className="new-page-btn" onClick={go(() => newNoteIn(''))}>
          <FilePlus size={17} />
          New page
        </button>
      </div>

      {!mobile && (
        <div
          className="sidebar-resize"
          onPointerDown={(e) => {
            drag.current = { x: e.clientX, w: width }
            ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
          }}
          onPointerMove={(e) => {
            if (!drag.current) return
            setSettings({ sidebarWidth: Math.max(200, Math.min(460, drag.current.w + e.clientX - drag.current.x)) })
          }}
          onPointerUp={() => (drag.current = null)}
          onDoubleClick={() => setSettings({ sidebarWidth: 260 })}
        />
      )}
    </aside>
  )
}
