import { Check, ChevronLeft, ChevronRight, FileText, History, KeyRound, Lock, RotateCcw, Search, SquarePen, TextQuote, X } from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { startChat, updateChat, useChats, type Chat } from '../lib/ai/chats'
import { regenerate, sendMessage, stopChat, useRunning } from '../lib/ai/run'
import { neutralizeRemoteImages } from '../lib/ai/safeMarkdown'
import { connectionOf, openAiSettings, useAiConfig, useAiLaunch, useAiReady } from '../lib/ai/store'
import { Composer } from '../lib/ai/ui/Composer'
import { HistorySheet } from '../lib/ai/ui/HistorySheet'
import { AssistantMessage, UserMessage, type AnswerActions } from '../lib/ai/ui/Message'
import { PagePicker } from '../lib/ai/ui/PagePicker'
import { isEncrypted } from '../lib/crypto'
import { titleOf } from '../lib/paths'
import { goBack, openNote } from '../lib/router'
import { useSettings } from '../lib/settings'
import { toast } from '../lib/toasts'
import { createNote, getNote, updateContent, useVault } from '../lib/vault'
import '../styles/ai.css'
import { Orb } from './Orb'
import { openMenu, type MenuEntry } from './ui'

// The assistant (#/ai): a landing screen with the orb and suggestions, then a
// conversation — the user's questions as bubbles, answers as cards with the
// orb beside them — over a glass input bar. Chats are kept on this device.
export default function AiPage() {
  const ready = useAiReady()
  const cfg = useAiConfig()
  const conn = useMemo(() => connectionOf(cfg), [cfg])
  const chat = useChats((s) => s.chats.find((c) => c.id === s.currentId))
  const running = useRunning((s) => (chat ? !!s[chat.id] : false))
  const launch = useAiLaunch((s) => s.launch)
  const [draft, setDraft] = useState('')
  const [sheet, setSheet] = useState<null | 'history' | 'pick'>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const pageRef = useRef<HTMLDivElement>(null)
  const dockRef = useRef<HTMLDivElement>(null)
  const stick = useRef(true)

  // The glass dock floats over the conversation, which scrolls under it; the
  // conversation keeps the dock's height free at its end. The dock grows with
  // context chips and a multi-line message, so it's measured, not guessed.
  useLayoutEffect(() => {
    const page = pageRef.current
    const dock = dockRef.current
    if (!page || !dock) return
    const ro = new ResizeObserver(() => {
      page.style.setProperty('--ai-dock-h', `${dock.offsetHeight}px`)
      // Keep the latest answer in view; the landing stays at its top.
      const el = scrollRef.current
      if (el && stick.current && el.querySelector('.ai-thread')) el.scrollTop = el.scrollHeight
    })
    ro.observe(dock)
    return () => ro.disconnect()
  }, [])

  // Always have a chat on screen (first visit, after deleting the open one…).
  useEffect(() => {
    if (!chat && !launch) startChat()
  }, [chat, launch])

  // Opened from somewhere with a page, selection or prompt: start fresh with it.
  const handled = useRef(0)
  useEffect(() => {
    if (!launch || launch.seq === handled.current) return
    handled.current = launch.seq
    useAiLaunch.setState({ launch: null })
    const c = startChat({ attachPath: launch.attachPath ?? null, selection: launch.selection ?? null })
    if (launch.send && launch.prompt?.trim()) {
      setDraft('')
      sendMessage(c.id, launch.prompt)
    } else {
      setDraft(launch.prompt ?? '')
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [launch])

  // Follow the answer as it grows, unless the user scrolled up to read.
  const messages = chat?.messages
  const chatId = chat?.id
  useEffect(() => {
    stick.current = true
  }, [chatId])
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    // An empty chat shows the landing from its top (greeting first).
    if (!messages?.length) el.scrollTop = 0
    else if (stick.current) el.scrollTop = el.scrollHeight
  }, [messages])

  const setChat = useCallback(
    (patch: Partial<Chat>) => {
      if (chat) updateChat(chat.id, (c) => ({ ...c, ...patch }))
    },
    [chat],
  )

  const send = (text = draft) => {
    if (!chat || !text.trim()) return
    if (!ready) {
      openAiSettings()
      return
    }
    stick.current = true
    setDraft('')
    sendMessage(chat.id, text)
  }

  const focusWith = (text: string, patch?: Partial<Chat>) => {
    if (patch) setChat(patch)
    setDraft(text)
    requestAnimationFrame(() => {
      const el = inputRef.current
      if (!el) return
      el.focus()
      el.setSelectionRange(text.length, text.length)
    })
  }

  const recent = useSettings((s) => s.recent)
  const paths = useVault((s) => s.paths)
  const files = useVault((s) => s.files)
  const attach = chat?.attachPath && paths.includes(chat.attachPath) ? chat.attachPath : null
  const attachLocked = attach ? isEncrypted(files[attach]?.content ?? '') : false

  const attachMenu = (el: HTMLElement) => {
    if (!chat) return
    const last = recent.find((p) => p !== attach && paths.includes(p))
    const items: MenuEntry[] = []
    if (last) items.push({ label: `Attach “${titleOf(last)}”`, icon: <FileText size={16} />, onSelect: () => setChat({ attachPath: last }) })
    items.push({ label: 'Choose a page…', icon: <Search size={16} />, onSelect: () => setSheet('pick') })
    if (attach) items.push({ label: 'Remove page', icon: <X size={16} />, onSelect: () => setChat({ attachPath: null }) })
    items.push('sep', {
      label: 'Search my notes',
      icon: chat.search ? <Check size={16} /> : <Search size={16} />,
      hint: chat.search ? 'On' : 'Off',
      onSelect: () => setChat({ search: !chat.search }),
    })
    openMenu(el, items, 'Add to your message')
  }

  const actions: AnswerActions = {
    onCopy: (text) => {
      void navigator.clipboard?.writeText(text).catch(() => toast('Couldn’t copy', { tone: 'error' }))
    },
    // The answer becomes note content, where a remote image would load by itself
    // (and could carry note text to whoever the model was steered to name), so
    // remote images go in as plain links.
    onInsert:
      attach && !attachLocked
        ? (text) => {
            const note = getNote(attach)
            if (!note) return
            updateContent(attach, `${note.content.replace(/\s*$/, '')}\n\n${neutralizeRemoteImages(text.trim())}\n`)
            toast(`Added to “${titleOf(attach)}”`, { action: { label: 'Open', run: () => openNote(attach) } })
          }
        : undefined,
    onSave: (text) => {
      const path = createNote({ title: chat?.title && chat.title !== 'New chat' ? chat.title : 'AI answer', content: neutralizeRemoteImages(text.trim()) + '\n' })
      toast(`Saved as “${titleOf(path)}”`, { action: { label: 'Open', run: () => openNote(path) } })
    },
    onRetry: () => chat && regenerate(chat.id),
    onSettings: openAiSettings,
    onWikilink: (target) => {
      const want = target.toLowerCase().replace(/\.md$/, '')
      const path = paths.find((p) => p.toLowerCase().replace(/\.md$/, '') === want) ?? paths.find((p) => titleOf(p).toLowerCase() === want)
      if (path) openNote(path)
      else toast(`No page called “${target}”`)
    },
  }

  const empty = !messages?.length
  const lastMsg = messages?.[messages.length - 1]
  const canRegenerate = !running && lastMsg?.role === 'assistant' && lastMsg.status !== 'streaming' && lastMsg.status !== 'error'

  const chips: ReactNode[] = []
  if (attach)
    chips.push(
      <span key="page" className={'ai-ctx-chip' + (attachLocked ? ' is-locked' : '')} title={attachLocked ? 'Encrypted pages are never sent' : attach}>
        {attachLocked ? <Lock size={13} /> : <FileText size={13} />}
        <span className="ai-ctx-label">{titleOf(attach)}</span>
        {attachLocked && <span className="ai-ctx-note">won’t be sent</span>}
        <button type="button" aria-label="Remove page" onClick={() => setChat({ attachPath: null })}>
          <X size={13} />
        </button>
      </span>,
    )
  if (chat?.selection)
    chips.push(
      <span key="sel" className="ai-ctx-chip" title={chat.selection}>
        <TextQuote size={13} />
        <span className="ai-ctx-label">“{chat.selection.replace(/\s+/g, ' ').slice(0, 40)}”</span>
        <button type="button" aria-label="Remove selection" onClick={() => setChat({ selection: null })}>
          <X size={13} />
        </button>
      </span>,
    )
  if (chat?.search)
    chips.push(
      <span key="search" className="ai-ctx-chip is-accent">
        <Search size={13} />
        <span className="ai-ctx-label">Searching my notes</span>
        <button type="button" aria-label="Stop searching notes" onClick={() => setChat({ search: false })}>
          <X size={13} />
        </button>
      </span>,
    )

  return (
    <div className="ai-page" ref={pageRef}>
      <div className="ambient-glow ai-glow" aria-hidden="true" />
      <header className="ai-head">
        <div className="ai-head-side">
          {/* The router's Back: history.length counts other sites in this tab, so a
              deep link to #/ai would go back out of Slate. goBack() goes Home instead. */}
          <button type="button" className="circle-btn is-glass" aria-label="Back" onClick={goBack}>
            <ChevronLeft size={20} strokeWidth={2} />
          </button>
        </div>
        <div className="ai-head-title">
          <span>{empty ? 'Ask Slate' : chat?.title}</span>
          {conn && ready && <span className="ai-head-sub">{conn.name}</span>}
        </div>
        <div className="ai-head-side is-end">
          <button
            type="button"
            className="circle-btn is-glass"
            aria-label="New chat"
            title="New chat"
            onClick={() => {
              startChat({ attachPath: chat?.attachPath ?? null })
              setDraft('')
            }}
          >
            <SquarePen size={18} />
          </button>
          <button type="button" className="circle-btn is-glass" aria-label="Chats" title="Chats" onClick={() => setSheet('history')}>
            <History size={18} />
          </button>
        </div>
      </header>

      <div
        className="ai-scroll"
        ref={scrollRef}
        onScroll={(e) => {
          const el = e.currentTarget
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
          // The header's soft backing shows only once something scrolls under it.
          pageRef.current?.classList.toggle('is-scrolled', el.scrollTop > 4)
        }}
      >
        {empty ? (
          <Landing
            ready={ready}
            hasPage={!!attach && !attachLocked}
            onPick={(text, send) => (send ? sendIf(text) : focusWith(text))}
            onSearch={() => focusWith('Find my notes about ', { search: true })}
          />
        ) : (
          <div className="ai-thread">
            {messages!.map((m, i) =>
              m.role === 'user' ? (
                <UserMessage key={m.id} msg={m} index={0} />
              ) : (
                <AssistantMessage key={m.id} msg={m} index={0} isLast={i === messages!.length - 1} actions={actions} />
              ),
            )}
          </div>
        )}
      </div>

      <div className="ai-dock" ref={dockRef}>
        <div className="ambient-glow-bottom ai-dock-glow" aria-hidden="true" />
        {canRegenerate && chat && (
          <button type="button" className="ai-regenerate" onClick={() => regenerate(chat.id)}>
            <span className="ai-regenerate-icon">
              <RotateCcw size={13} strokeWidth={2.4} />
            </span>
            Regenerate
          </button>
        )}
        <Composer
          value={draft}
          onChange={setDraft}
          onSend={() => send()}
          onStop={() => chat && stopChat(chat.id)}
          onAttach={attachMenu}
          streaming={running}
          inputRef={inputRef}
          chips={chips.length ? chips : undefined}
        />
      </div>

      {sheet === 'history' && <HistorySheet onClose={() => setSheet(null)} />}
      {sheet === 'pick' && <PagePicker onPick={(p) => setChat({ attachPath: p })} onClose={() => setSheet(null)} />}
    </div>
  )

  function sendIf(text: string) {
    if (ready) send(text)
    else focusWith(text)
  }
}

function Landing({
  ready,
  hasPage,
  onPick,
  onSearch,
}: {
  ready: boolean
  hasPage: boolean
  onPick: (text: string, send: boolean) => void
  onSearch: () => void
}) {
  // Short enough that every chip stays one line on a 375px phone.
  const suggestions: { label: string; run: () => void }[] = hasPage
    ? [
        { label: 'Summarise page', run: () => onPick('Summarise this page.', true) },
        { label: 'To-dos from page', run: () => onPick('Make a to-do list from this page.', true) },
        { label: 'Search my notes', run: onSearch },
        { label: 'Brainstorm ideas', run: () => onPick('Brainstorm ideas for ', false) },
      ]
    : [
        { label: 'Search my notes', run: onSearch },
        { label: 'Make a to-do list', run: () => onPick('Make a to-do list from ', false) },
        { label: 'Brainstorm ideas', run: () => onPick('Brainstorm ideas for ', false) },
        { label: 'Draft an email', run: () => onPick('Draft an email to ', false) },
      ]
  return (
    <div className="ai-landing">
      <div className="ai-hero">
        <h1 className="ai-hello">Hi there 👋</h1>
        <p className="ai-hello-sub">How can I help? Ask about your notes or anything else.</p>
        <div className="ai-hero-orb">
          <Orb size={180} />
        </div>
      </div>
      {!ready && (
        <button type="button" className="ai-connect" onClick={openAiSettings}>
          <span className="ai-connect-icon">
            <KeyRound size={18} />
          </span>
          <span className="ai-connect-text">
            <strong>Connect an AI</strong>
            <span>Use your own ChatGPT, Claude, Gemini or other key. It stays on this device.</span>
          </span>
          <ChevronRight size={18} className="ai-connect-chev" />
        </button>
      )}
      <div className="ai-suggestions">
        {suggestions.map((s, i) => (
          <button key={s.label} type="button" className="ai-suggestion" style={{ '--i': i + 2 } as CSSProperties} onClick={s.run}>
            <span>{s.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
