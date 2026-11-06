import { FileText, RotateCcw, Trash, X } from 'lucide-react'
import { relativeTime } from '../lib/hooks'
import { dirname, titleOf } from '../lib/paths'
import { openNote } from '../lib/router'
import { purgeTrash, restoreFromTrash, useVault } from '../lib/vault'

export function TrashPage() {
  const trash = useVault((s) => s.trash)
  return (
    <div className="page">
      <div className="page-inner">
        <h1 className="page-heading">
          <Trash size={26} strokeWidth={1.75} /> Trash
        </h1>
        <p className="muted page-lede">
          Deleted pages stay here on this device until you remove them. Older versions are also kept in your GitHub history.
        </p>
        {trash.length === 0 ? (
          <div className="empty-card">
            <Trash size={30} strokeWidth={1.75} />
            <strong>Trash is empty</strong>
          </div>
        ) : (
          <>
            <div className="list">
              {trash.map((t, i) => (
                <div key={t.id} className="list-row is-static stagger-item" style={{ '--i': i } as React.CSSProperties}>
                  <span className="list-icon">
                    <FileText size={16} strokeWidth={1.75} />
                  </span>
                  <span className="list-title">{titleOf(t.path)}</span>
                  {dirname(t.path) && <span className="list-folder">{dirname(t.path)}</span>}
                  <span className="list-meta">{relativeTime(t.deletedAt)}</span>
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => {
                      const p = restoreFromTrash(t.id)
                      if (p) openNote(p)
                    }}
                  >
                    <RotateCcw size={14} /> Restore
                  </button>
                  <button
                    type="button"
                    className="icon-btn icon-btn-sm"
                    aria-label="Delete forever"
                    title="Delete forever"
                    onClick={() => confirm(`Delete “${titleOf(t.path)}” forever from this device?`) && purgeTrash(t.id)}
                  >
                    <X size={15} />
                  </button>
                </div>
              ))}
            </div>
            <button type="button" className="btn btn-ghost text-error" onClick={() => confirm('Empty the trash on this device?') && purgeTrash()}>
              Empty trash
            </button>
          </>
        )}
      </div>
    </div>
  )
}
