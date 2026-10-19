import type { Editor } from '@tiptap/core'
import { Check, Heading3, List, ListChecks, ListCollapse, ListOrdered, Pilcrow, Sparkles, X, type LucideIcon } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { applyShape, blockRange, groupLines, linesIn, RESTRUCTURE_META, suggestShape, titleText, type Group, type Shape } from './restructure'

// The "Turn into…" choices for several lines at once: a chip that appears
// after a multi-line paste, and the same list in the selection toolbar.

export const SHAPES: { id: Shape; label: string; icon: LucideIcon }[] = [
  { id: 'toggle', label: 'Toggle', icon: ListCollapse },
  { id: 'heading', label: 'Heading + bullets', icon: Heading3 },
  { id: 'bullet', label: 'Bulleted list', icon: List },
  { id: 'ordered', label: 'Numbered list', icon: ListOrdered },
  { id: 'task', label: 'To-do list', icon: ListChecks },
  { id: 'lines', label: 'Plain lines', icon: Pilcrow },
]

/** "Setup ▸ 4 items · Wash ▸ 2 items" — what the tool found, so the choice makes sense. */
function summary(groups: Group[]): string {
  const titled = groups.filter((g) => g.title)
  const items = groups.reduce((n, g) => n + g.items.length, 0)
  if (!titled.length) return `${items} line${items === 1 ? '' : 's'}`
  return titled
    .slice(0, 3)
    .map((g) => `${titleText(g.title!)} · ${g.items.length}`)
    .join('  ')
    .concat(titled.length > 3 ? ` +${titled.length - 3}` : '')
}

/** The dropdown in the selection toolbar for a multi-line selection. */
export function ShapeMenu({ editor, onDone }: { editor: Editor; onDone: () => void }) {
  const { from, to } = editor.state.selection
  const { start, end } = blockRange(editor.state.doc, from, to)
  const groups = groupLines(linesIn(editor.state.doc, start, end))
  const best = suggestShape(groups)
  return (
    <div className="menu turn-menu shape-menu" onMouseDown={(e) => e.preventDefault()}>
      <div className="menu-title">{summary(groups)}</div>
      {SHAPES.map((s) => (
        <button
          key={s.id}
          type="button"
          className="menu-item"
          onClick={() => {
            applyShape(editor, start, end, groups, s.id)
            onDone()
          }}
        >
          <s.icon size={15} />
          <span>{s.label}</span>
          {s.id === best && <span className="shape-best">Suggested</span>}
        </button>
      ))}
    </div>
  )
}

interface Pasted {
  start: number
  end: number
  groups: Group[]
  shape: Shape | null // what it's been turned into so far
}

const OURS = RESTRUCTURE_META

/** Watches for multi-line pastes and offers to turn them into a list, toggle or sections. */
export function PasteOptions({ editor }: { editor: Editor }) {
  const [pasted, setPasted] = useState<Pasted | null>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onTr = ({ transaction: tr }: { transaction: import('@tiptap/pm/state').Transaction }) => {
      if (!tr.docChanged || tr.getMeta(OURS)) return
      const isPaste = tr.getMeta('paste') || tr.getMeta('uiEvent') === 'paste'
      if (!isPaste) {
        setPasted(null) // typing (or anything else) dismisses the offer
        return
      }
      let lo = Infinity
      let hi = -Infinity
      tr.mapping.maps.forEach((map, i) => {
        map.forEach((_a, _b, newStart, newEnd) => {
          const rest = tr.mapping.slice(i + 1)
          lo = Math.min(lo, rest.map(newStart, -1))
          hi = Math.max(hi, rest.map(newEnd, 1))
        })
      })
      if (!isFinite(lo) || hi <= lo) return setPasted(null)
      const doc = tr.doc
      const { start, end } = blockRange(doc, lo, Math.min(hi, doc.content.size))
      const lines = linesIn(doc, start, end)
      if (lines.length < 2) return setPasted(null)
      setPasted({ start, end, groups: groupLines(lines), shape: null })
    }
    editor.on('transaction', onTr)
    return () => {
      editor.off('transaction', onTr)
    }
  }, [editor])

  // Sit just under the pasted text; hide while it scrolls out of view.
  useLayoutEffect(() => {
    if (!pasted) return setPos(null)
    const place = () => {
      try {
        // Lined up with the start of the pasted text, just below its last line.
        const first = editor.view.coordsAtPos(pasted.start + 1)
        const last = editor.view.coordsAtPos(Math.max(pasted.start + 1, pasted.end - 1))
        const w = box.current?.offsetWidth ?? 520
        setPos({ left: Math.max(8, Math.min(first.left - 4, window.innerWidth - w - 8)), top: last.bottom + 8 })
      } catch {
        setPos(null)
      }
    }
    place()
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    return () => {
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
    }
  }, [pasted, editor])

  useEffect(() => {
    if (!pasted) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setPasted(null)
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [pasted])

  if (!pasted || !pos) return null
  const best = suggestShape(pasted.groups)

  // Rebuilt from the original lines each time, so you can try every shape.
  const choose = (shape: Shape) => setPasted({ ...pasted, end: applyShape(editor, pasted.start, pasted.end, pasted.groups, shape), shape })

  return (
    <div className="paste-options" ref={box} style={{ left: pos.left, top: pos.top }} onMouseDown={(e) => e.preventDefault()}>
      <span className="paste-options-label">
        <Sparkles size={13} /> Turn into
      </span>
      {SHAPES.map((s) => (
        <button
          key={s.id}
          type="button"
          className={'paste-chip' + (pasted.shape === s.id ? ' is-active' : '') + (!pasted.shape && s.id === best ? ' is-best' : '')}
          title={s.label}
          onClick={() => choose(s.id)}
        >
          <s.icon size={14} />
          <span>{s.id === 'heading' ? 'Heading' : s.id === 'bullet' ? 'Bullets' : s.id === 'ordered' ? 'Numbered' : s.id === 'task' ? 'To-dos' : s.id === 'lines' ? 'Lines' : 'Toggle'}</span>
        </button>
      ))}
      <span className="paste-options-found">{summary(pasted.groups)}</span>
      <button type="button" className="paste-chip is-done" title="Done" onClick={() => setPasted(null)}>
        {pasted.shape ? <Check size={14} /> : <X size={14} />}
      </button>
    </div>
  )
}
