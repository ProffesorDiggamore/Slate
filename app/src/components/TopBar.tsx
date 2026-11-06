import { ChevronLeft, ClipboardCopy, Ellipsis, FileText, GitBranch, Menu, PanelLeft, Star } from 'lucide-react'
import { useIsMobile, useNoteIcons } from '../lib/hooks'
import { NoteIcon } from './NoteIcon'
import { splitFrontmatter } from '../lib/markdown/frontmatter'
import { titleOf } from '../lib/paths'
import { goBack, useRoute } from '../lib/router'
import { setSettings, toggleFavorite, useSettings } from '../lib/settings'
import { toast } from '../lib/toasts'
import { getNote, useVault } from '../lib/vault'
import { noteMenu } from './FileTree'
import { SyncIndicator } from './SyncIndicator'
import { mod, openMenu, type MenuEntry } from './ui'
import { useUI } from './uiState'

// Desktop: crumbs on the left, glass circle buttons on the right. Phones: the
// bar floats over the page (which scrolls under it) with a glass circle at each
// edge and the title centred between them, which (on pages with their own big
// heading) only fades in once that heading scrolls away.
export function TopBar({ scrolled = false }: { scrolled?: boolean }) {
  const route = useRoute()
  const mobile = useIsMobile()
  const sidebarOpen = useSettings((s) => s.sidebarOpen)
  const favorites = useSettings((s) => s.favorites)
  const sync = useSettings((s) => s.sync)
  const icons = useNoteIcons()
  const syncStatus = useVault((s) => s.sync.status)
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
              : route.name === 'ai'
                ? 'Ask Slate'
                : 'Home'
    crumbs = (
      <div className="crumbs">
        <span className="crumb crumb-current">{label}</span>
      </div>
    )
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

  // Phones: Home's own brand row is its header; Tasks is a tab root (menu);
  // everything else came from somewhere (back).
  const bare = mobile && route.name === 'home'
  const reveal = mobile && (route.name === 'note' || route.name === 'tasks' || route.name === 'trash' || route.name === 'table')
  const iconSize = mobile ? 20 : 17
  let lead: React.ReactNode = null
  if (mobile) {
    lead =
      route.name === 'tasks' ? (
        <button type="button" className="circle-btn is-glass" aria-label="Open pages" title="Pages" onClick={() => useUI.setState({ drawer: true })}>
          <Menu size={iconSize} />
        </button>
      ) : (
        <button type="button" className="circle-btn is-glass" aria-label="Back" title="Back" onClick={goBack}>
          <ChevronLeft size={22} strokeWidth={2} />
        </button>
      )
  } else if (!sidebarOpen) {
    lead = (
      <button type="button" className="circle-btn is-glass" aria-label="Open sidebar" title={`Open sidebar (${mod}\\)`} onClick={() => setSettings({ sidebarOpen: true })}>
        <PanelLeft size={iconSize} />
      </button>
    )
  }
  const fav = route.name === 'note' && favorites.includes(route.path)
  // On a phone's note bar the sync button gives way to the title, so a sync
  // problem shows as a dot on the ••• button instead.
  const syncDot = mobile && route.name === 'note' && (syncStatus === 'error' || syncStatus === 'offline') ? syncStatus : undefined

  return (
    <header className={'topbar' + (scrolled ? ' is-scrolled' : '') + (bare ? ' is-bare' : '') + (reveal ? ' title-reveal' : '')}>
      <div className="topbar-lead">{lead}</div>
      {crumbs}
      <div className="topbar-actions">
        {!(mobile && route.name === 'note') && <SyncIndicator compact={mobile} />}
        {route.name === 'note' && (
          <>
            <button
              type="button"
              className={'circle-btn is-glass' + (fav ? ' is-fav' : '')}
              aria-label="Favorite"
              aria-pressed={fav}
              title={fav ? 'Remove from favorites' : 'Add to favorites'}
              onClick={() => toggleFavorite(route.path)}
            >
              <Star size={iconSize} fill={fav ? 'currentColor' : 'none'} />
            </button>
            <button
              type="button"
              className="circle-btn is-glass"
              data-sync={syncDot}
              aria-label={syncDot ? `Page options (sync ${syncDot === 'error' ? 'problem' : 'offline'})` : 'Page options'}
              onClick={(e) => pageMenu(e.currentTarget)}
            >
              <Ellipsis size={iconSize} />
            </button>
          </>
        )}
      </div>
    </header>
  )
}
