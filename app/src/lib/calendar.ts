// Times written in notes ("1-3", "2:30pm", "9:00–10:15") and the free ways to
// put them on a calendar: Google Calendar's prefilled event page, or an .ics
// file that Apple Calendar / Outlook open. No account, no API key.

export interface ClockTime {
  h: number // 0–23
  m: number
}

export interface TimeMatch {
  index: number
  length: number
  start: ClockTime
  end: ClockTime | null
}

const MERIDIEM = '(a\\.?m\\.?|p\\.?m\\.?|a|p)'
const HOUR_MIN = '(\\d{1,2})(?::([0-5]\\d))?'
const RANGE = new RegExp(
  `(?<![\\d/.:-])${HOUR_MIN}\\s*${MERIDIEM}?\\s*(-|–|—|to|until)\\s*${HOUR_MIN}\\s*${MERIDIEM}?(?![\\d/:]|-\\d)(?![a-z])`,
  'gi',
)
const SINGLE = new RegExp(`(?<![\\d/.:-])(?:(\\d{1,2}):([0-5]\\d)\\s*${MERIDIEM}?|(\\d{1,2})\\s*${MERIDIEM})(?![\\d/:]|-\\d)(?![a-z])`, 'gi')

function meridiem(s: string | undefined): 'am' | 'pm' | null {
  if (!s) return null
  return s[0].toLowerCase() === 'p' ? 'pm' : 'am'
}

function to24(h: number, mer: 'am' | 'pm' | null): number {
  if (mer === 'am') return h === 12 ? 0 : h
  if (mer === 'pm') return h === 12 ? 12 : h + 12
  return h
}

// No am/pm written: a school/work day guess — 7–11 morning, 12–6 afternoon.
function guess(h: number): 'am' | 'pm' {
  return h >= 7 && h <= 11 ? 'am' : 'pm'
}

export function findTimes(text: string, { bareRanges = true } = {}): TimeMatch[] {
  const out: TimeMatch[] = []
  const taken: [number, number][] = []
  const overlaps = (a: number, b: number) => taken.some(([x, y]) => a < y && b > x)

  for (const m of text.matchAll(RANGE)) {
    const [whole, h1s, m1s, mer1s, sep, h2s, m2s, mer2s] = m
    const h1 = Number(h1s)
    const h2 = Number(h2s)
    const explicit = !!(m1s || m2s || mer1s || mer2s)
    // "1-3" counts as a time; "add 2 to 3 cups" doesn't.
    if (!explicit && (!bareRanges || /[a-z]/i.test(sep))) continue
    let mer1 = meridiem(mer1s)
    let mer2 = meridiem(mer2s)
    const twentyFour = !mer1 && !mer2 && (h1 > 12 || h2 > 12)
    if (twentyFour) {
      // Only with minutes on both sides ("13:00-14:30"), so "10-13" isn't a time.
      if (h1 > 23 || h2 > 23 || !m1s || !m2s) continue
    } else {
      if (h1 < 1 || h1 > 12 || h2 < 1 || h2 > 12) continue
      if (!mer1 && !mer2) {
        mer1 = guess(h1)
        mer2 = guess(h2)
        if (mer1 === 'pm' && mer2 === 'am') mer2 = 'pm'
      } else if (!mer1) {
        // "11-1pm" is 11am to 1pm; "2-4pm" is 2pm to 4pm.
        mer1 = h1 > h2 && h1 !== 12 ? (mer2 === 'pm' ? 'am' : 'pm') : mer2
      } else if (!mer2) mer2 = mer1
    }
    const start = { h: twentyFour ? h1 : to24(h1, mer1), m: Number(m1s ?? 0) }
    const end = { h: twentyFour ? h2 : to24(h2, mer2), m: Number(m2s ?? 0) }
    const len = whole.trimEnd().length
    out.push({ index: m.index!, length: len, start, end })
    taken.push([m.index!, m.index! + len])
  }

  for (const m of text.matchAll(SINGLE)) {
    const len = m[0].trimEnd().length
    if (overlaps(m.index!, m.index! + len)) continue
    const colon = m[1] !== undefined
    const h = Number(colon ? m[1] : m[4])
    const mer = meridiem(colon ? m[3] : m[5])
    if (mer ? h < 1 || h > 12 : h > 23) continue
    const start = { h: mer ? to24(h, mer) : colon && h <= 12 && h >= 1 ? to24(h, guess(h)) : h, m: colon ? Number(m[2]) : 0 }
    out.push({ index: m.index!, length: len, start, end: null })
  }
  return out.sort((a, b) => a.index - b.index)
}

export function formatTime(t: ClockTime, h24 = false): string {
  if (h24) return `${String(t.h).padStart(2, '0')}:${String(t.m).padStart(2, '0')}`
  const h = t.h % 12 || 12
  return `${h}${t.m ? ':' + String(t.m).padStart(2, '0') : ''} ${t.h < 12 ? 'AM' : 'PM'}`
}

export function formatSpan(start: ClockTime, end: ClockTime | null, h24 = false): string {
  if (!end) return formatTime(start, h24)
  return `${formatTime(start, h24)} – ${formatTime(end, h24)}`
}

// A tiny analog clock: a wedge for a span, a hand for a single time.
export function clockSvg(start: ClockTime, end: ClockTime | null, size = 14): string {
  const r = 10
  const angle = (t: ClockTime) => (((t.h % 12) + t.m / 60) / 12) * Math.PI * 2 - Math.PI / 2
  const pt = (a: number, rr: number) => `${(12 + Math.cos(a) * rr).toFixed(2)} ${(12 + Math.sin(a) * rr).toFixed(2)}`
  const a1 = angle(start)
  let body: string
  if (end) {
    let sweep = angle(end) - a1
    const mins = (end.h * 60 + end.m - (start.h * 60 + start.m) + 1440) % 1440
    if (sweep <= 0) sweep += Math.PI * 2
    if (mins >= 720) sweep = Math.PI * 2 - 0.0001
    const a2 = a1 + sweep
    const large = sweep > Math.PI ? 1 : 0
    body = `<path d="M12 12 L${pt(a1, r - 1.5)} A${r - 1.5} ${r - 1.5} 0 ${large} 1 ${pt(a2, r - 1.5)} Z" fill="currentColor" opacity="0.38"/>`
  } else {
    body = `<line x1="12" y1="12" x2="${pt(a1, r - 3).split(' ')[0]}" y2="${pt(a1, r - 3).split(' ')[1]}" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>`
  }
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="${r}" fill="none" stroke="currentColor" stroke-width="2"/>${body}<circle cx="12" cy="12" r="1.6" fill="currentColor"/></svg>`
}

// ------------------------------------------------------------------- dates

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

/** A date written in text: 2026-10-14, 10/14, Oct 14, tomorrow. */
export function findDate(text: string, today = new Date()): Date | null {
  let m = /\b(\d{4})-(\d{2})-(\d{2})\b/.exec(text)
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  m = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/.exec(text)
  if (m) {
    const y = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : today.getFullYear()
    return new Date(y, Number(m[1]) - 1, Number(m[2]))
  }
  m = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?\b/i.exec(text)
  if (m) return new Date(today.getFullYear(), MONTHS.indexOf(m[1].toLowerCase()), Number(m[2]))
  if (/\btomorrow\b/i.test(text)) return new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1)
  if (/\btoday\b|\btonight\b/i.test(text)) return new Date(today.getFullYear(), today.getMonth(), today.getDate())
  return null
}

/** Daily notes are named YYYY-MM-DD. */
export function dateFromTitle(title: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(title.trim())
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null
}

export function isoDay(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

// --------------------------------------------------------------- calendars

export interface CalendarEvent {
  title: string
  date: Date
  start: ClockTime | null // null = all day
  end: ClockTime | null
  details?: string
  location?: string
}

export function stamp(d: Date, t: ClockTime | null): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  const day = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`
  return t ? `${day}T${pad(t.h)}${pad(t.m)}00` : day
}

/** When an event ends: an hour after a lone start time, the next day for all-day events. */
export function endOf(ev: CalendarEvent): { date: Date; time: ClockTime | null } {
  if (!ev.start) return { date: new Date(ev.date.getFullYear(), ev.date.getMonth(), ev.date.getDate() + 1), time: null }
  const end = ev.end ?? { h: (ev.start.h + 1) % 24, m: ev.start.m }
  const overnight = end.h * 60 + end.m <= ev.start.h * 60 + ev.start.m
  const date = overnight ? new Date(ev.date.getFullYear(), ev.date.getMonth(), ev.date.getDate() + 1) : ev.date
  return { date, time: end }
}

export function googleCalendarUrl(ev: CalendarEvent): string {
  const e = endOf(ev)
  const p = new URLSearchParams({
    action: 'TEMPLATE',
    text: ev.title || 'Event',
    dates: `${stamp(ev.date, ev.start)}/${stamp(e.date, e.time)}`,
  })
  if (ev.details) p.set('details', ev.details)
  if (ev.location) p.set('location', ev.location)
  if (ev.start) p.set('ctz', Intl.DateTimeFormat().resolvedOptions().timeZone)
  return `https://calendar.google.com/calendar/render?${p.toString()}`
}

export function openInGoogleCalendar(ev: CalendarEvent) {
  window.open(googleCalendarUrl(ev), '_blank', 'noopener')
}

const icsEscape = (s: string) => s.replace(/[\\;,]/g, (c) => '\\' + c).replace(/\n/g, '\\n')

export function icsText(ev: CalendarEvent): string {
  const e = endOf(ev)
  const uid = `${Date.now()}-${Math.random().toString(36).slice(2)}@cairn`
  const now = new Date()
  const z = (n: number) => String(n).padStart(2, '0')
  const dtstamp = `${now.getUTCFullYear()}${z(now.getUTCMonth() + 1)}${z(now.getUTCDate())}T${z(now.getUTCHours())}${z(now.getUTCMinutes())}00Z`
  const when = ev.start
    ? [`DTSTART:${stamp(ev.date, ev.start)}`, `DTEND:${stamp(e.date, e.time)}`]
    : [`DTSTART;VALUE=DATE:${stamp(ev.date, null)}`, `DTEND;VALUE=DATE:${stamp(e.date, null)}`]
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Cairn//Notes//EN',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${dtstamp}`,
    ...when,
    `SUMMARY:${icsEscape(ev.title || 'Event')}`,
    ...(ev.details ? [`DESCRIPTION:${icsEscape(ev.details)}`] : []),
    ...(ev.location ? [`LOCATION:${icsEscape(ev.location)}`] : []),
    'END:VEVENT',
    'END:VCALENDAR',
    '',
  ].join('\r\n')
}

export function downloadIcs(ev: CalendarEvent) {
  const url = URL.createObjectURL(new Blob([icsText(ev)], { type: 'text/calendar' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `${(ev.title || 'event').replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 60) || 'event'}.ics`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}

/** The rest of a line once the time (and leftover bullets/dashes) are removed. */
export function titleAround(text: string, match: TimeMatch): string {
  const rest = (text.slice(0, match.index) + ' ' + text.slice(match.index + match.length))
    .replace(/[\u{fffc}]/gu, '')
    .replace(/\b(from|at|@)\s*$/i, '')
    .replace(/^\s*(from|at|@)\b/i, '')
  return rest.replace(/\s+/g, ' ').replace(/^[\s:,–—-]+|[\s:,–—-]+$/g, '').trim()
}
