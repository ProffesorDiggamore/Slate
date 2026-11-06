import { FileText, Lock, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Modal } from '../../../components/ui'
import { useLockedPaths } from '../../hooks'
import { titleOf } from '../../paths'
import { searchNotes } from '../../search'
import { useSettings } from '../../settings'
import { useVault } from '../../vault'

// "Choose a page…" from the attach menu: recent pages first, or type to search.
// Encrypted pages are listed but can't be picked — they're never sent.
export function PagePicker({ onPick, onClose }: { onPick: (path: string) => void; onClose: () => void }) {
  const [q, setQ] = useState('')
  const paths = useVault((s) => s.paths)
  const files = useVault((s) => s.files)
  const recent = useSettings((s) => s.recent)
  const locked = useLockedPaths()

  const list = useMemo(() => {
    if (q.trim()) {
      const notes = paths.filter((p) => !locked.has(p)).map((p) => ({ path: p, content: files[p]?.content ?? '' }))
      return searchNotes(notes, q, 30).map((h) => h.path)
    }
    const live = new Set(paths)
    const first = recent.filter((p) => live.has(p))
    return [...first, ...paths.filter((p) => !first.includes(p))].slice(0, 60)
  }, [q, paths, files, recent, locked])

  return (
    <Modal title="Attach a page" onClose={onClose} className="ai-picker">
      <label className="ai-picker-search">
        <Search size={16} />
        <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search pages" autoFocus autoCapitalize="off" spellCheck={false} />
      </label>
      <ul className="ai-picker-list">
        {list.map((p) => {
          const isLocked = locked.has(p)
          return (
            <li key={p}>
              <button
                type="button"
                className="ai-picker-item"
                disabled={isLocked}
                title={isLocked ? 'Encrypted pages are never sent to an AI' : p}
                onClick={() => {
                  onPick(p)
                  onClose()
                }}
              >
                {isLocked ? <Lock size={15} /> : <FileText size={15} />}
                <span className="ai-picker-title">{titleOf(p)}</span>
                {p.includes('/') && <span className="ai-picker-folder">{p.slice(0, p.lastIndexOf('/'))}</span>}
              </button>
            </li>
          )
        })}
        {list.length === 0 && <li className="muted ai-picker-empty">No pages match.</li>}
      </ul>
    </Modal>
  )
}
