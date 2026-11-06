import { ArrowUp, Paperclip, Square } from 'lucide-react'
import { useLayoutEffect, useRef, type ReactNode, type RefObject } from 'react'
import { useIsTouch } from '../../hooks'

// The glass input bar: attach, an auto-growing message box, and send — which
// turns into Stop while an answer streams. Enter sends on a keyboard; on a
// phone Enter is a newline (there's a send button right there).
export function Composer({
  value,
  onChange,
  onSend,
  onStop,
  onAttach,
  streaming,
  inputRef,
  chips,
}: {
  value: string
  onChange: (v: string) => void
  onSend: () => void
  onStop: () => void
  onAttach: (el: HTMLElement) => void
  streaming: boolean
  inputRef: RefObject<HTMLTextAreaElement | null>
  chips?: ReactNode
}) {
  const touch = useIsTouch()
  const canSend = !!value.trim()
  const form = useRef<HTMLFormElement>(null)

  // The glass bar gives a little squish as the message leaves it: a quick dip,
  // then one springy bounce back on the app's shared spring (no extra wobble).
  const submit = () => {
    if (streaming || !canSend) return
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
      // Without linear() support the variable already holds a cubic-bezier.
      const spring = getComputedStyle(document.documentElement).getPropertyValue('--spring-bouncy').trim() || 'ease-out'
      try {
        form.current?.animate(
          [
            { transform: 'none', easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
            { transform: 'scale(0.97, 0.94)', offset: 0.18, easing: spring },
            { transform: 'none' },
          ],
          { duration: 600 },
        )
      } catch {
        // An easing this engine can't parse: skip the flourish, never the send.
      }
    }
    onSend()
  }

  // Grow with the text up to a few lines, then scroll inside.
  useLayoutEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 168)}px`
  }, [value, inputRef])

  return (
    <div className="ai-composer-wrap">
      {chips && <div className="ai-chips">{chips}</div>}
      <form
        ref={form}
        className="ai-composer glass"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <button type="button" className="ai-composer-btn ai-attach" aria-label="Attach" title="Attach a page or search your notes" onClick={(e) => onAttach(e.currentTarget)}>
          <Paperclip size={19} />
        </button>
        <textarea
          ref={inputRef}
          className="ai-input"
          rows={1}
          value={value}
          placeholder="Message Slate…"
          aria-label="Message"
          enterKeyHint={touch ? 'enter' : 'send'}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter' || e.shiftKey || touch || e.nativeEvent.isComposing) return
            e.preventDefault()
            submit()
          }}
        />
        {streaming ? (
          <button type="button" className="ai-send is-stop" aria-label="Stop" title="Stop" onClick={onStop}>
            <Square size={13} fill="currentColor" />
          </button>
        ) : (
          <button type="submit" className={'ai-send' + (canSend ? ' is-ready' : '')} aria-label="Send" title="Send" disabled={!canSend}>
            <ArrowUp size={19} strokeWidth={2.4} />
          </button>
        )}
      </form>
    </div>
  )
}
