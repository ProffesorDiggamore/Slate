import { MessageSquare, Trash2 } from 'lucide-react'
import { useMemo } from 'react'
import { Modal } from '../../../components/ui'
import { relativeTime } from '../../hooks'
import { deleteChat, openChat, useChats } from '../chats'

// Past conversations on this device: tap to reopen, bin to delete.

/** One plain line from a message: Markdown marks and [[ ]] dropped. */
const preview = (text: string) => text.replace(/[*_`#>[\]|]+/g, '').replace(/\s+/g, ' ').trim().slice(0, 80)

export function HistorySheet({ onClose }: { onClose: () => void }) {
  const all = useChats((s) => s.chats)
  const chats = useMemo(() => all.filter((c) => c.messages.length), [all])
  const currentId = useChats((s) => s.currentId)
  return (
    <Modal title="Chats" onClose={onClose} className="ai-history">
      {chats.length === 0 ? (
        <p className="muted ai-history-empty">No chats yet. They’re kept on this device only.</p>
      ) : (
        <ul className="ai-history-list">
          {chats.map((c, i) => {
            const last = c.messages[c.messages.length - 1]
            return (
              <li key={c.id} style={{ '--i': i } as React.CSSProperties} className={c.id === currentId ? 'is-current' : undefined}>
                <button
                  type="button"
                  className="ai-history-item"
                  onClick={() => {
                    openChat(c.id)
                    onClose()
                  }}
                >
                  <MessageSquare size={16} />
                  <span className="ai-history-text">
                    <span className="ai-history-title">{c.title}</span>
                    <span className="ai-history-sub">
                      {relativeTime(c.updated)} · {preview(last?.text ?? '') || '…'}
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  className="ai-history-delete"
                  aria-label={`Delete “${c.title}”`}
                  onClick={() => {
                    if (confirm(`Delete “${c.title}”? This can’t be undone.`)) deleteChat(c.id)
                  }}
                >
                  <Trash2 size={16} />
                </button>
              </li>
            )
          })}
        </ul>
      )}
      <p className="muted small ai-history-foot">Chats stay on this device and aren’t synced to GitHub.</p>
    </Modal>
  )
}
