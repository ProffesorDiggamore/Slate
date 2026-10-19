import { getSchema, type Editor, type JSONContent } from '@tiptap/core'
import Highlight from '@tiptap/extension-highlight'
import Image from '@tiptap/extension-image'
import { TaskItem, TaskList } from '@tiptap/extension-list'
import { Slice } from '@tiptap/pm/model'
import type { EditorView } from '@tiptap/pm/view'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { merge } from 'node-diff3'
import { useEffect, useMemo, useRef } from 'react'
import { registerFlusher } from '../lib/flush'
import { imageFiles, imageToDataUrl } from '../lib/images'
import { useSettings } from '../lib/settings'
import { toast } from '../lib/toasts'
import { markdownToDoc } from '../lib/markdown/parse'
import { docToMarkdown } from '../lib/markdown/serialize'
import { BlockHandle } from './BlockHandle'
import { PasteOptions } from './ShapeMenu'
import { Callout } from './extensions/callout'
import { CodeBlock } from './extensions/codeBlock'
import { HeadingFold, loadFolds, saveFolds } from './extensions/headingFold'
import { CurrentPlaceholder } from './extensions/placeholder'
import { RawBlock, RawInline } from './extensions/rawNodes'
import { SlashCommand } from './extensions/slashCommand'
import { tableExtensions } from './extensions/table'
import { refreshTimeChips, TimeChips, type TimeClick } from './extensions/timeChips'
import { WikiLink } from './extensions/wikiLink'
import { WikiLinkSuggest, type LinkItem } from './extensions/wikiLinkSuggest'
import { LinkToolbar, SelectionToolbar, TableToolbar } from './Toolbars'

export interface NoteEditorProps {
  markdown: string
  onChange: (markdown: string) => void
  resolveLink: (target: string) => string | null
  subscribeLinks: (fn: () => void) => () => void
  onOpenLink: (target: string, newTab: boolean) => void
  linkItems: (query: string) => LinkItem[]
  onLinkPage: (text: string, editor: Editor) => void
  onReady?: (editor: Editor | null) => void
  spellcheck?: boolean
  touch?: boolean
  /** Where this note's folded headings are remembered (its path). */
  foldKey?: string
  onTimeClick?: (info: TimeClick) => void
}

const looksLikeMarkdown = (t: string) =>
  /(^|\n)(#{1,6} |[-*+] |\d+[.)] |> |```|- \[[ xX]\] |\|.*\|)|\*\*[^*]+\*\*|\[\[[^\]]+\]\]|\[[^\]]+\]\([^)]+\)|==[^=]+==/.test(t)

function buildExtensions(p: { current: NoteEditorProps }) {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3, 4, 5, 6] },
      codeBlock: false,
      link: {
        openOnClick: false,
        autolink: true,
        linkOnPaste: true,
        defaultProtocol: 'https',
        HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' },
      },
      dropcursor: { color: 'var(--accent)', width: 3 },
    }),
    TaskList,
    TaskItem.configure({ nested: true }),
    Highlight,
    CodeBlock,
    ...tableExtensions,
    Image.configure({ inline: false, allowBase64: true }),
    Callout,
    RawBlock,
    RawInline,
    WikiLink.configure({
      resolve: (t) => p.current.resolveLink(t),
      subscribe: (fn) => p.current.subscribeLinks(fn),
      onOpen: (t, e) => p.current.onOpenLink(t, e.metaKey || e.ctrlKey),
    }),
    WikiLinkSuggest.configure({ items: (q) => p.current.linkItems(q) }),
    SlashCommand,
    CurrentPlaceholder.configure({
      placeholder: (node, $pos) => {
        if (node.type.name === 'heading') return `Heading ${node.attrs.level}`
        if (node.type.name === 'codeBlock' || node.type.name === 'rawBlock') return ''
        const parent = $pos.depth > 1 ? $pos.node($pos.depth - 1) : null
        const kind = parent?.type.name ?? ''
        if (kind === 'taskItem') return 'To-do'
        if (kind === 'listItem') return 'List'
        if (kind === 'callout' && parent?.attrs.kind === 'toggle') return 'Empty toggle — write or drop blocks inside'
        if (kind === 'callout' || kind === 'blockquote' || kind.startsWith('table')) return ''
        return p.current.touch ? 'Type, or tap + for blocks…' : 'Write, or press ‘/’ for commands…'
      },
    }),
    HeadingFold.configure({
      load: () => (p.current.foldKey ? loadFolds(p.current.foldKey) : []),
      save: (keys) => p.current.foldKey && saveFolds(p.current.foldKey, keys),
    }),
    TimeChips.configure({
      enabled: () => useSettings.getState().timeClocks,
      bareRanges: () => useSettings.getState().bareTimeRanges,
      h24: () => useSettings.getState().clock24,
      onClick: (info) => p.current.onTimeClick?.(info),
    }),
  ]
}

// Screenshots and photos go into the note as compact embedded images.
async function insertImages(view: EditorView, files: File[], at?: number) {
  const big = files.some((f) => f.size > 1_500_000)
  if (big) toast('Adding image…', { duration: 1500 })
  for (const file of files) {
    try {
      const src = await imageToDataUrl(file)
      if (view.isDestroyed) return
      const node = view.state.schema.nodes.image.create({ src, alt: file.name && !/^image\.\w+$/.test(file.name) ? file.name.replace(/\.[^.]+$/, '') : null })
      const tr = at === undefined ? view.state.tr.replaceSelectionWith(node) : view.state.tr.insert(at, node)
      view.dispatch(tr.scrollIntoView())
      if (at !== undefined) at += node.nodeSize
    } catch {
      toast('That image couldn’t be added. Try a PNG or JPEG.')
    }
  }
}

// Never let a weird file crash the editor: fall back to raw source.
function safeDoc(markdown: string, schema: ReturnType<typeof getSchema>): JSONContent {
  const doc = markdownToDoc(markdown)
  try {
    schema.nodeFromJSON(doc).check()
    return doc
  } catch (e) {
    console.warn('[cairn] could not map note to editor blocks, showing source', e)
    return { type: 'doc', content: [{ type: 'rawBlock', content: markdown ? [{ type: 'text', text: markdown }] : [] }] }
  }
}

export function NoteEditor(props: NoteEditorProps) {
  const p = useRef(props)
  p.current = props
  const extensions = useMemo(() => buildExtensions(p), [])
  const schema = useMemo(() => getSchema(extensions), [extensions])
  const lastMd = useRef(props.markdown)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const editorRef = useRef<Editor | null>(null)

  const flush = () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    const ed = editorRef.current
    if (!ed || ed.isDestroyed) return
    const md = docToMarkdown(ed.getJSON())
    if (md !== lastMd.current) {
      lastMd.current = md
      p.current.onChange(md)
    }
  }

  const editor = useEditor({
    extensions,
    content: safeDoc(props.markdown, schema),
    editorProps: {
      attributes: { class: 'prose', spellcheck: String(props.spellcheck ?? true), autocapitalize: 'sentences' },
      handlePaste: (view, event) => {
        const text = event.clipboardData?.getData('text/plain')
        const html = event.clipboardData?.getData('text/html')
        // A screenshot (⌘⇧⌃4) or copied picture arrives as a file with no HTML.
        const pics = imageFiles(event.clipboardData?.files?.length ? event.clipboardData.files : event.clipboardData?.items)
        if (pics.length && !(html && /<img\b/i.test(html))) {
          event.preventDefault()
          void insertImages(view, pics)
          return true
        }
        // Rich HTML (web pages, Slate itself) pastes as-is; plain text and code
        // editors' span soup get parsed as markdown. So does HTML that's only
        // wrapping literal Markdown (copied from GitHub, Notes, a chat…), where
        // "**Setup**" should become bold, not show its asterisks.
        const ours = !!html && /data-pm-slice/.test(html)
        const formatted = !!html && /<(h[1-6]|ul|ol|li|table|blockquote|pre|img|strong|em|b|i|a)\b/i.test(html)
        const wrapsMarkdown = !!html && !ours && !formatted && !!text && looksLikeMarkdown(text)
        const rich = !!html && !wrapsMarkdown && (ours || formatted || /<p\b/i.test(html))
        if (!text || rich) return false
        if (view.state.selection.$from.parent.type.spec.code) return false
        if (!looksLikeMarkdown(text)) return false
        const doc = safeDoc(text, view.state.schema)
        const node = view.state.schema.nodeFromJSON(doc)
        const single = node.childCount === 1 && node.firstChild!.type.name === 'paragraph'
        const slice = single ? new Slice(node.firstChild!.content, 0, 0) : new Slice(node.content, 1, 1)
        view.dispatch(view.state.tr.replaceSelection(slice).scrollIntoView().setMeta('paste', true).setMeta('uiEvent', 'paste'))
        return true
      },
      clipboardTextSerializer: (slice) => {
        try {
          const json = slice.content.toJSON() as JSONContent[]
          const blocks = json.every((n) => schema.nodes[n.type!]?.isBlock) ? json : [{ type: 'paragraph', content: json }]
          return docToMarkdown({ type: 'doc', content: blocks }).replace(/\n$/, '')
        } catch {
          return slice.content.textBetween(0, slice.content.size, '\n\n')
        }
      },
      handleDrop: (view, event, _slice, moved) => {
        if (moved) return false
        const pics = imageFiles(event.dataTransfer?.files)
        if (!pics.length) return false
        event.preventDefault()
        const at = view.posAtCoords({ left: event.clientX, top: event.clientY })
        let pos = at?.pos
        if (pos !== undefined) {
          // Drop between blocks, not inside a word.
          const $p = view.state.doc.resolve(pos)
          pos = $p.depth > 0 ? $p.after(1) : pos
        }
        void insertImages(view, pics, pos)
        return true
      },
      handleClick: (_view, _pos, event) => {
        const a = (event.target as HTMLElement).closest('a[href]') as HTMLAnchorElement | null
        if (a && (event.metaKey || event.ctrlKey)) {
          window.open(a.href, '_blank', 'noopener')
          return true
        }
        return false
      },
    },
    onUpdate: () => {
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(flush, 300)
    },
    onBlur: () => flush(),
  })

  useEffect(() => {
    editorRef.current = editor
    p.current.onReady?.(editor)
    const unregister = registerFlusher(flush)
    return () => {
      unregister()
      flush()
      p.current.onReady?.(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor])

  // Content changed underneath us (sync from another device).
  useEffect(() => {
    if (!editor || props.markdown === lastMd.current) return
    const remote = props.markdown
    const pending = timer.current !== null
    let next = remote
    let local = ''
    if (pending) {
      // Typing that hasn't been saved yet gets merged with the incoming text.
      local = docToMarkdown(editor.getJSON())
      const m = merge(local.split('\n'), lastMd.current.split('\n'), remote.split('\n'))
      next = m.conflict ? local : m.result.join('\n')
      clearTimeout(timer.current!)
      timer.current = null
    }
    lastMd.current = remote
    if (!pending || next !== local) {
      const node = editor.schema.nodeFromJSON(safeDoc(next, editor.schema))
      const { from, to } = editor.state.selection
      const tr = editor.state.tr.replaceWith(0, editor.state.doc.content.size, node.content)
      tr.setMeta('addToHistory', false).setMeta('preventUpdate', true)
      editor.view.dispatch(tr)
      if (editor.isFocused) {
        const max = editor.state.doc.content.size
        try {
          editor.commands.setTextSelection({ from: Math.min(from, max), to: Math.min(to, max) })
        } catch {
          /* selection restore is best-effort */
        }
      }
    }
    if (next !== remote) {
      lastMd.current = next
      p.current.onChange(next)
    }
  }, [props.markdown, editor])

  useEffect(() => {
    editor?.view.dom.setAttribute('spellcheck', String(props.spellcheck ?? true))
  }, [editor, props.spellcheck])

  // Clock settings changed: redraw the little clocks.
  useEffect(() => {
    if (!editor) return
    return useSettings.subscribe((s, prev) => {
      if (s.timeClocks !== prev.timeClocks || s.bareTimeRanges !== prev.bareTimeRanges || s.clock24 !== prev.clock24) refreshTimeChips(editor)
    })
  }, [editor])

  if (!editor) return null
  return (
    <div className="editor-wrap">
      {!props.touch && <BlockHandle editor={editor} />}
      <SelectionToolbar editor={editor} onLinkPage={(text) => props.onLinkPage(text, editor)} />
      <PasteOptions editor={editor} />
      <LinkToolbar editor={editor} />
      <TableToolbar editor={editor} />
      <EditorContent editor={editor} />
    </div>
  )
}
