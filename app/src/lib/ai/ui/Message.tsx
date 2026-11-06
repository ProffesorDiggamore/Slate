import { Check, Copy, FileInput, FilePlus2, FileText, Info, KeyRound, Lock, RotateCcw, Search, TextQuote, TriangleAlert } from 'lucide-react'
import { memo, useState } from 'react'
import { Orb } from '../../../components/Orb'
import type { ChatMessage } from '../chats'
import { AiMarkdown } from '../render'

const clock = (t: number) => new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

export const UserMessage = memo(function UserMessage({ msg, index }: { msg: ChatMessage; index: number }) {
  const ctx = msg.context
  return (
    <div className="ai-row is-user" style={{ '--i': index } as React.CSSProperties}>
      {ctx && (ctx.pageTitle || ctx.selection || ctx.searched) && (
        <div className="ai-sent-context">
          {ctx.pageTitle && (
            <span className="ai-tag">
              <FileText size={12} /> {ctx.pageTitle}
            </span>
          )}
          {ctx.selection && (
            <span className="ai-tag">
              <TextQuote size={12} /> Selection
            </span>
          )}
          {ctx.searched && (
            <span className="ai-tag" title={ctx.sources?.map((s) => s.title).join(', ')}>
              <Search size={12} /> {ctx.sources?.length ? `${ctx.sources.length} note${ctx.sources.length === 1 ? '' : 's'}` : 'Searched notes'}
            </span>
          )}
        </div>
      )}
      <div className="ai-bubble">{msg.text}</div>
      {ctx?.notes?.map((n) => (
        <div key={n} className="ai-context-note">
          {/encrypted/.test(n) ? <Lock size={12} /> : <Info size={12} />} {n}
        </div>
      ))}
      <time className="ai-time">{clock(msg.time)}</time>
    </div>
  )
})

export interface AnswerActions {
  onCopy: (text: string) => void
  /** Present when a page is attached and can take the answer. */
  onInsert?: (text: string) => void
  onSave: (text: string) => void
  onRetry: () => void
  onSettings: () => void
  onWikilink: (target: string) => void
}

export const AssistantMessage = memo(function AssistantMessage({
  msg,
  index,
  isLast,
  actions,
}: {
  msg: ChatMessage
  index: number
  isLast: boolean
  actions: AnswerActions
}) {
  const [copied, setCopied] = useState(false)
  const streaming = msg.status === 'streaming'
  const waiting = streaming && !msg.text
  const failed = msg.status === 'error'
  const fixable = failed && (msg.error?.kind === 'auth' || msg.error?.kind === 'model')
  return (
    <div className={'ai-row is-assistant' + (streaming ? ' is-streaming' : '')} style={{ '--i': index } as React.CSSProperties}>
      <div className="ai-avatar">
        <Orb size={26} state={waiting ? 'thinking' : 'idle'} />
      </div>
      <div className="ai-answer-col">
        <div className={'ai-answer' + (failed ? ' is-error' : '')} aria-live={isLast ? 'polite' : undefined} aria-busy={streaming}>
          {waiting && (
            <div className="ai-thinking">
              <span>Thinking</span>
              <span className="ai-dots" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
            </div>
          )}
          {msg.text && <AiMarkdown text={msg.text} className="ai-md" onWikilink={actions.onWikilink} />}
          {msg.status === 'stopped' && <div className="ai-flag">Stopped</div>}
          {msg.truncated && <div className="ai-flag">Cut off at the length limit</div>}
          {msg.context?.notes?.map((n) => (
            <div key={n} className="ai-flag">
              {n}
            </div>
          ))}
          {failed && msg.error && (
            <div className="ai-error">
              <TriangleAlert size={15} />
              <div>
                <div>{msg.error.message}</div>
                <div className="ai-error-actions">
                  {fixable && (
                    <button type="button" className="ai-chip-btn" onClick={actions.onSettings}>
                      <KeyRound size={14} /> Open Settings
                    </button>
                  )}
                  {isLast && (
                    <button type="button" className="ai-chip-btn" onClick={actions.onRetry}>
                      <RotateCcw size={14} /> Try again
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
        {!streaming && msg.text && (
          <div className="ai-answer-meta">
            <time className="ai-time">{clock(msg.time)}</time>
            <div className="ai-answer-actions">
              <button
                type="button"
                className="ai-mini-btn"
                onClick={() => {
                  actions.onCopy(msg.text)
                  setCopied(true)
                  setTimeout(() => setCopied(false), 1400)
                }}
              >
                {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Copied' : 'Copy'}
              </button>
              {actions.onInsert && (
                <button type="button" className="ai-mini-btn" onClick={() => actions.onInsert!(msg.text)}>
                  <FileInput size={14} /> Insert into page
                </button>
              )}
              <button type="button" className="ai-mini-btn" onClick={() => actions.onSave(msg.text)}>
                <FilePlus2 size={14} /> Save as page
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
})
