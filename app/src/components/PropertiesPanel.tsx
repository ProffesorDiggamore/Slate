import { Plus, X } from 'lucide-react'
import { useState } from 'react'
import { HIDDEN_KEYS, readProperties, renameProperty, setProperty, withHint, type PropType, type PropValue } from '../lib/properties'
import { setSettings, useSettings } from '../lib/settings'
import { toast } from '../lib/toasts'
import { emptyValue, PropertyValue, TYPE_ICONS, TYPE_LABELS } from './PropertyField'

export function rememberType(key: string, type: PropType) {
  setSettings((s) => ({ propertyTypes: { ...s.propertyTypes, [key]: type } }))
}

// Page properties under the title — the frontmatter, Notion-style. Each edit
// rewrites only the key it touches.

export function PropertiesPanel({
  frontmatter,
  onChange,
  adding,
  setAdding,
}: {
  frontmatter: string | null
  onChange: (next: string | null) => void
  adding: boolean
  setAdding: (v: boolean) => void
}) {
  const hints = useSettings((s) => s.propertyTypes)
  const props = readProperties(frontmatter)
    .filter((p) => !HIDDEN_KEYS.has(p.key))
    .map((p) => withHint(p, hints[p.key]))
  if (!props.length && !adding) return null

  const set = (key: string, value: PropValue | null, type: PropType) => onChange(setProperty(frontmatter, key, value, type))

  return (
    <div className="props">
      {props.map((p) => {
        const Icon = TYPE_ICONS[p.type]
        return (
          <div key={p.key} className="prop-row">
            <span className="prop-key">
              <Icon size={14} />
              <KeyName name={p.key} onRename={(to) => onChange(renameProperty(frontmatter, p.key, to))} />
            </span>
            <PropertyValue prop={p} onChange={(v) => set(p.key, v, p.type)} />
            <button type="button" className="icon-btn icon-btn-sm prop-remove" title="Remove property" onClick={() => set(p.key, null, p.type)}>
              <X size={13} />
            </button>
          </div>
        )
      })}
      {adding ? (
        <NewProperty
          taken={new Set(props.map((p) => p.key))}
          onAdd={(key, type) => {
            rememberType(key, type)
            set(key, emptyValue(type), type)
            setAdding(false)
          }}
          onCancel={() => setAdding(false)}
        />
      ) : (
        <button type="button" className="link-btn prop-add" onClick={() => setAdding(true)}>
          <Plus size={13} /> Add property
        </button>
      )}
    </div>
  )
}

function KeyName({ name, onRename }: { name: string; onRename: (to: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [v, setV] = useState(name)
  if (!editing)
    return (
      <button type="button" className="prop-key-name" onClick={() => (setV(name), setEditing(true))} title="Rename">
        {name}
      </button>
    )
  const done = () => {
    setEditing(false)
    if (v.trim() && v.trim() !== name) onRename(v.trim())
  }
  return (
    <input
      autoFocus
      className="prop-input prop-key-input"
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={done}
      onKeyDown={(e) => {
        if (e.key === 'Enter') done()
        if (e.key === 'Escape') setEditing(false)
      }}
    />
  )
}

function NewProperty({ taken, onAdd, onCancel }: { taken: Set<string>; onAdd: (key: string, type: PropType) => void; onCancel: () => void }) {
  const [key, setKey] = useState('')
  const [type, setType] = useState<PropType>('text')
  const submit = () => {
    const k = key.trim().replace(/:/g, '')
    if (!k) return onCancel()
    if (taken.has(k) || HIDDEN_KEYS.has(k)) return toast(`This page already has “${k}”.`)
    onAdd(k, type)
  }
  return (
    <div className="prop-row prop-new">
      <input
        autoFocus
        className="prop-input"
        value={key}
        placeholder="Property name"
        onChange={(e) => setKey(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit()
          if (e.key === 'Escape') onCancel()
        }}
      />
      <select value={type} onChange={(e) => setType(e.target.value as PropType)} aria-label="Type">
        {TYPE_LABELS.map(([t, l]) => (
          <option key={t} value={t}>
            {l}
          </option>
        ))}
      </select>
      <button type="button" className="btn btn-sm btn-primary" onClick={submit}>
        Add
      </button>
      <button type="button" className="icon-btn icon-btn-sm" onClick={onCancel} aria-label="Cancel">
        <X size={13} />
      </button>
    </div>
  )
}
