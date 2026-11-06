import { Files, House, ListTodo, Settings } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { openAi } from '../lib/ai/store'
import { attachGlassSheen } from '../lib/glass'
import { useKeyboardOpen } from '../lib/hooks'
import { navigate, useRoute, type Route } from '../lib/router'
import { Orb } from './Orb'
import { useUI } from './uiState'

// The phone's floating Liquid Glass tab bar: Home · Pages · Ask AI · Tasks ·
// Settings. A soft glass blob slides under the current tab on the bouncy spring.

type Tab = 'home' | 'pages' | 'tasks' | 'settings'

/** Routes that show the tab bar. A page and the assistant get the whole screen. */
const TAB_ROUTES: readonly Route['name'][] = ['home', 'tasks', 'graph', 'trash', 'table']
export const showsTabBar = (name: Route['name']) => TAB_ROUTES.includes(name)

function activeTab(route: Route['name'], drawer: boolean, settings: boolean): Tab | null {
  if (settings) return 'settings'
  if (drawer) return 'pages'
  if (route === 'home') return 'home'
  if (route === 'tasks') return 'tasks'
  // Graph, Trash and a folder's table are all reached from the page list.
  if (route === 'graph' || route === 'trash' || route === 'table') return 'pages'
  return null
}

export function TabBar() {
  const route = useRoute()
  const drawer = useUI((s) => s.drawer)
  const settings = useUI((s) => s.settings)
  const keyboard = useKeyboardOpen()
  const visible = showsTabBar(route.name) && !keyboard
  const active = activeTab(route.name, drawer, settings)

  const bar = useRef<HTMLElement>(null)
  const items = useRef<Partial<Record<Tab, HTMLButtonElement | null>>>({})
  const [blob, setBlob] = useState<{ x: number; w: number } | null>(null)
  // The first placement snaps; only later moves slide.
  const [settled, setSettled] = useState(false)

  useLayoutEffect(() => {
    const measure = () => {
      const el = active ? items.current[active] : null
      // With no current tab the blob fades out where it was.
      if (el) setBlob({ x: el.offsetLeft, w: el.offsetWidth })
    }
    measure()
    const ro = new ResizeObserver(measure)
    if (bar.current) ro.observe(bar.current)
    return () => ro.disconnect()
  }, [active])

  useEffect(() => {
    if (!blob || settled) return
    const f = requestAnimationFrame(() => setSettled(true))
    return () => cancelAnimationFrame(f)
  }, [blob, settled])

  useEffect(() => (bar.current ? attachGlassSheen(bar.current) : undefined), [])

  const close = () => useUI.setState({ drawer: false, settings: false })
  const tab = (id: Tab, label: string, icon: React.ReactNode, onClick: () => void) => (
    <button
      type="button"
      ref={(el) => {
        items.current[id] = el
      }}
      className={'tab-item' + (active === id ? ' is-active' : '')}
      aria-label={label}
      aria-current={active === id ? 'page' : undefined}
      onClick={onClick}
    >
      {icon}
      <span className="tab-label" aria-hidden="true">
        {label}
      </span>
    </button>
  )
  const stroke = (id: Tab) => (active === id ? 2.2 : 1.8)

  const blobStyle: CSSProperties | undefined = blob ? { width: blob.w, translate: `${blob.x}px 0`, transition: settled ? undefined : 'none' } : undefined

  return (
    <div className={'tabbar-wrap' + (visible ? '' : ' is-hidden')} aria-hidden={!visible} inert={!visible}>
      <div className="ambient-glow-bottom" />
      <nav ref={bar} className="tabbar glass glass-sheen" aria-label="Main">
        <span className={'tabbar-indicator' + (active && blob ? '' : ' is-none')} style={blobStyle} aria-hidden="true">
          {/* Remounting on each move replays the little squish. */}
          <span key={active ?? 'none'} />
        </span>
        {tab('home', 'Home', <House size={22} strokeWidth={stroke('home')} />, () => {
          close()
          navigate({ name: 'home' })
        })}
        {tab('pages', 'Pages', <Files size={22} strokeWidth={stroke('pages')} />, () =>
          useUI.setState((s) => ({ drawer: !s.drawer, settings: false })),
        )}
        <button
          type="button"
          className="tab-orb"
          aria-label="Ask AI"
          onClick={() => {
            close()
            openAi()
          }}
        >
          <Orb size={44} />
        </button>
        {tab('tasks', 'Tasks', <ListTodo size={22} strokeWidth={stroke('tasks')} />, () => {
          close()
          navigate({ name: 'tasks' })
        })}
        {tab('settings', 'Settings', <Settings size={22} strokeWidth={stroke('settings')} />, () => useUI.setState({ settings: true, drawer: false }))}
      </nav>
    </div>
  )
}
