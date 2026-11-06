import type { Editor } from '@tiptap/core'
import {
  ChevronLeft,
  Feather,
  Languages,
  Maximize2,
  MessageCircleQuestionMark,
  Minimize2,
  PenLine,
  SpellCheck,
  TextQuote,
  WandSparkles,
  type LucideIcon,
} from 'lucide-react'
import { useState } from 'react'
import type { AiAction } from '../lib/ai/client'
import { openAi } from '../lib/ai/store'
import { isCellSelection, runAiAction, selectionMarkdown } from './ai'
import './ai.css'

const ACTIONS: { action: AiAction; label: string; icon: LucideIcon }[] = [
  { action: 'improve', label: 'Improve writing', icon: WandSparkles },
  { action: 'fix', label: 'Fix spelling & grammar', icon: SpellCheck },
  { action: 'shorter', label: 'Make shorter', icon: Minimize2 },
  { action: 'longer', label: 'Make longer', icon: Maximize2 },
  { action: 'simplify', label: 'Simplify', icon: Feather },
  { action: 'summarize', label: 'Summarise', icon: TextQuote },
  { action: 'continue', label: 'Continue writing', icon: PenLine },
]

const LANGUAGES = ['English', 'Spanish', 'French', 'German', 'Italian', 'Portuguese', 'Dutch', 'Japanese', 'Korean', 'Chinese (Simplified)', 'Hindi', 'Arabic']

// What the ✨ button offers. With nothing selected (phone toolbar) only the
// actions that make sense from the cursor are shown. Several table cells can be
// asked about but not rewritten: a rewrite only reaches one of them.
export function AiMenu({ editor, attachPath, onDone }: { editor: Editor; attachPath?: string; onDone: () => void }) {
  const [view, setView] = useState<'main' | 'translate'>('main')
  const [other, setOther] = useState('')
  const hasSelection = !editor.state.selection.empty
  const cells = isCellSelection(editor.state)
  const actions = cells ? [] : ACTIONS.filter((a) => hasSelection || a.action === 'continue')

  const run = (action: AiAction, language?: string) => {
    onDone()
    void runAiAction(editor, action, { language })
  }
  const ask = () => {
    const selection = selectionMarkdown(editor)
    onDone()
    openAi({ attachPath, selection: selection || undefined })
  }

  if (view === 'translate') {
    return (
      <div
        className="popover ai-menu"
        onMouseDown={(e) => {
          // Keep the editor's selection, except when tapping into the language box.
          if (!(e.target instanceof HTMLInputElement)) e.preventDefault()
        }}
      >
        <button type="button" className="menu-item ai-menu-back" onClick={() => setView('main')}>
          <ChevronLeft size={15} /> Translate to…
        </button>
        <div className="ai-menu-scroll">
          {LANGUAGES.map((l) => (
            <button type="button" key={l} className="menu-item" onClick={() => run('translate', l)}>
              {l}
            </button>
          ))}
        </div>
        <form
          className="ai-menu-other"
          onSubmit={(e) => {
            e.preventDefault()
            if (other.trim()) run('translate', other.trim())
          }}
        >
          <input value={other} onChange={(e) => setOther(e.target.value)} placeholder="Another language…" aria-label="Another language" enterKeyHint="go" />
        </form>
      </div>
    )
  }

  return (
    <div className="popover ai-menu" onMouseDown={(e) => e.preventDefault()}>
      <div className="menu-label">{hasSelection && !cells ? 'Ask AI to…' : 'AI'}</div>
      <div className="ai-menu-scroll">
        {actions.map(({ action, label, icon: Icon }, i) => (
          <button type="button" key={action} className="menu-item ai-menu-item" style={{ '--i': i } as React.CSSProperties} onClick={() => run(action)}>
            <Icon size={15} strokeWidth={1.75} />
            {label}
          </button>
        ))}
        {hasSelection && !cells && (
          <button type="button" className="menu-item ai-menu-item" style={{ '--i': ACTIONS.length } as React.CSSProperties} onClick={() => setView('translate')}>
            <Languages size={15} strokeWidth={1.75} />
            Translate…
          </button>
        )}
        {actions.length > 0 && <div className="menu-sep" />}
        <button type="button" className="menu-item ai-menu-item" onClick={ask}>
          <MessageCircleQuestionMark size={15} strokeWidth={1.75} />
          {cells ? 'Ask AI about these cells' : hasSelection ? 'Ask AI about this' : 'Ask AI about this page'}
        </button>
      </div>
    </div>
  )
}
