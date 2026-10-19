import type { Editor } from '@tiptap/core'
import { NodeSelection } from '@tiptap/pm/state'
import { useEditorState } from '@tiptap/react'
import { BubbleMenu } from '@tiptap/react/menus'
import {
  ArrowUpRight,
  Bold,
  Check,
  ChevronDown,
  Code,
  CodeXml,
  FileText,
  Heading1,
  Heading2,
  Heading3,
  Heading4,
  Highlighter,
  Italic,
  Lightbulb,
  Link,
  List,
  ListCollapse,
  ListOrdered,
  ListTodo,
  Pencil,
  Pilcrow,
  Quote,
  Strikethrough,
  Trash,
  Underline,
  Unlink,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { BLOCK_LABELS, currentBlock, turnInto, type BlockKind } from './blocks'
import { lineCount } from './restructure'
import { ShapeMenu } from './ShapeMenu'

function Btn({ active, onClick, title, children }: { active?: boolean; onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      className={'tb-btn' + (active ? ' is-active' : '')}
      title={title}
      aria-label={title}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

const BLOCK_ICONS: Record<BlockKind, LucideIcon> = {
  paragraph: Pilcrow,
  h1: Heading1,
  h2: Heading2,
  h3: Heading3,
  h4: Heading4,
  toggle: ListCollapse,
  bullet: List,
  ordered: ListOrdered,
  task: ListTodo,
  quote: Quote,
  callout: Lightbulb,
  code: CodeXml,
}

export function TurnIntoMenu({ editor, onDone, kinds }: { editor: Editor; onDone: () => void; kinds?: BlockKind[] }) {
  const cur = currentBlock(editor)
  const list = kinds ?? (Object.keys(BLOCK_LABELS) as BlockKind[])
  return (
    <div className="popover turn-into-menu" onMouseDown={(e) => e.preventDefault()}>
      <div className="menu-label">Turn into</div>
      {list.map((k) => (
        <button
          type="button"
          key={k}
          className={'menu-item' + (k === cur ? ' is-active' : '')}
          onClick={() => {
            turnInto(editor, k)
            onDone()
          }}
        >
          {(() => {
            const Icon = BLOCK_ICONS[k]
            return <Icon size={15} strokeWidth={1.75} className="menu-kind-icon" />
          })()}
          {BLOCK_LABELS[k]}
          {k === cur && <Check size={14} className="menu-check" />}
        </button>
      ))}
    </div>
  )
}

function normalizeUrl(raw: string): string {
  const v = raw.trim()
  if (!v) return v
  if (/^[a-z][a-z0-9+.-]*:/i.test(v) || v.startsWith('#') || v.startsWith('/')) return v
  return `https://${v}`
}

export function SelectionToolbar({ editor, onLinkPage }: { editor: Editor; onLinkPage: (text: string) => void }) {
  const [mode, setMode] = useState<'main' | 'link' | 'turn'>('main')
  const [url, setUrl] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      underline: e.isActive('underline'),
      strike: e.isActive('strike'),
      code: e.isActive('code'),
      highlight: e.isActive('highlight'),
      link: e.isActive('link'),
      href: (e.getAttributes('link').href as string | undefined) ?? '',
      block: currentBlock(e),
      from: e.state.selection.from,
      multi: lineCount(e.state.doc, e.state.selection.from, e.state.selection.to) > 1,
    }),
  })

  useEffect(() => setMode('main'), [s.from])
  useEffect(() => {
    if (mode === 'link') input.current?.focus()
  }, [mode])

  const applyLink = () => {
    const href = normalizeUrl(url)
    if (!href) editor.chain().focus().extendMarkRange('link').unsetLink().run()
    else editor.chain().focus().extendMarkRange('link').setLink({ href }).run()
    setMode('main')
  }

  return (
    <BubbleMenu
      editor={editor}
      pluginKey="selectionToolbar"
      className="bubble"
      options={{ placement: 'top', offset: 8, flip: true, shift: { padding: 8 } }}
      shouldShow={({ editor: e, state, from, to }) => {
        if (!e.isEditable || from === to) return false
        if (state.selection instanceof NodeSelection) return false
        if (e.isActive('codeBlock') || e.isActive('rawBlock')) return false
        return state.doc.textBetween(from, to, ' ').trim().length > 0
      }}
    >
      {mode === 'link' ? (
        <form
          className="tb-link-form"
          onSubmit={(e) => {
            e.preventDefault()
            applyLink()
          }}
        >
          <input
            ref={input}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Paste a link…"
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault()
                setMode('main')
                editor.commands.focus()
              }
            }}
          />
          <button type="submit" className="tb-btn" aria-label="Apply link">
            <Check size={16} />
          </button>
        </form>
      ) : (
        <div className="tb-row">
          <div className="tb-turn">
            <button type="button" className="tb-btn tb-text" onMouseDown={(e) => e.preventDefault()} onClick={() => setMode(mode === 'turn' ? 'main' : 'turn')}>
              {s.multi ? 'Turn into' : BLOCK_LABELS[s.block]}
              <ChevronDown size={14} />
            </button>
            {mode === 'turn' &&
              (s.multi ? <ShapeMenu editor={editor} onDone={() => setMode('main')} /> : <TurnIntoMenu editor={editor} onDone={() => setMode('main')} />)}
          </div>
          <span className="tb-sep" />
          <Btn title="Bold (⌘B)" active={s.bold} onClick={() => editor.chain().focus().toggleBold().run()}>
            <Bold size={16} strokeWidth={2.25} />
          </Btn>
          <Btn title="Italic (⌘I)" active={s.italic} onClick={() => editor.chain().focus().toggleItalic().run()}>
            <Italic size={16} />
          </Btn>
          <Btn title="Underline (⌘U)" active={s.underline} onClick={() => editor.chain().focus().toggleUnderline().run()}>
            <Underline size={16} />
          </Btn>
          <Btn title="Strikethrough (⌘⇧S)" active={s.strike} onClick={() => editor.chain().focus().toggleStrike().run()}>
            <Strikethrough size={16} />
          </Btn>
          <Btn title="Inline code (⌘E)" active={s.code} onClick={() => editor.chain().focus().toggleCode().run()}>
            <Code size={16} />
          </Btn>
          <Btn title="Highlight (⌘⇧H)" active={s.highlight} onClick={() => editor.chain().focus().toggleHighlight().run()}>
            <Highlighter size={16} />
          </Btn>
          <span className="tb-sep" />
          <Btn
            title="Link"
            active={s.link}
            onClick={() => {
              setUrl(s.href)
              setMode('link')
            }}
          >
            <Link size={16} />
          </Btn>
          <Btn
            title="Link to page"
            onClick={() => {
              const { from, to } = editor.state.selection
              onLinkPage(editor.state.doc.textBetween(from, to, ' '))
            }}
          >
            <FileText size={16} />
          </Btn>
        </div>
      )}
    </BubbleMenu>
  )
}

export function LinkToolbar({ editor }: { editor: Editor }) {
  const [editing, setEditing] = useState(false)
  const [url, setUrl] = useState('')
  const href = useEditorState({ editor, selector: ({ editor: e }) => (e.getAttributes('link').href as string | undefined) ?? '' })
  useEffect(() => setEditing(false), [href])
  return (
    <BubbleMenu
      editor={editor}
      pluginKey="linkToolbar"
      className="bubble"
      options={{ placement: 'bottom', offset: 6, flip: true, shift: { padding: 8 } }}
      shouldShow={({ editor: e, from, to }) => from === to && e.isActive('link')}
    >
      {editing ? (
        <form
          className="tb-link-form"
          onSubmit={(e) => {
            e.preventDefault()
            const v = normalizeUrl(url)
            const c = editor.chain().focus().extendMarkRange('link')
            if (v) c.setLink({ href: v }).run()
            else c.unsetLink().run()
            setEditing(false)
          }}
        >
          <input autoFocus value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Paste a link…" />
          <button type="submit" className="tb-btn" aria-label="Save link">
            <Check size={16} />
          </button>
        </form>
      ) : (
        <div className="tb-row">
          <a className="tb-href" href={href} target="_blank" rel="noopener noreferrer" title={href}>
            {href.replace(/^https?:\/\/(www\.)?/, '')}
            <ArrowUpRight size={14} />
          </a>
          <span className="tb-sep" />
          <Btn
            title="Edit link"
            onClick={() => {
              setUrl(href)
              setEditing(true)
            }}
          >
            <Pencil size={15} />
          </Btn>
          <Btn title="Remove link" onClick={() => editor.chain().focus().extendMarkRange('link').unsetLink().run()}>
            <Unlink size={15} />
          </Btn>
        </div>
      )}
    </BubbleMenu>
  )
}

export function TableToolbar({ editor }: { editor: Editor }) {
  return (
    <BubbleMenu
      editor={editor}
      pluginKey="tableToolbar"
      className="bubble"
      options={{ placement: 'top', offset: 10, flip: true, shift: { padding: 8 } }}
      shouldShow={({ editor: e, from, to }) => from === to && e.isEditable && e.isActive('table')}
    >
      <div className="tb-row tb-table">
        <button type="button" className="tb-btn tb-text" onMouseDown={(e) => e.preventDefault()} onClick={() => editor.chain().focus().addRowAfter().run()}>
          + Row
        </button>
        <button type="button" className="tb-btn tb-text" onMouseDown={(e) => e.preventDefault()} onClick={() => editor.chain().focus().addColumnAfter().run()}>
          + Column
        </button>
        <span className="tb-sep" />
        <button type="button" className="tb-btn tb-text" onMouseDown={(e) => e.preventDefault()} onClick={() => editor.chain().focus().deleteRow().run()}>
          − Row
        </button>
        <button type="button" className="tb-btn tb-text" onMouseDown={(e) => e.preventDefault()} onClick={() => editor.chain().focus().deleteColumn().run()}>
          − Column
        </button>
        <span className="tb-sep" />
        <Btn title="Delete table" onClick={() => editor.chain().focus().deleteTable().run()}>
          <Trash size={15} />
        </Btn>
      </div>
    </BubbleMenu>
  )
}
