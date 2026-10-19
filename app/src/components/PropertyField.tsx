import { Braces, Calendar, CheckSquare, Hash, List, Type, type LucideIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { coerce, displayValue, type PropType, type PropValue, type Property } from '../lib/properties'

// One property value, shown as text and edited in place. Shared by the
// properties panel on a page and the table view.

export const TYPE_ICONS: Record<PropType, LucideIcon> = {
  text: Type,
  number: Hash,
  checkbox: CheckSquare,
  date: Calendar,
  list: List,
  complex: Braces,
}

export const TYPE_LABELS: [PropType, string][] = [
  ['text', 'Text'],
  ['list', 'List'],
  ['date', 'Date'],
  ['number', 'Number'],
  ['checkbox', 'Checkbox'],
]

export function emptyValue(type: PropType): PropValue {
  if (type === 'checkbox') return false
  if (type === 'list') return []
  return ''
}

export function PropertyValue({ prop, onChange, placeholder = 'Empty' }: { prop: Property; onChange: (v: PropValue) => void; placeholder?: string }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) input.current?.focus()
  }, [editing])

  if (prop.type === 'complex') {
    return (
      <span className="prop-value is-readonly" title="Edit this one in the page’s Markdown">
        {String(prop.value)}
      </span>
    )
  }

  if (prop.type === 'checkbox') {
    return <input type="checkbox" className="prop-check" checked={prop.value === true} onChange={(e) => onChange(e.target.checked)} />
  }

  const start = () => {
    setDraft(Array.isArray(prop.value) ? prop.value.join(', ') : String(prop.value))
    setEditing(true)
  }
  const commit = () => {
    setEditing(false)
    const next = coerce(draft, prop.type)
    if (displayValue({ ...prop, value: next }) !== displayValue(prop)) onChange(next)
  }

  if (editing) {
    return (
      <input
        ref={input}
        className="prop-input"
        type={prop.type === 'date' ? 'date' : prop.type === 'number' ? 'number' : 'text'}
        value={draft}
        placeholder={prop.type === 'list' ? 'one, two, three' : ''}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit()
          if (e.key === 'Escape') setEditing(false)
        }}
      />
    )
  }

  const empty = Array.isArray(prop.value) ? prop.value.length === 0 : prop.value === ''
  return (
    <button type="button" className={'prop-value' + (empty ? ' is-empty' : '')} onClick={start}>
      {empty ? (
        placeholder
      ) : Array.isArray(prop.value) ? (
        prop.value.map((v) => (
          <span key={v} className="prop-chip">
            {v}
          </span>
        ))
      ) : prop.type === 'date' ? (
        new Date(`${prop.value}T00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
      ) : (
        String(prop.value)
      )}
    </button>
  )
}
