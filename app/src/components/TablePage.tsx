import { ArrowDown, ArrowUp, FilePlus, FileText, Plus, Search, Table2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { isEncrypted } from '../lib/crypto'
import { relativeTime, useNoteIcons } from '../lib/hooks'
import { joinFrontmatter, splitFrontmatter } from '../lib/markdown/frontmatter'
import { dirname, titleOf } from '../lib/paths'
import { displayValue, HIDDEN_KEYS, readProperties, setProperty, withHint, type PropType, type PropValue, type Property } from '../lib/properties'
import { openNote } from '../lib/router'
import { useSettings } from '../lib/settings'
import { inTemplates } from '../lib/templates'
import { toast } from '../lib/toasts'
import { createNote, updateContent, useVault } from '../lib/vault'
import { NoteIcon } from './NoteIcon'
import { rememberType } from './PropertiesPanel'
import { emptyValue, PropertyValue, TYPE_ICONS, TYPE_LABELS } from './PropertyField'

// A folder as a table: one row per page, one column per property — a small,
// file-backed take on a Notion database. Every edit is a normal change to that
// page's frontmatter.

const MAX_COLUMNS = 12

/** Writes one property on one page, straight to its file. */
export function setNoteProperty(path: string, key: string, value: PropValue | null, type: PropType) {
  const f = useVault.getState().files[path]
  if (!f || f.deleted) return
  const split = splitFrontmatter(f.content)
  updateContent(path, joinFrontmatter(setProperty(split.frontmatter, key, value, type), split.body))
}

interface Row {
  path: string
  props: Map<string, Property>
  mtime: number
}

export function TablePage({ folder }: { folder: string }) {
  const paths = useVault((s) => s.paths)
  const files = useVault((s) => s.files)
  const templates = useSettings((s) => s.templatesFolder)
  const hints = useSettings((s) => s.propertyTypes)
  const icons = useNoteIcons()
  const folderIcon = useSettings((s) => s.folderIcons[folder])
  const [deep, setDeep] = useState(true)
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 }>({ key: '', dir: 1 })
  const [adding, setAdding] = useState(false)

  const rows: Row[] = useMemo(() => {
    const inside = (p: string) => (folder ? (deep ? p.startsWith(folder + '/') : dirname(p) === folder) : deep || !dirname(p))
    return paths
      .filter((p) => inside(p) && files[p] && !isEncrypted(files[p].content) && (inTemplates(folder + '/x', templates) || !inTemplates(p, templates)))
      .map((p) => ({
        path: p,
        mtime: files[p].mtime,
        props: new Map(
          readProperties(splitFrontmatter(files[p].content).frontmatter)
            .filter((x) => !HIDDEN_KEYS.has(x.key))
            .map((x) => [x.key, withHint(x, hints[x.key])]),
        ),
      }))
  }, [paths, files, folder, deep, templates, hints])

  // Columns: the properties these pages use, most common first, each with its usual type.
  const columns = useMemo(() => {
    const seen = new Map<string, { n: number; types: Map<PropType, number> }>()
    for (const r of rows)
      for (const p of r.props.values()) {
        const c = seen.get(p.key) ?? { n: 0, types: new Map() }
        c.n++
        c.types.set(p.type, (c.types.get(p.type) ?? 0) + 1)
        seen.set(p.key, c)
      }
    return [...seen.entries()]
      .sort((a, b) => b[1].n - a[1].n || a[0].localeCompare(b[0]))
      .slice(0, MAX_COLUMNS)
      .map(([key, c]) => ({ key, type: [...c.types.entries()].sort((a, b) => b[1] - a[1])[0][0] }))
  }, [rows])

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const hit = (r: Row) => !needle || titleOf(r.path).toLowerCase().includes(needle) || [...r.props.values()].some((p) => displayValue(p).toLowerCase().includes(needle))
    const value = (r: Row) => {
      if (!sort.key) return titleOf(r.path).toLowerCase()
      if (sort.key === ':mtime') return r.mtime
      const p = r.props.get(sort.key)
      if (!p) return ''
      return p.type === 'number' ? Number(p.value) : displayValue(p).toLowerCase()
    }
    return rows.filter(hit).sort((a, b) => {
      const x = value(a)
      const y = value(b)
      if (x === y) return 0
      if (x === '') return 1 // empty cells last either way
      if (y === '') return -1
      return (x < y ? -1 : 1) * sort.dir
    })
  }, [rows, q, sort])

  const head = (key: string, label: React.ReactNode) => (
    <button type="button" className="table-head" onClick={() => setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : 1 }))}>
      {label}
      {sort.key === key && (sort.dir === 1 ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
    </button>
  )

  const addColumn = (key: string, type: PropType) => {
    const k = key.trim()
    if (!k) return
    if (HIDDEN_KEYS.has(k)) return toast('That name is used by Cairn itself — pick another.')
    const missing = rows.filter((r) => !r.props.has(k))
    if (missing.length > 20 && !confirm(`Add “${k}” to ${missing.length} pages?`)) return
    rememberType(k, type)
    for (const r of missing) setNoteProperty(r.path, k, emptyValue(type), type)
    setAdding(false)
  }

  return (
    <div className="page table-page width-full is-full">
      <div className="page-inner">
        <h1 className="page-heading">
          {folderIcon ? <NoteIcon value={folderIcon} size={28} /> : <Table2 size={26} strokeWidth={1.75} />} {folder ? titleOf(folder + '.md') : 'All pages'}
        </h1>
        <div className="table-toolbar">
          <label className="table-search">
            <Search size={14} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter" />
          </label>
          <label className="table-deep">
            <input type="checkbox" checked={deep} onChange={(e) => setDeep(e.target.checked)} /> {folder ? 'Include subfolders' : 'Pages in folders too'}
          </label>
          <span className="muted small">
            {shown.length} page{shown.length === 1 ? '' : 's'}
          </span>
          <button type="button" className="btn btn-sm" onClick={() => openNote(createNote({ folder }))}>
            <FilePlus size={14} /> New page
          </button>
        </div>
        <div className="table-scroll">
          <table className="db-table">
            <thead>
              <tr>
                <th>{head('', 'Name')}</th>
                {columns.map((c) => {
                  const Icon = TYPE_ICONS[c.type]
                  return (
                    <th key={c.key}>
                      {head(
                        c.key,
                        <>
                          <Icon size={12} /> {c.key}
                        </>,
                      )}
                    </th>
                  )
                })}
                <th>{head(':mtime', 'Edited')}</th>
                <th className="table-add-col">
                  {adding ? (
                    <AddColumn onAdd={addColumn} onCancel={() => setAdding(false)} />
                  ) : (
                    <button type="button" className="icon-btn icon-btn-sm" title="Add a property to every page here" onClick={() => setAdding(true)}>
                      <Plus size={14} />
                    </button>
                  )}
                </th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.path}>
                  <td className="table-name">
                    <button type="button" onClick={() => openNote(r.path)}>
                      {icons[r.path] ? <NoteIcon value={icons[r.path]} size={16} /> : <FileText size={15} strokeWidth={1.75} />}
                      <span>{titleOf(r.path)}</span>
                    </button>
                  </td>
                  {columns.map((c) => {
                    const p = r.props.get(c.key) ?? { key: c.key, type: c.type, value: emptyValue(c.type) }
                    return (
                      <td key={c.key}>
                        <PropertyValue prop={p} placeholder="" onChange={(v) => setNoteProperty(r.path, c.key, v, p.type)} />
                      </td>
                    )
                  })}
                  <td className="muted small table-edited">{relativeTime(r.mtime)}</td>
                  <td />
                </tr>
              ))}
            </tbody>
          </table>
          {shown.length === 0 && <div className="empty-inline">{rows.length ? 'No pages match.' : 'No pages here yet.'}</div>}
        </div>
        {columns.length === 0 && rows.length > 0 && (
          <p className="muted small">
            Columns come from page properties. Press <strong>+</strong> above, or open a page and use <em>Add property</em>.
          </p>
        )}
      </div>
    </div>
  )
}

function AddColumn({ onAdd, onCancel }: { onAdd: (key: string, type: PropType) => void; onCancel: () => void }) {
  const [key, setKey] = useState('')
  const [type, setType] = useState<PropType>('text')
  return (
    <form
      className="table-add-form"
      onSubmit={(e) => {
        e.preventDefault()
        onAdd(key, type)
      }}
    >
      <input autoFocus value={key} onChange={(e) => setKey(e.target.value)} placeholder="Property name" onKeyDown={(e) => e.key === 'Escape' && onCancel()} />
      <select value={type} onChange={(e) => setType(e.target.value as PropType)}>
        {TYPE_LABELS.map(([t, l]) => (
          <option key={t} value={t}>
            {l}
          </option>
        ))}
      </select>
      <button type="submit" className="btn btn-sm btn-primary">
        Add
      </button>
    </form>
  )
}
