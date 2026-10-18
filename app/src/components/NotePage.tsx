import type { Editor } from '@tiptap/core'
import { ArrowUpRight, FaceSlightlySmilingPlus, FileQuestion, FileText, Link2, ListPlus } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { LinkItem } from '../editor/extensions/wikiLinkSuggest'
import { NoteEditor } from '../editor/NoteEditor'
import type { TimeClick } from '../editor/extensions/timeChips'
import { dateFromTitle, downloadIcs, findDate, formatSpan, isoDay, openInGoogleCalendar, titleAround, type CalendarEvent } from '../lib/calendar'
import { addToGoogle, googleConnected } from '../lib/google/store'
import { useIsMobile, useIsTouch, useLinkIndex, useNoteIcons, useResolver } from '../lib/hooks'
import { NoteIcon } from './NoteIcon'
import { linkContexts, stripSubpath } from '../lib/links'
import { getField, joinFrontmatter, setField, splitFrontmatter } from '../lib/markdown/frontmatter'
import { isEncrypted } from '../lib/crypto'
import { dirname, titleOf } from '../lib/paths'
import { HIDDEN_KEYS, readProperties } from '../lib/properties'
import { navigate, openNote } from '../lib/router'
import { pushRecent, useSettings } from '../lib/settings'
import { toast } from '../lib/toasts'
import { createNote, renameNote, updateContent, useVault } from '../lib/vault'
import { EmojiPicker } from './EmojiPicker'
import { EncryptedNote } from './EncryptedNote'
import { MobileToolbar } from './MobileToolbar'
import { PropertiesPanel } from './PropertiesPanel'
import { openMenu } from './ui'
import { openCalendar } from './uiState'

// Cross-page hand-offs (focus the body after renaming, jump to a #heading).
let focusBodyOnMount = false
let pendingAnchor: string | null = null

const UNTITLED = /^Untitled( \d+)?$/

export function openLinkTarget(target: string, resolve: (t: string) => string | null) {
  const path = resolve(target)
  const anchor = target.includes('#') ? target.slice(target.indexOf('#') + 1) : null
  if (path) {
    pendingAnchor = anchor
    openNote(path)
    return
  }
  const name = stripSubpath(target)
  if (/\.[a-z0-9]{2,5}$/i.test(name)) {
    toast('Attachments like images and PDFs aren’t supported in links yet.')
    return
  }
  const parts = name.split('/')
  const title = parts.pop()!
  const folder = parts.join('/')
  openNote(createNote({ folder, title }))
}

export function NotePage({ path }: { path: string }) {
  const exists = useVault((s) => !!s.files[path] && !s.files[path].deleted)
  const ready = useVault((s) => s.ready)
  if (!ready) return null
  if (!exists) {
    return (
      <div className="empty-state">
        <FileQuestion size={40} strokeWidth={1.25} />
        <h2>This page doesn’t exist</h2>
        <p>It may have been renamed, moved to Trash, or not synced to this device yet.</p>
        <div className="row-gap">
          <button type="button" className="btn btn-primary" onClick={() => openNote(createNote({ folder: dirname(path), title: titleOf(path) }))}>
            Create “{titleOf(path)}”
          </button>
          <button type="button" className="btn" onClick={() => navigate({ name: 'home' })}>
            Go home
          </button>
        </div>
      </div>
    )
  }
  return <NoteBody key={path} path={path} />
}

function NoteBody({ path }: { path: string }) {
  const encrypted = useVault((s) => isEncrypted(s.files[path]?.content ?? ''))
  return encrypted ? <EncryptedNote path={path} /> : <NoteView path={path} />
}

// Clicking a little clock: put that line on a calendar.
function timeMenu(path: string, { match, blockText, anchor }: TimeClick) {
  const date = dateFromTitle(titleOf(path)) ?? findDate(blockText) ?? new Date()
  const ev: CalendarEvent = { title: titleAround(blockText, match) || titleOf(path), date, start: match.start, end: match.end }
  const h24 = useSettings.getState().clock24
  openMenu(
    anchor,
    [
      { label: 'Add to Google Calendar', onSelect: () => (googleConnected() ? addToGoogle(ev) : openInGoogleCalendar(ev)) },
      { label: 'Add to Apple Calendar (.ics)', onSelect: () => downloadIcs(ev) },
      { label: 'Edit details…', onSelect: () => openCalendar({ title: ev.title, date: isoDay(date), start: match.start, end: match.end }) },
    ],
    `${formatSpan(match.start, match.end, h24)} · ${date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}`,
  )
}

/** Where a page's text comes from and goes to. Plain pages use the vault; encrypted ones decrypt in between. */
export interface NoteSource {
  content: string
  read: () => string
  write: (content: string) => void
}

export function NoteView({ path, source }: { path: string; source?: NoteSource }) {
  const file = useVault((s) => s.files[path])
  const content = source ? source.content : (file?.content ?? '')
  const io = useRef<Omit<NoteSource, 'content'>>({ read: () => '', write: () => {} })
  io.current = source ?? { read: () => useVault.getState().files[path]?.content ?? '', write: (c) => updateContent(path, c) }
  const { frontmatter, body } = useMemo(() => splitFrontmatter(content), [content])
  const fm = useRef(frontmatter)
  fm.current = frontmatter
  const icon = getField(frontmatter, 'icon')
  const hasProps = useMemo(() => readProperties(frontmatter).some((p) => !HIDDEN_KEYS.has(p.key)), [frontmatter])
  const pageWidth = useSettings((s) => s.pageWidth)
  const font = useSettings((s) => s.font)
  const foldArrows = useSettings((s) => s.foldArrows)
  const spellcheck = useSettings((s) => s.spellcheck)
  const touch = useIsTouch()
  const mobile = useIsMobile()
  const resolver = useResolver()
  const resolverRef = useRef(resolver)
  resolverRef.current = resolver
  const [editor, setEditor] = useState<Editor | null>(null)
  const [picker, setPicker] = useState(false)
  const [addingProp, setAddingProp] = useState(false)

  useEffect(() => pushRecent(path), [path])

  const onChange = useCallback((md: string) => io.current.write(joinFrontmatter(fm.current, md)), [])
  const setFrontmatter = (next: string | null) => io.current.write(joinFrontmatter(next, splitFrontmatter(io.current.read()).body))
  const setIcon = (e: string | null) => {
    setFrontmatter(setField(splitFrontmatter(io.current.read()).frontmatter, 'icon', e))
    setPicker(false)
  }

  const resolve = useCallback((t: string) => resolverRef.current.resolve(t, path), [path])
  const subscribeLinks = useCallback((fn: () => void) => useVault.subscribe((s, prev) => s.paths !== prev.paths && fn()), [])

  const linkItems = useCallback(
    (query: string): LinkItem[] => {
      const q = query.split(/[#|]/)[0].trim().toLowerCase()
      const { paths, files } = useVault.getState()
      const recent = useSettings.getState().recent
      const scored = paths
        .filter((p) => p !== path)
        .map((p) => {
          const t = titleOf(p).toLowerCase()
          let score = 0
          if (!q) score = 10 - Math.min(9, recent.indexOf(p) < 0 ? 9 : recent.indexOf(p))
          else if (t === q) score = 100
          else if (t.startsWith(q)) score = 80
          else if (t.includes(q)) score = 60
          else if (p.toLowerCase().includes(q)) score = 40
          return { p, score }
        })
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score || titleOf(a.p).localeCompare(titleOf(b.p)))
        .slice(0, 8)
      const items: LinkItem[] = scored.map(({ p }) => ({
        kind: 'note',
        title: titleOf(p),
        linkText: resolverRef.current.linkTextFor(p),
        folder: dirname(p) || undefined,
        icon: getField(splitFrontmatter(files[p].content).frontmatter, 'icon'),
      }))
      const raw = query.split(/[#|]/)[0].trim()
      if (raw && !paths.some((p) => titleOf(p).toLowerCase() === raw.toLowerCase())) {
        items.push({ kind: 'create', title: raw, linkText: raw })
      }
      return items
    },
    [path],
  )

  const onReady = useCallback((ed: Editor | null) => {
    setEditor(ed)
    if (!ed) return
    if (focusBodyOnMount) {
      focusBodyOnMount = false
      ed.commands.focus('start')
    }
    if (pendingAnchor) {
      const want = pendingAnchor.toLowerCase()
      pendingAnchor = null
      ed.state.doc.descendants((node, pos) => {
        if (node.type.name === 'heading' && node.textContent.trim().toLowerCase() === want) {
          const dom = ed.view.nodeDOM(pos) as HTMLElement | null
          dom?.scrollIntoView({ block: 'start', behavior: 'smooth' })
          return false
        }
        return true
      })
    }
  }, [])

  // Decided once: a brand-new page starts in its title. Not after Enter in the title
  // renamed it (that remounts this view and the body should get the cursor), and
  // not again later just because the page is empty.
  const [isNew] = useState(() => !!file && !file.content && Date.now() - file.ctime < 4000 && !focusBodyOnMount)

  return (
    <div className={`page font-${font} width-${pageWidth}${pageWidth === 'full' ? ' is-full' : ''}${foldArrows === 'always' ? ' folds-always' : ''}`}>
      <div className="page-inner">
        <div className={'page-icon-row' + (icon ? ' has-icon' : '')}>
          {icon && (
            <button type="button" className="page-icon" onClick={() => setPicker(true)} aria-label="Change icon">
              <NoteIcon value={icon} size={mobile ? 58 : 76} />
            </button>
          )}
          {(!icon || (!hasProps && !addingProp)) && (
            <div className="page-controls">
              {!icon && (
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPicker(true)}>
                  <FaceSlightlySmilingPlus size={15} /> Add icon
                </button>
              )}
              {!hasProps && !addingProp && (
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAddingProp(true)}>
                  <ListPlus size={15} /> Add property
                </button>
              )}
            </div>
          )}
          {picker && <EmojiPicker current={icon} onPick={setIcon} onRemove={icon ? () => setIcon(null) : undefined} onClose={() => setPicker(false)} />}
        </div>

        <TitleField path={path} autoFocus={isNew} onEnter={() => editor?.commands.focus('start')} />
        <PropertiesPanel frontmatter={frontmatter} onChange={setFrontmatter} adding={addingProp} setAdding={setAddingProp} />

        <NoteEditor
          markdown={body}
          onChange={onChange}
          resolveLink={resolve}
          subscribeLinks={subscribeLinks}
          onOpenLink={(t) => openLinkTarget(t, resolve)}
          linkItems={linkItems}
          onLinkPage={(text, ed) => {
            const t = text.trim().replace(/[[\]|#^]/g, '')
            if (!t) return
            const existing = resolverRef.current.resolve(t, path)
            const target = existing ? resolverRef.current.linkTextFor(existing) : t
            ed.chain().focus().insertContent({ type: 'wikiLink', attrs: { target, alias: null, embed: false } }).run()
          }}
          onReady={onReady}
          spellcheck={spellcheck}
          touch={touch}
          foldKey={path}
          onTimeClick={(info) => timeMenu(path, info)}
        />

        <div className="page-tail" onClick={() => editor?.commands.focus('end')} />
        <Backlinks path={path} />
      </div>
      {touch && editor && <MobileToolbar editor={editor} />}
    </div>
  )
}

function TitleField({ path, autoFocus, onEnter }: { path: string; autoFocus: boolean; onEnter: () => void }) {
  const real = titleOf(path)
  const [value, setValue] = useState(UNTITLED.test(real) ? '' : real)
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    setValue(UNTITLED.test(real) ? '' : real)
  }, [real])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = '0px'
    el.style.height = el.scrollHeight + 'px'
  }, [value])

  useEffect(() => {
    if (autoFocus) ref.current?.focus()
  }, [autoFocus])

  const commit = (focusBody: boolean) => {
    const v = value.trim()
    if (!v || v === real) {
      if (focusBody) onEnter()
      return
    }
    focusBodyOnMount = focusBody
    const next = renameNote(path, v)
    if (next === path) {
      focusBodyOnMount = false
      setValue(UNTITLED.test(real) ? '' : real)
      if (focusBody) onEnter()
    }
  }

  return (
    <textarea
      ref={ref}
      className="page-title"
      rows={1}
      value={value}
      placeholder="Untitled"
      spellCheck={false}
      onChange={(e) => setValue(e.target.value.replace(/\n/g, ''))}
      onBlur={() => commit(false)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || (e.key === 'ArrowDown' && ref.current?.selectionStart === value.length)) {
          e.preventDefault()
          commit(true)
        }
      }}
    />
  )
}

function Backlinks({ path }: { path: string }) {
  const index = useLinkIndex()
  const resolver = useResolver()
  const files = useVault((s) => s.files)
  const icons = useNoteIcons()
  const sources = [...(index.incoming.get(path) ?? [])].sort((a, b) => titleOf(a).localeCompare(titleOf(b)))
  if (!sources.length) return null
  return (
    <section className="backlinks">
      <div className="backlinks-head">
        <Link2 size={15} /> {sources.length} linked mention{sources.length === 1 ? '' : 's'}
      </div>
      {sources.map((src) => {
        const lines = linkContexts(files[src]?.content ?? '', src, path, resolver).slice(0, 3)
        return (
          <button type="button" key={src} className="backlink" onClick={() => openNote(src)}>
            <span className="backlink-title">
              {icons[src] ? <NoteIcon className="tree-emoji" value={icons[src]} size={16} /> : <FileText size={15} strokeWidth={1.75} />}
              {titleOf(src)}
              <ArrowUpRight size={13} className="backlink-arrow" />
            </span>
            {lines.map((l, i) => (
              <span key={i} className="backlink-line">
                {l.replace(/^[-*+>]\s+(\[[ xX]\]\s+)?/, '').replace(/\[\[([^\]|]+)\|?([^\]]*)\]\]/g, (_, t, a) => a || t)}
              </span>
            ))}
          </button>
        )
      })}
    </section>
  )
}

