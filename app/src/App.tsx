import { Fragment, lazy, Suspense, useEffect, useRef, useState } from 'react'
import { CalendarPanel } from './components/CalendarPanel'
import { CommandPalette } from './components/CommandPalette'
import { PassphraseHost } from './components/EncryptedNote'
import { HistoryModal } from './components/HistoryModal'
import { IconPickerHost } from './components/IconPickerHost'
import { FolderPickerHost } from './components/FolderPicker'
import { HomePage } from './components/HomePage'
import { newNoteIn } from './components/FileTree'
import { InstallBanner } from './components/InstallHint'
import { NotePage } from './components/NotePage'
import { Onboarding } from './components/Onboarding'
import { SettingsModal } from './components/SettingsModal'
import { Sidebar } from './components/Sidebar'
import { showsTabBar, TabBar } from './components/TabBar'
import { TopBar } from './components/TopBar'
import { TablePage } from './components/TablePage'
import { TasksPage } from './components/TasksPage'
import { TrashPage } from './components/TrashPage'
import { Logo, MenuHost, Toasts } from './components/ui'
import { useUI } from './components/uiState'
import { useIsMobile, useResolvedTheme } from './lib/hooks'
import { openNote, parseHash, useRoute, type Route } from './lib/router'
import { accentFor, setSettings, useSettings } from './lib/settings'
import { startAutoSync } from './lib/sync/manager'
import { onNoteMoved, useVault } from './lib/vault'

const GraphView = lazy(() => import('./components/GraphView'))
const AiPage = lazy(() => import('./components/AiPage'))

export function App() {
  const ready = useVault((s) => s.ready)
  const empty = useVault((s) => s.paths.length === 0)
  const hasSync = useSettings((s) => !!s.sync)
  const onboarded = useSettings((s) => s.onboarded)
  const sidebarOpen = useSettings((s) => s.sidebarOpen)
  const drawer = useUI((s) => s.drawer)
  const route = useRoute()
  const mobile = useIsMobile()
  const theme = useResolvedTheme()
  const scroller = useRef<HTMLDivElement>(null)
  // Whether the page has scrolled under the top bar (hairline, phone titles).
  const [scrolled, setScrolled] = useState(false)

  const palette = useSettings((s) => s.palette)
  const accent = useSettings((s) => s.accent)
  const fontSize = useSettings((s) => s.fontSize)
  const density = useSettings((s) => s.density)

  useEffect(() => {
    const root = document.documentElement
    root.dataset.theme = theme
    root.dataset.palette = palette
    root.dataset.accent = ''
    root.style.setProperty('--accent', accentFor(accent, theme))
    root.style.setProperty('--editor-font-size', `${fontSize}px`)
    root.style.setProperty('--editor-line-height', density === 'compact' ? '1.45' : density === 'airy' ? '1.75' : '1.6')
    root.style.setProperty('--block-gap', density === 'compact' ? '1px' : density === 'airy' ? '10px' : '4px')
    // Match the window chrome to the page colour.
    const bg = getComputedStyle(root).getPropertyValue('--bg').trim() || (theme === 'dark' ? '#191919' : '#ffffff')
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bg)
  }, [theme, palette, accent, fontSize, density])

  useEffect(() => {
    if (ready) return startAutoSync()
  }, [ready])

  // Keep the open page in view when it gets renamed or moved.
  useEffect(
    () =>
      onNoteMoved((from, to) => {
        const r = parseHash(location.hash)
        if (r.name === 'note' && r.path === from) openNote(to, { replace: true })
      }),
    [],
  )

  useEffect(() => {
    useUI.setState({ drawer: false })
    scroller.current?.scrollTo({ top: 0 })
    setScrolled(false)
  }, [route])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return
      const k = e.key.toLowerCase()
      const ui = useUI.getState()
      if (k === 'k' || k === 'o') {
        e.preventDefault()
        useUI.setState({ palette: ui.palette ? null : 'search' })
      } else if (k === 'p') {
        e.preventDefault()
        useUI.setState({ palette: ui.palette ? null : 'commands' })
      } else if (k === 'n' && !e.shiftKey) {
        e.preventDefault()
        newNoteIn('')
      } else if (k === '\\') {
        e.preventDefault()
        if (window.matchMedia('(max-width: 760px)').matches) useUI.setState({ drawer: !ui.drawer })
        else setSettings((s) => ({ sidebarOpen: !s.sidebarOpen }))
      } else if (k === ',') {
        e.preventDefault()
        useUI.setState({ settings: true })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (!ready) {
    return (
      <div className="splash">
        <Logo size={48} />
      </div>
    )
  }

  if (empty && !hasSync && !onboarded) {
    return (
      <>
        <Onboarding />
        <Toasts />
      </>
    )
  }

  let page: React.ReactNode
  switch (route.name) {
    case 'note':
      page = <NotePage path={route.path} />
      break
    case 'graph':
      page = (
        <Suspense fallback={null}>
          <GraphView />
        </Suspense>
      )
      break
    case 'trash':
      page = <TrashPage />
      break
    case 'tasks':
      page = <TasksPage />
      break
    case 'table':
      page = <TablePage folder={route.folder} />
      break
    case 'ai':
      page = (
        <Suspense fallback={null}>
          <AiPage />
        </Suspense>
      )
      break
    default:
      page = <HomePage />
  }

  // Phones float a glass tab bar over these routes, so they get room for it.
  const tabRoute = mobile && showsTabBar(route.name)
  // The assistant's message box owns the bottom of the screen (toasts move up).
  const aiRoute = route.name === 'ai'

  return (
    <div className={'app' + (mobile ? ' is-mobile' : '') + (tabRoute ? ' has-tabbar' : '') + (aiRoute ? ' is-ai' : '')}>
      {!mobile && sidebarOpen && <Sidebar />}
      {mobile && (
        <div className={'drawer' + (drawer ? ' is-open' : '')} aria-hidden={!drawer}>
          <div className="drawer-backdrop" onClick={() => useUI.setState({ drawer: false })} />
          <Sidebar />
        </div>
      )}
      <main className="main">
        {/* The assistant draws its own header (back, new chat, history). */}
        {route.name !== 'ai' && <TopBar scrolled={scrolled} />}
        <div
          className={'main-scroll' + (route.name === 'graph' ? ' is-fixed' : '')}
          ref={scroller}
          onScroll={(e) => setScrolled(e.currentTarget.scrollTop > 48)}
        >
          {/* Keyed by route so every page change mounts afresh: on phones that
              mount is the page transition (app.css). */}
          <Fragment key={routeKey(route)}>{page}</Fragment>
        </div>
      </main>
      {mobile && <TabBar />}
      <CommandPalette />
      <SettingsModal />
      <CalendarPanel />
      <HistoryModal />
      <PassphraseHost />
      <IconPickerHost />
      <FolderPickerHost />
      <MenuHost />
      <InstallBanner />
      <Toasts />
    </div>
  )
}

const routeKey = (r: Route) => r.name + ':' + ('path' in r ? r.path : 'folder' in r ? r.folder : '')
