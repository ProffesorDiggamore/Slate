import { X } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { create } from 'zustand'
import { dismissToast, useToasts } from '../lib/toasts'

// ------------------------------------------------------------- context menu

export type MenuEntry =
  | { label: string; icon?: ReactNode; onSelect: () => void; danger?: boolean; hint?: string; disabled?: boolean }
  | 'sep'

interface MenuState {
  open: null | { x: number; y: number; items: MenuEntry[]; title?: string }
}

const useMenu = create<MenuState>(() => ({ open: null }))

export function openMenu(at: { x: number; y: number } | HTMLElement, items: MenuEntry[], title?: string) {
  let x: number
  let y: number
  if (at instanceof HTMLElement) {
    const r = at.getBoundingClientRect()
    x = r.left
    y = r.bottom + 4
  } else ({ x, y } = at)
  useMenu.setState({ open: { x, y, items, title } })
}

export function closeMenu() {
  useMenu.setState({ open: null })
}

export function MenuHost() {
  const open = useMenu((s) => s.open)
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number; origin: string } | null>(null)

  useLayoutEffect(() => {
    if (!open || !ref.current) return setPos(null)
    // Layout size, not the on-screen box: the menu is mid-way through its
    // spring (scaled down) when this runs.
    const r = { width: ref.current.offsetWidth, height: ref.current.offsetHeight }
    const vw = window.innerWidth
    const vh = window.innerHeight
    const left = Math.max(8, Math.min(open.x, vw - r.width - 8))
    const above = open.y + r.height > vh - 8
    // Spring open from the point it was opened at (above it when flipped up).
    setPos({
      left,
      top: above ? Math.max(8, open.y - r.height - 8) : open.y,
      origin: `${Math.max(0, Math.min(r.width, open.x - left))}px ${above ? 'bottom' : 'top'}`,
    })
  }, [open])

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) closeMenu()
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeMenu()
    document.addEventListener('pointerdown', onDown, true)
    document.addEventListener('keydown', onKey)
    window.addEventListener('resize', closeMenu)
    return () => {
      document.removeEventListener('pointerdown', onDown, true)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', closeMenu)
    }
  }, [open])

  if (!open) return null
  return (
    <div
      ref={ref}
      className="popover context-menu"
      role="menu"
      style={{ left: pos?.left ?? open.x, top: pos?.top ?? open.y, visibility: pos ? 'visible' : 'hidden', '--origin': pos?.origin } as CSSProperties}
    >
      {open.title && <div className="menu-label">{open.title}</div>}
      {open.items.map((it, i) =>
        it === 'sep' ? (
          <div key={i} className="menu-sep" />
        ) : (
          <button
            key={i}
            type="button"
            role="menuitem"
            disabled={it.disabled}
            className={'menu-item' + (it.danger ? ' is-danger' : '')}
            onClick={() => {
              closeMenu()
              it.onSelect()
            }}
          >
            {it.icon && <span className="menu-icon">{it.icon}</span>}
            <span className="menu-text">{it.label}</span>
            {it.hint && <span className="menu-hint">{it.hint}</span>}
          </button>
        ),
      )}
    </div>
  )
}

// -------------------------------------------------------------------- modal

const calm = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
const asSheet = () => window.matchMedia('(max-width: 760px)').matches

/** Centred glass card on desktop; a bottom sheet with a grabber on phones that
 *  can be swiped down to close. Escape, the ×, a tap outside and the swipe all
 *  play a short exit before onClose runs. */
export function Modal({
  title,
  onClose,
  children,
  className = '',
  wide = false,
}: {
  title?: string
  onClose: () => void
  children: ReactNode
  className?: string
  wide?: boolean
}) {
  const sheet = useRef<HTMLDivElement>(null)
  const [closing, setClosing] = useState(false)
  const closed = useRef(false)
  const timer = useRef(0)
  const latest = useRef(onClose)
  const drag = useRef<{ y0: number; dy: number; lastY: number; lastT: number; v: number } | null>(null)

  useLayoutEffect(() => {
    latest.current = onClose
  })

  const requestClose = (ms = 230) => {
    if (closed.current) return
    closed.current = true
    if (calm()) return latest.current()
    setClosing(true)
    timer.current = window.setTimeout(() => latest.current(), ms)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && requestClose()
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      clearTimeout(timer.current)
    }
    // requestClose only reads refs, so one listener for the modal's lifetime.
  }, [])

  // Swipe the sheet down by its grabber or title bar (phones only).
  const onDragStart = (e: ReactPointerEvent<HTMLElement>) => {
    const el = sheet.current
    if (!el || !asSheet() || e.button !== 0 || (e.target as HTMLElement).closest('button, a, input, select, textarea')) return
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { y0: e.clientY, dy: 0, lastY: e.clientY, lastT: performance.now(), v: 0 }
    el.style.animation = 'none'
    el.style.transition = 'none'
  }
  const onDragMove = (e: ReactPointerEvent<HTMLElement>) => {
    const d = drag.current
    if (!d || !sheet.current) return
    const now = performance.now()
    d.v = (e.clientY - d.lastY) / Math.max(1, now - d.lastT)
    d.lastY = e.clientY
    d.lastT = now
    const raw = e.clientY - d.y0
    // Dragging up only gives a little, like a rubber band.
    d.dy = raw > 0 ? raw : raw / 5
    sheet.current.style.translate = `0 ${d.dy}px`
  }
  const onDragEnd = () => {
    const d = drag.current
    const el = sheet.current
    drag.current = null
    if (!d || !el) return
    if (d.dy > 120 || (d.dy > 24 && d.v > 0.45)) {
      el.style.transition = 'translate 0.24s cubic-bezier(0.4, 0, 1, 1)'
      el.style.translate = '0 100%'
      requestClose(240)
    } else {
      el.style.transition = 'translate var(--dur-smooth) var(--spring-smooth)'
      el.style.translate = '0 0'
    }
  }
  const dragProps = { onPointerDown: onDragStart, onPointerMove: onDragMove, onPointerUp: onDragEnd, onPointerCancel: onDragEnd }

  return (
    <div className={'modal-backdrop' + (closing ? ' is-closing' : '')} onMouseDown={(e) => e.target === e.currentTarget && requestClose()}>
      <div ref={sheet} className={`modal glass ${wide ? 'modal-wide' : ''} ${className}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="sheet-grabber" aria-hidden="true" {...dragProps} />
        {title && (
          <div className="modal-head" {...dragProps}>
            <h2>{title}</h2>
            <button type="button" className="circle-btn is-glass" onClick={() => requestClose()} aria-label="Close">
              <X size={17} />
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  )
}

// --------------------------------------------------------------------- logo

// The Slate mark: three stacked slabs, drawn in the text colour so it's dark on
// light themes and light on dark ones, with no tile behind it.
export const SLATE_PATHS = [
  'M34.2 31.9 L53.8 11.0 L61.6 29.8 L46.5 36.0 L35.8 33.7 Z',
  'M24.0 51.7 L29.3 45.4 L65.5 32.7 L72.8 45.4 L60.6 60.3 L25.3 53.0 Z',
  'M15.2 77.5 L32.4 60.0 L73.9 67.9 L84.8 78.0 L34.5 89.0 Z',
]

export function Logo({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true" className="logo">
      {SLATE_PATHS.map((d) => (
        <path key={d} d={d} fill="currentColor" stroke="currentColor" strokeWidth="1" strokeLinejoin="round" />
      ))}
    </svg>
  )
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="kbd">{children}</kbd>
}

export const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)
export const mod = isMac ? '⌘' : 'Ctrl+'
export const shift = isMac ? '⇧' : 'Shift+'

// ------------------------------------------------------------------- toasts

export function Toasts() {
  const toasts = useToasts((s) => s.toasts)
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={'toast' + (t.tone === 'error' ? ' is-error' : '')}>
          <span>{t.message}</span>
          {t.action && (
            <button
              type="button"
              className="toast-action"
              onClick={() => {
                t.action!.run()
                dismissToast(t.id)
              }}
            >
              {t.action.label}
            </button>
          )}
          <button type="button" className="toast-close" onClick={() => dismissToast(t.id)} aria-label="Dismiss">
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  )
}
