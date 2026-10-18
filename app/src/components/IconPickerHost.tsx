import { create } from 'zustand'
import { EmojiPicker } from './EmojiPicker'

// The emoji / icon maker as a floating popover, for things without a page of
// their own to hang it on — folders, for now.

interface Open {
  x: number
  y: number
  current: string | null
  onPick: (icon: string) => void
  onRemove?: () => void
}

const usePicker = create<{ open: Open | null }>(() => ({ open: null }))

export function openIconPicker(at: { x: number; y: number } | HTMLElement, opts: Omit<Open, 'x' | 'y'>) {
  const r = at instanceof HTMLElement ? at.getBoundingClientRect() : null
  usePicker.setState({ open: { x: r ? r.left : (at as { x: number }).x, y: r ? r.bottom + 4 : (at as { y: number }).y, ...opts } })
}

export function IconPickerHost() {
  const open = usePicker((s) => s.open)
  if (!open) return null
  const close = () => usePicker.setState({ open: null })
  const width = Math.min(352, window.innerWidth - 24)
  const left = Math.max(12, Math.min(open.x, window.innerWidth - width - 12))
  // Room for the taller "Make your own" view; scroll inside on short windows.
  const top = Math.max(12, Math.min(open.y, window.innerHeight - 540))
  return (
    <div className="icon-picker-float" style={{ left, top, maxHeight: window.innerHeight - top - 12 }}>
      <EmojiPicker
        current={open.current}
        onPick={(v) => {
          open.onPick(v)
          close()
        }}
        onRemove={
          open.onRemove
            ? () => {
                open.onRemove!()
                close()
              }
            : undefined
        }
        onClose={close}
      />
    </div>
  )
}
