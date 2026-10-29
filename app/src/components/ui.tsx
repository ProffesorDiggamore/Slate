import { X } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
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
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)

  useLayoutEffect(() => {
    if (!open || !ref.current) return setPos(null)
    const r = ref.current.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    setPos({
      left: Math.max(8, Math.min(open.x, vw - r.width - 8)),
      top: open.y + r.height > vh - 8 ? Math.max(8, open.y - r.height - 8) : open.y,
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
      style={{ left: pos?.left ?? open.x, top: pos?.top ?? open.y, visibility: pos ? 'visible' : 'hidden' }}
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
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'modal-wide' : ''} ${className}`} role="dialog" aria-modal="true" aria-label={title}>
        {title && (
          <div className="modal-head">
            <h2>{title}</h2>
            <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
              <X size={18} />
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
