// Templates are ordinary notes in the templates folder (Obsidian-compatible
// `{{date}}`, `{{time}}`, `{{title}}`, plus `{{date:YYYY-MM-DD}}` formats).
// Unknown `{{…}}` placeholders are left exactly as written.

export const STARTER_TEMPLATES: Record<string, string> = {
  Daily: `## Plan
- [ ]

## Notes

`,
  Meeting: `**When:** {{start}} – {{end}}
**Where:** {{location}}

## Agenda
-

## Notes

## Action items
- [ ]
`,
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const pad = (n: number) => String(n).padStart(2, '0')

/** A small subset of moment.js tokens, enough for Obsidian templates. */
export function formatDate(d: Date, format: string): string {
  return format.replace(/YYYY|YY|MMMM|MMM|MM|M|DD|D|dddd|ddd|HH|H|hh|h|mm|ss|A|a/g, (t) => {
    const h12 = d.getHours() % 12 || 12
    switch (t) {
      case 'YYYY': return String(d.getFullYear())
      case 'YY': return String(d.getFullYear()).slice(2)
      case 'MMMM': return MONTHS[d.getMonth()]
      case 'MMM': return MONTHS[d.getMonth()].slice(0, 3)
      case 'MM': return pad(d.getMonth() + 1)
      case 'M': return String(d.getMonth() + 1)
      case 'DD': return pad(d.getDate())
      case 'D': return String(d.getDate())
      case 'dddd': return WEEKDAYS[d.getDay()]
      case 'ddd': return WEEKDAYS[d.getDay()].slice(0, 3)
      case 'HH': return pad(d.getHours())
      case 'H': return String(d.getHours())
      case 'hh': return pad(h12)
      case 'h': return String(h12)
      case 'mm': return pad(d.getMinutes())
      case 'ss': return pad(d.getSeconds())
      case 'A': return d.getHours() < 12 ? 'AM' : 'PM'
      default: return d.getHours() < 12 ? 'am' : 'pm'
    }
  })
}

const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, d.getHours(), d.getMinutes())

/** The variables every template gets. `date` is the note's day (a daily note's date, else today). */
export function baseVars(date: Date, title: string, now = new Date()): Record<string, string> {
  return {
    title,
    date: formatDate(date, 'YYYY-MM-DD'),
    time: formatDate(now, 'HH:mm'),
    weekday: formatDate(date, 'dddd'),
    yesterday: formatDate(addDays(date, -1), 'YYYY-MM-DD'),
    tomorrow: formatDate(addDays(date, 1), 'YYYY-MM-DD'),
  }
}

export function renderTemplate(text: string, vars: Record<string, string>, date = new Date()): string {
  return text.replace(/\{\{\s*([\w-]+)(?::([^}]*))?\s*\}\}/g, (whole, name: string, format?: string) => {
    if (format !== undefined && (name === 'date' || name === 'time')) return formatDate(date, format.trim())
    return Object.prototype.hasOwnProperty.call(vars, name) ? vars[name] : whole
  })
}

/** Templates live in `folder` (and its subfolders). */
export function templatePaths(paths: string[], folder: string): string[] {
  const f = folder.replace(/^\/+|\/+$/g, '')
  if (!f) return []
  return paths.filter((p) => p.startsWith(f + '/'))
}

export const inTemplates = (path: string, folder: string) => {
  const f = folder.replace(/^\/+|\/+$/g, '')
  return !!f && path.startsWith(f + '/')
}
