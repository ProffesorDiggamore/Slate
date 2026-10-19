// YAML frontmatter is kept as raw text so Slate never reformats keys it
// doesn't understand. Only simple `key: value` lines are read or edited.

export interface SplitNote {
  frontmatter: string | null // raw YAML between the fences, no fences
  body: string
}

const FM_RE = /^---[ \t]*\r?\n([\s\S]*?)\r?\n?---[ \t]*(?:\r?\n|$)/

export function splitFrontmatter(md: string): SplitNote {
  const m = FM_RE.exec(md)
  if (!m) return { frontmatter: null, body: md }
  return { frontmatter: m[1], body: md.slice(m[0].length).replace(/^\r?\n/, '') }
}

export function joinFrontmatter(frontmatter: string | null, body: string): string {
  if (frontmatter === null || frontmatter.trim() === '') return body
  return `---\n${frontmatter.replace(/\n+$/, '')}\n---\n\n${body}`
}

export function getField(frontmatter: string | null, key: string): string | null {
  if (!frontmatter) return null
  const re = new RegExp(`^${key}:[ \\t]*(.*)$`, 'm')
  const m = re.exec(frontmatter)
  if (!m) return null
  return unquote(m[1].trim()) || null
}

export function setField(frontmatter: string | null, key: string, value: string | null): string | null {
  const fm = frontmatter ?? ''
  const re = new RegExp(`^${key}:.*(?:\\n|$)`, 'm')
  if (value === null || value === '') {
    const next = fm.replace(re, '').replace(/\n+$/, '')
    return next.trim() === '' ? null : next
  }
  const line = `${key}: ${quote(value)}`
  if (re.test(fm)) return fm.replace(new RegExp(`^${key}:.*$`, 'm'), line)
  return fm.trim() === '' ? line : `${line}\n${fm.replace(/\n+$/, '')}`
}

function unquote(v: string): string {
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) return v.slice(1, -1)
  return v
}

function quote(v: string): string {
  return /^[\w\s\-./]+$/u.test(v) && !/^\s|\s$/.test(v) ? v : JSON.stringify(v)
}
