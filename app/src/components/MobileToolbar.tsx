import type { Editor } from '@tiptap/core'
import { useEditorState } from '@tiptap/react'
import {
  Bold,
  Check,
  ChevronDown,
  FileText,
  Italic,
  Link,
  ListIndentDecrease,
  ListIndentIncrease,
  ListTodo,
  Plus,
  Redo2,
  Sparkles,
  Strikethrough,
  Underline,
  Undo2,
  X,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { AiMenu } from '../editor/AiMenu'
import { BLOCK_LABELS, currentBlock, startPageLink, turnInto } from '../editor/blocks'
import { TurnIntoMenu } from '../editor/Toolbars'

type Panel = null | 'turn' | 'ai' | 'link'

function normalizeUrl(raw: string): string {
  const v = raw.trim()
  if (!v || /^[a-z][a-z0-9+.-]*:/i.test(v) || v.startsWith('#') || v.startsWith('/')) return v
  return `https://${v}`
}

// The floating Liquid Glass format bar that rides on top of the on-screen
// keyboard: the block-type pill (opens Turn into), then B I U S and link, then
// the extras, which scroll sideways. Menus open upwards from it.
export function MobileToolbar({ editor, ai }: { editor: Editor; ai?: { attachPath?: string } }) {
  const [focused, setFocused] = useState(editor.isFocused)
  const [offset, setOffset] = useState(0)
  const [room, setRoom] = useState(320)
  const [panel, setPanel] = useState<Panel>(null)
  const [url, setUrl] = useState('')
  const root = useRef<HTMLDivElement>(null)
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      underline: e.isActive('underline'),
      strike: e.isActive('strike'),
      link: e.isActive('link'),
      href: (e.getAttributes('link').href as string | undefined) ?? '',
      block: currentBlock(e),
      from: e.state.selection.from,
      inList: e.isActive('listItem') || e.isActive('taskItem'),
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  })

  useEffect(() => {
    let t: ReturnType<typeof setTimeout>
    const onFocus = () => {
      clearTimeout(t)
      setFocused(true)
    }
    const onBlur = () => {
      t = setTimeout(() => setFocused(false), 120)
    }
    editor.on('focus', onFocus)
    editor.on('blur', onBlur)
    return () => {
      editor.off('focus', onFocus)
      editor.off('blur', onBlur)
      clearTimeout(t)
    }
  }, [editor])

  // Sit just above the keyboard. Where the page doesn't shrink for it (Safari),
  // the visual viewport tells us how far up that is.
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const update = () => {
      setOffset(Math.max(0, window.innerHeight - vv.height - vv.offsetTop))
      setRoom(Math.max(160, vv.height - 140))
    }
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    update()
    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
    }
  }, [])

  // Moving the cursor closes Turn into / AI; the link box stays until it's done.
  useEffect(() => setPanel((p) => (p === 'link' ? p : null)), [s.from])

  // Focus moving anywhere outside the bar (the title, a property, back into the text) closes any panel.
  useEffect(() => {
    if (!panel) return
    const onFocusIn = (e: FocusEvent) => {
      if (!root.current?.contains(e.target as Node)) setPanel(null)
    }
    document.addEventListener('focusin', onFocusIn)
    return () => document.removeEventListener('focusin', onFocusIn)
  }, [panel])

  const visible = focused || panel !== null

  useEffect(() => {
    document.documentElement.classList.toggle('has-mobile-toolbar', visible)
    return () => document.documentElement.classList.remove('has-mobile-toolbar')
  }, [visible])

  // Keep the line being typed above this floating bar. The editor's own scroll
  // margin measures against the window, but on iOS the keyboard and the bar
  // decide what's really visible, so measure against the bar itself.
  useEffect(() => {
    if (!visible) return
    let frame = 0
    const check = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const bar = root.current?.querySelector<HTMLElement>('.mt-bar')
        const scroller = editor.view.dom.closest('.main-scroll')
        if (!bar || !scroller || !editor.isFocused) return
        let caret: { bottom: number }
        try {
          caret = editor.view.coordsAtPos(editor.state.selection.head)
        } catch {
          return
        }
        const over = caret.bottom - (bar.getBoundingClientRect().top - 16)
        if (over > 0) scroller.scrollBy({ top: over })
      })
    }
    editor.on('selectionUpdate', check)
    editor.on('update', check)
    // The keyboard opens after the tap that put the cursor there: when the app
    // shrinks above it (the iOS app) or the visual viewport does (Safari), the
    // line may have just gone under the bar, so look again.
    window.visualViewport?.addEventListener('resize', check)
    window.addEventListener('resize', check)
    const scroller = editor.view.dom.closest('.main-scroll')
    const sized = scroller ? new ResizeObserver(check) : null
    if (scroller) sized?.observe(scroller)
    check()
    return () => {
      cancelAnimationFrame(frame)
      editor.off('selectionUpdate', check)
      editor.off('update', check)
      window.visualViewport?.removeEventListener('resize', check)
      window.removeEventListener('resize', check)
      sized?.disconnect()
    }
  }, [visible, editor])

  if (!visible) return null

  const keep = (e: React.MouseEvent | React.PointerEvent) => e.preventDefault()
  const toggle = (p: Exclude<Panel, null>) => setPanel((cur) => (cur === p ? null : p))
  const listType = s.block === 'task' ? 'taskItem' : 'listItem'
  const b = (label: string, icon: React.ReactNode, run: () => void, active = false, disabled = false) => (
    <button type="button" className={'mt-btn' + (active ? ' is-active' : '')} aria-label={label} aria-pressed={active} disabled={disabled} onMouseDown={keep} onClick={run}>
      {icon}
    </button>
  )

  const applyLink = () => {
    const href = normalizeUrl(url)
    const c = editor.chain().focus()
    if (!href) c.extendMarkRange('link').unsetLink().run()
    else if (editor.state.selection.empty && !s.link) c.insertContent({ type: 'text', text: url.trim(), marks: [{ type: 'link', attrs: { href } }] }).run()
    else c.extendMarkRange('link').setLink({ href }).run()
    setPanel(null)
  }

  return (
    <div
      ref={root}
      className="mobile-toolbar"
      style={{ bottom: offset > 0 ? offset + 8 : undefined, '--mt-room': `${room}px` } as React.CSSProperties}
      onMouseDown={(e) => {
        // Taps on the bar keep the editor's cursor; only text boxes take focus.
        if (!(e.target instanceof HTMLInputElement)) keep(e)
      }}
    >
      <span className="mt-glow" aria-hidden="true" />
      {(panel === 'turn' || panel === 'ai') && (
        <div className="mt-panel" key={panel}>
          {panel === 'turn' ? (
            <TurnIntoMenu editor={editor} onDone={() => setPanel(null)} />
          ) : (
            <AiMenu editor={editor} attachPath={ai?.attachPath} onDone={() => setPanel(null)} />
          )}
        </div>
      )}
      <div className="mt-bar glass">
        {panel === 'link' ? (
          <form
            className="mt-link"
            // "example.com" isn't a valid URL to the browser; we add the https:// ourselves.
            noValidate
            onSubmit={(e) => {
              e.preventDefault()
              applyLink()
            }}
          >
            <Link size={17} className="mt-link-icon" />
            <input
              autoFocus
              type="url"
              inputMode="url"
              autoCapitalize="off"
              autoCorrect="off"
              enterKeyHint="done"
              value={url}
              placeholder="Paste a link…"
              aria-label="Link address"
              onChange={(e) => setUrl(e.target.value)}
              onBlur={() =>
                // Keyboard dismissed without finishing: put the bar away too.
                setTimeout(() => {
                  if (!root.current?.contains(document.activeElement)) setPanel(null)
                }, 150)
              }
            />
            <button type="submit" className="mt-btn" aria-label="Apply link" onMouseDown={keep}>
              <Check size={19} />
            </button>
            <button
              type="button"
              className="mt-btn"
              aria-label="Cancel"
              onMouseDown={keep}
              onClick={() => {
                setPanel(null)
                editor.commands.focus()
              }}
            >
              <X size={18} />
            </button>
          </form>
        ) : (
          <>
            <button type="button" className={'mt-block' + (panel === 'turn' ? ' is-open' : '')} aria-expanded={panel === 'turn'} onMouseDown={keep} onClick={() => toggle('turn')}>
              <span className="mt-block-label">{BLOCK_LABELS[s.block]}</span>
              <ChevronDown size={15} className="mt-chevron" />
            </button>
            <span className="mt-sep" />
            <div className="mt-scroll">
              {b('Bold', <Bold size={18} strokeWidth={2} />, () => editor.chain().focus().toggleBold().run(), s.bold)}
              {b('Italic', <Italic size={18} />, () => editor.chain().focus().toggleItalic().run(), s.italic)}
              {b('Underline', <Underline size={18} />, () => editor.chain().focus().toggleUnderline().run(), s.underline)}
              {b('Strikethrough', <Strikethrough size={18} />, () => editor.chain().focus().toggleStrike().run(), s.strike)}
              {b(
                'Link',
                <Link size={18} />,
                () => {
                  setUrl(s.href)
                  setPanel('link')
                },
                s.link,
              )}
              <span className="mt-sep" />
              {ai && b('AI', <Sparkles size={18} />, () => toggle('ai'), panel === 'ai')}
              {b('Insert block', <Plus size={19} />, () => editor.chain().focus().insertContent('/').run())}
              {b('To-do', <ListTodo size={18} />, () => turnInto(editor, s.block === 'task' ? 'paragraph' : 'task'), s.block === 'task')}
              {b('Link to page', <FileText size={18} />, () => startPageLink(editor))}
              <span className="mt-sep" />
              {b('Indent', <ListIndentIncrease size={18} />, () => editor.chain().focus().sinkListItem(listType).run(), false, !s.inList)}
              {b('Outdent', <ListIndentDecrease size={18} />, () => editor.chain().focus().liftListItem(listType).run(), false, !s.inList)}
              {b('Undo', <Undo2 size={18} />, () => editor.chain().focus().undo().run(), false, !s.canUndo)}
              {b('Redo', <Redo2 size={18} />, () => editor.chain().focus().redo().run(), false, !s.canRedo)}
            </div>
            <span className="mt-sep" />
            <button
              type="button"
              className="mt-btn mt-done"
              aria-label="Hide keyboard"
              onMouseDown={keep}
              onClick={() => {
                setPanel(null)
                editor.commands.blur()
              }}
            >
              <ChevronDown size={20} />
            </button>
          </>
        )}
      </div>
    </div>
  )
}
