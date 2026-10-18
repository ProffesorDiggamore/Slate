// Page properties: the `key: value` lines of a note's YAML frontmatter, read
// and edited one key at a time. Lines Cairn doesn't understand (nested maps,
// multi-line text, comments) are kept byte-for-byte and shown read-only.

export type PropType = 'text' | 'number' | 'checkbox' | 'date' | 'list' | 'complex'
export type PropValue = string | string[] | boolean

export interface Property {
  key: string
  type: PropType
  value: PropValue
}

interface Block {
  key: string | null
  lines: string[]
}

const KEY_RE = /^([^\s#:\-][^:]*?):(?:[ \t]+(.*?)|[ \t]*)$/
const ITEM_RE = /^\s*-\s*(.*?)\s*$/

/** Keys with their own UI elsewhere. */
export const HIDDEN_KEYS = new Set(['icon', 'cairn-encrypted'])

function toBlocks(fm: string | null): Block[] {
  const out: Block[] = []
  if (!fm) return out
  for (const line of fm.split('\n')) {
    const m = KEY_RE.exec(line)
    if (m) out.push({ key: m[1].trim(), lines: [line] })
    else if (out.length && (line.startsWith(' ') || line.startsWith('\t') || line.startsWith('-') || line.trim() === '')) out[out.length - 1].lines.push(line)
    else out.push({ key: null, lines: [line] })
  }
  return out
}

function unquote(v: string): string {
  const s = v.trim()
  if (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) {
    try {
      return JSON.parse(s) as string
    } catch {
      return s.slice(1, -1)
    }
  }
  if (s.length >= 2 && s.startsWith("'") && s.endsWith("'")) return s.slice(1, -1).replace(/''/g, "'")
  return s
}

function splitInline(inner: string): string[] {
  const out: string[] = []
  let cur = ''
  let q: string | null = null
  for (const ch of inner) {
    if (q) {
      cur += ch
      if (ch === q) q = null
    } else if (ch === '"' || ch === "'") {
      q = ch
      cur += ch
    } else if (ch === ',') {
      out.push(cur)
      cur = ''
    } else cur += ch
  }
  if (cur.trim()) out.push(cur)
  return out.map(unquote).filter((s) => s !== '')
}

function readBlock(b: Block): Property {
  const key = b.key!
  const first = KEY_RE.exec(b.lines[0])![2] ?? ''
  const rest = b.lines.slice(1).filter((l) => l.trim() !== '')
  if (!first && rest.length && rest.every((l) => ITEM_RE.test(l))) {
    return { key, type: 'list', value: rest.map((l) => unquote(ITEM_RE.exec(l)![1])).filter((s) => s !== '') }
  }
  if (rest.length || /^[|>{&*!]/.test(first)) return { key, type: 'complex', value: b.lines.slice(1).length ? [first, ...rest].join('\n').trim() : first }
  if (first.startsWith('[') && first.endsWith(']')) return { key, type: 'list', value: splitInline(first.slice(1, -1)) }
  if (first === 'true' || first === 'false') return { key, type: 'checkbox', value: first === 'true' }
  if (/^\d{4}-\d{2}-\d{2}$/.test(first)) return { key, type: 'date', value: first }
  if (/^-?\d+(\.\d+)?$/.test(first)) return { key, type: 'number', value: first }
  return { key, type: 'text', value: unquote(first) }
}

export function readProperties(fm: string | null): Property[] {
  return toBlocks(fm)
    .filter((b) => b.key !== null)
    .map(readBlock)
}

const RESERVED = /^(true|false|yes|no|on|off|null|~)$/i

function scalar(v: string, type: PropType): string {
  if (v === '') return ''
  if (type === 'number' && /^-?\d+(\.\d+)?$/.test(v)) return v
  if (type === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v
  const risky =
    /^[\s[\]{}#&*!|>'"%@`,?:-]/.test(v) || /\s$/.test(v) || /:\s|\s#/.test(v) || RESERVED.test(v) || /^-?\d+(\.\d+)?$/.test(v) || /^\d{4}-\d{2}-\d{2}/.test(v) || v.includes('\n')
  return risky ? JSON.stringify(v) : v
}

function writeBlock(key: string, value: PropValue, type: PropType): string[] {
  if (type === 'checkbox' || typeof value === 'boolean') return [`${key}: ${value ? 'true' : 'false'}`]
  if (type === 'list' || Array.isArray(value)) {
    const items = (Array.isArray(value) ? value : String(value).split(',')).map((s) => s.trim()).filter(Boolean)
    return items.length ? [`${key}:`, ...items.map((i) => `  - ${scalar(i, 'text')}`)] : [`${key}: []`]
  }
  const s = scalar(String(value), type)
  return [s ? `${key}: ${s}` : `${key}:`]
}

function fromBlocks(blocks: Block[]): string | null {
  const text = blocks
    .flatMap((b) => b.lines)
    .join('\n')
    .replace(/\n+$/, '')
  return text.trim() === '' ? null : text
}

/** Adds, changes (value: PropValue) or removes (value: null) one property. */
export function setProperty(fm: string | null, key: string, value: PropValue | null, type: PropType = 'text'): string | null {
  const k = key.trim()
  if (!k || !KEY_RE.test(`${k}:`)) return fm
  const blocks = toBlocks(fm)
  const i = blocks.findIndex((b) => b.key === k)
  if (value === null) {
    if (i >= 0) blocks.splice(i, 1)
    return fromBlocks(blocks)
  }
  const next: Block = { key: k, lines: writeBlock(k, value, type) }
  if (i >= 0) blocks[i] = next
  else blocks.push(next)
  return fromBlocks(blocks)
}

export function renameProperty(fm: string | null, from: string, to: string): string | null {
  const k = to.trim()
  if (!k || k === from || !KEY_RE.test(`${k}:`)) return fm
  const blocks = toBlocks(fm)
  if (blocks.some((b) => b.key === k)) return fm // don't merge into an existing key
  const b = blocks.find((x) => x.key === from)
  if (!b) return fm
  b.lines[0] = b.lines[0].replace(/^[^:]*:/, `${k}:`)
  b.key = k
  return fromBlocks(blocks)
}

/** A value typed into a text box, read as the property's type. */
export function coerce(input: string, type: PropType): PropValue {
  if (type === 'checkbox') return input === 'true'
  if (type === 'list') return input.split(',').map((s) => s.trim()).filter(Boolean)
  return input.trim()
}

export function displayValue(p: Property): string {
  if (Array.isArray(p.value)) return p.value.join(', ')
  if (typeof p.value === 'boolean') return p.value ? 'Yes' : 'No'
  return p.value
}

/**
 * YAML can't say what type an empty value is (or tell a quoted "2" from text),
 * so Cairn remembers the type picked for each property name — like Obsidian's
 * types.json — and reads ambiguous values through it.
 */
export function withHint(p: Property, hint: PropType | undefined): Property {
  if (!hint || hint === p.type || p.type === 'complex' || hint === 'complex' || Array.isArray(p.value)) return p
  const v = String(p.value)
  if (p.type === 'text' && v === '') return { ...p, type: hint, value: hint === 'checkbox' ? false : hint === 'list' ? [] : '' }
  if (p.type === 'text' && hint === 'number' && /^-?\d+(\.\d+)?$/.test(v)) return { ...p, type: 'number' }
  if (p.type === 'text' && hint === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return { ...p, type: 'date' }
  if (p.type === 'text' && hint === 'list') return { ...p, type: 'list', value: [v] }
  if (hint === 'text' && (p.type === 'number' || p.type === 'date')) return { ...p, type: 'text' }
  return p
}
