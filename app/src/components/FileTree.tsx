import {
  ChevronRight,
  Copy,
  Ellipsis,
  FilePlus,
  FileText,
  Folder,
  FolderInput,
  FolderOpen,
  FolderPlus,
  History,
  LayoutTemplate,
  Lock,
  LockOpen,
  Pencil,
  Plus,
  Smile,
  Star,
  Table2,
  Trash,
} from 'lucide-react'
import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { isEncrypted } from '../lib/crypto'
import { useLockedPaths, useNoteIcons } from '../lib/hooks'
import { NoteIcon } from './NoteIcon'
import { ancestors, basename, dirname, titleOf } from '../lib/paths'
import { navigate, openNote, useRoute } from '../lib/router'
import { setSettings, toggleFavorite, useSettings } from '../lib/settings'
import {
  createFolder,
  createNote,
  deleteFolder,
  deleteNote,
  getNote,
  moveFolder,
  moveNoteToFolder,
  renameFolder,
  renameNote,
  useVault,
} from '../lib/vault'
import { toast } from '../lib/toasts'
import { openMenu, type MenuEntry } from './ui'
import { decryptPage, encryptFolder, encryptPages } from './EncryptedNote'
import { chooseFolder } from './FolderPicker'
import { openIconPicker } from './IconPickerHost'
import { chooseNewFromTemplate } from './templateActions'
import { useUI } from './uiState'

interface TreeNode {
  type: 'folder' | 'note'
  path: string
  name: string
  children: TreeNode[]
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

function buildTree(paths: string[], folders: string[]): TreeNode[] {
  const root: TreeNode = { type: 'folder', path: '', name: '', children: [] }
  const index = new Map<string, TreeNode>([['', root]])
  const ensure = (folder: string): TreeNode => {
    const hit = index.get(folder)
    if (hit) return hit
    const parent = ensure(dirname(folder))
    const node: TreeNode = { type: 'folder', path: folder, name: basename(folder), children: [] }
    parent.children.push(node)
    index.set(folder, node)
    return node
  }
  for (const f of folders) ensure(f)
  for (const p of paths) ensure(dirname(p)).children.push({ type: 'note', path: p, name: titleOf(p), children: [] })
  const sort = (n: TreeNode) => {
    n.children.sort((a, b) => (a.type !== b.type ? (a.type === 'folder' ? -1 : 1) : collator.compare(a.name, b.name)))
    n.children.forEach(sort)
  }
  sort(root)
  return root.children
}

export function newNoteIn(folder: string) {
  const path = createNote({ folder })
  if (folder) setSettings((s) => ({ expanded: [...new Set([...s.expanded, ...ancestors(path)])] }))
  openNote(path)
  return path
}

export function noteMenu(path: string, onRename?: () => void): MenuEntry[] {
  const fav = useSettings.getState().favorites.includes(path)
  return [
    ...(onRename ? [{ label: 'Rename', icon: <Pencil size={15} />, onSelect: onRename }] : []),
    {
      label: 'Move to…',
      icon: <FolderInput size={15} />,
      onSelect: async () => {
        const folder = await chooseFolder(`Move “${titleOf(path)}” to…`, dirname(path))
        if (folder !== null) moveNoteToFolder(path, folder)
      },
    },
    { label: fav ? 'Remove from favorites' : 'Add to favorites', icon: <Star size={15} />, onSelect: () => toggleFavorite(path) },
    {
      label: 'Duplicate',
      icon: <Copy size={15} />,
      onSelect: () => {
        const n = getNote(path)
        if (!n) return
        openNote(createNote({ folder: dirname(path), title: `${titleOf(path)} copy`, content: n.content }))
      },
    },
    ...(useSettings.getState().sync
      ? [{ label: 'Version history', icon: <History size={15} />, onSelect: () => useUI.setState({ history: path }) }]
      : []),
    isEncrypted(getNote(path)?.content ?? '')
      ? { label: 'Remove encryption', icon: <LockOpen size={15} />, onSelect: () => void decryptPage(path) }
      : {
          label: 'Encrypt page…',
          icon: <Lock size={15} />,
          onSelect: () => {
            if (confirm(`Encrypt “${titleOf(path)}”? Its text is sealed with your passphrase; the title stays visible.`)) void encryptPages([path])
          },
        },
    'sep',
    {
      label: 'Delete',
      icon: <Trash size={15} />,
      danger: true,
      onSelect: () => {
        deleteNote(path)
        toast(`Moved “${titleOf(path)}” to Trash`)
      },
    },
  ]
}

function setFolderIcon(path: string, icon: string | null) {
  setSettings((s) => {
    const next = { ...s.folderIcons }
    if (icon) next[path] = icon
    else delete next[path]
    return { folderIcons: next }
  })
}

function folderMenu(path: string, onRename: () => void, anchor: { x: number; y: number } | HTMLElement): MenuEntry[] {
  const current = useSettings.getState().folderIcons[path] ?? null
  return [
    { label: 'New page', icon: <FilePlus size={15} />, onSelect: () => newNoteIn(path) },
    { label: 'New page from template…', icon: <LayoutTemplate size={15} />, onSelect: () => chooseNewFromTemplate(anchor, path) },
    {
      label: 'New folder',
      icon: <FolderPlus size={15} />,
      onSelect: () => {
        createFolder(path, 'New folder')
      },
    },
    { label: 'Rename', icon: <Pencil size={15} />, onSelect: onRename },
    {
      label: current ? 'Change icon…' : 'Add icon…',
      icon: <Smile size={15} />,
      onSelect: () => openIconPicker(anchor, { current, onPick: (v) => setFolderIcon(path, v), onRemove: current ? () => setFolderIcon(path, null) : undefined }),
    },
    { label: 'Open as table', icon: <Table2 size={15} />, onSelect: () => navigate({ name: 'table', folder: path }) },
    {
      label: 'Move to…',
      icon: <FolderInput size={15} />,
      onSelect: async () => {
        const dest = await chooseFolder(`Move “${basename(path)}” to…`, dirname(path), path)
        if (dest === null) return
        moveFolder(path, dest ? `${dest}/${basename(path)}` : basename(path))
      },
    },
    { label: 'Encrypt pages inside…', icon: <Lock size={15} />, onSelect: () => encryptFolder(path) },
    'sep',
    {
      label: 'Delete folder',
      icon: <Trash size={15} />,
      danger: true,
      onSelect: () => {
        const count = useVault.getState().paths.filter((p) => p.startsWith(path + '/')).length
        if (count && !confirm(`Delete “${basename(path)}” and the ${count} page${count === 1 ? '' : 's'} inside? They go to Trash.`)) return
        deleteFolder(path)
      },
    },
  ]
}

const Row = memo(function Row({
  node,
  depth,
  active,
  icon,
  locked,
  expanded,
  renaming,
  setRenaming,
}: {
  node: TreeNode
  depth: number
  active: boolean
  icon?: string
  locked?: boolean
  expanded: boolean
  renaming: boolean
  setRenaming: (p: string | null) => void
}) {
  const [drop, setDrop] = useState(false)
  const isFolder = node.type === 'folder'
  const toggle = () =>
    setSettings((s) => ({ expanded: expanded ? s.expanded.filter((e) => e !== node.path) : [...s.expanded, node.path] }))

  // Press and hold opens the menu on phones (iOS sends no contextmenu event).
  const hold = useRef<{ timer: ReturnType<typeof setTimeout>; fired: boolean } | null>(null)
  const endHold = () => {
    if (hold.current) clearTimeout(hold.current.timer)
  }

  const menu = (at: { x: number; y: number } | HTMLElement) =>
    openMenu(at, isFolder ? folderMenu(node.path, () => setRenaming(node.path), at) : noteMenu(node.path, () => setRenaming(node.path)))

  return (
    <div
      className={'tree-row' + (active ? ' is-active' : '') + (drop ? ' is-drop' : '')}
      style={{ paddingLeft: 8 + depth * 14 }}
      draggable={!renaming}
      onDragStart={(e) => {
        e.dataTransfer.setData('application/x-cairn', JSON.stringify({ type: node.type, path: node.path }))
        e.dataTransfer.effectAllowed = 'move'
      }}
      onDragOver={(e) => {
        if (!isFolder || !e.dataTransfer.types.includes('application/x-cairn')) return
        e.preventDefault()
        setDrop(true)
      }}
      onDragLeave={() => setDrop(false)}
      onDrop={(e) => {
        setDrop(false)
        if (!isFolder) return
        e.preventDefault()
        try {
          const data = JSON.parse(e.dataTransfer.getData('application/x-cairn')) as { type: string; path: string }
          if (data.type === 'note') moveNoteToFolder(data.path, node.path)
          else if (data.path !== node.path) moveFolder(data.path, `${node.path}/${basename(data.path)}`)
        } catch {
          /* not ours */
        }
      }}
      onTouchStart={(e) => {
        const t = e.touches[0]
        const at = { x: t.clientX, y: t.clientY }
        const h = { fired: false, timer: setTimeout(() => ((h.fired = true), menu(at)), 500) }
        hold.current = h
      }}
      onTouchMove={endHold}
      onTouchEnd={endHold}
      onTouchCancel={endHold}
      onClick={() => {
        if (hold.current?.fired) {
          hold.current = null
          return // the long press already opened the menu
        }
        if (isFolder) toggle()
        else openNote(node.path)
      }}
      onContextMenu={(e) => {
        e.preventDefault()
        menu({ x: e.clientX, y: e.clientY })
      }}
    >
      <span className="tree-icon">
        {isFolder ? (
          <>
            <ChevronRight size={14} className={'tree-chevron' + (expanded ? ' is-open' : '')} />
            {icon ? (
              <NoteIcon className="tree-emoji" value={icon} size={17} />
            ) : expanded ? (
              <FolderOpen size={16} strokeWidth={1.75} />
            ) : (
              <Folder size={16} strokeWidth={1.75} />
            )}
          </>
        ) : icon ? (
          <NoteIcon className="tree-emoji" value={icon} size={17} />
        ) : locked ? (
          <Lock size={15} strokeWidth={1.75} />
        ) : (
          <FileText size={16} strokeWidth={1.75} />
        )}
      </span>
      {renaming ? (
        <RenameInput
          initial={node.name}
          onDone={(v) => {
            setRenaming(null)
            if (v === null || v === node.name) return
            if (isFolder) renameFolder(node.path, v)
            else renameNote(node.path, v)
          }}
        />
      ) : (
        <span className="tree-name">{node.name}</span>
      )}
      {!renaming && (
        <span className="tree-actions">
          <button
            type="button"
            className="icon-btn icon-btn-sm"
            aria-label="More"
            onClick={(e) => {
              e.stopPropagation()
              menu(e.currentTarget)
            }}
          >
            <Ellipsis size={15} />
          </button>
          {isFolder && (
            <button
              type="button"
              className="icon-btn icon-btn-sm"
              aria-label="New page in folder"
              onClick={(e) => {
                e.stopPropagation()
                newNoteIn(node.path)
              }}
            >
              <Plus size={15} />
            </button>
          )}
        </span>
      )}
    </div>
  )
})

function RenameInput({ initial, onDone }: { initial: string; onDone: (v: string | null) => void }) {
  const [v, setV] = useState(initial)
  const ref = useRef<HTMLInputElement>(null)
  const done = useRef(false)
  useEffect(() => {
    ref.current?.focus()
    ref.current?.select()
  }, [])
  const finish = (val: string | null) => {
    if (done.current) return
    done.current = true
    onDone(val)
  }
  return (
    <input
      ref={ref}
      className="tree-rename"
      value={v}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => finish(v.trim() || null)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') finish(v.trim() || null)
        if (e.key === 'Escape') finish(null)
      }}
    />
  )
}

export function FileTree() {
  const paths = useVault((s) => s.paths)
  const folders = useVault((s) => s.folders)
  const expandedList = useSettings((s) => s.expanded)
  const route = useRoute()
  const icons = useNoteIcons()
  const folderIcons = useSettings((s) => s.folderIcons)
  const locked = useLockedPaths()
  const [renaming, setRenaming] = useState<string | null>(null)
  const tree = useMemo(() => buildTree(paths, folders), [paths, folders])
  const expanded = useMemo(() => new Set(expandedList), [expandedList])
  const activePath = route.name === 'note' ? route.path : null

  // Reveal the open note.
  useEffect(() => {
    if (!activePath) return
    const need = ancestors(activePath).filter((a) => !expanded.has(a))
    if (need.length) setSettings((s) => ({ expanded: [...new Set([...s.expanded, ...need])] }))
  }, [activePath]) // eslint-disable-line react-hooks/exhaustive-deps

  const rows: React.ReactNode[] = []
  const walk = (nodes: TreeNode[], depth: number) => {
    for (const n of nodes) {
      const isOpen = n.type === 'folder' && expanded.has(n.path)
      rows.push(
        <Row
          key={n.type + n.path}
          node={n}
          depth={depth}
          active={n.path === activePath}
          icon={n.type === 'folder' ? folderIcons[n.path] : icons[n.path]}
          locked={locked.has(n.path)}
          expanded={isOpen}
          renaming={renaming === n.path}
          setRenaming={setRenaming}
        />,
      )
      if (isOpen) {
        if (n.children.length) walk(n.children, depth + 1)
        else
          rows.push(
            <div key={'empty' + n.path} className="tree-empty" style={{ paddingLeft: 30 + (depth + 1) * 14 }}>
              No pages inside
            </div>,
          )
      }
    }
  }
  walk(tree, 0)

  return (
    <div
      className="tree"
      onDragOver={(e) => {
        if (e.target === e.currentTarget && e.dataTransfer.types.includes('application/x-cairn')) e.preventDefault()
      }}
      onDrop={(e) => {
        if (e.target !== e.currentTarget) return
        try {
          const data = JSON.parse(e.dataTransfer.getData('application/x-cairn')) as { type: string; path: string }
          if (data.type === 'note') moveNoteToFolder(data.path, '')
          else moveFolder(data.path, basename(data.path))
        } catch {
          /* ignore */
        }
      }}
    >
      {rows.length ? rows : <div className="tree-empty">No pages yet</div>}
    </div>
  )
}

