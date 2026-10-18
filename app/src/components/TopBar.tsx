import { ClipboardCopy, Ellipsis, FileText, GitBranch, Menu, Star } from 'lucide-react'
import { useIsMobile, useNoteIcons } from '../lib/hooks'
import { NoteIcon } from './NoteIcon'
import { splitFrontmatter } from '../lib/markdown/frontmatter'
import { titleOf } from '../lib/paths'
import { useRoute } from '../lib/router'
import { setSettings, toggleFavorite, useSettings } from '../lib/settings'
import { toast } from '../lib/toasts'
import { getNote, useVault } from '../lib/vault'
import { noteMenu } from './FileTree'
import { SyncIndicator } from './SyncIndicator'
import { mod, openMenu, type MenuEntry } from './ui'
import { useUI } from './uiState'

export function TopBar() {
  const route = useRoute()
  const mobile = useIsMobile()
  const sidebarOpen = useSettings((s) => s.sidebarOpen)
  const favorites = useSettings((s) => s.favorites)
  const sync = useSettings((s) => s.sync)
  const icons = useNoteIcons()
  const words = useVault((s) => {
    if (route.name !== 'note') return 0
    const c = s.files[route.path]?.content ?? ''
    return (splitFrontmatter(c).body.match(/[\p{L}\p{N}’']+/gu) ?? []).length
  })

  let crumbs: React.ReactNode = null
  if (route.name === 'note') {
    const parts = route.path.split('/')
    const folders = parts.slice(0, -1)
    crumbs = (
      <div className="crumbs">
        {folders.map((f, i) => (
          <span key={i} className="crumb crumb-folder">
            {f}
            <span className="crumb-sep">/</span>
          </span>
        ))}
        <span className="crumb crumb-current">
          {icons[route.path] ? <NoteIcon className="crumb-icon" value={icons[route.path]} size={16} /> : <FileText size={15} strokeWidth={1.75} />}
          {titleOf(route.path)}
        </span>
      </div>
    )
  } else {
    const label =
      route.name === 'graph'
        ? 'Graph'
        : route.name === 'trash'
          ? 'Trash'
          : route.name === 'tasks'
            ? 'Tasks'
            : route.name === 'table'
              ? route.folder
                ? `${route.folder} · Table`
                : 'All pages · Table'
              : 'Home'
    crumbs = <div className="crumbs"><span className="crumb crumb-current">{label}</span></div>
  }

  const pageMenu = (el: HTMLElement) => {
    if (route.name !== 'note') return
    const path = route.path
    const extra: MenuEntry[] = [
      {
        label: 'Copy as Markdown',
        icon: <ClipboardCopy size={15} />,
        onSelect: () => {
          void navigator.clipboard?.writeText(getNote(path)?.content ?? '').then(() => toast('Copied markdown'))
        },
      },
    ]
    if (sync) {
      extra.push({
        label: 'View on GitHub',
        icon: <GitBranch size={15} />,
        onSelect: () =>
          window.open(
            `https://github.com/${sync.owner}/${sync.repo}/blob/${encodeURIComponent(sync.branch)}/${((sync.folder ? sync.folder + '/' : '') + path).split('/').map(encodeURIComponent).join('/')}`,
            '_blank',
            'noopener',
          ),
      })
    }
    openMenu(el, [...extra, 'sep', ...noteMenu(path)], `${words.toLocaleString()} word${words === 1 ? '' : 's'}`)
  }

  return (
    <header className="topbar">
      {(mobile || !sidebarOpen) && (
        <button
          type="button"
          className="icon-btn"
          aria-label="Open sidebar"
          title={mobile ? 'Menu' : `Open sidebar (${mod}\\)`}
          onClick={() => (mobile ? useUI.setState({ drawer: true }) : setSettings({ sidebarOpen: true }))}
        >
          <Menu size={19} />
        </button>
      )}
      {crumbs}
      <div className="topbar-actions">
        {!mobile && <SyncIndicator />}
        {mobile && <SyncIndicator compact />}
        {route.name === 'note' && (
          <>
            <button
              type="button"
              className={'icon-btn' + (favorites.includes(route.path) ? ' is-fav' : '')}
              aria-label="Favorite"
              title={favorites.includes(route.path) ? 'Remove from favorites' : 'Add to favorites'}
              onClick={() => toggleFavorite(route.path)}
            >
              <Star size={18} fill={favorites.includes(route.path) ? 'currentColor' : 'none'} />
            </button>
            <button type="button" className="icon-btn" aria-label="Page options" onClick={(e) => pageMenu(e.currentTarget)}>
              <Ellipsis size={19} />
            </button>
          </>
        )}
      </div>
    </header>
  )
}
